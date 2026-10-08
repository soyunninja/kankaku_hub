import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import type { TotalsGroup, TotalsResponse, TotalsRow } from '../app/lib/totals-map'
import { loadMemberProjectChart } from '../app/lib/member-work-views'
import { buildLocalDayBoundaries } from '../app/lib/local-day'

const total: TotalsRow = {
  entries: 1, wallMs: 10, workMs: 10, waitingMs: 0, input: 0, output: 0,
  cacheRead: 0, cacheWrite: 0, cost: 0, waitingUnavailableEntries: 0,
  costUnknownEntries: 0, costEstimatedEntries: 0, costKnownEntries: 1,
  costKnownSum: 0, unlinkedEntries: 0, distinctSessions: 1, count: 1,
}
function row(groupKey: string, workMs: number): TotalsGroup {
  return {
    ...total, workMs, wallMs: workMs, groupKey, groupKey2: '', sessionName: '', minStartedAt: '', maxEndedAt: '',
    distinctClient: 1, sampleClient: 'client', distinctProject: 1, sampleProject: groupKey,
    distinctTask: 1, sampleTask: 'task', machine: '', distinctAgent: 1, sampleAgent: 'pi',
  }
}
function response(groups: TotalsGroup[], totalGroups = groups.length): TotalsResponse {
  return { groups, total, page: 1, perPage: 200, totalGroups, totalPages: groups.length ? 1 : 0 }
}

it('places the persistent project chart between KPIs and the existing date filters', () => {
  const component = readFileSync('app/components/team/MemberWorkViews.vue', 'utf8')
  const kpis = component.indexOf('v-if="isOwner && !overviewLoading && !overviewError && totals"')
  const chart = component.indexOf('data-testid="member-project-work-chart"')
  const picker = component.indexOf('<DateRangePicker')
  expect(kpis).toBeGreaterThan(-1)
  expect(kpis).toBeLessThan(chart)
  expect(chart).toBeLessThan(picker)
  expect(component).toContain('loadMemberProjectChart(fetchTotals, memberId, selectedRange, isRequestCurrent)')
  expect(component).toContain('selectedView === \'projects\' ? \'project\' : \'session\'')
  expect(component).toContain('overviewGeneration')
  expect(component).toContain('listGeneration')
  expect(component).toContain('team.workUnknownProject')
  expect(component).toContain('dashboard.chart.others')
})

it('returns empty daily buckets for a member with no recorded projects', async () => {
  const fetch = vi.fn(async () => response([], 0))
  const result = await loadMemberProjectChart(fetch, 'member', { start: '2024-01-01', end: '2024-01-01' })
  expect(result).toEqual({ points: [{ day: '2024-01-01', values: {} }], seriesKeys: [] })
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls[1]?.[0]).toMatchObject({ groupBy: 'day', filters: { member: 'member' }, dayBoundaries: expect.any(Array) })
})

it('does not request daily groups after the member/range request becomes stale', async () => {
  let current = true
  let release!: (value: TotalsResponse) => void
  const fetch = vi.fn(() => new Promise<TotalsResponse>((resolve) => { release = resolve }))
  const pending = loadMemberProjectChart(fetch, 'member', { start: '2024-01-01', end: '2024-01-01' }, () => current)
  current = false
  release(response([row('stale-project', 1)]))
  await expect(pending).resolves.toBeNull()
  expect(fetch).toHaveBeenCalledTimes(1)
})

it('builds a member-filtered daily project chart with full work coverage and local-day boundaries', async () => {
  const fetch = vi.fn(async (request: { groupBy?: string, filters?: { member?: string, project?: string }, dayBoundaries?: string[] }) => {
    if (request.groupBy === 'project') return response([
      row('unknown-project', 90), row('project-b', 60), row('project-c', 50), row('project-d', 40),
      row('project-e', 30), row('project-f', 20), row('', 10),
    ])
    if (request.groupBy === 'day' && request.filters?.project) {
      const dailyWork: Record<string, number> = {
        'unknown-project': 90, 'project-b': 60, 'project-c': 50, 'project-d': 40, 'project-e': 30,
      }
      return response([row('0', dailyWork[request.filters.project] ?? 0)])
    }
    return response([row('0', 300), row('1', 0)])
  })

  const result = await loadMemberProjectChart(fetch, 'historical-member', { start: '2024-01-01', end: '2024-01-02' })
  expect(result?.seriesKeys).toEqual(['unknown-project', 'project-b', 'project-c', 'project-d', 'project-e', '__project_others__'])
  expect(result?.points).toEqual([
    { day: '2024-01-01', values: { 'unknown-project': 90, 'project-b': 60, 'project-c': 50, 'project-d': 40, 'project-e': 30, __project_others__: 30 } },
    { day: '2024-01-02', values: { 'unknown-project': 0, 'project-b': 0, 'project-c': 0, 'project-d': 0, 'project-e': 0, __project_others__: 0 } },
  ])
  expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ groupBy: 'project', filters: { member: 'historical-member' } }))
  const dailyRequests = fetch.mock.calls.filter(([request]) => request.groupBy === 'day')
  expect(dailyRequests).toHaveLength(6)
  expect(dailyRequests.every(([request]) => request.filters?.member === 'historical-member')).toBe(true)
  expect(dailyRequests[0]?.[0].dayBoundaries).toHaveLength(3)
  expect(dailyRequests[0]?.[0].filters).toEqual({ member: 'historical-member' })
  expect(dailyRequests[1]?.[0].filters).toEqual({ member: 'historical-member', project: 'unknown-project' })
})

