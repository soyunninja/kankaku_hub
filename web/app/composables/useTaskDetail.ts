import type { TaskEntryRecord, TaskRecord, TaskStatus } from '../lib/pocketbase-types'
import type { TaskSessionRow } from '../lib/session-aggregate'
import { sessionSummaryToRow, sessionTotalToRow } from '../lib/task-session-row'
import { TotalsRouteUnavailableError } from './useTotals'

export interface SessionEntriesState {
  loading: boolean
  items: TaskEntryRecord[]
  totalItems: number
}

export interface TaskDetailLoadContext {
  validate: (task: TaskRecord) => Promise<boolean>
  isCurrent: () => boolean
}

/** Task detail reads are independent of the catalog and protected against
 * stale responses when Nuxt reuses the page for another task ID. */
export function useTaskDetail() {
  const { $pb } = useNuxtApp()
  const { tasks, moveStatus } = useTasks()
  const { canWrite } = useAuth()
  const { fetchSessionTotals, fetchSessionsForTask } = useSessions()
  const { list: listEntries } = useEntriesExplorer()
  const taskId = ref<string | null>(null)
  let context: TaskDetailLoadContext | undefined
  const authorized = ref(false)
  const authorizedProject = ref<string | null>(null)
  const task = computed(() => {
    const record = tasks.value.find(row => row.id === taskId.value) ?? null
    return context && (!authorized.value || !context.isCurrent() || record?.project !== authorizedProject.value) ? null : record
  })
  const loading = ref(false)
  const error = ref(false)
  const sessions = ref<TaskSessionRow[]>([])
  const sessionsLoading = ref(false)
  const sessionsError = ref(false)
  // Retain loaded/empty disclosures across by-ID route changes. Fenced
  // pending reads must be retryable rather than cached as loading forever.
  // Raw rows are classified by the presentation against its current task.
  const sessionEntries = ref<Record<string, SessionEntriesState>>({})
  let request = 0

  function clearPendingDisclosures() {
    sessionEntries.value = Object.fromEntries(Object.entries(sessionEntries.value).filter(([, state]) => !state.loading))
  }

  // Ownership can disappear and return without a route load. Retire only
  // pending disclosures immediately; completed/empty cache entries survive.
  watch(() => authorized.value && context && (!context.isCurrent()
    || tasks.value.find(row => row.id === taskId.value)?.project !== authorizedProject.value), lost => {
    if (lost) clearPendingDisclosures()
  }, { flush: 'sync' })

  function dispose() {
    request++
    clearPendingDisclosures()
    taskId.value = null
    authorized.value = false
    sessions.value = []
    loading.value = false
    sessionsLoading.value = false
  }

  async function expandSession(sessionId: string) {
    const current = request
    const scope = context
    const valid = () => current === request && (!scope || (authorized.value && scope.isCurrent() && !!task.value))
    if (!valid() || sessionEntries.value[sessionId]) return
    sessionEntries.value[sessionId] = { loading: true, items: [], totalItems: 0 }
    const pending = sessionEntries.value[sessionId]
    // Restoring ownership must not revive a retired read, even if another
    // request for the same session is already pending or has completed.
    const ownsEntry = () => valid() && sessionEntries.value[sessionId] === pending
    try {
      const res = await listEntries({ page: 1, perPage: 50, sort: '-started_at', filters: { session_id: sessionId } })
      if (ownsEntry()) sessionEntries.value[sessionId] = { loading: false, items: res.items, totalItems: res.totalItems }
    }
    catch {
      // A bonus disclosure read must never prevent the session rendering.
      if (ownsEntry()) sessionEntries.value[sessionId] = { loading: false, items: [], totalItems: 0 }
    }
  }

  async function fetchResumeInfo(sessionId: string, current: () => boolean) {
    if (!current()) return {}
    try {
      const result = await listEntries({ page: 1, perPage: 1, sort: '-started_at', filters: { session_id: sessionId } })
      const row = result.items[0]
      return { repoProject: row?.repo_project || undefined, sessionDir: row?.session_dir || undefined }
    }
    catch {
      return {}
    }
  }

  async function loadSessionRows(id: string, current: () => boolean): Promise<TaskSessionRow[]> {
    try {
      // Resume remains visible immediately: one single-row read per
      // session on this bounded totals page, not an unbounded scan.
      const page = await fetchSessionTotals(id, { perPage: 50 })
      if (!current()) return []
      return await Promise.all(page.sessions.map(async session => sessionTotalToRow(session, await fetchResumeInfo(session.sessionId, current))))
    }
    catch (err) {
      if (!current()) return []
      if (!(err instanceof TotalsRouteUnavailableError)) throw err
      const rows = await fetchSessionsForTask(id)
      return rows.map(sessionSummaryToRow)
    }
  }

  async function load(id: string, loadContext?: TaskDetailLoadContext) {
    const current = ++request
    clearPendingDisclosures()
    context = loadContext
    authorized.value = false
    const valid = () => current === request && (!loadContext || (loadContext.isCurrent() && (!authorized.value || !!task.value)))
    loading.value = true
    error.value = false
    taskId.value = null
    sessions.value = []
    sessionsLoading.value = false
    sessionsError.value = false
    try {
      const record = await $pb.collection('tasks').getOne<TaskRecord>(id)
      if (!valid()) return
      if (loadContext && !await loadContext.validate(record)) return
      if (!valid()) return
      authorizedProject.value = record.project
      tasks.value = [record, ...tasks.value.filter(row => row.id !== id)]
      taskId.value = id
      authorized.value = true
      loading.value = false
      sessionsLoading.value = true
      try {
        const rows = await loadSessionRows(id, valid)
        if (valid()) sessions.value = rows
      }
      catch {
        if (valid()) sessionsError.value = true
      }
    }
    catch (err) {
      if (valid() && (err as { status?: number }).status !== 404) error.value = true
    }
    finally {
      if (current === request) {
        loading.value = false
        sessionsLoading.value = false
      }
    }
  }

  async function changeStatus(status: TaskStatus) {
    if (!canWrite.value || !task.value || !['open', 'doing', 'done'].includes(status)) return
    await moveStatus(task.value.id, status)
  }

  return { task, loading, error, sessions, sessionsLoading, sessionsError, sessionEntries, load, expandSession, changeStatus, dispose }
}
