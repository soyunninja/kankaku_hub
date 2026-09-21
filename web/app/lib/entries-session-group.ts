/**
 * Pure "group by session" presentation over one already-fetched PAGE of
 * `task_entries` rows (app/pages/entries/index.vue's "Group by session"
 * toggle). This groups exactly the rows the page already fetched for the
 * active page — it does NOT re-fetch, re-sort, or change server
 * pagination; the page's server-side `-started_at` sort and `perPage`
 * stay exactly as they are. Grouping is purely a presentation of the
 * fetched page, same "pure and network-free" rule as
 * app/lib/session-aggregate.ts.
 */
import type { CostQuality } from './pocketbase-types'
import { sumCost } from './measurement-quality'

export interface SessionGroupEntryLike {
  id: string
  session_id: string
  session_name?: string
  started_at: string
  work_ms: number
  cost: number
  cost_quality?: CostQuality | ''
  client?: string
  project?: string
}

export interface EntriesSessionGroup<T extends SessionGroupEntryLike> {
  /** `''` for rows with no `session_id` at all — grouped together under
   * the same muted "—" label the per-row marker uses
   * (`app/lib/session-marker.ts#sessionMarkerLabel`), rather than being
   * dropped from grouping or left ungrouped. */
  sessionId: string
  sessionName: string
  entries: T[]
  /** Most recent `started_at` among the group's rows — what groups are
   * ordered by. */
  mostRecentStartedAt: string
  workMs: number
  /** Sum of `cost`, excluding rows whose `cost_quality` is `'unknown'` —
   * same exclusion `computeAverageCost`/`sumCost` apply everywhere else
   * cost is aggregated in this app. */
  cost: number
  /** Distinct `client` ids of the rows, first-seen order. One element = the
   * header can name the client once and the rows need not repeat it. */
  clientIds: string[]
  /** Same for `project` (`''` = no project). */
  projectIds: string[]
}

/**
 * Groups the given (already page-fetched) entries by `session_id`.
 * Groups are ordered by their most recent entry's `started_at`,
 * descending — matching the page's default `-started_at` sort so turning
 * grouping on doesn't visually reorder what the owner already sees.
 */
export function groupEntriesBySession<T extends SessionGroupEntryLike>(entries: T[]): EntriesSessionGroup<T>[] {
  const buckets = new Map<string, T[]>()
  for (const entry of entries) {
    const key = entry.session_id ?? ''
    const bucket = buckets.get(key)
    if (bucket) bucket.push(entry)
    else buckets.set(key, [entry])
  }

  const groups: EntriesSessionGroup<T>[] = []
  for (const [sessionId, rows] of buckets) {
    let mostRecentStartedAt = rows[0]!.started_at
    for (const row of rows) {
      if (row.started_at > mostRecentStartedAt) mostRecentStartedAt = row.started_at
    }
    const sessionName = rows.find(e => e.session_name?.trim())?.session_name?.trim() ?? ''
    groups.push({
      sessionId,
      sessionName,
      entries: rows,
      mostRecentStartedAt,
      workMs: rows.reduce((sum, e) => sum + (e.work_ms ?? 0), 0),
      cost: sumCost(rows),
      clientIds: [...new Set(rows.map(e => e.client ?? ''))],
      projectIds: [...new Set(rows.map(e => e.project ?? ''))],
    })
  }

  return groups.sort((a, b) => (a.mostRecentStartedAt < b.mostRecentStartedAt ? 1 : -1))
}