it('paginates daily results beyond 200 buckets without rebasing their global indexes', async () => {
  const dayCount = 201
  const dayRows = Array.from({ length: dayCount }, (_, index) => row(String(index), 1))
  const fetch = vi.fn(async (request: { groupBy?: string, page?: number, perPage?: number, filters?: { member?: string, project?: string } }) => {
    if (request.groupBy === 'project') return response([row('project-a', dayCount)])
    const rows = dayRows
    const perPage = request.perPage ?? 0
    const page = request.page ?? 1
    return {
      ...response(rows.slice((page - 1) * perPage, page * perPage), dayCount),
      page, perPage, totalGroups: dayCount, totalPages: Math.ceil(dayCount / perPage),
    }
  })
  const result = await loadMemberProjectChart(fetch, 'member', { start: '2024-01-01', end: '2024-07-19' })
  const dailyRequests = fetch.mock.calls.map(([request]) => request).filter(request => request.groupBy === 'day')
  expect(dailyRequests).toHaveLength(4)
  expect(dailyRequests.every(request => request.perPage === 200)).toBe(true)
  expect(dailyRequests.filter(request => request.page === 2)).toHaveLength(2)
  expect(result?.points).toHaveLength(dayCount)
  expect(result?.points[200]?.values['project-a']).toBe(1)
})

it('chunks ranges longer than 400 days and retains shared boundaries and global indexes', async () => {
  const fetch = vi.fn(async (request: { groupBy?: string, dayBoundaries?: string[], filters?: { member?: string } }) => {
    if (request.groupBy === 'project') return response([], 0)
    return response([row('0', 7)])
  })
  const result = await loadMemberProjectChart(fetch, 'member', { start: '2024-01-01', end: '2025-02-04' })
  const daily = fetch.mock.calls.map(([request]) => request).filter(request => request.groupBy === 'day')
  expect(daily.map(request => request.dayBoundaries?.length)).toEqual([401, 2])
  expect(daily[0]?.dayBoundaries?.at(-1)).toBe(daily[1]?.dayBoundaries?.[0])
  expect(result?.points).toHaveLength(401)
  expect(result?.points[0]?.values.__project_others__).toBe(7)
  expect(result?.points[400]?.values.__project_others__).toBe(7)
})

it('forwards DST-aware local boundaries unchanged to the daily totals request', async () => {
  const range = { start: '2024-03-09', end: '2024-03-11' }
  const { boundaries, labels } = buildLocalDayBoundaries(range, 'America/Los_Angeles')
  const fetch = vi.fn(async () => response([], 0))
  const result = await loadMemberProjectChart(fetch, 'member', range, () => true, 'America/Los_Angeles')
  expect(boundaries.map((value, index) => index ? Date.parse(value.replace(' ', 'T')) - Date.parse(boundaries[index - 1]!.replace(' ', 'T')) : 0))
    .toEqual([0, 24 * 60 * 60 * 1000, 23 * 60 * 60 * 1000, 24 * 60 * 60 * 1000])
  expect(fetch.mock.calls[1]?.[0].dayBoundaries).toEqual(boundaries)
  expect(result?.points.map(point => point.day)).toEqual(labels)
})

it.each([
  ['duplicate bucket index', [row('0', 1), row('0', 2)], total, /bucket index/],
  ['out-of-range bucket index', [row('1', 1)], total, /bucket index/],
  ['noninteger bucket index', [row('0.5', 1)], total, /bucket index/],
  ['negative daily work', [row('0', -1)], total, /daily group totals/],
  ['NaN daily work', [row('0', Number.NaN)], total, /daily group totals/],
  ['infinite daily work', [row('0', Number.POSITIVE_INFINITY)], total, /daily group totals/],
  ['negative summary work', [row('0', 1)], { ...total, workMs: -1 }, /daily summary/],
  ['NaN summary work', [row('0', 1)], { ...total, workMs: Number.NaN }, /daily summary/],
  ['infinite summary work', [row('0', 1)], { ...total, workMs: Number.POSITIVE_INFINITY }, /daily summary/],
] as const)('rejects %s before daily chart shaping', async (_case, groups, summary, expectedError) => {
  const fetch = vi.fn(async (request: { groupBy?: string, page?: number, perPage?: number }) => {
    if (request.groupBy === 'project') return response([row('project-a', 1)])
    return { ...response(groups as TotalsGroup[], groups.length > 1 ? 1 : groups.length), total: summary as TotalsRow }
  })
  await expect(loadMemberProjectChart(fetch, 'member', { start: '2024-01-01', end: '2024-01-01' }))
    .rejects.toThrow(expectedError)
})
