import { localDateRangeToUtcFilters } from '~/lib/local-day'
import type { DateRange } from '~/lib/period'
import type { TaskEntryRecord } from '~/lib/pocketbase-types'

const FIELDS = 'id,client,project,task,started_at,ended_at,wall_ms,waiting_ms,work_ms,input,output,cache_read,cache_write,cost,status,model,machine,session_id,session_name,prompt,legacy_client_label,repo_project,agent,agent_version,plugin,plugin_version,waiting_quality,cost_quality,subagent_linkage'

/**
 * Fetches `task_entries` (never `work_records` — D6) for a date range, as
 * plain records ready for `app/lib/aggregate.ts`'s summing helpers. Used
 * by the dashboard and project detail, both of which need the raw rows
 * to group by client/project/day client-side.
 */
export function useTaskEntries() {
  const { $pb } = useNuxtApp()

  async function fetchRange(range: DateRange, opts: { project?: string, client?: string } = {}) {
    // `range.start`/`range.end` are LOCAL calendar days (app/lib/period.ts).
    // `started_at` is stored as a UTC instant, so the boundary must be
    // converted to UTC here rather than treated as if it were already UTC
    // — see app/lib/local-day.ts and the MAJOR day-boundary finding.
    const utc = localDateRangeToUtcFilters(range)
    const filters = [
      `started_at >= "${utc.start}"`,
      `started_at <= "${utc.end}"`,
    ]
    if (opts.project) filters.push(`project = "${opts.project}"`)
    if (opts.client) filters.push(`client = "${opts.client}"`)

    return $pb.collection('task_entries').getFullList<TaskEntryRecord>({
      filter: filters.join(' && '),
      fields: FIELDS,
      sort: '-started_at',
      perPage: 500,
    })
  }

  /** All entries, no date filter — used where totals must be all-time
   * (e.g. the tasks board's accumulated cost/time per task). */
  async function fetchAll(opts: { project?: string } = {}) {
    const filters: string[] = []
    if (opts.project) filters.push(`project = "${opts.project}"`)
    return $pb.collection('task_entries').getFullList<TaskEntryRecord>({
      filter: filters.join(' && '),
      fields: FIELDS,
      sort: '-started_at',
      perPage: 500,
    })
  }

  /** Debounced realtime subscription: calls `onChange` at most once per
   * `debounceMs` after any create/update/delete on task_entries. */
  function subscribe(onChange: () => void, debounceMs = 1500) {
    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onChange, debounceMs)
    }

    let unsubscribed = false
    let unsubscribeFn: (() => void) | null = null

    $pb.collection('task_entries').subscribe('*', debounced).then((unsub) => {
      if (unsubscribed) unsub()
      else unsubscribeFn = unsub
    }).catch(() => {
      // Realtime is a nice-to-have; a subscribe failure (e.g. no
      // websocket support) should never break the dashboard.
    })

    return () => {
      unsubscribed = true
      if (timer) clearTimeout(timer)
      unsubscribeFn?.()
    }
  }

  return { fetchRange, fetchAll, subscribe }
}
