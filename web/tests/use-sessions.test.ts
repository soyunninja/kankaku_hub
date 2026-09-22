/**
 * Unit tests for `app/composables/useSessions.ts`'s new totals-backed
 * functions (`fetchSessionTotals`, `fetchUnassignedSessionTotals`).
 * `useTotals()` is stubbed directly (not `$pb.send`) — these tests are
 * about the request shape this composable builds and how it reshapes
 * `TotalsGroup` rows into `SessionTotal`, not about `useTotals`'s own
 * wire mapping (covered by `totals-map.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TotalsGroup, TotalsResponse } from '../app/lib/totals-map'

function sessionGroup(overrides: Partial<TotalsGroup> = {}): TotalsGroup {
  return {
    entries: 2,
    wallMs: 1000,
    workMs: 900,
    waitingMs: 100,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0.5,
    waitingUnavailableEntries: 0,
    costUnknownEntries: 0,
    costEstimatedEntries: 0,
    costKnownEntries: 2,
    costKnownSum: 0.5,
    unlinkedEntries: 0,
    distinctSessions: 1,
    count: 2,
    groupKey: 'sess-1',
    groupKey2: '',
    sessionName: 'Refactor auth',
    minStartedAt: '2026-01-01 10:00:00.000Z',
    maxEndedAt: '2026-01-01 10:20:00.000Z',
    distinctClient: 1,
    sampleClient: 'client-a',
    distinctProject: 1,
    sampleProject: 'project-a',
    distinctTask: 1,
    sampleTask: 'task-a',
    machine: 'mac-mini',
    distinctAgent: 1,
    sampleAgent: 'pi',
    ...overrides,
  }
}

function totalsResponse(groups: TotalsGroup[]): TotalsResponse {
  return {
    groups,
    total: { ...groups[0]!, count: groups[0]?.entries ?? 0 } as never,
    page: 1,
    perPage: 50,
    totalGroups: groups.length,
    totalPages: groups.length === 0 ? 0 : 1,
  }
}

describe('useSessions', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchSessionTotals: requests group_by=session filtered by task, sorted -min_started_at, and reshapes groups', async () => {
    const fetchTotals = vi.fn(async () => totalsResponse([sessionGroup()]))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: {} }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals }))

    const { useSessions } = await import('../app/composables/useSessions')
    const { fetchSessionTotals } = useSessions()

    const page = await fetchSessionTotals('task-a', { page: 2, perPage: 25 })

    expect(fetchTotals).toHaveBeenCalledWith({
      groupBy: 'session',
      filters: { task: 'task-a' },
      sort: '-min_started_at',
      page: 2,
      perPage: 25,
    })

    expect(page.sessions).toHaveLength(1)
    const [session] = page.sessions
    expect(session!.sessionId).toBe('sess-1')
    // 10:00 -> 10:20 = 20 minutes
    expect(session!.elapsedMs).toBe(20 * 60 * 1000)
    expect(session!.mixed).toBe(false)
  })

  it('fetchSessionTotals: flags mixed when the session\'s rows disagree on client or project', async () => {
    const fetchTotals = vi.fn(async () => totalsResponse([sessionGroup({ distinctClient: 2 })]))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: {} }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals }))

    const { useSessions } = await import('../app/composables/useSessions')
    const { fetchSessionTotals } = useSessions()

    const page = await fetchSessionTotals('task-a')
    expect(page.sessions[0]!.mixed).toBe(true)
  })

  it('fetchUnassignedSessionTotals: requests without_task + session_fully_unassigned, sorted -min_started_at', async () => {
    const fetchTotals = vi.fn(async () => totalsResponse([]))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: {} }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals }))

    const { useSessions } = await import('../app/composables/useSessions')
    const { fetchUnassignedSessionTotals } = useSessions()

    await fetchUnassignedSessionTotals()

    expect(fetchTotals).toHaveBeenCalledWith({
      groupBy: 'session',
      filters: { without_task: true, session_fully_unassigned: true },
      sort: '-min_started_at',
      page: undefined,
      perPage: undefined,
    })
  })

  it('fetchSessionTotalsForEntries: requests group_by=session with the given filters/date-range/page, sorted -min_started_at', async () => {
    const fetchTotals = vi.fn(async () => totalsResponse([sessionGroup()]))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: {} }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals }))

    const { useSessions } = await import('../app/composables/useSessions')
    const { fetchSessionTotalsForEntries } = useSessions()

    const page = await fetchSessionTotalsForEntries({
      filters: { client: 'client-a' },
      from: '2026-01-01 00:00:00.000Z',
      to: '2026-01-31 23:59:59.999Z',
      page: 2,
      perPage: 25,
    })

    expect(fetchTotals).toHaveBeenCalledWith({
      groupBy: 'session',
      filters: { client: 'client-a' },
      from: '2026-01-01 00:00:00.000Z',
      to: '2026-01-31 23:59:59.999Z',
      sort: '-min_started_at',
      page: 2,
      perPage: 25,
    })

    expect(page.sessions).toHaveLength(1)
    expect(page.sessions[0]!.sessionId).toBe('sess-1')
    // task info (distinctTask/sampleTask) is available on the reshaped
    // row, inherited from TotalsGroup — no separate mapping needed.
    expect(page.sessions[0]!.distinctTask).toBe(1)
    expect(page.sessions[0]!.sampleTask).toBe('task-a')
  })

  it('fetchSessionTotalsForEntries: propagates TotalsRouteUnavailableError untouched', async () => {
    class FakeUnavailable extends Error {}
    const fetchTotals = vi.fn(async () => { throw new FakeUnavailable('unavailable') })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: {} }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals }))

    const { useSessions } = await import('../app/composables/useSessions')
    const { fetchSessionTotalsForEntries } = useSessions()

    await expect(fetchSessionTotalsForEntries({ filters: {} })).rejects.toThrow(FakeUnavailable)
  })

  it('still exports fetchSessionsForTask and fetchUnassignedSessions as @deprecated fallbacks', async () => {
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection: vi.fn() } }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals: vi.fn() }))

    const { useSessions } = await import('../app/composables/useSessions')
    const composable = useSessions()

    expect(typeof composable.fetchSessionsForTask).toBe('function')
    expect(typeof composable.fetchUnassignedSessions).toBe('function')
  })
})
