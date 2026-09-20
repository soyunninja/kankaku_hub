/**
 * Pure helpers over the seven "agent and measurement quality" fields on
 * `task_entries` (migration `1758300013`, see docs/contract.md "Agent
 * and measurement quality"). No i18n calls, no Vue, no PocketBase —
 * importable from plain Vitest, same rule as app/lib/aggregate.ts and
 * app/lib/entry-detail.ts.
 *
 * Every field is a select that may be **empty**, and empty always means
 * *not reported* (an older client) — never the best or the worst case.
 * Today's seeded data is entirely `agent: "pi"` with everything
 * `"measured"` / `"not_applicable"`, so these helpers must render zero
 * badges/notices for that data: a value is only ever flagged when it is
 * the explicit *worse* select option (`"unavailable"`, `"estimated"`,
 * `"unknown"`, `"unlinked"`). Empty behaves exactly like the *good*
 * option it stands in for, never like the bad one.
 */

import type { TaskEntryRecord } from './pocketbase-types'

/** The seven quality fields, lifted from the canonical record type so the
 * literal unions never drift out of sync with `TaskEntryRecord`. */
export type QualityFields = Pick<TaskEntryRecord,
  | 'agent'
  | 'agent_version'
  | 'plugin'
  | 'plugin_version'
  | 'waiting_quality'
  | 'cost_quality'
  | 'subagent_linkage'
  | 'cost'
>

/** Sentinel returned by `listDistinctAgents` for empty/legacy `agent` —
 * a stable key, not display text; the caller maps it to a translated
 * "legacy / not reported" label. */
export const LEGACY_AGENT = '__legacy__'

// ---------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------

export interface AgentInfo {
  agent: string
  agentVersion: string
  plugin: string
  pluginVersion: string
  /** True only when `agent` is empty/undefined — predates the field. */
  isLegacy: boolean
}

/**
 * Normalises the four free-text agent/plugin fields. Does not assume the
 * server-side backfill ran (rows before the migration were backfilled to
 * `agent: "pi"`, but a client should not depend on that) — a genuinely
 * empty `agent` is just reported as `isLegacy: true` and left to the
 * caller to label.
 */
export function normalizeAgentInfo(
  entry: Pick<QualityFields, 'agent' | 'agent_version' | 'plugin' | 'plugin_version'>,
): AgentInfo {
  const agent = entry.agent?.trim() || ''
  return {
    agent,
    agentVersion: entry.agent_version?.trim() || '',
    plugin: entry.plugin?.trim() || '',
    pluginVersion: entry.plugin_version?.trim() || '',
    isLegacy: agent === '',
  }
}

// ---------------------------------------------------------------------
// Per-row quality summary
// ---------------------------------------------------------------------

export type QualityBadge =
  | { kind: 'upper-bound' }
  | { kind: 'cost-approx', quality: 'estimated' | 'unknown' }
  | { kind: 'unlinked' }

export interface EntryQualitySummary {
  /** `waiting_quality === 'unavailable'`: `work_ms` is `work_ms == wall_ms`,
   * an upper bound, not a true measurement — render as "≤ X", never as
   * a precise figure. */
  workTimeIsUpperBound: boolean
  /** `'measured'` unless `cost_quality` is explicitly `'estimated'` or
   * `'unknown'` (empty/undefined counts as `'measured'` — not reported
   * is not the same as reported-bad). */
  costIsApprox: 'measured' | 'estimated' | 'unknown'
  /** `subagent_linkage === 'unlinked'`: child work exists but could not
   * be folded in, so this row under-reports. */
  showsUnlinkedWarning: boolean
  /** Empty when everything is measured/linked/not_applicable/empty —
   * the "zero noise on fully-measured data" case. */
  badges: QualityBadge[]
}

/**
 * Summarises a single row's measurement quality for display. Returns an
 * empty `badges` array (and all-good flags) when nothing needs flagging,
 * so a fully-measured or legacy-empty row renders identically clean.
 */
