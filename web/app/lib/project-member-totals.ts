import type { TotalsRequest } from '../composables/useTotals'
import type { TotalsResponse } from './totals-map'

const PAGE_SIZE = 200
const MAX_PAGES = 10_000

type FetchTotals = (request: TotalsRequest) => Promise<TotalsResponse>
export interface ProjectMemberTotal {
  workMs: number
  cost: number
  entries: number
  costUnknownEntries: number
  costEstimatedEntries: number
}
export interface ProjectMemberTotals {
  members: Record<string, ProjectMemberTotal>
  unattributed: ProjectMemberTotal | null
}

function validCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}
function validMetric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Load complete all-time member aggregates for one project; never publish partial pages. */
export async function loadProjectMemberTotals(fetchTotals: FetchTotals, scope: { client: string, project: string }): Promise<ProjectMemberTotals> {
  if (!scope.client || !scope.project) throw new Error('Project member totals require a client and project scope')
  const members: Record<string, ProjectMemberTotal> = Object.create(null)
  let unattributed: ProjectMemberTotal | null = null
  let totalPages: number | undefined
  let totalGroups: number | undefined

  for (let page = 1; ; page++) {
    const response = await fetchTotals({ groupBy: 'member', filters: { client: scope.client, project: scope.project }, page, perPage: PAGE_SIZE })
    if (!Number.isSafeInteger(response.page) || response.page !== page
      || !Number.isSafeInteger(response.totalPages) || response.totalPages < 0 || response.totalPages > MAX_PAGES
      || !Number.isSafeInteger(response.totalGroups) || response.totalGroups < 0
      || !Array.isArray(response.groups)) throw new Error('Invalid project member totals pagination response')
    if (page === 1) {
      totalPages = response.totalPages
      totalGroups = response.totalGroups
      if (totalPages === 0) {
        if (totalGroups !== 0 || response.groups.length !== 0) throw new Error('Invalid empty project member totals response')
        return { members, unattributed }
      }
    }
    if (response.totalPages !== totalPages || response.totalGroups !== totalGroups || page > totalPages
      || (page < totalPages && response.groups.length === 0) || response.groups.length > PAGE_SIZE) {
      throw new Error('Invalid project member totals pagination response')
    }
    for (const group of response.groups) {
      const key = group.groupKey
      if (typeof key !== 'string' || !validMetric(group.workMs) || !validMetric(group.cost)
        || !validCount(group.entries) || !validCount(group.costUnknownEntries) || !validCount(group.costEstimatedEntries)
        || group.costUnknownEntries + group.costEstimatedEntries > group.entries) {
        throw new Error('Invalid project member totals aggregate')
      }
      if (key && Object.hasOwn(members, key)) throw new Error('Duplicate project member totals group')
      if (!key && unattributed) throw new Error('Duplicate unattributed project totals group')
      const total = { workMs: group.workMs, cost: group.cost, entries: group.entries, costUnknownEntries: group.costUnknownEntries, costEstimatedEntries: group.costEstimatedEntries }
      if (key) members[key] = total
      else unattributed = total
    }
    if (page === totalPages) {
      if (Object.keys(members).length + Number(unattributed !== null) !== totalGroups) throw new Error('Incomplete project member totals response')
      return { members, unattributed }
    }
  }
}
