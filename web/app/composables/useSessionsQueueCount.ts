/**
 * Shared count of the "sessions without a task" queue (see
 * `useSessions().fetchUnassignedSessions`), for the sidebar nav and
 * command palette badges (`web/app/pages/sessions-without-task/index.vue`
 * is the queue itself). Same `useState`-cached shape as
 * `useTasks`/`useClients`/`useProjects`, so both badge consumers — and
 * the queue page, which calls `refresh()` after it changes the queue —
 * share one fetch instead of each badge triggering its own round-trip.
 */
export function useSessionsQueueCount() {
  const { fetchUnassignedSessions } = useSessions()
  const count = useState<number>('sessionsQueueCount:count', () => 0)
  const loading = useState<boolean>('sessionsQueueCount:loading', () => false)
  const loaded = useState<boolean>('sessionsQueueCount:loaded', () => false)

  async function refresh() {
    loading.value = true
    try {
      const { sessions } = await fetchUnassignedSessions()
      count.value = sessions.length
      loaded.value = true
    }
    finally {
      loading.value = false
    }
  }

  async function ensureLoaded() {
    if (!loaded.value && !loading.value) await refresh()
  }

  return { count, loading, ensureLoaded, refresh }
}
