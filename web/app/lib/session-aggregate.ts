/**
 * D6 guard: like `aggregate.ts`, this sums only already-consolidated
 * `task_entries` rows, never `work_records`. See AGENTS.md and
 * docs/proposal.md §9.3.
 *
 * Groups `task_entries` rows by `session_id` into one summary per
 * kankaku session — the unit of work for the "sessions without a task"
 * queue (create a task from a session, attach a session to an existing
 * task, or ignore it). Pure and network-free: callers fetch the rows,
 * this only groups/sums them, same split as `aggregate.ts`.
 *
 * ## Why `wallMs` is not a plain sum here (session-level union)
 *
 * Each `task_entries` row's OWN `wall_ms` is already union-consolidated
 * across its orchestrator and subagents by kankaku's `buildTaskView`
 * (docs/architecture/aggregation.md) — safe to trust on its own. But a
 * SESSION groups several such rows (several orchestrator runs), and
 * `docs/architecture/aggregation.md` documents that a background subagent
 * from task N can still be running when task N+1 starts: task N's own
 * `wall_ms` window and task N+1's own `wall_ms` window can then overlap in
 * real time. Summing `wall_ms` across a session's rows double-counts that
 * overlap, exactly like summing `work_records` would — the *sum* becomes
 * an upper bound of the true session wall time, not the true figure.
 * kankaku's own `buildSessions` (`src/domain/task-view.ts`) computes the
 * true session `wallMs` by re-unioning every raw orchestrator/subagent
 * interval across the session's tasks — but the hub never receives those
 * raw intervals (only each task's already-collapsed `wall_ms`/`work_ms`),
 * so the web CANNOT re-derive that true union (ADR 0006: the union lives
 * exactly once, in kankaku). Re-implementing interval union here from
 * incomplete data would silently produce a *different wrong* number, not
 * a fix.
 *
 * The number the web CAN compute exactly from what it has is the
 * session's **elapsed span** — `min(started_at)` to `max(ended_at)` across
 * its rows (`elapsedMs`) — a well-defined, honestly-labelled "first
 * activity to last activity" duration, never claimed to be a true summed
 * or unioned wall time. `wallMs` is kept on `SessionSummary` only as the
 * raw per-row sum (for anything that genuinely wants "total row-seconds
 * counted", e.g. a future export); UI code must never display it as "wall
 * time" — use `elapsedMs` instead.
 *
 * `workMs` (summed) inherits the same overlap risk as `wallMs`, since
 * `work_ms = wall_ms - waiting_ms` per row: `sum(work_ms) <= true session
 * work time` is NOT guaranteed either — it is also only an upper bound
 * when a session has more than one row. `workMsMayOverlap` flags that.
 *
 * `waitingMs` (summed) is the one figure that IS exact, not an
 * approximation: kankaku's own `buildSessions` computes the true session
 * `waitingMs` the same way — `waiting is tracked on the orchestrator only`
 * (aggregation.md) and is summed across a session's tasks there too
 * (never unioned), because distinct orchestrator turns don't overlap each
 * other the way a lingering background subagent can overlap the next
 * turn's start. The web's plain sum over `waiting_ms` matches kankaku's
 * own session-level definition exactly, verified against
 * `kankaku/src/domain/task-view.ts#buildSessions`.
 */

export interface SessionEntryLike {
  id?: string
  session_id: string
  session_name?: string
  started_at: string
  ended_at?: string
  client?: string
  project?: string
  task?: string
  machine?: string
  agent?: string
  repo_project?: string
  session_dir?: string
  wall_ms?: number
  waiting_ms?: number
  work_ms?: number
  cost?: number
}

/** Sentinel for a field that disagrees across a session's entries. */
export const MIXED = 'mixed' as const

/**
 * Presentational view of one session row in the task detail sheet's
 * sessions list (`components/tasks/TaskDetailSheet.vue`) — exactly the
 * fields that component reads, independent of whether the caller built
 * it from a totals-backed `SessionTotal` (`useSessions.ts#fetchSessionTotals`)
 * or a fallback `SessionSummary` (`fetchSessionsForTask` below).
 * Deliberately narrower than `SessionSummary`: no `entryIds` (the totals
 * endpoint returns aggregates, not row ids) and no `client`/`project`/
 * `task` (unused by this sheet) — so a totals-backed caller isn't forced
 * to invent values for fields it structurally doesn't have. Field names
 * mirror `SessionSummary`'s on purpose so `TaskDetailSheet.vue`'s
 * template needed no changes when this type replaced `SessionSummary[]`
 * as its prop shape.
 */
