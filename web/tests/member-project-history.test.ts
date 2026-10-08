import { expect, it, vi } from 'vitest'
import type { TotalsGroup, TotalsResponse, TotalsRow } from '../app/lib/totals-map'
import { loadMemberProjectHistory, loadMemberProjectSessionTasks } from '../app/lib/member-project-history'

const total: TotalsRow = {
  entries: 2, wallMs: 30, workMs: 20, waitingMs: 10, input: 4, output: 5,
  cacheRead: 0, cacheWrite: 0, cost: 0.25, waitingUnavailableEntries: 0,
  costUnknownEntries: 1, costEstimatedEntries: 1, costKnownEntries: 1,
  costKnownSum: 0.25, unlinkedEntries: 0, distinctSessions: 2, count: 2,
}
function group(groupKey: string, overrides: Partial<TotalsGroup> = {}): TotalsGroup {
  return {
    ...total, groupKey, groupKey2: '', sessionName: groupKey, minStartedAt: '', maxEndedAt: '',
    distinctClient: 1, sampleClient: 'client', distinctProject: 1, sampleProject: 'project',
    distinctTask: 1, sampleTask: 'task', machine: '', distinctAgent: 1, sampleAgent: 'pi', ...overrides,
  }
}
function response(
  groups: TotalsGroup[],
  page: number,
  totalPages: number,
  totalGroups = groups.length,
  totals: TotalsRow = total,
  perPage = 200,
  ignoredSessionsIncluded?: boolean,
): TotalsResponse {
  return {
    groups, total: totals, page, perPage, totalGroups, totalPages,
    ...(ignoredSessionsIncluded === undefined ? {} : { ignoredSessionsIncluded }),
  }
}

it('loads complete all-time project history with member/project filters and carries unknown costs', async () => {
  const fetch = vi.fn(async (request: { groupBy?: string, page?: number }) => {
    if (request.groupBy === 'task') return response([
      group('task-a', { entries: 1, count: 1, wallMs: 15, workMs: 10, waitingMs: 5, input: 2, output: 2, cost: 0, costUnknownEntries: 1, costEstimatedEntries: 0, costKnownEntries: 0, costKnownSum: 0, distinctSessions: 1 }),
      group('task-b', { entries: 1, count: 1, wallMs: 15, workMs: 10, waitingMs: 5, input: 2, output: 3, cost: 0.25, costUnknownEntries: 0, costEstimatedEntries: 1, costKnownEntries: 1, costKnownSum: 0.25, distinctSessions: 1 }),
    ], 1, 1, 2)
    if (request.groupBy === 'session') return response([
      group('session-a', { entries: 1, count: 1, wallMs: 15, workMs: 10, waitingMs: 5, input: 2, output: 2, cost: 0, costUnknownEntries: 1, costEstimatedEntries: 0, costKnownEntries: 0, costKnownSum: 0, distinctSessions: 1, minStartedAt: '2020-01-02 00:00:00.000Z', maxEndedAt: '2020-01-02 00:30:00.000Z', ignoredSession: true }),
      group('session-b', { entries: 1, count: 1, wallMs: 15, workMs: 10, waitingMs: 5, input: 2, output: 3, cost: 0.25, costUnknownEntries: 0, costEstimatedEntries: 1, costKnownEntries: 1, costKnownSum: 0.25, distinctSessions: 1, minStartedAt: '2020-01-04 00:00:00.000Z', maxEndedAt: '2020-01-04 00:30:00.000Z', ignoredSession: false }),
    ], 1, 1, 2, total, 200, true)
    if (request.groupBy === 'day') return response([
      group('0', { entries: 1, count: 1, wallMs: 15, workMs: 10, waitingMs: 5, input: 2, output: 2, cost: 0, costUnknownEntries: 1, costEstimatedEntries: 0, costKnownEntries: 0, costKnownSum: 0, distinctSessions: 1 }),
      group('2', { entries: 1, count: 1, wallMs: 15, workMs: 10, waitingMs: 5, input: 2, output: 3, cost: 0.25, costUnknownEntries: 0, costEstimatedEntries: 1, costKnownEntries: 1, costKnownSum: 0.25, distinctSessions: 1 }),
    ], 1, 1, 2, total, 3)
    return response([], 1, 0, 0)
  })

  const result = await loadMemberProjectHistory(fetch, 'member-1', 'project-1', () => true, 'UTC')
  expect(result?.total).toMatchObject({ workMs: 20, entries: 2, costKnownEntries: 1, costUnknownEntries: 1 })
  expect(result?.distinctTasks).toBe(2)
  expect(result?.firstActivity).toBe('2020-01-02 00:00:00.000Z')
  expect(result?.lastActivity).toBe('2020-01-04 00:30:00.000Z')
  expect(result?.activeDays).toEqual(['2020-01-02', '2020-01-04'])
  expect(fetch.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ groupBy: 'none', filters: { member: 'member-1', project: 'project-1' } }))
  expect(fetch.mock.calls[0]?.[0]).not.toHaveProperty('from')
  expect(fetch.mock.calls[0]?.[0]).not.toHaveProperty('to')
  const sessionRequest = fetch.mock.calls.find(([request]) => request.groupBy === 'session')?.[0]
  expect(sessionRequest).toMatchObject({ includeIgnoredSessions: true, filters: { member: 'member-1', project: 'project-1' } })
})

