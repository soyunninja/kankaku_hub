/**
 * Unit tests for `app/composables/useSessionsQueueCount.ts`'s
 * totals-backed `refresh()` and its `TotalsRouteUnavailableError`
 * fallback. `useSessions()` is stubbed as a whole (not re-testing its
 * own request-shape here — that's `use-sessions.test.ts`'s job):
 * `fetchUnassignedSessionTotals` there hard-codes its own
 * `groupBy: 'session'`/`filters` and takes no caller-supplied filter
 * override, so this composable calling it with only `{ perPage: 1 }`
 * (asserted below) is structurally guaranteed to send the exact same
 * request shape as `sessions-without-task/index.vue`'s own page-load
 * call — both go through the one hard-coded function, so they can never
 * drift apart.
 *
 * `useState` isn't a real Nuxt ref here (no Nuxt runtime in this plain
 * `vitest` + `happy-dom` environment, see `use-task-entries.test.ts`'s
 * doc comment) — stubbed as a tiny per-key cache so the count/loading/
 * loaded state a single `useSessionsQueueCount()` call destructures
 * behaves the same way across `refresh()`/`ensureLoaded()` calls within
 * one test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function makeUseState() {
  const store = new Map<string, { value: unknown }>()
  return function useState<T>(key: string, init: () => T) {
    if (!store.has(key)) store.set(key, { value: init() })
    return store.get(key)!
  }
}

describe('useSessionsQueueCount', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('refresh(): totals-backed path sets count from totalGroups, requesting only perPage: 1', async () => {
    const fetchUnassignedSessionTotals = vi.fn(async () => ({ sessions: [], page: 1, perPage: 1, totalGroups: 7, totalPages: 7 }))
    const fetchUnassignedSessions = vi.fn(async () => ({ sessions: [], truncated: false }))
    vi.stubGlobal('useState', makeUseState())
    vi.stubGlobal('useSessions', () => ({ fetchUnassignedSessionTotals, fetchUnassignedSessions }))

    const { useSessionsQueueCount } = await import('../app/composables/useSessionsQueueCount')
    const { count, ensureLoaded, refresh } = useSessionsQueueCount()

    await refresh()

    expect(fetchUnassignedSessionTotals).toHaveBeenCalledWith({ perPage: 1 })
    expect(fetchUnassignedSessions).not.toHaveBeenCalled()
    expect(count.value).toBe(7)

    // `loaded` isn't exposed directly — `ensureLoaded()` not re-fetching
    // is the observable proof `refresh()` marked it loaded.
    await ensureLoaded()
    expect(fetchUnassignedSessionTotals).toHaveBeenCalledTimes(1)
  })

  it('refresh(): falls back to fetchUnassignedSessions().sessions.length on TotalsRouteUnavailableError', async () => {
    const { TotalsRouteUnavailableError } = await import('../app/composables/useTotals')
    const fetchUnassignedSessionTotals = vi.fn(async () => { throw new TotalsRouteUnavailableError() })
    const fetchUnassignedSessions = vi.fn(async () => ({ sessions: [{ sessionId: 'a' }, { sessionId: 'b' }, { sessionId: 'c' }], truncated: false }))
    vi.stubGlobal('useState', makeUseState())
    vi.stubGlobal('useSessions', () => ({ fetchUnassignedSessionTotals, fetchUnassignedSessions }))

    const { useSessionsQueueCount } = await import('../app/composables/useSessionsQueueCount')
    const { count, ensureLoaded, refresh } = useSessionsQueueCount()

    await refresh()

    expect(fetchUnassignedSessionTotals).toHaveBeenCalledWith({ perPage: 1 })
    expect(fetchUnassignedSessions).toHaveBeenCalledTimes(1)
    expect(count.value).toBe(3)

    await ensureLoaded()
    expect(fetchUnassignedSessions).toHaveBeenCalledTimes(1)
  })

  it('refresh(): a non-totals error is not swallowed as a fallback trigger', async () => {
    const boom = new Error('boom')
    const fetchUnassignedSessionTotals = vi.fn(async () => { throw boom })
    const fetchUnassignedSessions = vi.fn(async () => ({ sessions: [], truncated: false }))
    vi.stubGlobal('useState', makeUseState())
    vi.stubGlobal('useSessions', () => ({ fetchUnassignedSessionTotals, fetchUnassignedSessions }))

    const { useSessionsQueueCount } = await import('../app/composables/useSessionsQueueCount')
    const { refresh, loading } = useSessionsQueueCount()

    await expect(refresh()).rejects.toBe(boom)
    expect(fetchUnassignedSessions).not.toHaveBeenCalled()
    // `finally` still resets loading even though the error propagated.
    expect(loading.value).toBe(false)
  })
})