export function describeEntryQuality(
  entry: Pick<QualityFields, 'waiting_quality' | 'cost_quality' | 'subagent_linkage'>,
): EntryQualitySummary {
  const workTimeIsUpperBound = entry.waiting_quality === 'unavailable'
  const costIsApprox: EntryQualitySummary['costIsApprox']
    = entry.cost_quality === 'estimated' || entry.cost_quality === 'unknown'
      ? entry.cost_quality
      : 'measured'
  const showsUnlinkedWarning = entry.subagent_linkage === 'unlinked'

  const badges: QualityBadge[] = []
  if (workTimeIsUpperBound) badges.push({ kind: 'upper-bound' })
  if (costIsApprox !== 'measured') badges.push({ kind: 'cost-approx', quality: costIsApprox })
  if (showsUnlinkedWarning) badges.push({ kind: 'unlinked' })

  return { workTimeIsUpperBound, costIsApprox, showsUnlinkedWarning, badges }
}

// ---------------------------------------------------------------------
// Aggregation honesty (KPI level)
// ---------------------------------------------------------------------

export interface WorkTimeQualitySummary {
  measuredCount: number
  upperBoundCount: number
  /** True when at least one row in the set is an upper bound — the KPI
   * built over this set must be presented as a range/upper-bound, not
   * averaged in silently as if every row were precise. */
  isUpperBound: boolean
}

/**
 * Rolls up `waiting_quality` across a set of rows for a KPI total: how
 * many rows are true measurements vs. upper bounds, and whether the set
 * as a whole must be presented as approximate.
 */
export function summarizeWorkTimeQuality(
  entries: Pick<QualityFields, 'waiting_quality'>[],
): WorkTimeQualitySummary {
  const upperBoundCount = entries.filter(e => e.waiting_quality === 'unavailable').length
  return {
    measuredCount: entries.length - upperBoundCount,
    upperBoundCount,
    isUpperBound: upperBoundCount > 0,
  }
}

// ---------------------------------------------------------------------
// Average cost (unknown-cost rows excluded from the average only)
// ---------------------------------------------------------------------

export interface AverageCostResult {
  /** `null` when every row was excluded (or the set was empty) — there
   * is nothing to average. */
  average: number | null
  excludedCount: number
  includedCount: number
}

/**
 * Average cost over rows whose `cost_quality` is not `'unknown'`
 * (`'unknown'` means `cost` is `0` because it could not be known — an
 * average must exclude it rather than average in a zero). This is
 * deliberately separate from the plain SUM path in `aggregate.ts`,
 * which still includes unknown-cost rows.
 */
export function computeAverageCost(
  entries: Pick<QualityFields, 'cost_quality' | 'cost'>[],
): AverageCostResult {
  let sum = 0
  let includedCount = 0
  let excludedCount = 0

  for (const entry of entries) {
    if (entry.cost_quality === 'unknown') {
      excludedCount += 1
      continue
    }
    includedCount += 1
    sum += entry.cost ?? 0
  }

  return {
    average: includedCount === 0 ? null : sum / includedCount,
    excludedCount,
    includedCount,
  }
}

// ---------------------------------------------------------------------
// Agent filter list
// ---------------------------------------------------------------------

/**
 * Distinct `agent` values across a set of rows, for a filter dropdown.
 * Empty/undefined `agent` collapses to the `LEGACY_AGENT` sentinel
 * (never English display text — this is a pure lib file, i18n happens
 * in components). Sorted alphabetically with the legacy sentinel last.
 */
export function listDistinctAgents(entries: Pick<QualityFields, 'agent'>[]): string[] {
  const agents = new Set<string>()
  for (const entry of entries) {
    const agent = entry.agent?.trim()
    agents.add(agent || LEGACY_AGENT)
  }

  return [...agents].sort((a, b) => {
    if (a === LEGACY_AGENT) return 1
    if (b === LEGACY_AGENT) return -1
    return a.localeCompare(b)
  })
}