it('rejects incomplete or drifting session pagination rather than presenting false history', async () => {
  const fetch = vi.fn(async (request: { groupBy?: string, page?: number }) => request.groupBy === 'session'
    ? request.page === 1
      ? response([group('session-a', { entries: 2, count: 2 })], 1, 2, 2, total, 200, true)
      : response([], 2, 2, 2, total, 200, true)
    : request.groupBy === 'task'
      ? response([group('task-a')], 1, 1, 1)
      : response([], 1, 0, 0))
  await expect(loadMemberProjectHistory(fetch, 'member', 'project', () => true, 'UTC')).rejects.toThrow(/incomplete|pagination/i)
})

it('rejects a legacy server session result that omits all ignored rows present in the summary', async () => {
  const allIgnoredTotal = { ...total, entries: 1, count: 1, distinctSessions: 1, workMs: 5 }
  const emptyTotal = { ...allIgnoredTotal, entries: 0, count: 0, distinctSessions: 0, workMs: 0, cost: 0, costUnknownEntries: 0, costEstimatedEntries: 0, costKnownEntries: 0, costKnownSum: 0 }
  const fetch = vi.fn(async (request: { groupBy?: string }) => {
    if (request.groupBy === 'session') return response([], 1, 0, 0, emptyTotal, 200, false)
    if (request.groupBy === 'task') return response([group('task-a', allIgnoredTotal)], 1, 1, 1, allIgnoredTotal)
    return response([], 1, 0, 0, allIgnoredTotal)
  })
  await expect(loadMemberProjectHistory(fetch, 'member', 'project', () => true, 'UTC')).rejects.toThrow(/ignored|inconsistent|mismatch/i)
})

it('rejects reversed session activity dates before constructing a chart', async () => {
  const fetch = vi.fn(async (request: { groupBy?: string }) => request.groupBy === 'session'
    ? response([group('reversed', { minStartedAt: '2024-03-01 00:00:00.000Z', maxEndedAt: '2023-03-01 00:00:00.000Z', ignoredSession: true })], 1, 1, 1, total, 200, true)
    : request.groupBy === 'task'
      ? response([group('task-a')], 1, 1, 1)
      : response([], 1, 0, 0))
  await expect(loadMemberProjectHistory(fetch, 'member', 'project', () => true, 'UTC')).rejects.toThrow(/date|activity/i)
})

it('keeps an unknown-only cost total distinguishable from a known zero', async () => {
  const unknownOnly = { ...total, entries: 1, count: 1, distinctSessions: 1, cost: 0, costKnownEntries: 0, costKnownSum: 0, costUnknownEntries: 1, costEstimatedEntries: 0 }
  const oneTask = group('task-a', unknownOnly)
  const oneSession = group('session-a', { ...unknownOnly, minStartedAt: '2020-01-02 00:00:00.000Z', maxEndedAt: '2020-01-02 00:30:00.000Z', ignoredSession: true })
  const fetch = vi.fn(async (request: { groupBy?: string, dayBoundaries?: string[] }) => {
    if (request.groupBy === 'session') return response([oneSession], 1, 1, 1, unknownOnly, 200, true)
    if (request.groupBy === 'task') return response([oneTask], 1, 1, 1, unknownOnly)
    if (request.groupBy === 'day') return response([group('0', unknownOnly)], 1, 1, 1, unknownOnly, 1)
    return response([], 1, 0, 0, unknownOnly)
  })
  const result = await loadMemberProjectHistory(fetch, 'member', 'project', () => true, 'UTC')
  expect(result?.total).toMatchObject({ cost: 0, costKnownEntries: 0, costKnownSum: 0, costUnknownEntries: 1 })
  expect(result).toMatchObject({ complete: true, sessions: [{ ignoredSession: true }], activeDays: ['2020-01-02'] })
})

