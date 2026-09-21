/**
 * Shared count of the "Sin determinar" (unassigned) reassignment queue —
 * every `task_entries` row still pointed at the protected unassigned
 * client (`app/pages/unassigned/index.vue` is the queue itself) — for the
 * sidebar nav and command palette badges. Same `useState`-cached shape as
 * `useSessionsQueueCount`, so both badge consumers share one fetch
 * instead of each triggering its own round-trip; only the total item
 * count is fetched (`getList(1, 1, ...)`), not the full row set the queue
 * page itself needs.
 */
// See the matching comment in `useClients.ts` — same race, same fix.
let inFlight: Promise<void> | null = null

export function useUnassignedQueueCount() {
  const { $pb } = useNuxtApp()
  const { clients, ensureLoaded: ensureClients } = useClients()
  const count = useState<number>('unassignedQueueCount:count', () => 0)
  const loading = useState<boolean>('unassignedQueueCount:loading', () => false)
  const loaded = useState<boolean>('unassignedQueueCount:loaded', () => false)

  async function refresh() {
    loading.value = true
    try {
      await ensureClients()
      const unassignedClientId = clients.value.find(c => c.unassigned)?.id
      if (!unassignedClientId) {
        count.value = 0
        loaded.value = true
        return
      }
      const page = await $pb.collection('task_entries').getList(1, 1, {
        filter: `client = "${unassignedClientId}"`,
      })
      count.value = page.totalItems
      loaded.value = true
    }
    finally {
      loading.value = false
    }
  }

  /** FIX (independent review, 2026-09-21): await a shared in-flight
   * `refresh()` instead of racing past it — see `useClients.ts`. */
  async function ensureLoaded() {
    if (loaded.value) return
    if (!inFlight) inFlight = refresh().finally(() => { inFlight = null })
    await inFlight
  }

  return { count, loading, ensureLoaded, refresh }
}
