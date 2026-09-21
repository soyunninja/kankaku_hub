import type { ClientRecord } from '~/lib/pocketbase-types'

export type ClientContactFields = Pick<ClientRecord, 'website' | 'contact_email' | 'contact_phone' | 'notes'>

/** Stable outcome codes for `POST /api/kankaku/clients/{id}/favicon/refresh`
 * — see docs/contract.md. Always a `200`, never a thrown error, for any
 * outcome the route's own business logic produces. */
export type FaviconRefreshResult =
  | { ok: true }
  | { ok: false, reason: 'no_website' | 'fetch_failed' | 'no_icon_found' | 'unsupported_type' | 'too_large' | 'blocked_host' }

/** Clients catalog: small collection, fetched in full and cached in a
 * shared useState (refresh() re-fetches; components call it after
 * create/update/archive). */
// Module-scoped (not `useState`, deliberately not reactive/SSR-shared):
// tracks a single in-flight `refresh()` call so a second concurrent
// `ensureLoaded()` caller AWAITS the same request instead of racing past
// it — see the comment on `ensureLoaded` below for the bug this closes.
// Safe as a plain module singleton because the web is `ssr: false` (one
// browser tab = one JS realm; app/plugins/pocketbase.client.ts is the
// only place a fresh `$pb` per request would otherwise matter).
let inFlight: Promise<void> | null = null

export function useClients() {
  const { $pb } = useNuxtApp()
  const clients = useState<ClientRecord[]>('clients:list', () => [])
  const loading = useState<boolean>('clients:loading', () => false)
  const loaded = useState<boolean>('clients:loaded', () => false)

  async function refresh() {
    loading.value = true
    try {
      const items = await $pb.collection('clients').getFullList<ClientRecord>({ sort: 'name', perPage: 200 })
      clients.value = items
      loaded.value = true
    }
    finally {
      loading.value = false
    }
  }

  /**
   * FIX (independent review, 2026-09-21): two callers that both need the
   * client list — e.g. the sidebar's unassigned-queue badge and the
   * `/unassigned` page itself, both mounted by the same navigation —
   * used to race here. `ensureLoaded()`'s guard only checked
   * `!loaded.value && !loading.value`; the FIRST caller sets
   * `loading.value = true` synchronously (before its own first
   * `await`), so a SECOND caller invoked in the same tick sees
   * `loading.value === true`, skips calling `refresh()` again (correct,
   * no duplicate request), but then returned immediately without
   * waiting for the FIRST caller's in-flight request to finish
   * (incorrect) — so it read `clients.value` while it was still empty.
   * On `/unassigned` this produced exactly the observed symptom: the
   * sidebar badge (which won the race and actually fetched) showed the
   * correct count, while the page itself (which lost the race and
   * read the stale empty array) rendered the empty state. Awaiting the
   * shared `inFlight` promise makes every concurrent caller wait for
   * the SAME resolved fetch, never a stale read.
   */
  async function ensureLoaded() {
    if (loaded.value) return
    if (!inFlight) inFlight = refresh().finally(() => { inFlight = null })
    await inFlight
  }

  async function create(data: { name: string, code: string, active: boolean, unassigned: boolean } & Partial<ClientContactFields>) {
    const record = await $pb.collection('clients').create<ClientRecord>(data)
    await refresh()
    return record
  }

  async function update(id: string, data: Partial<Pick<ClientRecord, 'name' | 'code' | 'active'> & ClientContactFields>) {
    const record = await $pb.collection('clients').update<ClientRecord>(id, data)
    await refresh()
    return record
  }

  async function setActive(id: string, active: boolean) {
    return update(id, { active })
  }

  function byId(id: string) {
    return clients.value.find(c => c.id === id)
  }

  /** Replaces one client's entry in the shared store in place (no full
   * `refresh()` round-trip) — used after a favicon refresh so the icon
   * appears without reloading the whole list. */
  function patch(record: ClientRecord) {
    const idx = clients.value.findIndex(c => c.id === record.id)
    if (idx !== -1) clients.value.splice(idx, 1, record)
  }

  /**
   * Triggers the owner-only server-side favicon fetch for one client and
   * patches the store with whatever the route changed on the record
   * (favicon/favicon_source/favicon_checked_at, on both success and
   * failure — see docs/contract.md). Never throws for a business-logic
   * outcome (`ok: false, reason: ...`); can still throw a
   * `ClientResponseError` for 401/403/404 on the route itself.
   */
  async function refreshFavicon(id: string): Promise<FaviconRefreshResult> {
    const result = await $pb.send<FaviconRefreshResult>(`/api/kankaku/clients/${id}/favicon/refresh`, { method: 'POST' })
    try {
      const updated = await $pb.collection('clients').getOne<ClientRecord>(id)
      patch(updated)
    }
    catch {
      // The refresh itself already succeeded or failed cleanly (`result`
      // says which) — a transient failure re-reading the record shouldn't
      // mask that outcome from the caller.
    }
    return result
  }

  return { clients, loading, loaded, refresh, ensureLoaded, create, update, setActive, byId, patch, refreshFavicon }
}
