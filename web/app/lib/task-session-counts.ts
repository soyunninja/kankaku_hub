import type { TotalsRequest } from '../composables/useTotals'
import type { TotalsResponse } from './totals-map'

export interface SessionCountEntry { task: string, session_id: string, client: string, project: string }
interface EntryPage { items: SessionCountEntry[], page: number, totalPages: number, totalItems: number }
interface CountPorts {
  fetchTotals: (request: TotalsRequest) => Promise<Pick<TotalsResponse, 'groups' | 'page' | 'totalPages' | 'totalGroups'>>
  readEntries: (page: number, perPage: number, options: { filter: string, fields: string }) => Promise<EntryPage>
  isUnavailable: (error: unknown) => boolean
}
const GROUP_PAGE_SIZE = 200
const GROUP_PAGE_CAP = 5
const ENTRY_CAP = 2000
const integer = (value: number) => Number.isSafeInteger(value) && value >= 0
function requireComplete(condition: boolean) {
  if (!condition) throw new Error('Unavailable task session counts')
}

/** All-time, per-task nonempty session IDs; never entry or process counts.
 * SQL counts the empty string once, unlike task detail. Correct it only from
 * a complete bounded blank-row read. A capped/error response is not zero. */
export async function loadTaskSessionCounts(scope: { client: string, project: string }, ports: CountPorts): Promise<Record<string, number>> {
  requireComplete(!!scope.client && !!scope.project)
  const filter = `client = ${JSON.stringify(scope.client)} && project = ${JSON.stringify(scope.project)}`
  async function entries(blankOnly: boolean) {
    const result = await ports.readEntries(1, ENTRY_CAP, {
      filter: filter + (blankOnly ? ' && session_id = ""' : ''),
      fields: 'task,session_id,client,project',
    })
    requireComplete(result.page === 1 && integer(result.totalPages) && result.totalPages <= 1
      && integer(result.totalItems) && result.totalItems === result.items.length && result.items.length <= ENTRY_CAP)
    for (const entry of result.items) {
      requireComplete(typeof entry.client === 'string' && typeof entry.project === 'string'
        && typeof entry.task === 'string' && typeof entry.session_id === 'string')
    }
    return result.items.filter(entry => entry.client === scope.client && entry.project === scope.project)
  }
  const counts = new Map<string, number>()
  try {
    let pages = 1
    let expectedGroups = 0
    for (let page = 1; page <= pages; page++) {
      const result = await ports.fetchTotals({ groupBy: 'task', filters: scope, page, perPage: GROUP_PAGE_SIZE, sort: 'group_key' })
      requireComplete(result.page === page && integer(result.totalGroups) && integer(result.totalPages)
        && result.totalPages <= GROUP_PAGE_CAP
        && result.totalPages === (result.totalGroups ? Math.ceil(result.totalGroups / GROUP_PAGE_SIZE) : result.totalPages)
        && (result.totalGroups > 0 || result.totalPages <= 1))
      if (page === 1) { pages = Math.max(1, result.totalPages); expectedGroups = result.totalGroups }
      requireComplete(result.totalGroups === expectedGroups && Math.max(1, result.totalPages) === pages)
      requireComplete(result.groups.length === Math.min(GROUP_PAGE_SIZE, expectedGroups - (page - 1) * GROUP_PAGE_SIZE))
      for (const group of result.groups) {
        requireComplete(typeof group.groupKey === 'string' && !counts.has(group.groupKey) && integer(group.distinctSessions))
        counts.set(group.groupKey, group.distinctSessions)
      }
    }
    requireComplete(counts.size === expectedGroups)
  }
  catch (error) {
    if (!ports.isUnavailable(error)) throw error
    // Only a missing totals protocol permits a complete bounded all-time scan.
    const byTask = new Map<string, Set<string>>()
    for (const entry of await entries(false)) {
      if (!entry.task) continue
      const sessions = byTask.get(entry.task) ?? new Set<string>()
      if (entry.session_id) sessions.add(entry.session_id)
      byTask.set(entry.task, sessions)
    }
    return Object.fromEntries([...byTask].map(([task, sessions]) => [task, sessions.size]))
  }
  const blankTasks = new Set((await entries(true)).filter(entry => entry.session_id === '').map(entry => entry.task))
  for (const task of blankTasks) {
    requireComplete(counts.has(task) && counts.get(task)! > 0)
    counts.set(task, counts.get(task)! - 1)
  }
  return Object.fromEntries([...counts].filter(([task]) => task))
}
