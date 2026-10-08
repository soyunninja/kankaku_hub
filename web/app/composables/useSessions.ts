import { chunk } from '~/lib/aggregate'
import type { GroupableEntriesFilters } from '~/lib/entries-session-filters'
import { groupBySession, type SessionEntryLike, type SessionSummary } from '~/lib/session-aggregate'
import type { TaskEntryRecord } from '~/lib/pocketbase-types'
import type { TotalsGroup } from '~/lib/totals-map'

const FIELDS = 'id,session_id,session_name,started_at,ended_at,client,project,task,machine,agent,repo_project,session_dir,wall_ms,waiting_ms,work_ms,cost'
/** Bound on the unassigned-entries scan — the "sessions without a task"
 * queue is expected to stay small in practice (an owner triages it as it
 * grows); this caps a single fetch instead of blindly pulling the whole
 * table, mirroring `useTaskEntries.fetchRange`'s bounded-by-filter style.
 *
 * The cap is real: ONE `getList(1, UNASSIGNED_SCAN_LIMIT, …)` page. It is
 * never passed as `perPage` to `getFullList`, which pages until a short
 * page whatever its page size and therefore cannot bound anything.
 * `truncated` comes from the server's own `totalItems`.
 */
const UNASSIGNED_SCAN_LIMIT = 500
const SESSION_ID_FILTER_CHUNK = 50

interface IgnoredSessionRow {
  session_id: string
}

/** A `group_by: 'session'` totals row, reshaped for session-level
 * display. Superset of the fields `TotalsGroup` already carries for a
 * session group, plus:
 * - `sessionId` — alias of `groupKey` (the session_id), named to match
 *   `SessionSummary.sessionId` so a follow-up pass can rename call
 *   sites mechanically.
 * - `elapsedMs` — `max_ended_at - min_started_at`, the session's
 *   honestly-labelled elapsed span (see `session-aggregate.ts`'s "Why
 *   `wallMs` is not a plain sum" doc comment: summed `wallMs`/`workMs`
 *   across a session's rows is only an UPPER BOUND, never display it as
 *   the session's duration — use `elapsedMs`, same rule this mirrors).
 * - `mixed` — see the doc comment on `fetchSessionTotals` below; this is
 *   a NEW, coarser capability than anything `session-aggregate.ts` had,
 *   not a parity field.
 */
export interface SessionTotal extends TotalsGroup {
  sessionId: string
  elapsedMs: number
  /** Server capability for interpreting historical member summary fields. */
  sessionMemberSummaryAvailable?: boolean
  /** True when the session's rows disagree on `client` or `project`
   * (`distinctClient > 1 || distinctProject > 1`). NOT a parity field —
   * see the doc comment on `fetchSessionTotals`/`fetchUnassignedSessionTotals`
   * below for why. `distinctTask`/`sampleTask` and `distinctAgent`/
   * `sampleAgent` are still available on this object (inherited from
   * `TotalsGroup`) for a caller that wants a finer-grained per-field
   * "mixed" check, the same shape `session-aggregate.ts#uniformOrMixed`
   * computed per-field (`client`/`project`/`task`/`agent`), rather than
   * this one combined boolean. */
  mixed: boolean
}

export interface SessionTotalsPage {
  sessions: SessionTotal[]
  page: number
  perPage: number
  totalGroups: number
  totalPages: number
}

function toSessionTotal(g: TotalsGroup, sessionMemberSummaryAvailable?: boolean): SessionTotal {
  const startMs = Date.parse(g.minStartedAt)
  const endMs = Date.parse(g.maxEndedAt || g.minStartedAt)
  const elapsedMs = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : 0
  return {
    ...g,
    sessionId: g.groupKey,
    elapsedMs,
    sessionMemberSummaryAvailable,
    mixed: g.distinctClient > 1 || g.distinctProject > 1,
  }
}

