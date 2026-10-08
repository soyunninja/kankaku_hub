import type { TotalsRequest } from '../composables/useTotals'
import type { TotalsResponse } from './totals-map'

const PAGE_SIZE = 200
const MAX_PAGES = 10_000

type FetchTotals = (request: TotalsRequest) => Promise<TotalsResponse>

export interface TeamMemberTotal {
  activeProjects: number
  workMs: number
  cost: number
}

/** Fetch all lifetime member groups; publish no partial data when any page fails. */
export async function loadTeamMemberTotals(fetchTotals: FetchTotals): Promise<Record<string, TeamMemberTotal>> {
  const byMember: Record<string, TeamMemberTotal> = Object.create(null)
  let totalPages: number | undefined

  for (let page = 1; ; page++) {
    const response = await fetchTotals({ groupBy: 'member', page, perPage: PAGE_SIZE })
    if (page === 1 && response.page === 1 && response.totalPages === 0
      && Array.isArray(response.groups) && response.groups.length === 0) {
      if (response.activeProjectsAvailable !== true) throw new Error('Member project totals are unavailable')
      return byMember
    }
    if (!Number.isSafeInteger(response.page) || response.page !== page
      || !Number.isSafeInteger(response.totalPages) || response.totalPages < 1 || response.totalPages > MAX_PAGES
      || (totalPages !== undefined && response.totalPages !== totalPages)
      || page > response.totalPages || !Array.isArray(response.groups)
      || (page < response.totalPages && response.groups.length === 0)) {
      throw new Error('Invalid team member totals pagination response')
    }
    if (response.activeProjectsAvailable !== true) throw new Error('Member project totals are unavailable')
    totalPages = response.totalPages
    for (const group of response.groups) {
      if (!group.groupKey || Object.hasOwn(byMember, group.groupKey)) continue
      if (!Number.isSafeInteger(group.activeProjects) || (group.activeProjects ?? -1) < 0) {
        throw new Error('Member project totals are unavailable')
      }
      byMember[group.groupKey] = { activeProjects: group.activeProjects!, workMs: group.workMs, cost: group.cost }
    }
    if (page === totalPages) return byMember
  }
}
