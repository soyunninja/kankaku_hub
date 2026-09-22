/**
 * Unit tests for `app/composables/useEngramNarrative.ts` — the client
 * for the read-only Engram narrative proxy
 * (`GET /api/kankaku/engram/status`, `POST /api/kankaku/engram/sessions`,
 * see odd/tasks/engram-narrative.md). `$pb.send` is stubbed directly,
 * same idiom as `tests/use-sessions.test.ts` stubbing `useTotals`.
 *
 * State (`status` cache, the `disabled` flag, and the per-session
 * narrative cache) is module-level — deliberately, so every composer of
 * `useEngramNarrative()` on one page load shares one status call and one
 * cache. `vi.resetModules()` + a fresh dynamic `import()` per test resets
 * that state between tests, mirroring how `use-sessions.test.ts` isolates
 * `useSessions`'s own module state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('useEngramNarrative', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ensureStatus: calls the status route once and caches the result across repeated calls', async () => {
    const send = vi.fn(async () => ({ configured: true, reachable: true }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

    const { useEngramNarrative } = await import('../app/composables/useEngramNarrative')
    const { ensureStatus } = useEngramNarrative()

    const first = await ensureStatus()
    const second = await ensureStatus()

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('/api/kankaku/engram/status', { method: 'GET' })
    expect(first).toEqual({ configured: true, reachable: true })
    expect(second).toEqual({ configured: true, reachable: true })
  })

  it('ensureStatus: exposes the unauthorized flag reported by the status route', async () => {
    const send = vi.fn(async () => ({ configured: true, reachable: false, unauthorized: true }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

    const { useEngramNarrative } = await import('../app/composables/useEngramNarrative')
    const { ensureStatus } = useEngramNarrative()

    const status = await ensureStatus()
    expect(status).toEqual({ configured: true, reachable: false, unauthorized: true })
    expect(status?.unauthorized).toBe(true)
  })

  it('ensureStatus: a 404 disables the composable — no further status or sessions calls are made', async () => {
    const send = vi.fn(async () => { throw { status: 404 } })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

    const { useEngramNarrative } = await import('../app/composables/useEngramNarrative')
    const { ensureStatus, forSessions } = useEngramNarrative()

    const result = await ensureStatus()
    expect(result).toBeNull()

    const second = await ensureStatus()
    expect(second).toBeNull()

    const map = await forSessions(['s1'])
    expect(map.size).toBe(0)

    // Only the one status call — forSessions made no request because
    // disabled was already set.
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('forSessions: batches ids into chunks of at most 50 per request', async () => {
    const send = vi.fn(async (path: string) => {
      if (path === '/api/kankaku/engram/sessions') return { sessions: {} }
      throw new Error('unexpected path')
    })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

    const { useEngramNarrative } = await import('../app/composables/useEngramNarrative')
    const { forSessions } = useEngramNarrative()

    const ids = Array.from({ length: 120 }, (_, i) => `session-${i}`)
    await forSessions(ids)

    const sessionCalls = send.mock.calls.filter(c => c[0] === '/api/kankaku/engram/sessions')
    expect(sessionCalls).toHaveLength(3)
    for (const call of sessionCalls) {
      const body = (call[1] as { body: { ids: string[] } }).body
      expect(body.ids.length).toBeLessThanOrEqual(50)
    }
    const allSentIds = sessionCalls.flatMap(c => (c[1] as { body: { ids: string[] } }).body.ids)
    expect(allSentIds.sort()).toEqual([...ids].sort())
  })

  it('forSessions: returns a Map of the narratives the server had, keyed by session id', async () => {
    const send = vi.fn(async () => ({
      sessions: {
        s1: { project: 'p', title: 'Ship the login flow', source: 'summary' },
      },
    }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

    const { useEngramNarrative } = await import('../app/composables/useEngramNarrative')
    const { forSessions, narrativeOf } = useEngramNarrative()

    const map = await forSessions(['s1', 's2'])
    expect(map.size).toBe(1)
    expect(map.get('s1')).toEqual({ project: 'p', title: 'Ship the login flow', source: 'summary' })
    expect(map.has('s2')).toBe(false)
    expect(narrativeOf('s1')).toEqual({ project: 'p', title: 'Ship the login flow', source: 'summary' })
    expect(narrativeOf('s2')).toBeUndefined()
  })

  it('forSessions: skips ids already cached from a previous call — no request for them', async () => {
    const send = vi.fn(async () => ({
      sessions: { s1: { project: 'p', title: 'Cached title', source: 'summary' } },
    }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

    const { useEngramNarrative } = await import('../app/composables/useEngramNarrative')
    const { forSessions } = useEngramNarrative()

    await forSessions(['s1'])
    send.mockClear()

    const map = await forSessions(['s1', 's2'])
    // s2 has no narrative on the server (not in the response), so only s2 is requested.
    expect(send).toHaveBeenCalledTimes(1)
    const body = (send.mock.calls[0]![1] as { body: { ids: string[] } }).body
    expect(body.ids).toEqual(['s2'])
    expect(map.get('s1')).toEqual({ project: 'p', title: 'Cached title', source: 'summary' })
  })

  it('forSessions: a network/generic error is swallowed — returns whatever it already has, never throws', async () => {
    const send = vi.fn(async () => { throw new Error('network down') })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

    const { useEngramNarrative } = await import('../app/composables/useEngramNarrative')
    const { forSessions } = useEngramNarrative()

    const map = await expect(forSessions(['s1'])).resolves.toBeInstanceOf(Map)
    void map
    const result = await forSessions(['s1'])
    expect(result.size).toBe(0)
  })

  it('forSessions: a 404 from the sessions route also disables the composable', async () => {
    const send = vi.fn(async () => { throw { status: 404 } })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

    const { useEngramNarrative } = await import('../app/composables/useEngramNarrative')
    const { forSessions, ensureStatus } = useEngramNarrative()

    await forSessions(['s1'])
    send.mockClear()

    await forSessions(['s2'])
    const status = await ensureStatus()
    expect(status).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })

  it('reset(): clears the status cache, the disabled flag and the narrative cache', async () => {
    const send = vi.fn(async () => { throw { status: 404 } })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { send } }))

    const { useEngramNarrative } = await import('../app/composables/useEngramNarrative')
    const { ensureStatus, reset } = useEngramNarrative()

    await ensureStatus()
    reset()
    send.mockClear()
    send.mockImplementation(async () => ({ configured: true, reachable: true }))

    const status = await ensureStatus()
    expect(status).toEqual({ configured: true, reachable: true })
  })
})
