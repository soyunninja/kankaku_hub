/**
 * Pure response-mapping helpers for POST /api/kankaku/totals
 * (pocketbase/pb_hooks/totals.pb.js, docs/contract.md). No Vue, no
 * PocketBase — importable from plain Vitest, same rule as
 * `app/lib/aggregate.ts`/`app/lib/measurement-quality.ts`.
 *
 * D6 guard (same boundary as `aggregate.ts`): this module only ever
 * RESHAPES numbers the server already summed over `task_entries` — it
 * never sums anything itself. See AGENTS.md and
 * docs/architecture/aggregation.md "the server sums; the browser
 * displays".
 *
 * `TotalsRow`/`TotalsGroup`'s field names mirror `Totals`/`GroupTotals`
 * from `app/lib/aggregate.ts` (`wallMs`, `waitingMs`, `workMs`, `input`,
 * `output`, `cacheRead`, `cacheWrite`, `cost`, `count`→`entries`) on
 * purpose, so a migrated screen's template/rendering code barely
 * changes — only where the numbers come from does.
 */

export interface TotalsRowRaw {
  entries: number
  wall_ms: number
  work_ms: number
  waiting_ms: number
  input: number
  output: number
  cache_read: number
  cache_write: number
  cost: number
  waiting_unavailable_entries: number
  cost_unknown_entries: number
  cost_estimated_entries: number
  cost_known_entries: number
  cost_known_sum: number
  unlinked_entries: number
  distinct_sessions: number
}

export interface TotalsGroupRaw extends TotalsRowRaw {
  group_key: string
  group_key2: string
  session_name: string
  min_started_at: string
  max_ended_at: string
  distinct_client: number
  sample_client: string
  distinct_project: number
  sample_project: string
  distinct_task: number
  sample_task: string
  machine: string
  distinct_agent: number
  sample_agent: string
  /** Present on current totals hooks; omitted by older PocketBase instances. */
  active_projects?: number
  /** Session-only historical attribution; absent on old APIs/schemas. */
  distinct_member?: number
  /** Owner-only relation ID, present when exactly one member is assigned. */
  sample_member?: string
  /** Session-only count of entries without historical member attribution. */
  unassigned_member_entries?: number
  /** Session-only marker for membership in ignored_sessions. */
  ignored_session?: boolean | number
}

export interface TotalsResponseRaw {
  groups: TotalsGroupRaw[]
  total: TotalsRowRaw
  page: number
  per_page: number
  total_groups: number
  total_pages: number
  /** Explicit capability marker also covers an empty member-group response. */
  active_projects_available?: boolean
  /** Session attribution capability; false means unknown, not all-unassigned. */
  session_member_summary_available?: boolean
  /** True only when the response honored include_ignored_sessions. */
  ignored_sessions_included?: boolean
}

export interface TotalsRow {
  entries: number
  wallMs: number
  workMs: number
  waitingMs: number
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
  waitingUnavailableEntries: number
  costUnknownEntries: number
  costEstimatedEntries: number
  costKnownEntries: number
  costKnownSum: number
  unlinkedEntries: number
  distinctSessions: number
  /** Alias of `entries` — kept for structural compatibility with the
   * pre-totals `Totals`/`GroupTotals` shapes (`app/lib/aggregate.ts`),
   * which several shared components (e.g. `BreakdownTable.vue`) still
   * type against. Always equal to `entries`. */
  count: number
}

export interface TotalsGroup extends TotalsRow {
  groupKey: string
  groupKey2: string
  sessionName: string
  minStartedAt: string
  maxEndedAt: string
  distinctClient: number
  sampleClient: string
  distinctProject: number
  sampleProject: string
  distinctTask: number
  sampleTask: string
  machine: string
  distinctAgent: number
  sampleAgent: string
  activeProjects?: number
  distinctMember?: number
  sampleMember?: string
  unassignedMemberEntries?: number
  ignoredSession?: boolean
}

