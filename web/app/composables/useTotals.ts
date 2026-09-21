import type { DateRange } from '~/lib/period'
import { localDateRangeToUtcFilters } from '~/lib/local-day'
import { mapTotalsResponse, type TotalsResponse, type TotalsResponseRaw } from '~/lib/totals-map'

export type TotalsGroupBy = 'none' | 'day' | 'client' | 'project' | 'task' | 'session' | 'agent' | 'model' | 'legacy_label'

export interface TotalsFilters {
  client?: string
  project?: string
  task?: string
  agent?: string
  status?: string
  machine?: string
  session_id?: string
  unassigned_only?: boolean
  without_task?: boolean
  exclude_unassigned_client?: string
  /** Session-level parity filter (server-side, `group_by: 'session'`
   * only): a session only matches when EVERY one of its `task_entries`
   * rows is unassigned (`task === ''`) — a session with even one
   * assigned row elsewhere is excluded outright, not just filtered down
   * to its unassigned rows. Reproduces the exact old semantic of
   * `useSessions.ts#fetchUnassignedSessions`
   * (`pocketbase/pb_hooks/lib/totals-query.js`'s `session_fully_unassigned`
   * branch). Always combine with `without_task: true` — this filter only
   * adds the "no sibling row anywhere has a task" exclusion, it doesn't
   * narrow the aggregated row set by itself. */
  session_fully_unassigned?: boolean
}

export interface TotalsRequest {
  from?: string
  to?: string
  filters?: TotalsFilters
  groupBy?: TotalsGroupBy
  dayBoundaries?: string[]
  sort?: string
  page?: number
  perPage?: number
}

/** Thrown/returned distinctly from any other error so callers can fall
 * back to the pre-totals client-side path (design requirement: "the new
 * server route must degrade gracefully in the web until the owner
 * restarts PocketBase — route missing → fall back to the current
 * client-side path, no error toast"). */
export class TotalsRouteUnavailableError extends Error {
  constructor() {
    super('POST /api/kankaku/totals is not available on this PocketBase instance yet (owner has not restarted PocketBase to load the new hook/migration).')
    this.name = 'TotalsRouteUnavailableError'
  }
}

/**
 * Thin client for POST /api/kankaku/totals (docs/contract.md). Every
 * dashboard/tasks-board/sessions-queue screen that used to
 * getFullList()+sum client-side calls this instead — see
 * docs/architecture/aggregation.md "the server sums; the browser
 * displays". A 404 (route not yet loaded — the owner hasn't restarted
 * PocketBase since this feature shipped) throws
 * `TotalsRouteUnavailableError`; every call site must catch it and fall
 * back to the previous client-side path rather than showing an error.
 */
export function useTotals() {
  const { $pb } = useNuxtApp()

  async function fetchTotals(req: TotalsRequest): Promise<TotalsResponse> {
    const body: Record<string, unknown> = {}
    if (req.from) body.from = req.from
    if (req.to) body.to = req.to
    if (req.filters) body.filters = req.filters
    if (req.groupBy) body.group_by = req.groupBy
    if (req.dayBoundaries) body.day_boundaries = req.dayBoundaries
    if (req.sort) body.sort = req.sort
    if (req.page) body.page = req.page
    if (req.perPage) body.per_page = req.perPage

    try {
      const raw = await $pb.send<TotalsResponseRaw>('/api/kankaku/totals', { method: 'POST', body })
      return mapTotalsResponse(raw)
    }
    catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 404) throw new TotalsRouteUnavailableError()
      throw err
    }
  }

  /** Convenience wrapper for the common "sum over a local-day range"
   * call: converts the range to UTC filter instants the same way
   * `useTaskEntries.fetchRange` used to (see `app/lib/local-day.ts`). */
  async function fetchRangeTotals(range: DateRange, opts: { groupBy?: TotalsGroupBy, filters?: TotalsFilters, sort?: string, page?: number, perPage?: number } = {}): Promise<TotalsResponse> {
    const utc = localDateRangeToUtcFilters(range)
    return fetchTotals({ from: utc.start, to: utc.end, groupBy: opts.groupBy ?? 'none', filters: opts.filters, sort: opts.sort, page: opts.page, perPage: opts.perPage })
  }

  return { fetchTotals, fetchRangeTotals }
}
