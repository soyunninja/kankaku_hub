import { chunk } from '~/lib/aggregate'

/** Mirrors the hook's `Narrative` shape (pocketbase/pb_hooks/lib/engram-narrative.js,
 * `buildNarrative`) — see odd/tasks/engram-narrative.md's Contract section. */
export interface Narrative {
  project: string
  title: string
  goal?: string
  summary?: string
  first_prompt?: string
  source: 'summary' | 'prompt'
  created_at?: string
}

export interface EngramStatus {
  configured: boolean
  reachable: boolean
  /** True only when `configured` is true and the daemon rejected the
   * request as unauthenticated (401/403 — `ENGRAM_HTTP_TOKEN` is set on
   * the daemon and no/no matching `KANKAKU_ENGRAM_TOKEN` is configured on
   * the PocketBase process). `reachable` is always false in that case. */
  unauthorized?: boolean
}

/** Thrown internally (never leaked to a caller of this composable — see
 * `ensureStatus`/`forSessions`'s own doc comments) when
 * `GET /api/kankaku/engram/status` or `POST /api/kankaku/engram/sessions`
 * answers 404 (`{code: "engram_not_configured"}`), same 404-means-
 * unavailable convention `TotalsRouteUnavailableError` uses for
 * `/api/kankaku/totals`. */
export class EngramUnavailableError extends Error {
  constructor() {
    super('Engram is not configured on this PocketBase instance (KANKAKU_ENGRAM_URL unset).')
    this.name = 'EngramUnavailableError'
  }
}

const MAX_IDS_PER_REQUEST = 50

// Module-level state, deliberately shared by every `useEngramNarrative()`
// call for the life of the page: one status cache, one "give up, the
// route isn't there" flag, and one per-session narrative cache — so two
// unrelated components on the same page (e.g. the entries table and the
// filter-bar chip) never issue their own redundant status/sessions calls.
let statusCache: EngramStatus | null = null
let statusPromise: Promise<EngramStatus | null> | null = null
let disabled = false
const narrativeCache = new Map<string, Narrative>()

/**
 * Thin client for the read-only Engram narrative proxy
 * (odd/tasks/engram-narrative.md's Contract). Never throws to its
 * callers: any daemon/route failure — including "not configured"
 * (404) — degrades to `null`/an empty `Map`, exactly like
 * `useTotals`'s graceful-degradation contract, except this composable
 * absorbs the 404 itself instead of handing a typed error up, since no
 * caller here needs to distinguish it from "no narrative today".
 */
export function useEngramNarrative() {
  const { $pb } = useNuxtApp()

  /** Wraps `$pb.send`, converting a 404 into `EngramUnavailableError` —
   * caught by every call site in this module, never escapes it. */
  async function send<T>(path: string, options: { method: 'GET' | 'POST', body?: unknown }): Promise<T> {
    try {
      return await $pb.send<T>(path, options)
    }
    catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 404) throw new EngramUnavailableError()
      throw err
    }
  }

  /** One status call per page load: cached after the first successful
   * answer, and short-circuited to `null` forever once `disabled` (a
   * 404 from either route) is set. Concurrent callers before the first
   * answer share the same in-flight promise instead of firing their own
   * request. */
  async function ensureStatus(): Promise<EngramStatus | null> {
    if (disabled) return null
    if (statusCache) return statusCache
    if (statusPromise) return statusPromise

    statusPromise = (async () => {
      try {
        const res = await send<EngramStatus>('/api/kankaku/engram/status', { method: 'GET' })
        statusCache = res
        return res
      }
      catch (err) {
        if (err instanceof EngramUnavailableError) disabled = true
        return null
      }
      finally {
        statusPromise = null
      }
    })()
    return statusPromise
  }

  /** Fetches narratives for every id not already cached, in chunks of at
   * most `MAX_IDS_PER_REQUEST` (the route's own `ids` limit) — one
   * `POST` per chunk. Swallows every failure per chunk (network error,
   * malformed response, 404) and returns whatever is in the cache for
   * the requested ids; a 404 also sets `disabled` so no later call to
   * this or `ensureStatus` makes another request. */
  async function forSessions(ids: string[]): Promise<Map<string, Narrative>> {
    if (!disabled) {
      const missing = [...new Set(ids.filter(id => id && !narrativeCache.has(id)))]
      if (missing.length > 0) {
        const chunks = chunk(missing, MAX_IDS_PER_REQUEST)
        await Promise.all(chunks.map(async (idsChunk) => {
          try {
            const res = await send<{ sessions: Record<string, Narrative> }>('/api/kankaku/engram/sessions', {
              method: 'POST',
              body: { ids: idsChunk },
            })
            for (const [id, narrative] of Object.entries(res.sessions ?? {})) {
              narrativeCache.set(id, narrative)
            }
          }
          catch (err) {
            if (err instanceof EngramUnavailableError) disabled = true
            // Any other error (network, malformed body): skip this
            // chunk, never throw — the caller gets whatever the cache
            // already has.
          }
        }))
      }
    }

    const result = new Map<string, Narrative>()
    for (const id of ids) {
      const narrative = narrativeCache.get(id)
      if (narrative) result.set(id, narrative)
    }
    return result
  }

  /** Synchronous cache read — never triggers a request. `undefined` when
   * this session has no narrative (or none was fetched yet). */
  function narrativeOf(id: string): Narrative | undefined {
    return narrativeCache.get(id)
  }

  /** Test-only escape hatch: clears every module-level cache/flag. */
  function reset(): void {
    statusCache = null
    statusPromise = null
    disabled = false
    narrativeCache.clear()
  }

  return { ensureStatus, forSessions, narrativeOf, reset }
}
