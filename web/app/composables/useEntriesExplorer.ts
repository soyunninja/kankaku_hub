import { localWallClockToUtc, toPbDateFilter } from '~/lib/local-day'
import { LEGACY_AGENT, listDistinctAgents } from '~/lib/measurement-quality'
import type { TaskEntryRecord } from '~/lib/pocketbase-types'

/** The two "not measured" quality filters this screen supports (`waiting_quality
 * = 'unavailable'` / `cost_quality = 'unknown'`) — see docs/contract.md "Agent
 * and measurement quality". */
export type QualityFilter = 'waitingUnavailable' | 'costUnknown'

export interface EntriesExplorerFilters {
  client?: string
  project?: string
  task?: string
  status?: string
  model?: string
  machine?: string
  /** `agent` slug, or the `LEGACY_AGENT` sentinel for rows with no
   * reported agent (see `app/lib/measurement-quality.ts`). */
  agent?: string
  quality?: QualityFilter
  dateStart?: string
  dateEnd?: string
  search?: string
  /** Exact `session_id` match — narrow, additive filter for a
   * session-scoped row lookup (e.g. the "sessions without a task" queue
   * fetching one session's `task_entries` ids before a bulk action; see
   * `useSessions.ts`'s `SessionTotal`/`fetchSessionTotals` GAP doc
   * comment: the totals endpoint returns aggregates, not row ids). */
  session_id?: string
}

function escapeFilterValue(value: string) {
  return value.replace(/"/g, '\\"')
}

function buildFilter(filters: EntriesExplorerFilters): string {
  const parts: string[] = []
  if (filters.client) parts.push(`client = "${filters.client}"`)
  if (filters.project) parts.push(`project = "${filters.project}"`)
  if (filters.task) parts.push(`task = "${filters.task}"`)
  if (filters.status) parts.push(`status = "${filters.status}"`)
  if (filters.model) parts.push(`model = "${filters.model}"`)
  if (filters.machine) parts.push(`machine = "${filters.machine}"`)
  if (filters.session_id) parts.push(`session_id = "${filters.session_id}"`)
  if (filters.agent) parts.push(filters.agent === LEGACY_AGENT ? `agent = ""` : `agent = "${filters.agent}"`)
  if (filters.quality === 'waitingUnavailable') parts.push(`waiting_quality = "unavailable"`)
  if (filters.quality === 'costUnknown') parts.push(`cost_quality = "unknown"`)
  // `dateStart`/`dateEnd` are LOCAL calendar days — convert to UTC instants
  // before filtering `started_at` (see app/lib/local-day.ts).
  if (filters.dateStart) {
    const startUtc = localWallClockToUtc(filters.dateStart, { hour: 0, minute: 0, second: 0, ms: 0 })
    parts.push(`started_at >= "${toPbDateFilter(startUtc)}"`)
  }
  if (filters.dateEnd) {
    const endUtc = localWallClockToUtc(filters.dateEnd, { hour: 23, minute: 59, second: 59, ms: 999 })
    parts.push(`started_at <= "${toPbDateFilter(endUtc)}"`)
  }
  if (filters.search) parts.push(`prompt ~ "${escapeFilterValue(filters.search)}"`)
  return parts.join(' && ')
}

/** Server-side paginated/sorted/filtered browse of every `task_entries`
 * row — screen 8, "detail rows", never summed by this composable. */
/** Hard cap of the deprecated agent-filter fallback scan. */
export const AGENTS_FALLBACK_CAP = 2000

export function useEntriesExplorer() {
  const { $pb } = useNuxtApp()
  const { fetchTotals } = useTotals()

  async function list(opts: {
    page: number
    perPage: number
    sort: string
    filters: EntriesExplorerFilters
  }) {
    return $pb.collection('task_entries').getList<TaskEntryRecord>(opts.page, opts.perPage, {
      filter: buildFilter(opts.filters),
      sort: opts.sort,
      expand: 'client,project,task',
    })
  }

  async function getOne(id: string) {
    return $pb.collection('task_entries').getOne<TaskEntryRecord>(id, { expand: 'client,project,task' })
  }

  async function updateAssignment(id: string, data: { client?: string, project?: string, task?: string }) {
    return $pb.collection('task_entries').update<TaskEntryRecord>(id, data)
  }

  async function listWorkRecords(taskEntryId: string) {
    return $pb.collection('work_records').getFullList({
      filter: `task_entry = "${taskEntryId}"`,
      sort: 'started_at',
    })
  }

  /**
   * Server-totals-backed replacement for `listAgents` (`@deprecated`
   * below). `group_by: 'agent'` needs no date range or other filters —
   * every distinct `agent` value across the whole table, one row per
   * value. `perPage: 200` is the server's own `per_page` cap
   * (`docs/contract.md`); there are only ever a handful of distinct
   * agent values in practice (`pocketbase/seed/bulk.js`'s `AGENTS`
   * list), so one page is always enough — `totalPages > 1` would be a
   * real anomaly, logged rather than silently truncated. Each group's
   * `group_key` (the raw `agent` value, `''` for legacy/not-reported) is
   * run through the SAME `listDistinctAgents` normalization/sorting the
   * old row-level path used, by reshaping it into the
   * `Pick<TaskEntryRecord, 'agent'>[]` shape that function expects —
   * this guarantees identical output (including the `LEGACY_AGENT`
   * sentinel and sort order) without duplicating that logic here.
   */
  async function fetchAgentOptions(): Promise<string[]> {
    const response = await fetchTotals({ groupBy: 'agent', perPage: 200 })
    if (response.totalPages > 1) {
      console.warn(`fetchAgentOptions: expected every distinct agent value to fit on one page (server per_page cap is 200), got totalPages=${response.totalPages} — the agent filter dropdown may be missing values.`)
    }
    return listDistinctAgents(response.groups.map(g => ({ agent: g.groupKey })))
  }

  /** `@deprecated` fallback-only — used when `fetchAgentOptions` throws
   * `TotalsRouteUnavailableError`. Distinct `agent` values across every
   * `task_entries` row (not just the current page) for the agent filter
   * dropdown — a narrow field-only fetch, the same field-projection
   * idiom `useTaskEntries` uses for its `fields` param, since there is
   * no dedicated `agents` collection to page against. */
  async function listAgents() {
    // ONE capped page, newest first — never `getFullList`, which pages the
    // whole table whatever `perPage` says. An agent only seen in rows older
    // than the cap is missing from the dropdown on this deprecated path.
    const result = await $pb.collection('task_entries').getList<Pick<TaskEntryRecord, 'agent'>>(1, AGENTS_FALLBACK_CAP, {
      fields: 'agent',
      sort: '-started_at',
      skipTotal: true,
    })
    return listDistinctAgents(result.items)
  }

  return { list, getOne, updateAssignment, listWorkRecords, fetchAgentOptions, listAgents }
}