export interface TaskSessionRow {
  sessionId: string
  sessionName: string
  firstActivity: string
  lastActivity: string
  entryCount: number
  /** See `SessionSummary.workMs` — same "may be an upper bound" caveat. */
  workMs: number
  /** See `SessionSummary.workMsMayOverlap`. A totals-backed row has no
   * raw per-row intervals to run the real overlap check against, so it
   * conservatively sets this whenever the session summed more than one
   * row (a single-row session trivially can't overlap itself) — see
   * `app/pages/tasks/index.vue#sessionTotalToRow`. */
  workMsMayOverlap: boolean
  elapsedMs: number
  waitingMs: number
  cost: number
  machine: string
  /** Resolved agent slug, or the `MIXED` sentinel. */
  agent: string
  repoProject: string | undefined
  sessionDir: string | undefined
}

export interface SessionSummary {
  sessionId: string
  sessionName: string
  firstActivity: string
  lastActivity: string
  entryCount: number
  /** Sum of the session's rows' `work_ms`. An upper bound, not an exact
   * figure, when `entryCount > 1` — see the "Why `wallMs` is not a plain
   * sum" note above. `workMsMayOverlap` flags this for display. */
  workMs: number
  /** True when `workMs` (and `wallMs`) may overstate the session's true
   * work/wall time because more than one row's interval could overlap. */
  workMsMayOverlap: boolean
  /** Raw sum of the session's rows' `wall_ms`. NOT the session's wall
   * time — never display this as a duration; use `elapsedMs`. Kept only
   * for callers that explicitly want "total row-seconds counted". */
  wallMs: number
  /** `max(ended_at) - min(started_at)` across the session's rows — the
   * session's honestly-labelled elapsed span ("first activity to last
   * activity"), safe to display as a duration. */
  elapsedMs: number
  /** Exact (not an upper bound) — see the doc comment above. */
  waitingMs: number
  cost: number
  /** Unanimous value across the session's entries, or `MIXED`. */
  client: string
  /** Unanimous value across the session's entries, or `MIXED`. */
  project: string
  /** Unanimous value across the session's entries, or `MIXED`. */
  task: string
  machine: string
  /** Unanimous value across the session's entries, or `MIXED`. */
  agent: string
  /** Unanimous `repo_project`, or a best-effort value when it disagrees — see `pickRepoProject`. */
  repoProject: string | undefined
  /** Unanimous `session_dir`, or a best-effort value when it disagrees — same pick strategy as `repoProject` (see `pickSessionDir`). */
  sessionDir: string | undefined
  /** ids of every `task_entries` row in this session — the unit the bulk-reassign queue updates. */
  entryIds: string[]
}

/** `undefined`/empty normalise to `''` so "everyone empty" counts as unanimous, not mixed. */
function uniformOrMixed(values: (string | undefined)[]): string {
  const unique = new Set(values.map(v => v ?? ''))
  return unique.size <= 1 ? (values[0] ?? '') : MIXED
}

/**
 * Picks the session's display name from its entries' `session_name`.
 * DESIGN CHOICE: most-frequent non-empty name wins, ties broken by first
 * appearance order (not "always the first entry") — a session's rows
 * occasionally carry a stale/edited name on a handful of rows (renamed
 * mid-session, or a legacy row with a different label), and the
 * majority name is more likely to be the one the owner actually
 * recognises than whichever row happens to sort first.
 */
function pickSessionName(entries: SessionEntryLike[]): string {
  const counts = new Map<string, number>()
  const order: string[] = []
  for (const e of entries) {
    const name = e.session_name?.trim()
    if (!name) continue
    if (!counts.has(name)) {
      counts.set(name, 0)
      order.push(name)
    }
    counts.set(name, counts.get(name)! + 1)
  }
  if (order.length === 0) return ''

  let best = order[0]!
  for (const name of order) {
    if (counts.get(name)! > counts.get(best)!) best = name
  }
  return best
}

