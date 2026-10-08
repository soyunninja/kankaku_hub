import { expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { TotalsGroup, TotalsResponse, TotalsRow } from '../app/lib/totals-map'
import { countRecordedMemberProjects, loadMemberWorkGroups, memberWorkProjectCacheKey } from '../app/lib/member-work-views'
import { localDateRangeToUtcFilters } from '../app/lib/local-day'

const total: TotalsRow = {
  entries: 3, wallMs: 30, workMs: 20, waitingMs: 10, input: 0, output: 0,
  cacheRead: 0, cacheWrite: 0, cost: 1, waitingUnavailableEntries: 0,
  costUnknownEntries: 0, costEstimatedEntries: 0, costKnownEntries: 3,
  costKnownSum: 1, unlinkedEntries: 0, distinctSessions: 2, count: 3,
}
function group(groupKey: string): TotalsGroup {
  return {
    ...total, groupKey, groupKey2: '', sessionName: groupKey, minStartedAt: '', maxEndedAt: '',
    distinctClient: 1, sampleClient: 'client', distinctProject: 1, sampleProject: 'project',
    distinctTask: 1, sampleTask: 'task', machine: '', distinctAgent: 1, sampleAgent: 'pi',
  }
}
function response(groups: TotalsGroup[], page: number, totalPages: number, totalGroups = groups.length): TotalsResponse {
  return { groups, total, page, perPage: 2, totalGroups, totalPages }
}

it('counts distinct recorded projects, including archived and missing history but excluding blank and protected placeholders', () => {
  const projects = [
    { id: 'placeholder', client: 'sentinel', active: true },
    { id: 'archived', client: 'real-client', active: false },
    { id: 'project-a', client: 'real-client', active: true },
  ]
  const clients = [{ id: 'sentinel', unassigned: true }, { id: 'real-client', unassigned: false }]
  const groups = [group(''), group('   '), group('placeholder'), group('archived'), group('missing-history'), group('project-a')]
  expect(countRecordedMemberProjects(groups, projects, clients)).toBe(3)
  expect(countRecordedMemberProjects([group('project-a'), group('project-a')], projects, clients)).toBe(1)
})

it('counts a project once even when its work appears across multiple sessions', () => {
  const repeatedSessionGroups = [
    { ...group('session-a'), distinctProject: 2 },
    { ...group('session-b'), distinctProject: 2 },
  ]
  const projectGroups = [group('project-a'), group('project-b')]
  expect(repeatedSessionGroups.reduce((sum, session) => sum + session.distinctProject, 0)).toBe(4)
  expect(countRecordedMemberProjects(projectGroups, [], [])).toBe(2)
})

it('keeps overview loading independent from project/session list reloads', () => {
  const component = readFileSync('app/components/team/MemberWorkViews.vue', 'utf8')
  expect(component).toContain('const overviewLoading = ref(false)')
  expect(component).toContain('const listLoading = ref(false)')
  expect(component).toContain('const listReady = ref(false)')
  expect(component).toContain('<template v-else-if="listReady">')
  expect(component).toContain('watch([() => props.memberId, view, () => range.value.start, () => range.value.end, isOwner]')
  expect(component).toContain('void loadOverview()')
  expect(component).toContain('void loadGroups()')
  expect(component).toContain('if (current[0] !== previous[0] || current[2] !== previous[2] || current[3] !== previous[3] || current[4] !== previous[4])')
  expect(component).toContain('projectChart.value = chartResult')
  expect(component).toContain('projectChart.value = null')
  expect(component).toContain('v-if="!overviewLoading && !overviewError && hasProjectChartWork"')
  expect(component).toContain('v-else-if="listLoading"')
  expect(component).not.toContain('view.value === selectedView && dateStart.value === selectedRange.start && dateEnd.value === selectedRange.end\n    && overviewGeneration')
  expect(component).toContain('loadMemberProjectChart(fetchTotals, memberId, selectedRange, isRequestCurrent)')
})

it('emphasizes the selected work view while preserving its accessible state', () => {
  const component = readFileSync('app/components/team/MemberWorkViews.vue', 'utf8')
  for (const view of ['projects', 'sessions']) {
    expect(component).toContain(`:class="{ 'font-bold': view === '${view}' }"`)
    expect(component).toContain(`:aria-pressed="view === '${view}'"`)
  }
})

it('uses the shared date-range picker once and observes nested range edits', () => {
  const component = readFileSync('app/components/team/MemberWorkViews.vue', 'utf8')
  expect(component).toContain("import DateRangePicker from '@/components/dashboard/DateRangePicker.vue'")
  expect(component.match(/<DateRangePicker\b/g)).toHaveLength(1)
  expect(component).toContain('v-model:preset="preset" v-model:range="range"')
  expect(component).not.toMatch(/<input[^>]+type="date"/)
  expect(component).toContain('() => range.value.start, () => range.value.end')
  expect(component).toContain('dateRangeFromQuery(route.query.dateStart, route.query.dateEnd, initialRange)')
})

it('places ready-only KPIs above persistent filters with a 32px gap', () => {
  const component = readFileSync('app/components/team/MemberWorkViews.vue', 'utf8')
  const kpis = component.indexOf('v-if="isOwner && !overviewLoading && !overviewError && totals"')
  const picker = component.indexOf('<DateRangePicker')
  const loading = component.indexOf('v-else-if="listLoading"')
  const error = component.indexOf('v-else-if="listError"')
  const totals = component.indexOf('<template v-else-if="listReady">')

  expect(kpis).toBeGreaterThan(-1)
  expect(kpis).toBeLessThan(picker)
  expect(component).toContain('class="flex min-w-0 flex-col gap-8"')
  expect(picker).toBeLessThan(loading)
  expect(picker).toBeLessThan(error)
  expect(picker).toBeLessThan(totals)
})

it('shows only the numeric records count beneath the Registros label', () => {
  const component = readFileSync('app/components/team/MemberWorkViews.vue', 'utf8')
  expect(component).toContain('t(\'team.memberTotalEntries\')')
  expect(component).toContain('{{ group.entries }}')
  expect(component).not.toContain("t('team.workGroupEntries', { count: group.entries })")
})

it('shows the member summary metrics in order and uses API distinct sessions for the Sessions KPI', async () => {
  const fetch = vi.fn(async () => response([group('session-a'), group('session-b')], 1, 1))
  const result = await loadMemberWorkGroups(fetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'session')
  expect(result?.total.entries).toBe(3)
  expect(result?.total.distinctSessions).toBe(2)

  const component = readFileSync('app/components/team/MemberWorkViews.vue', 'utf8')
  const cards = [...component.matchAll(/<KpiCard\s+:title="t\('([^']+)'\)"\s+:value="([^"]+)"\s*\/>/g)]
  expect(cards.map(([, title]) => title)).toEqual([
    'team.workProjects', 'team.workSessions', 'team.memberTotalMinutes', 'team.memberTotalCost',
  ])
  expect(cards[1]?.[2]).toBe('String(totals.distinctSessions)')
})

it('loads project KPI and chart as overview state, independent from the selected card grouping', () => {
  const component = readFileSync('app/components/team/MemberWorkViews.vue', 'utf8')
  expect(component).toContain('projectCountCache')
  expect(component).toContain('memberWorkProjectCacheKey(memberId, selectedRange)')
  expect(component).toContain('countRecordedMemberProjects')
  expect(component).toContain("loadMemberWorkGroups(fetchTotals, memberId, selectedRange, 'project', isRequestCurrent)")
  expect(component).toContain('loadMemberProjectChart(fetchTotals, memberId, selectedRange, isRequestCurrent)')
  expect(component).toContain("selectedView === 'projects' ? 'project' : 'session'")
  expect(component).not.toMatch(/distinctProject\s*\+/)
  expect(component).toContain('projectCount.value = projectCountCache.get(cacheKey) ?? null')
  expect(component).toContain('projectCountCache.delete(memberWorkProjectCacheKey(props.memberId, { start: dateStart.value, end: dateEnd.value }))')
  expect(component).toContain('grid-cols-2 gap-3 md:grid-cols-4 md:gap-6')
  expect(component.indexOf("t('team.workProjects')")).toBeLessThan(component.indexOf("t('team.memberTotalEntries')"))
  expect(component).not.toContain('.active')
  expect(component).toContain('const { ensureLoaded: ensureClients, clients } = useClients()')
})

it('keys cached project counts by both member and selected local date window', () => {
  const range = { start: '2024-01-01', end: '2024-01-31' }
  expect(memberWorkProjectCacheKey('member-a', range)).toBe(memberWorkProjectCacheKey('member-a', range))
  expect(memberWorkProjectCacheKey('member-a', range)).not.toBe(memberWorkProjectCacheKey('member-b', range))
  expect(memberWorkProjectCacheKey('member-a', range)).not.toBe(memberWorkProjectCacheKey('member-a', { ...range, end: '2024-02-01' }))
})

it.each(['project', 'session'] as const)('requests actual %s aggregates with the same historic member and date range', async (groupBy) => {
  const fetch = vi.fn(async () => response([group('group-1')], 1, 1))
  const result = await loadMemberWorkGroups(fetch, 'historical-member', { start: '2024-01-01', end: '2024-01-31' }, groupBy)
  expect(result?.groups.map(row => row.groupKey)).toEqual(['group-1'])
  expect(fetch).toHaveBeenCalledWith(expect.objectContaining({
    groupBy, page: 1, perPage: 200,
    filters: { member: 'historical-member' },
  }))
  const request = fetch.mock.calls[0]?.[0]
  expect(request?.from).toBe(localDateRangeToUtcFilters({ start: '2024-01-01', end: '2024-01-31' }).start)
  expect(request?.to).toBe(localDateRangeToUtcFilters({ start: '2024-01-01', end: '2024-01-31' }).end)
})

it('fetches every reported group page before exposing results', async () => {
  const fetch = vi.fn(async ({ page = 1 }: { page?: number }) => page === 1
    ? response([group('a'), group('b')], 1, 2, 3)
    : response([group('c')], 2, 2, 3))
  const result = await loadMemberWorkGroups(fetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'project')
  expect(result?.groups.map(row => row.groupKey)).toEqual(['a', 'b', 'c'])
  expect(countRecordedMemberProjects(result!.groups, [], [])).toBe(3)
  expect(fetch.mock.calls.map(([request]) => request.page)).toEqual([1, 2])
})

it('rejects inconsistent or incomplete pagination instead of showing partial groups', async () => {
  const fetch = vi.fn(async ({ page = 1 }: { page?: number }) => page === 1
    ? response([group('a')], 1, 2, 2)
    : response([], 2, 2, 2))
  await expect(loadMemberWorkGroups(fetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'session'))
    .rejects.toThrow(/pagination/i)
})

it.each(['workMs', 'cost', 'entries'] as const)('rejects malformed summary %s rather than formatting it as zero', async (field) => {
  const invalidValues = [undefined, '20', null, Number.NaN, Number.POSITIVE_INFINITY, -1]
  for (const value of invalidValues) {
    const malformed = { ...total, [field]: value }
    const fetch = vi.fn(async () => ({ ...response([group('a')], 1, 1), total: malformed } as unknown as TotalsResponse))
    await expect(loadMemberWorkGroups(fetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'project'))
      .rejects.toThrow(/numeric|totals/i)
  }
})

it.each(['workMs', 'cost', 'entries'] as const)('rejects malformed grouped %s rather than formatting it as zero', async (field) => {
  const invalidValues = [undefined, '20', null, Number.NaN, Number.POSITIVE_INFINITY, -1]
  for (const value of invalidValues) {
    const malformed = { ...group('a'), [field]: value }
    const fetch = vi.fn(async () => response([malformed as TotalsGroup], 1, 1))
    await expect(loadMemberWorkGroups(fetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'session'))
      .rejects.toThrow(/numeric|totals/i)
  }
})

it('validates required metric/count fields and group counts while allowing absent optional metadata', async () => {
  const malformedTotal = { ...total, waitingMs: undefined, costUnknownEntries: 0.5 }
  const summaryFetch = vi.fn(async () => ({ ...response([group('a')], 1, 1), total: malformedTotal } as unknown as TotalsResponse))
  await expect(loadMemberWorkGroups(summaryFetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'project'))
    .rejects.toThrow(/numeric|totals/i)

  const malformedGroup = { ...group('a'), distinctProject: Number.NaN, activeProjects: undefined }
  const groupFetch = vi.fn(async () => response([malformedGroup as TotalsGroup], 1, 1))
  await expect(loadMemberWorkGroups(groupFetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'project'))
    .rejects.toThrow(/numeric|totals/i)

  const fractionalCount = { ...total, entries: 1.5, count: 1.5 }
  const countFetch = vi.fn(async () => ({ ...response([group('a')], 1, 1), total: fractionalCount } as unknown as TotalsResponse))
  await expect(loadMemberWorkGroups(countFetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'project'))
    .rejects.toThrow(/numeric|totals/i)
})

it('preserves genuine zeros, empty results and finite fractional work/cost values', async () => {
  const zero = {
    ...total, entries: 0, count: 0, wallMs: 0, workMs: 0, waitingMs: 0, cost: 0, costKnownSum: 0,
    waitingUnavailableEntries: 0, costUnknownEntries: 0, costEstimatedEntries: 0,
    costKnownEntries: 0, unlinkedEntries: 0, distinctSessions: 0,
  }
  const emptyFetch = vi.fn(async () => ({ ...response([], 1, 0, 0), total: zero }))
  await expect(loadMemberWorkGroups(emptyFetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'project'))
    .resolves.toMatchObject({ groups: [], total: { entries: 0, workMs: 0, cost: 0 } })

  const fractional = { ...total, workMs: 0.5, cost: 0.125, costKnownSum: 0.125 }
  const fractionalFetch = vi.fn(async () => ({ ...response([{ ...group('a'), ...fractional }], 1, 1), total: fractional }))
  await expect(loadMemberWorkGroups(fractionalFetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'project'))
    .resolves.toMatchObject({ groups: [{ workMs: 0.5, cost: 0.125 }], total: { workMs: 0.5, cost: 0.125 } })
})

it('rejects invalid numeric fields on later pages without returning prior page groups', async () => {
  const fetch = vi.fn(async ({ page = 1 }: { page?: number }) => page === 1
    ? response([group('a')], 1, 2, 2)
    : response([{ ...group('b'), cost: Number.NaN } as TotalsGroup], 2, 2, 2))
  await expect(loadMemberWorkGroups(fetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'project'))
    .rejects.toThrow(/numeric|totals/i)
  expect(fetch).toHaveBeenCalledTimes(2)

  const summaryFetch = vi.fn(async ({ page = 1 }: { page?: number }) => page === 1
    ? response([group('a')], 1, 2, 2)
    : ({ ...response([group('b')], 2, 2, 2), total: { ...total, workMs: Number.POSITIVE_INFINITY } } as unknown as TotalsResponse))
  await expect(loadMemberWorkGroups(summaryFetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'session'))
    .rejects.toThrow(/numeric|totals/i)
  expect(summaryFetch).toHaveBeenCalledTimes(2)
})

it('discards a stale request before fetching or publishing later pages', async () => {
  let current = true
  let release!: (value: TotalsResponse) => void
  const fetch = vi.fn(() => new Promise<TotalsResponse>((resolve) => { release = resolve }))
  const pending = loadMemberWorkGroups(fetch, 'member', { start: '2024-01-01', end: '2024-01-30' }, 'project', () => current)
  current = false
  release(response([group('stale')], 1, 1))
  await expect(pending).resolves.toBeNull()
  expect(fetch).toHaveBeenCalledTimes(1)
})
