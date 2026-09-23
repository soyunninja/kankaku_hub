import type { TotalsRequest } from '../composables/useTotals'
import type { TotalsResponse } from './totals-map'

const PAGE_SIZE = 200
// A malformed server response must not start an effectively unbounded request loop.
const MAX_PAGES = 10_000

type FetchTotals = (request: TotalsRequest) => Promise<TotalsResponse>

/** Collect server-aggregated task groups without summing or publishing partial pages. */
export async function loadTaskTotalsPages(fetchTotals: FetchTotals): Promise<{
  byTask: Record<string, { cost: number, workMs: number }>
  sessionsByTask: Record<string, number>
}> {
  const byTask: Record<string, { cost: number, workMs: number }> = Object.create(null)
  const sessionsByTask: Record<string, number> = Object.create(null)
  let totalPages: number | undefined

  for (let page = 1; ; page++) {
    const response = await fetchTotals({ groupBy: 'task', page, perPage: PAGE_SIZE, sort: '-cost' })
    // PocketBase reports zero pages (but page 1) when there are no groups.
    // Only that empty first response may terminate before the normal page range.
    if (page === 1 && response.page === 1 && response.totalPages === 0 && Array.isArray(response.groups) && response.groups.length === 0) {
      return { byTask, sessionsByTask }
    }
    if (!Number.isSafeInteger(response.page) || response.page !== page
      || !Number.isSafeInteger(response.totalPages) || response.totalPages < 1 || response.totalPages > MAX_PAGES
      || (totalPages !== undefined && response.totalPages !== totalPages)
      || page > response.totalPages || !Array.isArray(response.groups)
      || (page < response.totalPages && response.groups.length === 0)) {
      throw new Error('Invalid task totals pagination response')
    }
    totalPages = response.totalPages
    for (const group of response.groups) {
      if (!group.groupKey || Object.hasOwn(byTask, group.groupKey)) continue
      byTask[group.groupKey] = { cost: group.cost, workMs: group.workMs }
      sessionsByTask[group.groupKey] = group.distinctSessions
    }
    if (page === totalPages) return { byTask, sessionsByTask }
  }
}
