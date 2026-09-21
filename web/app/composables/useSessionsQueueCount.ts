import { TotalsRouteUnavailableError } from '@/composables/useTotals'

/**
 * Shared count of the "sessions without a task" queue (see
 * `useSessions().fetchUnassignedSessionTotals`), for the sidebar nav and
 * command palette badges (`web/app/pages/sessions-without-task/index.vue`
 * is the queue itself). Same `useState`-cached shape as
 * `useTasks`/`useClients`/`useProjects`, so both badge consumers — and
 * the queue page, which calls `refresh()` after it changes the queue —
 * share one fetch instead of each badge triggering its own round-trip.
 */
// See the matching comment in `useClients.ts` — same race, same fix.
let inFlight: Promise<void> | null = null

export function useSessionsQueueCount() {
  const { fetchUnassignedSessionTotals, fetchUnassignedSessions } = useSessions()
  const count = useState<number>('sessionsQueueCount:count', () => 0)
  const loading = useState<boolean>('sessionsQueueCount:loading', () => false)
  const loaded = useState<boolean>('sessionsQueueCount:loaded', () => false)

  /**
   * Totals-backed: `perPage: 1` because only `totalGroups` is read — the
   * page itself is discarded, this never fetches (or pages through) the
   * actual session rows. MUST call the exact same
   * `fetchUnassignedSessionTotals` the queue page calls (same
   * `groupBy: 'session'`, same `filters: { without_task: true,
   * session_fully_unassigned: true }`, hard-coded inside that one
   * composable function) so the sidebar badge and the page's own
   * `totalGroups` can never disagree — this composable takes no filter
   * params of its own on purpose, to make that impossible to drift.
   * Falls back to the pre-totals scan (identical to the pre-migration
   * body of this function) on `TotalsRouteUnavailableError`.
   */
  async function refresh() {
    loading.value = true
    try {
      try {
        const { totalGroups } = await fetchUnassignedSessionTotals({ perPage: 1 })
        count.value = totalGroups
      }
      catch (err) {
        if (!(err instanceof TotalsRouteUnavailableError)) throw err
        const { sessions } = await fetchUnassignedSessions()
        count.value = sessions.length
      }
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
