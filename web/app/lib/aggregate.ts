/**
 * D6 guard: every total the web shows is a plain SUM over `task_entries`
 * (already consolidated by kankaku's buildTasks — union of overlapping
 * intervals, never re-derived here). Never import or sum `work_records`
 * in this module. See AGENTS.md and docs/proposal.md §9.3.
 */

export interface TaskEntryLike {
  id?: string
  client: string
  project?: string
  task?: string
  started_at: string
  wall_ms?: number
  waiting_ms?: number
  work_ms?: number
  input?: number
  output?: number
  cache_read?: number
  cache_write?: number
  cost?: number
  legacy_client_label?: string
  repo_project?: string
  model?: string
}

export interface Totals {
  wallMs: number
  waitingMs: number
  workMs: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  count: number
}

const ZERO_TOTALS: Totals = {
  wallMs: 0,
  waitingMs: 0,
  workMs: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  count: 0,
}

/** Plain sum over a list of `task_entries` rows. This is the only place
 * in the web that is allowed to add these fields together. */
export function sumTaskEntries(entries: TaskEntryLike[]): Totals {
  return entries.reduce<Totals>((acc, e) => ({
    wallMs: acc.wallMs + (e.wall_ms ?? 0),
    waitingMs: acc.waitingMs + (e.waiting_ms ?? 0),
    workMs: acc.workMs + (e.work_ms ?? 0),
    input: acc.input + (e.input ?? 0),
    output: acc.output + (e.output ?? 0),
    cacheRead: acc.cacheRead + (e.cache_read ?? 0),
    cacheWrite: acc.cacheWrite + (e.cache_write ?? 0),
    cost: acc.cost + (e.cost ?? 0),
    count: acc.count + 1,
  }), { ...ZERO_TOTALS })
}

/** Average cost per task entry (0 when there are none). */
export function avgCostPerTask(totals: Totals): number {
  return totals.count === 0 ? 0 : totals.cost / totals.count
}

export interface GroupTotals extends Totals {
  key: string
  costShare: number
  workMsShare: number
}

/**
 * Group entries by an arbitrary key (client id, project id, ...) and sum
 * each group, plus each group's share of the grand total (cost and work
 * time), sorted by cost descending.
 */
export function groupByKey(
  entries: TaskEntryLike[],
  keyOf: (entry: TaskEntryLike) => string,
): GroupTotals[] {
  const grand = sumTaskEntries(entries)
  const buckets = new Map<string, TaskEntryLike[]>()
  for (const entry of entries) {
    const key = keyOf(entry)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(entry)
    else buckets.set(key, [entry])
  }

  const groups: GroupTotals[] = []
  for (const [key, bucket] of buckets) {
    const totals = sumTaskEntries(bucket)
    groups.push({
      key,
      ...totals,
      costShare: grand.cost === 0 ? 0 : totals.cost / grand.cost,
      workMsShare: grand.workMs === 0 ? 0 : totals.workMs / grand.workMs,
    })
  }

  return groups.sort((a, b) => b.cost - a.cost)
}

export function groupByClient(entries: TaskEntryLike[]): GroupTotals[] {
  return groupByKey(entries, e => e.client)
}

export function groupByProject(entries: TaskEntryLike[]): GroupTotals[] {
  return groupByKey(entries, e => e.project || '')
}

export function groupByModel(entries: TaskEntryLike[]): GroupTotals[] {
  return groupByKey(entries, e => e.model || '(unknown)')
}

/** Split an array into chunks of at most `size` — used for the batch API
 * (PocketBase caps a single /api/batch call at 100 sub-requests). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}

export interface UnassignedGroup {
  legacyLabel: string
  repoProject: string
  count: number
  totals: Totals
  entryIds: string[]
}

/**
 * Group `Sin determinar` rows by (`legacy_client_label`, `repo_project`)
 * — the reassignment queue's unit of work (proposal §5.3, screen 7).
 *
 * Keyed by a JSON tuple, not string concatenation: labels and repo paths
 * routinely contain spaces (`"Clinica Dental Vega"`, `/home/dev/repos/...`),
 * so joining with a separator and splitting it back apart would corrupt
 * the grouping the moment a label contains that separator.
 */
export function groupUnassigned(entries: TaskEntryLike[]): UnassignedGroup[] {
  const buckets = new Map<string, { legacyLabel: string, repoProject: string, rows: TaskEntryLike[] }>()
  for (const entry of entries) {
    const legacyLabel = entry.legacy_client_label || '(sin etiqueta)'
    const repoProject = entry.repo_project || '(sin proyecto)'
    const key = JSON.stringify([legacyLabel, repoProject])
    const bucket = buckets.get(key)
    if (bucket) bucket.rows.push(entry)
    else buckets.set(key, { legacyLabel, repoProject, rows: [entry] })
  }

  const groups: UnassignedGroup[] = []
  for (const { legacyLabel, repoProject, rows } of buckets.values()) {
    groups.push({
      legacyLabel,
      repoProject,
      count: rows.length,
      totals: sumTaskEntries(rows),
      entryIds: rows.map(e => e.id).filter((id): id is string => Boolean(id)),
    })
  }

  return groups.sort((a, b) => b.totals.cost - a.totals.cost)
}
