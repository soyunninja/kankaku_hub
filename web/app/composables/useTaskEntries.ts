import { localDateRangeToUtcFilters } from '~/lib/local-day'
import type { DateRange } from '~/lib/period'
import type { TaskEntryRecord } from '~/lib/pocketbase-types'

const FIELDS = 'id,client,project,task,started_at,ended_at,wall_ms,waiting_ms,work_ms,input,output,cache_read,cache_write,cost,status,model,machine,session_id,session_name,prompt,legacy_client_label,repo_project,agent,agent_version,plugin,plugin_version,waiting_quality,cost_quality,subagent_linkage'

/** Hard cap on the `fetchRange` fallback scan (see the function's own
 * doc comment) — generous but bounded, so the fallback path can never
 * again silently download an unbounded set. */
const FALLBACK_SCAN_CAP = 2000

/**
 * `@deprecated` fallback-only. `POST /api/kankaku/totals`
 * (`useTotals().fetchRangeTotals`) is the primary path for a date-range
 * total/breakdown now — this composable's `fetchRange` exists only for
 * callers to fall back to when they catch `TotalsRouteUnavailableError`
 * (the totals route 404s until the owner restarts PocketBase). Kept for
 * `app/lib/aggregate.ts`'s client-side summing helpers, which the
 * fallback path still needs raw rows for.
 *
 * `fetchAll` (the unbounded `getFullList` all-time scan) has been
 * removed: its one remaining caller, `app/pages/tasks/index.vue`'s
 * `loadTaskTotals` fallback branch, now calls `fetchRange` with a
 * deliberately wide-but-bounded all-time-ish range instead (see that
 * page's `FALLBACK_ALL_TIME_START`), which caps at `FALLBACK_SCAN_CAP`
 * and reports `truncated` the same way every other `fetchRange` caller
 * already does.
 */
export function useTaskEntries() {
  const { $pb } = useNuxtApp()

  /**
   * `@deprecated` fallback-only — used when a caller catches
   * `TotalsRouteUnavailableError` from `useTotals()` and must degrade to
   * the pre-totals client-side path. Capped at `FALLBACK_SCAN_CAP`
   * (2000) rows via `getList` (NOT `getFullList` — `getFullList` pages
   * until the filtered set is exhausted regardless of any `perPage`
   * passed in its options; see the PocketBase JS SDK's `_getFullList`,
   * which only stops when a page comes back short, so it can never be
   * used as a bound on total rows). `truncated: true` tells the caller
   * the range may have more rows than were returned, so a fallback
   * screen can surface the `totals.fallbackTruncated` i18n notice rather
   * than silently under-reporting.
   */
  async function fetchRange(range: DateRange, opts: { project?: string, client?: string } = {}): Promise<{ entries: TaskEntryRecord[], truncated: boolean }> {
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

    const result = await $pb.collection('task_entries').getList<TaskEntryRecord>(1, FALLBACK_SCAN_CAP, {
      filter: filters.join(' && '),
      fields: FIELDS,
      sort: '-started_at',
    })

    return {
      entries: result.items,
      truncated: result.totalItems > result.items.length,
    }
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

  return { fetchRange, subscribe }
}
