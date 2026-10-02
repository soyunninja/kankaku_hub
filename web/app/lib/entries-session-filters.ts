/**
 * Pure mapping between `app/pages/entries/index.vue`'s filter state
 * (`EntriesExplorerFilters`) and what `POST /api/kankaku/totals` can
 * honor (`pocketbase/pb_hooks/lib/totals-query.js`'s `FILTER_KEYS`
 * whitelist: client, project, task, agent, status, machine, session_id,
 * ...). No Vue, no PocketBase — importable from plain Vitest, same rule
 * as `app/lib/aggregate.ts`/`app/lib/totals-map.ts`.
 *
 * `quality` (waiting/cost measurement quality), `model` and `search`
 * (free-text prompt search) have no equivalent totals filter — the
 * Entries page disables their controls in grouped mode; active values
 * require flat browse so browse and export honor the same filters. `dateStart`/`dateEnd` are deliberately NOT part of either
 * `groupable` or `unsupported` here: the totals contract honors them
 * too, but as the request's top-level `from`/`to`, never inside
 * `filters` (`totals-query.js`'s `FILTER_KEYS` has no `dateStart`/
 * `dateEnd` entry) — see `entriesDateRangeToTotalsRange` below.
 */
import { LEGACY_AGENT } from './measurement-quality'
import type { EntriesExplorerFilters } from '~/composables/useEntriesExplorer'
import { localWallClockToUtc, toPbDateFilter } from './local-day'

/** The subset of the totals `filters` whitelist the Entries screen's own
 * filter bar can ever populate — a plain string map (never `TotalsFilters`
 * itself, to keep this module free of a runtime dependency on
 * `useTotals.ts`'s composable-only exports). */
export interface GroupableEntriesFilters {
  client?: string
  project?: string
  task?: string
  status?: string
  /** Real agent slug, or `''` for legacy/not-reported — same mapping
   * `buildFilter` (`useEntriesExplorer.ts`) applies to the
   * `LEGACY_AGENT` sentinel. */
  agent?: string
  machine?: string
  session_id?: string
}

export interface EntriesFiltersSplit {
  groupable: GroupableEntriesFilters
  /** `EntriesExplorerFilters` keys present on the current filter state
   * that the totals contract cannot honor (`model`, `quality`, `search`
   * today). Empty when every active filter is groupable. */
  unsupported: string[]
}

/**
 * Splits the Entries screen's current filter state into what the totals
 * endpoint can honor (`groupable`, ready to pass as `TotalsRequest.filters`)
 * and what it cannot (`unsupported`) — the Entries page uses the latter
 * to require flat browse whenever an unsupported filter is active.
 */
export function splitEntriesFiltersForTotals(filters: EntriesExplorerFilters): EntriesFiltersSplit {
  const groupable: GroupableEntriesFilters = {}
  if (filters.client) groupable.client = filters.client
  if (filters.project) groupable.project = filters.project
  if (filters.task) groupable.task = filters.task
  if (filters.status) groupable.status = filters.status
  if (filters.machine) groupable.machine = filters.machine
  if (filters.session_id) groupable.session_id = filters.session_id
  if (filters.agent) groupable.agent = filters.agent === LEGACY_AGENT ? '' : filters.agent

  const unsupported: string[] = []
  if (filters.model) unsupported.push('model')
  if (filters.quality) unsupported.push('quality')
  if (filters.search) unsupported.push('search')

  return { groupable, unsupported }
}

/** Grouping must never silently omit an active Entries filter. */
export function canGroupEntriesFilters(filters: EntriesExplorerFilters): boolean {
  return splitEntriesFiltersForTotals(filters).unsupported.length === 0
}

export interface EntriesTotalsDateRange {
  from?: string
  to?: string
}

/**
 * Converts the Entries screen's local-calendar-day `dateStart`/`dateEnd`
 * filters into the UTC instant strings `TotalsRequest.from`/`.to` expect
 * — same conversion `useEntriesExplorer.ts#buildFilter` applies to
 * `started_at >=`/`<=`, kept independently here (rather than shared)
 * because the totals request needs the two bounds as separate top-level
 * fields, not a single SQL filter clause. Each bound is independently
 * optional, matching `buildFilter`'s own independent `if`s.
 */
export function entriesDateRangeToTotalsRange(filters: Pick<EntriesExplorerFilters, 'dateStart' | 'dateEnd'>): EntriesTotalsDateRange {
  const range: EntriesTotalsDateRange = {}
  if (filters.dateStart) {
    range.from = toPbDateFilter(localWallClockToUtc(filters.dateStart, { hour: 0, minute: 0, second: 0, ms: 0 }))
  }
  if (filters.dateEnd) {
    range.to = toPbDateFilter(localWallClockToUtc(filters.dateEnd, { hour: 23, minute: 59, second: 59, ms: 999 }))
  }
  return range
}