export interface TotalsResponse {
  groups: TotalsGroup[]
  total: TotalsRow
  page: number
  perPage: number
  totalGroups: number
  totalPages: number
  activeProjectsAvailable?: boolean
  sessionMemberSummaryAvailable?: boolean
  ignoredSessionsIncluded?: boolean
}

export function mapTotalsRow(raw: TotalsRowRaw): TotalsRow {
  return {
    entries: raw.entries,
    wallMs: raw.wall_ms,
    workMs: raw.work_ms,
    waitingMs: raw.waiting_ms,
    input: raw.input,
    output: raw.output,
    cacheRead: raw.cache_read,
    cacheWrite: raw.cache_write,
    cost: raw.cost,
    waitingUnavailableEntries: raw.waiting_unavailable_entries,
    costUnknownEntries: raw.cost_unknown_entries,
    costEstimatedEntries: raw.cost_estimated_entries,
    costKnownEntries: raw.cost_known_entries,
    costKnownSum: raw.cost_known_sum,
    unlinkedEntries: raw.unlinked_entries,
    distinctSessions: raw.distinct_sessions,
    count: raw.entries,
  }
}

export function mapTotalsGroup(raw: TotalsGroupRaw): TotalsGroup {
  return {
    ...mapTotalsRow(raw),
    groupKey: raw.group_key,
    groupKey2: raw.group_key2,
    sessionName: raw.session_name,
    minStartedAt: raw.min_started_at,
    maxEndedAt: raw.max_ended_at,
    distinctClient: raw.distinct_client,
    sampleClient: raw.sample_client,
    distinctProject: raw.distinct_project,
    sampleProject: raw.sample_project,
    distinctTask: raw.distinct_task,
    sampleTask: raw.sample_task,
    machine: raw.machine,
    distinctAgent: raw.distinct_agent,
    sampleAgent: raw.sample_agent,
    ...(raw.active_projects === undefined ? {} : { activeProjects: raw.active_projects }),
    ...(raw.distinct_member === undefined ? {} : { distinctMember: raw.distinct_member }),
    ...(raw.sample_member === undefined ? {} : { sampleMember: raw.sample_member }),
    ...(raw.unassigned_member_entries === undefined ? {} : { unassignedMemberEntries: raw.unassigned_member_entries }),
    ...(raw.ignored_session === undefined ? {} : { ignoredSession: Boolean(raw.ignored_session) }),
  }
}

export function mapTotalsResponse(raw: TotalsResponseRaw): TotalsResponse {
  return {
    groups: raw.groups.map(mapTotalsGroup),
    total: mapTotalsRow(raw.total),
    page: raw.page,
    perPage: raw.per_page,
    totalGroups: raw.total_groups,
    totalPages: raw.total_pages,
    ...(raw.active_projects_available === undefined ? {} : { activeProjectsAvailable: raw.active_projects_available }),
    ...(raw.session_member_summary_available === undefined ? {} : { sessionMemberSummaryAvailable: raw.session_member_summary_available }),
    ...(raw.ignored_sessions_included === undefined ? {} : { ignoredSessionsIncluded: raw.ignored_sessions_included }),
  }
}

/** Zero-value `TotalsRow`, for a still-loading or empty state. */
export const ZERO_TOTALS_ROW: TotalsRow = {
  entries: 0,
  wallMs: 0,
  workMs: 0,
  waitingMs: 0,
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  waitingUnavailableEntries: 0,
  costUnknownEntries: 0,
  costEstimatedEntries: 0,
  costKnownEntries: 0,
  costKnownSum: 0,
  unlinkedEntries: 0,
  distinctSessions: 0,
  count: 0,
}

/** Mirrors `app/lib/aggregate.ts#avgCostPerTask`. */
export function avgCostPerTaskFromTotal(total: TotalsRow): number {
  return total.entries === 0 ? 0 : total.cost / total.entries
}

export interface AverageCostResult {
  average: number | null
  excludedCount: number
  includedCount: number
}