/**
 * Picks the `repo_project` used to build the resume command.
 * DESIGN CHOICE: when it disagrees across the session's entries, fall
 * back to the first entry's value rather than returning `undefined`
 * (dropping resume support entirely) — resume needs exactly one path,
 * and in practice a session doesn't move machines/repos mid-run, so the
 * first entry is a reasonable best-effort guess for the rare row that
 * disagrees (e.g. a repo renamed on disk mid-session).
 */
function pickRepoProject(entries: SessionEntryLike[]): string | undefined {
  const first = entries.find(e => e.repo_project)?.repo_project
  return first || undefined
}

/**
 * Picks the `session_dir` used to build the resume command. Same
 * best-effort-first-value strategy as `pickRepoProject`, for the same
 * reason: resume needs exactly one directory, and a session practically
 * never moves session directories mid-run.
 */
function pickSessionDir(entries: SessionEntryLike[]): string | undefined {
  const first = entries.find(e => e.session_dir)?.session_dir
  return first || undefined
}

function minMaxStarted(entries: SessionEntryLike[]): { first: string, last: string } {
  let first = entries[0]!.started_at
  let last = entries[0]!.started_at
  for (const e of entries) {
    if (e.started_at < first) first = e.started_at
    if (e.started_at > last) last = e.started_at
  }
  return { first, last }
}

/** `min(started_at)` to `max(ended_at)` across a session's rows, as an
 * elapsed duration in ms. Falls back to `started_at` for a row with no
 * `ended_at` (older field-projection call sites that never fetched it) —
 * never lets a missing end time collapse the whole session's span. */
function elapsedMsOf(entries: SessionEntryLike[]): number {
  let firstStartMs = Date.parse(entries[0]!.started_at)
  let lastEndMs = Date.parse(entries[0]!.ended_at || entries[0]!.started_at)
  for (const e of entries) {
    const startMs = Date.parse(e.started_at)
    const endMs = Date.parse(e.ended_at || e.started_at)
    if (startMs < firstStartMs) firstStartMs = startMs
    if (endMs > lastEndMs) lastEndMs = endMs
  }
  return Math.max(0, lastEndMs - firstStartMs)
}

/**
 * Groups `task_entries`-shaped rows by `session_id`. Sorted by most
 * recent activity first (both queue screens this feeds want that
 * order), so callers don't need to re-sort.
 */
export function groupBySession(entries: SessionEntryLike[]): SessionSummary[] {
  const buckets = new Map<string, SessionEntryLike[]>()
  for (const entry of entries) {
    if (!entry.session_id) continue
    const bucket = buckets.get(entry.session_id)
    if (bucket) bucket.push(entry)
    else buckets.set(entry.session_id, [entry])
  }

  const summaries: SessionSummary[] = []
  for (const [sessionId, rows] of buckets) {
    const { first, last } = minMaxStarted(rows)
    summaries.push({
      sessionId,
      sessionName: pickSessionName(rows),
      firstActivity: first,
      lastActivity: last,
      entryCount: rows.length,
      workMs: rows.reduce((sum, e) => sum + (e.work_ms ?? 0), 0),
      workMsMayOverlap: rows.length > 1,
      wallMs: rows.reduce((sum, e) => sum + (e.wall_ms ?? 0), 0),
      elapsedMs: elapsedMsOf(rows),
      waitingMs: rows.reduce((sum, e) => sum + (e.waiting_ms ?? 0), 0),
      cost: rows.reduce((sum, e) => sum + (e.cost ?? 0), 0),
      client: uniformOrMixed(rows.map(e => e.client)),
      project: uniformOrMixed(rows.map(e => e.project)),
      task: uniformOrMixed(rows.map(e => e.task)),
      // Not a documented "your call": a session practically never moves
      // machines mid-run, so the first entry's value is used directly
      // rather than adding a second mixed-detection path for this field.
      machine: rows[0]!.machine ?? '',
      agent: uniformOrMixed(rows.map(e => e.agent)),
      repoProject: pickRepoProject(rows),
      sessionDir: pickSessionDir(rows),
      entryIds: rows.map(e => e.id).filter((id): id is string => Boolean(id)),
    })
  }

  return summaries.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1))
}
