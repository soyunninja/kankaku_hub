/**
 * The pre-totals fallback reads (used only against a hub whose totals route
 * is not loaded) must be HARD-capped. PocketBase's `getFullList` pages until
 * a short page regardless of `perPage`, so it can never be a cap: every
 * fallback here must be one `getList(1, CAP, …)` call and must never touch
 * `getFullList`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function stubPb(items: unknown[], totalItems: number) {
  const getList = vi.fn(async (_page: number, perPage: number) => ({ items, totalItems, totalPages: 1, page: 1, perPage }))
  const getFullList = vi.fn(async () => { throw new Error('getFullList must not be used by a capped fallback') })
  const collection = vi.fn(() => ({ getList, getFullList }))
  vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection } }))
  vi.stubGlobal('useTotals', () => ({ fetchTotals: vi.fn() }))
  return { getList, getFullList }
}

describe('fallback reads are hard-capped', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllGlobals())

  it('useUnassignedQueue.fetchUnassigned: one capped page, reports truncation', async () => {
    const { getList, getFullList } = stubPb([{ id: 'a' }], 5000)
    const { useUnassignedQueue, UNASSIGNED_FALLBACK_CAP } = await import('../app/composables/useUnassignedQueue')
    const result = await useUnassignedQueue().fetchUnassigned('cid')
    expect(getFullList).not.toHaveBeenCalled()
    expect(getList).toHaveBeenCalledTimes(1)
    expect(getList).toHaveBeenCalledWith(1, UNASSIGNED_FALLBACK_CAP, expect.objectContaining({ filter: 'client = "cid"', skipTotal: false }))
    expect(result).toEqual({ entries: [{ id: 'a' }], truncated: true, totalItems: 5000 })
  })

  it('useUnassignedQueue.fetchUnassigned: not truncated when everything fits', async () => {
    stubPb([{ id: 'a' }], 1)
    const { useUnassignedQueue } = await import('../app/composables/useUnassignedQueue')
    expect((await useUnassignedQueue().fetchUnassigned('cid')).truncated).toBe(false)
  })

  it('useEntriesExplorer.listAgents: one capped page, never the whole table', async () => {
    const { getList, getFullList } = stubPb([{ agent: 'pi' }, { agent: 'pi' }, { agent: 'opencode' }], 99999)
    const { useEntriesExplorer, AGENTS_FALLBACK_CAP } = await import('../app/composables/useEntriesExplorer')
    const agents = await useEntriesExplorer().listAgents()
    expect(getFullList).not.toHaveBeenCalled()
    expect(getList).toHaveBeenCalledTimes(1)
    expect(getList).toHaveBeenCalledWith(1, AGENTS_FALLBACK_CAP, expect.objectContaining({ fields: 'agent' }))
    expect(agents.length).toBe(2)
  })

  it('useSessions.fetchUnassignedSessions: the candidate scan is one capped page with a real truncation signal', async () => {
    const { getList } = stubPb([], 0)
    const { useSessions } = await import('../app/composables/useSessions')
    const result = await useSessions().fetchUnassignedSessions({ limit: 7 })
    expect(getList).toHaveBeenCalledWith(1, 7, expect.objectContaining({ filter: 'task = ""' }))
    expect(result).toEqual({ sessions: [], truncated: false })
  })

  it('useSessions.fetchUnassignedSessions: truncated when the server holds more than the cap', async () => {
    const getList = vi.fn(async () => ({ items: [{ id: 'e1', session_id: 's1', started_at: '2026-01-01 00:00:00.000Z', ended_at: '2026-01-01 00:01:00.000Z' }], totalItems: 9000, totalPages: 1, page: 1, perPage: 1 }))
    const getFullList = vi.fn(async () => [])
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection: vi.fn(() => ({ getList, getFullList })) } }))
    vi.stubGlobal('useTotals', () => ({ fetchTotals: vi.fn() }))
    const { useSessions } = await import('../app/composables/useSessions')
    const result = await useSessions().fetchUnassignedSessions({ limit: 1 })
    expect(result.truncated).toBe(true)
  })
})
