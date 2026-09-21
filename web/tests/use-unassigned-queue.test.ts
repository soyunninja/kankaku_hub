/**
 * Unit tests for `app/composables/useUnassignedQueue.ts`'s new
 * totals-backed functions (`fetchUnassignedGroups`, `fetchGroupEntries`).
 * `useTotals()` is stubbed directly for the group-listing test; `$pb` is
 * stubbed for `fetchGroupEntries` (a plain `getList` call, no totals
 * involved).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TotalsGroup, TotalsResponse } from '../app/lib/totals-map'

function legacyLabelGroup(overrides: Partial<TotalsGroup> = {}): TotalsGroup {
  return {
    entries: 5,
    wallMs: 1000,
    workMs: 900,
    waitingMs: 100,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 1.5,
    waitingUnavailableEntries: 0,
    costUnknownEntries: 0,
    costEstimatedEntries: 0,
    costKnownEntries: 5,
    costKnownSum: 1.5,
    unlinkedEntries: 0,
    distinctSessions: 2,
    count: 5,
    groupKey: 'Acme Corp',
    groupKey2: '/home/dev/acme-repo',
    sessionName: '',
    minStartedAt: '',
    maxEndedAt: '',
    distinctClient: 0,
    sampleClient: '',
    distinctProject: 0,
    sampleProject: '',
    distinctTask: 0,
    sampleTask: '',
    machine: '',
    distinctAgent: 0,
    sampleAgent: '',
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

describe('useUnassignedQueue', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchUnassignedGroups: requests group_by=legacy_label filtered by client, sorted -cost, and reshapes group_key/group_key2', async () => {
    const fetchTotals = vi.fn(async () => totalsResponse([legacyLabelGroup()]))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: {} }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals }))

    const { useUnassignedQueue } = await import('../app/composables/useUnassignedQueue')
    const { fetchUnassignedGroups } = useUnassignedQueue()

    const page = await fetchUnassignedGroups('unassigned-client-id', { page: 1, perPage: 20 })

    expect(fetchTotals).toHaveBeenCalledWith({
      groupBy: 'legacy_label',
      filters: { client: 'unassigned-client-id' },
      sort: '-cost',
      page: 1,
      perPage: 20,
    })

    expect(page.groups).toHaveLength(1)
    expect(page.groups[0]!.legacyLabel).toBe('Acme Corp')
    expect(page.groups[0]!.repoProject).toBe('/home/dev/acme-repo')
  })

  it('fetchGroupEntries: filters by client AND both legacyLabel/repoProject (not legacyLabel alone)', async () => {
    const getList = vi.fn(async () => ({ items: [], totalItems: 0, totalPages: 0, page: 1, perPage: 20 }))
    const collection = vi.fn(() => ({ getList }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection } }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals: vi.fn() }))

    const { useUnassignedQueue } = await import('../app/composables/useUnassignedQueue')
    const { fetchGroupEntries } = useUnassignedQueue()

    await fetchGroupEntries('unassigned-client-id', 'Acme Corp', '/home/dev/acme-repo', { page: 1, perPage: 20 })

    expect(collection).toHaveBeenCalledWith('task_entries')
    expect(getList).toHaveBeenCalledWith(1, 20, expect.objectContaining({
      filter: 'client = "unassigned-client-id" && legacy_client_label = "Acme Corp" && repo_project = "/home/dev/acme-repo"',
    }))
  })

  it('fetchGroupEntries: escapes double quotes in legacyLabel/repoProject', async () => {
    const getList = vi.fn(async () => ({ items: [], totalItems: 0, totalPages: 0, page: 1, perPage: 20 }))
    const collection = vi.fn(() => ({ getList }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection } }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals: vi.fn() }))

    const { useUnassignedQueue } = await import('../app/composables/useUnassignedQueue')
    const { fetchGroupEntries } = useUnassignedQueue()

    await fetchGroupEntries('c1', 'Weird "Label"', 'repo', { page: 1, perPage: 20 })

    const query = getList.mock.calls[0]![2] as { filter: string }
    expect(query.filter).toContain('legacy_client_label = "Weird \\"Label\\""')
  })

  it('still exports fetchUnassigned as an @deprecated fallback', async () => {
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection: vi.fn() } }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals: vi.fn() }))

    const { useUnassignedQueue } = await import('../app/composables/useUnassignedQueue')
    const composable = useUnassignedQueue()

    expect(typeof composable.fetchUnassigned).toBe('function')
    expect(typeof composable.bulkAssign).toBe('function')
  })
})