/** Mirrors `app/lib/measurement-quality.ts#computeAverageCost` exactly:
 * average over rows whose `cost_quality !== 'unknown'`, using the
 * server's `cost_known_sum`/`cost_known_entries` (which apply the exact
 * same exclusion) instead of re-deriving it from raw rows. */
export function computeAverageCostFromTotal(total: TotalsRow): AverageCostResult {
  return {
    average: total.costKnownEntries === 0 ? null : total.costKnownSum / total.costKnownEntries,
    excludedCount: total.costUnknownEntries,
    includedCount: total.costKnownEntries,
  }
}

export interface WorkTimeQualitySummary {
  measuredCount: number
  upperBoundCount: number
  isUpperBound: boolean
}

/** Mirrors `app/lib/measurement-quality.ts#summarizeWorkTimeQuality`. */
export function summarizeWorkTimeQualityFromTotal(total: TotalsRow): WorkTimeQualitySummary {
  return {
    measuredCount: total.entries - total.waitingUnavailableEntries,
    upperBoundCount: total.waitingUnavailableEntries,
    isUpperBound: total.waitingUnavailableEntries > 0,
  }
}

export interface GroupTotalsLike extends TotalsRow {
  key: string
  costShare: number
  workMsShare: number
}

/** Reshapes `group_by=client|project|...` groups into the same
 * `{ key, ...totals, costShare, workMsShare }` shape
 * `app/lib/aggregate.ts#groupByKey` already produces, so
 * `BreakdownTable.vue` and other consumers need no changes — only the
 * data source changes. Already sorted by cost descending by the server
 * (`sort: '-cost'` is the default); re-sorted here defensively in case a
 * caller passed a different `sort`. */
export function groupsToGroupTotals(groups: TotalsGroup[], grand: TotalsRow): GroupTotalsLike[] {
  return groups
    .map(g => ({
      key: g.groupKey,
      entries: g.entries,
      wallMs: g.wallMs,
      workMs: g.workMs,
      waitingMs: g.waitingMs,
      input: g.input,
      output: g.output,
      cacheRead: g.cacheRead,
      cacheWrite: g.cacheWrite,
      cost: g.cost,
      waitingUnavailableEntries: g.waitingUnavailableEntries,
      costUnknownEntries: g.costUnknownEntries,
      costEstimatedEntries: g.costEstimatedEntries,
      costKnownEntries: g.costKnownEntries,
      costKnownSum: g.costKnownSum,
      unlinkedEntries: g.unlinkedEntries,
      distinctSessions: g.distinctSessions,
      count: g.entries,
      costShare: grand.cost === 0 ? 0 : g.cost / grand.cost,
      workMsShare: grand.workMs === 0 ? 0 : g.workMs / grand.workMs,
    }))
    .sort((a, b) => b.cost - a.cost)
}

/** Builds a `groupKey -> TotalsRow` lookup — the shape the tasks board
 * (`group_by=task`) and similar per-key lookups want, replacing
 * `Object.fromEntries(groupByKey(...).map(g => [g.key, {cost, workMs}]))`. */
export function totalsByGroupKey(groups: TotalsGroup[]): Record<string, TotalsRow> {
  const out: Record<string, TotalsRow> = {}
  for (const g of groups) {
    if (!g.groupKey) continue
    // `g` is already a `TotalsGroup` (extends `TotalsRow`) — spreading
    // drops only the group-identity fields (`groupKey`, `sessionName`,
    // ...), no re-mapping needed (it is already camelCase).
    const { groupKey: _groupKey, groupKey2: _groupKey2, sessionName: _sessionName, minStartedAt: _minStartedAt, maxEndedAt: _maxEndedAt, distinctClient: _distinctClient, sampleClient: _sampleClient, distinctProject: _distinctProject, sampleProject: _sampleProject, distinctTask: _distinctTask, sampleTask: _sampleTask, machine: _machine, distinctAgent: _distinctAgent, sampleAgent: _sampleAgent, ...row } = g
    out[g.groupKey] = row
  }
  return out
}
