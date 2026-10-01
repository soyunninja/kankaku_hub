/**
 * Unit tests for `app/composables/useEntriesExplorer.ts`'s new
 * totals-backed `fetchAgentOptions`, especially the `LEGACY_AGENT`
 * empty-string mapping (it must reuse
 * `app/lib/measurement-quality.ts#listDistinctAgents` so this stays in
 * sync with the row-level path's normalization/sort, rather than
 * re-implementing it) and the `total_pages > 1` warning path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_AGENT } from '../app/lib/measurement-quality'
import type { TotalsGroup, TotalsResponse } from '../app/lib/totals-map'

function agentGroup(groupKey: string): TotalsGroup {
  return {
    entries: 1,
    wallMs: 0,
    workMs: 0,
    waitingMs: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0,
    waitingUnavailableEntries: 0,
    costUnknownEntries: 0,
    costEstimatedEntries: 0,
    costKnownEntries: 0,
    costKnownSum: 0,
    unlinkedEntries: 0,
    distinctSessions: 0,
    count: 1,
    groupKey,
    groupKey2: '',
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
  }
}

function totalsResponse(groups: TotalsGroup[], totalPages = 1): TotalsResponse {
  return {
    groups,
    total: { ...groups[0]!, count: groups[0]?.entries ?? 0 } as never,
    page: 1,
    perPage: 200,
    totalGroups: groups.length,
    totalPages,
  }
}

describe('useEntriesExplorer', () => {
  it('collects every filtered session id and rejects an unscoped scan', async () => {
    const getFullList = vi.fn(async () => [{ id: 'a' }, { id: 'b' }])
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection: () => ({ getFullList }) } }))
    vi.stubGlobal('useTotals', () => ({}))
    const { useEntriesExplorer } = await import('../app/composables/useEntriesExplorer')
    const explorer = useEntriesExplorer()
    expect(await explorer.collectEntryIds({ session_id: 'session', status: 'completed' })).toEqual(['a', 'b'])
    expect(getFullList).toHaveBeenCalledWith(expect.objectContaining({ fields: 'id', filter: 'status = "completed" && session_id = "session"' }))
    await expect(explorer.collectEntryIds({})).rejects.toThrow()
  })

  it('assigns only task in chunks of 50 and retains failed chunk ids', async () => {
    const update = vi.fn()
    const send = vi.fn().mockResolvedValueOnce(Array.from({ length: 50 }, () => ({ status: 200 }))).mockRejectedValueOnce(new Error('rollback'))
    const createBatch = vi.fn(() => ({ collection: () => ({ update }), send }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { createBatch } }))
    vi.stubGlobal('useTotals', () => ({}))
    const { useEntriesExplorer } = await import('../app/composables/useEntriesExplorer')
    const ids = Array.from({ length: 51 }, (_, i) => String(i))
    const result = await useEntriesExplorer().bulkAssignTask(ids, 'task')
    expect(createBatch).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledWith('0', { task: 'task' })
    expect(result).toEqual({ succeeded: ids.slice(0, 50), failed: ['50'] })
  })

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchAgentOptions: requests group_by=agent with perPage=200', async () => {
    const fetchTotals = vi.fn(async () => totalsResponse([agentGroup('pi')]))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: {} }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals }))

    const { useEntriesExplorer } = await import('../app/composables/useEntriesExplorer')
    const { fetchAgentOptions } = useEntriesExplorer()

    await fetchAgentOptions()

    expect(fetchTotals).toHaveBeenCalledWith({ groupBy: 'agent', perPage: 200 })
  })

  it('fetchAgentOptions: maps an empty group_key to the LEGACY_AGENT sentinel, matching listDistinctAgents', async () => {
    const fetchTotals = vi.fn(async () => totalsResponse([agentGroup('pi'), agentGroup(''), agentGroup('opencode')]))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: {} }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals }))

    const { useEntriesExplorer } = await import('../app/composables/useEntriesExplorer')
    const { fetchAgentOptions } = useEntriesExplorer()

    const agents = await fetchAgentOptions()

    // Same sort/sentinel contract as listDistinctAgents: alphabetical,
    // LEGACY_AGENT always last.
    expect(agents).toEqual(['opencode', 'pi', LEGACY_AGENT])
  })

  it('fetchAgentOptions: warns (does not throw or silently truncate) when totalPages > 1', async () => {
    const fetchTotals = vi.fn(async () => totalsResponse([agentGroup('pi')], 2))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: {} }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { useEntriesExplorer } = await import('../app/composables/useEntriesExplorer')
    const { fetchAgentOptions } = useEntriesExplorer()

    const agents = await fetchAgentOptions()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]![0]).toContain('totalPages=2')
    expect(agents).toEqual(['pi'])

    warnSpy.mockRestore()
  })

  it('still exports listAgents as an @deprecated fallback', async () => {
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection: vi.fn() } }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals: vi.fn() }))

    const { useEntriesExplorer } = await import('../app/composables/useEntriesExplorer')
    const composable = useEntriesExplorer()

    expect(typeof composable.listAgents).toBe('function')
  })

  it('list: builds a session_id = "..." filter clause when filters.session_id is set', async () => {
    const getListResult = { items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 0 }
    const getList = vi.fn(async () => getListResult)
    const collection = vi.fn(() => ({ getList }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection } }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals: vi.fn() }))

    const { useEntriesExplorer } = await import('../app/composables/useEntriesExplorer')
    const { list } = useEntriesExplorer()

    await list({ page: 1, perPage: 200, sort: 'started_at', filters: { session_id: 'sess-123' } })

    expect(collection).toHaveBeenCalledWith('task_entries')
    expect(getList).toHaveBeenCalledWith(1, 200, expect.objectContaining({
      filter: 'session_id = "sess-123"',
    }))
  })

  it('list: combines session_id with other filters using && , mirroring the other simple-equality filters', async () => {
    const getListResult = { items: [], page: 1, perPage: 200, totalItems: 0, totalPages: 0 }
    const getList = vi.fn(async () => getListResult)
    const collection = vi.fn(() => ({ getList }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection } }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals: vi.fn() }))

    const { useEntriesExplorer } = await import('../app/composables/useEntriesExplorer')
    const { list } = useEntriesExplorer()

    await list({ page: 1, perPage: 200, sort: 'started_at', filters: { client: 'client-a', session_id: 'sess-123' } })

    expect(getList).toHaveBeenCalledWith(1, 200, expect.objectContaining({
      filter: 'client = "client-a" && session_id = "sess-123"',
    }))
  })
})