function toSessionTotalsPage(response: { groups: TotalsGroup[], page: number, perPage: number, totalGroups: number, totalPages: number, sessionMemberSummaryAvailable?: boolean }): SessionTotalsPage {
  return {
    sessions: response.groups.map(group => toSessionTotal(group, response.sessionMemberSummaryAvailable)),
    page: response.page,
    perPage: response.perPage,
    totalGroups: response.totalGroups,
    totalPages: response.totalPages,
  }
}

/**
 * Session-level views over `task_entries` (D6: never `work_records`),
 * built on top of `session-aggregate.ts#groupBySession` — the task
 * detail sheet's session list, and the "sessions without a task" queue.
 */
export function useSessions() {
  const { $pb } = useNuxtApp()
  const { fetchTotals } = useTotals()

  /**
   * Server-totals-backed replacement for `fetchSessionsForTask`
   * (`@deprecated` below). `group_by: 'session'` filtered to `task`,
   * sorted most-recent-first (`-min_started_at`, matching the old
   * `-started_at` intent). Paginated — pass `opts.page`/`opts.perPage`
   * for a task with more sessions than one page. Throws
   * `TotalsRouteUnavailableError` (from `useTotals`) when the totals
   * route 404s; callers must catch it and fall back to
   * `fetchSessionsForTask`.
   *
   * GAP vs. `SessionSummary`: no `entryIds` — the totals endpoint
   * returns aggregates, not row ids, so a caller that needs the
   * session's individual `task_entries` ids (e.g. to bulk-reassign)
   * still needs a separate row-level fetch (`useEntriesExplorer().list()`
   * filtered by `session_id`, or the fallback `fetchSessionsForTask`).
   */
  async function fetchSessionTotals(taskId: string, opts: { page?: number, perPage?: number } = {}): Promise<SessionTotalsPage> {
    const response = await fetchTotals({
      groupBy: 'session',
      filters: { task: taskId },
      sort: '-min_started_at',
      page: opts.page,
      perPage: opts.perPage,
    })
    return toSessionTotalsPage(response)
  }

  /**
   * Server-totals-backed replacement for `fetchUnassignedSessions`
   * (`@deprecated` below). `filters: { without_task: true,
   * session_fully_unassigned: true }` reproduces the OLD exact
   * semantic — a session only appears when EVERY one of its entries has
   * `task === ''` (see `useTotals.ts`'s `session_fully_unassigned` doc
   * comment and `pocketbase/pb_hooks/lib/totals-query.js`). Sessions in
   * `ignored_sessions` are excluded server-side unconditionally for any
   * `group_by: 'session'` query, same as before. Unlike the old
   * `fetchUnassignedSessions`, this is genuinely paginated (`opts.page`/
   * `opts.perPage`) rather than a single capped-at-500 scan.
   */
  async function fetchUnassignedSessionTotals(opts: { page?: number, perPage?: number } = {}): Promise<SessionTotalsPage> {
    const response = await fetchTotals({
      groupBy: 'session',
      filters: { without_task: true, session_fully_unassigned: true },
      sort: '-min_started_at',
      page: opts.page,
      perPage: opts.perPage,
    })
    return toSessionTotalsPage(response)
  }

  /**
   * Server-totals-backed session rows for the Entries screen's grouped
   * mode (`app/pages/entries/index.vue`). `group_by: 'session'`, sorted
   * `-min_started_at` (most recently active session first). `filters`
   * is expected to already be the `groupable` subset
   * `app/lib/entries-session-filters.ts#splitEntriesFiltersForTotals`
   * produced — this composable does not know which Entries filter
   * fields the totals contract can honor, that mapping lives there on
   * purpose so it can be tested and reused independent of this fetch.
   * `from`/`to` are the Entries screen's `dateStart`/`dateEnd`, already
   * converted to UTC instants (`entries-session-filters.ts#entriesDateRangeToTotalsRange`).
   * Throws `TotalsRouteUnavailableError` (from `useTotals`) untouched —
   * the page must catch it and fall back to the flat page + client-side
   * grouping, exactly like every other totals call site.
   */
  async function fetchSessionTotalsForEntries(opts: {
    filters: GroupableEntriesFilters
    from?: string
    to?: string
    page?: number
    perPage?: number
  }): Promise<SessionTotalsPage> {
    const response = await fetchTotals({
      groupBy: 'session',
      filters: opts.filters,
      from: opts.from,
      to: opts.to,
      sort: '-min_started_at',
      page: opts.page,
      perPage: opts.perPage,
    })
    return toSessionTotalsPage(response)
  }

  /** `@deprecated` fallback-only — used when `fetchSessionTotals` throws
   * `TotalsRouteUnavailableError`. Sessions that touched a given task,
   * most-recent-first. */
  async function fetchSessionsForTask(taskId: string): Promise<SessionSummary[]> {
    const entries = await $pb.collection('task_entries').getFullList<TaskEntryRecord>({
      filter: `task = "${taskId}"`,
      fields: FIELDS,
      sort: '-started_at',
      perPage: 500,
    })
    return groupBySession(entries as SessionEntryLike[])
  }

  /**
   * `@deprecated` fallback-only — used when `fetchUnassignedSessionTotals`
   * throws `TotalsRouteUnavailableError`. Sessions whose entries are ALL
   * unassigned (`task = ""`) — a session with even one assigned entry
   * has already been triaged and is excluded, not just filtered down to
   * its unassigned rows. Also excludes sessions already dismissed into
   * `ignored_sessions`.
   */
  async function fetchUnassignedSessions(opts: { limit?: number } = {}): Promise<{
    sessions: SessionSummary[]
    /** True when the bounded scan may have cut off older unassigned entries. */
    truncated: boolean
  }> {
    const limit = opts.limit ?? UNASSIGNED_SCAN_LIMIT

    const candidatePage = await $pb.collection('task_entries').getList<TaskEntryRecord>(1, limit, {
      filter: 'task = ""',
      fields: FIELDS,
      sort: '-started_at',
      skipTotal: false,
    })
    const candidateEntries = candidatePage.items

    const sessionIds = [...new Set(candidateEntries.map(e => e.session_id).filter(Boolean))]
    if (sessionIds.length === 0) return { sessions: [], truncated: false }

    const [partiallyAssignedIds, ignoredIds] = await Promise.all([
      fetchSessionIdsWithAssignedEntries(sessionIds),
      fetchIgnoredSessionIds(),
    ])

    const pureUnassigned = candidateEntries.filter(e =>
      !partiallyAssignedIds.has(e.session_id) && !ignoredIds.has(e.session_id),
    )

    return {
      sessions: groupBySession(pureUnassigned as SessionEntryLike[]),
      truncated: candidatePage.totalItems > candidateEntries.length,
    }
  }

  /** ids of sessions (from `sessionIds`) that have at least one assigned entry elsewhere. */
  async function fetchSessionIdsWithAssignedEntries(sessionIds: string[]): Promise<Set<string>> {
    const results = await Promise.all(
      chunk(sessionIds, SESSION_ID_FILTER_CHUNK).map(async (ids) => {
        const filter = `(${ids.map(id => `session_id = "${id}"`).join(' || ')}) && task != ""`
        return $pb.collection('task_entries').getFullList<TaskEntryRecord>({
          filter,
          fields: 'session_id',
          perPage: 500,
        })
      }),
    )
    return new Set(results.flat().map(r => r.session_id))
  }

  async function fetchIgnoredSessionIds(): Promise<Set<string>> {
    const rows = await $pb.collection('ignored_sessions').getFullList<IgnoredSessionRow>({
      fields: 'session_id',
      perPage: 500,
    })
    return new Set(rows.map(r => r.session_id))
  }

  return { fetchSessionTotals, fetchUnassignedSessionTotals, fetchSessionTotalsForEntries, fetchSessionsForTask, fetchUnassignedSessions }
}
