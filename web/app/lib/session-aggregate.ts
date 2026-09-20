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
 */

export interface SessionEntryLike {
  id?: string
  session_id: string
  session_name?: string
  started_at: string
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

export interface SessionSummary {
  sessionId: string
  sessionName: string
  firstActivity: string
  lastActivity: string
  entryCount: number
  workMs: number
  wallMs: number
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
      wallMs: rows.reduce((sum, e) => sum + (e.wall_ms ?? 0), 0),
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
