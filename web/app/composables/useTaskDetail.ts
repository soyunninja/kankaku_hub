import type { ComputedRef } from 'vue'
import type { TotalsRow } from '../lib/totals-map'
import type { TaskEntryRecord, TaskRecord, TaskStatus } from '../lib/pocketbase-types'
import type { TaskSessionRow } from '../lib/session-aggregate'
import { sessionSummaryToRow, sessionTotalToRow } from '../lib/task-session-row'
import { TotalsRouteUnavailableError } from './useTotals'

/** Full-task server sums, not sums of the visible session page. */
export interface TaskDetailSummary extends Omit<TotalsRow, 'distinctSessions'> {
  sessionCount: number | null
  /** Preserve the existing multi-entry SUM/upper-bound disclosure. */
  workMsMayOverlap: boolean
}

export interface TaskDetailSummaryState {
  summary: ComputedRef<TaskDetailSummary | null>
  summaryLoading: ComputedRef<boolean>
  summaryError: ComputedRef<boolean>
  summaryUnavailable: ComputedRef<boolean>
  sessionCountUnavailable: ComputedRef<boolean>
}

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
  const { fetchTotals } = useTotals()
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
  let refreshEpoch = 0
  let summaryEpoch = 0
  const summaryData = ref<TaskDetailSummary | null>(null)
  const summaryPending = ref(false)
  const summaryFailed = ref(false)
  const summaryMissing = ref(false)
  const summary = computed(() => task.value ? summaryData.value : null)
  const summaryLoading = computed(() => !!task.value && summaryPending.value)
  const summaryError = computed(() => !!task.value && summaryFailed.value)
  const summaryUnavailable = computed(() => !!task.value && summaryMissing.value)
  const sessionCountUnavailable = computed(() => !!summary.value && !summaryLoading.value && summary.value.sessionCount === null)

  function resetSummary(unavailable = false) {
    summaryEpoch++
    summaryData.value = null
    summaryPending.value = false
    summaryFailed.value = false
    summaryMissing.value = unavailable
  }

  async function loadSummary(id: string, current: () => boolean) {
    const epoch = summaryEpoch
    const valid = () => epoch === summaryEpoch && current()
    summaryPending.value = true
    try {
      const { total } = await fetchTotals({ groupBy: 'none', filters: { task: id } })
      if (!valid()) return
      const { distinctSessions, ...metrics } = total
      summaryData.value = { ...metrics, sessionCount: null, workMsMayOverlap: total.entries > 1 }
      try {
        if (!Number.isSafeInteger(distinctSessions) || distinctSessions < 0
          || !Number.isSafeInteger(total.entries) || distinctSessions > total.entries) return
        // Unlike the project-wide helper's completeness scan, a task-scoped
        // existence probe needs only one matching blank row to subtract one.
        const probe = await $pb.collection('task_entries').getList<Pick<TaskEntryRecord, 'task' | 'session_id'>>(1, 1, {
          filter: `task = ${JSON.stringify(id)} && session_id = ""`, fields: 'task,session_id',
        })
        if (!valid()) return
        const blank = probe.items.length === 1 && probe.items[0]?.task === id && probe.items[0]?.session_id === ''
        const empty = probe.items.length === 0 && probe.totalItems === 0 && probe.totalPages <= 1
        if (probe.page !== 1 || !Number.isSafeInteger(probe.totalItems) || probe.totalItems < 0
          || !Number.isSafeInteger(probe.totalPages) || probe.totalPages < 0
          || !(blank && probe.totalItems > 0 && probe.totalPages > 0 || empty)
          || blank && distinctSessions === 0) return
        summaryData.value = { ...metrics, sessionCount: distinctSessions - (blank ? 1 : 0), workMsMayOverlap: total.entries > 1 }
      }
      catch { /* Count unavailable; retain independently valid task totals. */ }
    }
    catch (err) {
      if (valid()) {
        summaryMissing.value = true
        summaryFailed.value = !(err instanceof TotalsRouteUnavailableError)
      }
    }
    finally { if (valid()) summaryPending.value = false }
  }

  function clearPendingDisclosures() {
    sessionEntries.value = Object.fromEntries(Object.entries(sessionEntries.value).filter(([, state]) => !state.loading))
  }

  // Ownership can disappear and return without a route load. Retire only
  // pending disclosures immediately; completed/empty cache entries survive.
  watch(() => authorized.value && context && (!context.isCurrent()
    || tasks.value.find(row => row.id === taskId.value)?.project !== authorizedProject.value), lost => {
    if (lost) {
      refreshEpoch++
      clearPendingDisclosures()
      resetSummary(true)
    }
  }, { flush: 'sync' })

  function dispose() {
    request++
    refreshEpoch++
    resetSummary()
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
    refreshEpoch++
    resetSummary()
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
      const summaryRead = loadSummary(id, valid)
      try {
        const rows = await loadSessionRows(id, valid)
        if (valid()) sessions.value = rows
      }
      catch {
        if (valid()) sessionsError.value = true
      }
      finally {
        if (current === request) sessionsLoading.value = false
      }
      await summaryRead
    }
    catch (err) {
      if (valid() && (err as { status?: number }).status !== 404) error.value = true
    }
    finally {
      if (current === request) {
        if (loadContext && !loadContext.isCurrent()) {
          authorized.value = false
          resetSummary()
        }
        loading.value = false
        sessionsLoading.value = false
      }
    }
  }

  /** Reread affected disclosures even when cached, without resetting the
   * page or its expanded session set. Raw process records never enter totals. */
  async function refreshAfterAssignment(sessionIds: string[], isCurrent: () => boolean = () => true) {
    const id = task.value?.id
    if (!id || !isCurrent()) return
    const epoch = ++refreshEpoch
    const current = request
    const project = task.value!.project
    const valid = () => epoch === refreshEpoch && current === request && isCurrent()
      && (!context || (authorized.value && context.isCurrent()))
      && task.value?.id === id && task.value.project === project
    resetSummary()
    sessionsError.value = false
    const reads = [
      loadSummary(id, valid),
      (async () => {
        try {
          const rows = await loadSessionRows(id, valid)
          if (valid()) sessions.value = rows
        }
        catch (error) { if (valid()) sessionsError.value = true; throw error }
      })(),
      (async () => {
        const record = await $pb.collection('tasks').getOne<TaskRecord>(id)
        if (!valid()) return
        if (record.id !== id || record.project !== project) {
          authorized.value = false
          taskId.value = null
          resetSummary(true)
          clearPendingDisclosures()
          return
        }
        tasks.value = tasks.value.map(row => row.id === id ? record : row)
      })(),
      ...[...new Set(sessionIds)].filter(sessionId => !!sessionId && !!sessionEntries.value[sessionId]).map(async sessionId => {
        const previous = sessionEntries.value[sessionId]
        const res = await listEntries({ page: 1, perPage: 50, sort: '-started_at', filters: { session_id: sessionId } })
        if (valid() && sessionEntries.value[sessionId] === previous) {
          sessionEntries.value[sessionId] = { loading: false, items: res.items, totalItems: res.totalItems }
        }
      }),
    ]
    const results = await Promise.allSettled(reads)
    // A closed drawer may retire only the summary's pending work without a
    // new route load. Do not strand its loading indicator or revive old data.
    if (epoch === refreshEpoch && !valid() && summaryPending.value) resetSummary(true)
    if (valid() && (summaryMissing.value || results.some(result => result.status === 'rejected'))) {
      throw new Error('Task detail refresh failed')
    }
  }

  async function changeStatus(status: TaskStatus) {
    if (!canWrite.value || !task.value || !['open', 'doing', 'done'].includes(status)) return
    await moveStatus(task.value.id, status)
  }

  return { summary, summaryLoading, summaryError, summaryUnavailable, sessionCountUnavailable, task, loading, error, sessions, sessionsLoading, sessionsError, sessionEntries, load, expandSession, refreshAfterAssignment, changeStatus, dispose }
}