it('adapts long histories to monthly chart buckets while keeping all day requests within the API boundary limit', async () => {
  const first = '2018-01-01 00:00:00.000Z'
  const last = '2021-01-01 00:00:00.000Z'
  const oneTotal = { ...total, entries: 1, count: 1, distinctSessions: 1, wallMs: 30, workMs: 20, waitingMs: 10, input: 4, output: 5 }
  const taskRow = group('task-a', oneTotal)
  const sessionRow = group('session', { ...oneTotal, minStartedAt: first, maxEndedAt: last, ignoredSession: false })
  const fetch = vi.fn(async (request: { groupBy?: string, dayBoundaries?: string[] }) => {
    if (request.groupBy === 'session') return response([sessionRow], 1, 1, 1, oneTotal, 200, true)
    if (request.groupBy === 'task') return response([taskRow], 1, 1, 1, oneTotal)
    if (request.groupBy === 'day') {
      const index = request.dayBoundaries?.findIndex(boundary => boundary.startsWith('2018-01-01')) ?? -1
      return index < 0 || index >= (request.dayBoundaries?.length ?? 0) - 1
        ? response([], 1, 0, 0, { ...oneTotal, entries: 0, count: 0, distinctSessions: 0, wallMs: 0, workMs: 0, waitingMs: 0, input: 0, output: 0, cost: 0, costKnownSum: 0, costUnknownEntries: 0, costEstimatedEntries: 0, costKnownEntries: 0, unlinkedEntries: 0, waitingUnavailableEntries: 0 }, Math.min(200, (request.dayBoundaries?.length ?? 2) - 1))
        : response([group(String(index), oneTotal)], 1, 1, 1, oneTotal, Math.min(200, (request.dayBoundaries?.length ?? 2) - 1))
    }
    return response([], 1, 0, 0, oneTotal)
  })
  const result = await loadMemberProjectHistory(fetch, 'member', 'project', () => true, 'UTC')
  expect(result?.chart?.granularity).toBe('month')
  expect(result?.chart?.points[0]?.period).toBe('2018-01')
  expect(result?.chart?.points.at(-1)?.period).toBe('2021-01')
  expect(fetch.mock.calls.filter(([request]) => request.groupBy === 'day').every(([request]) => (request.dayBoundaries?.length ?? 0) <= 401)).toBe(true)
  expect(fetch.mock.calls.filter(([request]) => request.groupBy === 'day').length).toBeGreaterThan(1)
})

it('loads lazy task aggregates with the complete member, project and session scope', async () => {
  const fetch = vi.fn(async () => response([group('task-1')], 1, 1, 1))
  await expect(loadMemberProjectSessionTasks(fetch, 'member', 'project', 'session-1', total)).resolves.toEqual([group('task-1')])
  expect(fetch).toHaveBeenCalledWith(expect.objectContaining({
    groupBy: 'task', filters: { member: 'member', project: 'project', session_id: 'session-1' }, page: 1, perPage: 200,
  }))
  expect(fetch.mock.calls[0]?.[0]).not.toHaveProperty('from')
  expect(fetch.mock.calls[0]?.[0]).not.toHaveProperty('to')
})

it('rejects session task summaries that drift from the owning session aggregate', async () => {
  const fetch = vi.fn(async () => response([group('task-1')], 1, 1, 1))
  const expectedSession = { ...total, entries: 1, count: 1, distinctSessions: 1, workMs: 5 }
  await expect(loadMemberProjectSessionTasks(fetch, 'member', 'project', 'session-1', expectedSession))
    .rejects.toThrow(/session task summary/i)
})

it('does not query session task details for an opaque empty session id', async () => {
  const session = group('', { minStartedAt: '2020-01-02 00:00:00.000Z', maxEndedAt: '2020-01-02 00:30:00.000Z', ignoredSession: false })
  const fetch = vi.fn(async (request: { groupBy?: string, dayBoundaries?: string[] }) => request.groupBy === 'session'
    ? response([session], 1, 1, 1, total, 200, true)
    : request.groupBy === 'task'
      ? response([group('task-a')], 1, 1, 1)
      : request.groupBy === 'day'
        ? response([group('0')], 1, 1, 1, total, 1)
        : response([], 1, 0, 0))
  const result = await loadMemberProjectHistory(fetch, 'member', 'project', () => true, 'UTC')
  expect(result?.sessions[0]).toMatchObject({ identifiable: false, tasks: null })
  expect(fetch.mock.calls.some(([request]) => request.groupBy === 'task' && request.filters?.session_id)).toBe(false)
})
