import type { TotalsRequest } from '../composables/useTotals'
import { buildLocalDayBoundaries, localDateRangeToUtcFilters } from './local-day'
import { projectRemainder, PROJECT_OTHERS_KEY } from './project-chart'
import type { ClientRecord, ProjectRecord } from './pocketbase-types'
import type { TotalsGroup, TotalsResponse } from './totals-map'

export type MemberWorkView = 'projects' | 'sessions'
export type MemberWorkGroupBy = 'project' | 'session'

export interface MemberWorkRange {
  start: string
  end: string
}

export type MemberWorkFetcher = (request: TotalsRequest) => Promise<TotalsResponse>

export interface MemberWorkResult {
  groups: TotalsGroup[]
  total: TotalsResponse['total']
}

export interface MemberProjectChart {
  points: { day: string, values: Record<string, number> }[]
  seriesKeys: string[]
}

export function memberWorkProjectCacheKey(memberId: string, range: MemberWorkRange): string {
  return JSON.stringify([memberId, range.start, range.end])
}

/** Count real project identities from complete project groups, not session-level distinctProject subtotals. */
export function countRecordedMemberProjects(
  groups: readonly Pick<TotalsGroup, 'groupKey'>[],
  projects: readonly Pick<ProjectRecord, 'id' | 'client'>[],
  clients: readonly Pick<ClientRecord, 'id' | 'unassigned'>[],
): number {
  const protectedClientIds = new Set(clients.filter(client => client.unassigned).map(client => client.id))
  const projectById = new Map(projects.map(project => [project.id, project]))
  return new Set(groups
    .map(group => group.groupKey)
    .filter(projectId => projectId.trim() !== '')
    .filter((projectId) => {
      const project = projectById.get(projectId)
      // Keep unknown historical IDs; only catalog projects owned by a protected client are excluded.
      return !project || !protectedClientIds.has(project.client)
    })).size
}

const PAGE_SIZE = 200
const MAX_PAGES = 10_000
const TOTAL_METRIC_FIELDS = ['wallMs', 'workMs', 'waitingMs', 'cost', 'costKnownSum'] as const
const TOTAL_COUNT_FIELDS = [
  'entries', 'input', 'output', 'cacheRead', 'cacheWrite', 'waitingUnavailableEntries',
  'costUnknownEntries', 'costEstimatedEntries', 'costKnownEntries', 'unlinkedEntries', 'distinctSessions', 'count',
] as const
const GROUP_COUNT_FIELDS = ['distinctClient', 'distinctProject', 'distinctTask', 'distinctAgent'] as const
const PROJECT_CHART_SERIES_LIMIT = 5
const DAILY_MAX_BOUNDARIES = 401

function isNonnegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validateTotalsRow(row: unknown, label: string): asserts row is TotalsResponse['total'] {
  if (!row || typeof row !== 'object') throw new Error(`Invalid member work ${label} numeric totals`)
  const values = row as Record<string, unknown>
  for (const field of TOTAL_METRIC_FIELDS) {
    if (!isNonnegativeFinite(values[field])) {
      throw new Error(`Invalid member work ${label} numeric totals`)
    }
  }
  for (const field of TOTAL_COUNT_FIELDS) {
    if (!isNonnegativeSafeInteger(values[field])) {
      throw new Error(`Invalid member work ${label} numeric totals`)
    }
  }
  const entries = values.entries as number
  const knownEntries = values.costKnownEntries as number
  if (values.count !== entries
    || (values.waitingUnavailableEntries as number) > entries
    || (values.costUnknownEntries as number) > entries
    || (values.costEstimatedEntries as number) > knownEntries
    || knownEntries > entries
    || (values.unlinkedEntries as number) > entries
    || (values.distinctSessions as number) > entries) {
    throw new Error(`Inconsistent member work ${label} numeric totals`)
  }
}

function validateGroup(group: unknown): asserts group is TotalsGroup {
  if (!group || typeof group !== 'object') throw new Error('Invalid member work group numeric totals')
  const values = group as Record<string, unknown>
  validateTotalsRow(values, 'group')
  for (const field of GROUP_COUNT_FIELDS) {
    if (!isNonnegativeSafeInteger(values[field])) {
      throw new Error('Invalid member work group numeric metadata')
    }
  }
  if (values.activeProjects !== undefined && !isNonnegativeSafeInteger(values.activeProjects)) {
    throw new Error('Invalid member work group numeric metadata')
  }
}

async function loadMemberDailyGroups(
  fetchTotals: MemberWorkFetcher,
  memberId: string,
  boundaries: string[],
  globalIndexOffset: number,
  project: string | undefined,
  isCurrent: () => boolean,
): Promise<TotalsGroup[] | null> {
  const bucketCount = boundaries.length - 1
  const perPage = Math.min(PAGE_SIZE, bucketCount)
  const filters = project === undefined ? { member: memberId } : { member: memberId, project }
  const groups: TotalsGroup[] = []
  const indexes = new Set<number>()
  let pages: number | undefined
  let totalGroups: number | undefined

  for (let page = 1; ; page++) {
    if (!isCurrent()) return null
    const response = await fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters, page, perPage })
    if (!isCurrent()) return null
    try {
      validateTotalsRow(response.total, 'project chart daily summary')
    }
    catch {
      throw new Error('Invalid member project chart daily summary')
    }
    if (!Number.isSafeInteger(response.page) || response.page !== page
      || !Number.isSafeInteger(response.totalPages) || response.totalPages < 0 || response.totalPages > 2
      || !Number.isSafeInteger(response.totalGroups) || response.totalGroups < 0 || response.totalGroups > bucketCount
      || !Array.isArray(response.groups)) {
      throw new Error('Invalid member project chart daily pagination')
    }
    if (page === 1) {
      const expectedPages = response.totalGroups === 0 ? 0 : Math.ceil(response.totalGroups / perPage)
      if (response.totalPages !== expectedPages || expectedPages === 0 && response.groups.length !== 0) {
        throw new Error('Invalid member project chart daily pagination')
      }
      pages = response.totalPages
      totalGroups = response.totalGroups
      if (pages === 0) return []
    }
    if (response.totalPages !== pages || response.totalGroups !== totalGroups || page > (pages ?? 0)
      || (page < (pages ?? 0) && response.groups.length === 0)) {
      throw new Error('Inconsistent member project chart daily pagination')
    }
    for (const group of response.groups) {
      try {
        validateGroup(group)
      }
      catch {
        throw new Error('Invalid member project chart daily group totals')
      }
      const index = typeof group.groupKey === 'string' && /^(0|[1-9]\d*)$/.test(group.groupKey)
        ? Number(group.groupKey)
        : Number.NaN
      if (!Number.isSafeInteger(index) || index < 0 || index >= bucketCount || indexes.has(index)) {
        throw new Error('Invalid member project chart daily bucket index')
      }
      indexes.add(index)
      groups.push({ ...group, groupKey: String(globalIndexOffset + index) })
    }
    if (page === pages) {
      if (groups.length !== totalGroups) throw new Error('Incomplete member project chart daily totals')
      return groups
    }
  }
}

/** Fetch complete server-aggregated task-entry groups; never derive totals from raw work records. */
export async function loadMemberProjectChart(
  fetchTotals: MemberWorkFetcher,
  memberId: string,
  range: MemberWorkRange,
  isCurrent: () => boolean = () => true,
  timeZone?: string,
): Promise<MemberProjectChart | null> {
  const { boundaries, labels } = buildLocalDayBoundaries(range, timeZone)
  const ranking = await loadMemberWorkGroups(fetchTotals, memberId, range, 'project', isCurrent)
  if (!ranking || !isCurrent()) return null
  const selectedKeys = ranking.groups
    .filter(group => group.groupKey.trim() !== '')
    .slice()
    .sort((a, b) => b.workMs - a.workMs || a.groupKey.localeCompare(b.groupKey))
    .slice(0, PROJECT_CHART_SERIES_LIMIT)
    .map(group => group.groupKey)
  const overallGroups: TotalsGroup[] = []
  const selectedByProject: Record<string, TotalsGroup[]> = Object.fromEntries(selectedKeys.map(key => [key, []]))

  for (let offset = 0; offset < labels.length; offset += DAILY_MAX_BOUNDARIES - 1) {
    const chunkBoundaries = boundaries.slice(offset, offset + DAILY_MAX_BOUNDARIES)
    const [overall, ...selected] = await Promise.all([
      loadMemberDailyGroups(fetchTotals, memberId, chunkBoundaries, offset, undefined, isCurrent),
      ...selectedKeys.map(project => loadMemberDailyGroups(fetchTotals, memberId, chunkBoundaries, offset, project, isCurrent)),
    ])
    if (!isCurrent() || !overall || selected.some(groups => !groups)) return null
    overallGroups.push(...overall)
    selectedKeys.forEach((key, index) => selectedByProject[key]!.push(...selected[index]!))
  }

  const remainder = projectRemainder(overallGroups, selectedByProject)
  const groupsBySeries: Record<string, TotalsGroup[]> = { ...selectedByProject }
  if (remainder.some(group => group.workMs !== 0)) groupsBySeries[PROJECT_OTHERS_KEY] = remainder
  const seriesKeys = [...selectedKeys, ...(groupsBySeries[PROJECT_OTHERS_KEY] ? [PROJECT_OTHERS_KEY] : [])]
  const points = labels.map((day, index) => {
    const values: Record<string, number> = {}
    for (const key of seriesKeys) {
      const row = groupsBySeries[key]?.find(group => group.groupKey === String(index))
      values[key] = row?.workMs ?? 0
    }
    return { day, values }
  })
  return { points, seriesKeys }
}

export async function loadMemberWorkGroups(
  fetchTotals: MemberWorkFetcher,
  memberId: string,
  range: MemberWorkRange,
  groupBy: MemberWorkGroupBy,
  isCurrent: () => boolean = () => true,
): Promise<MemberWorkResult | null> {
  const utc = localDateRangeToUtcFilters(range)
  const groups: TotalsGroup[] = []
  const keys = new Set<string>()
  let pages: number | undefined
  let totalGroups: number | undefined
  let total: TotalsResponse['total'] | undefined

  for (let page = 1; ; page++) {
    if (!isCurrent()) return null
    const response = await fetchTotals({
      from: utc.start,
      to: utc.end,
      filters: { member: memberId },
      groupBy,
      page,
      perPage: PAGE_SIZE,
      sort: '-work_ms',
    })
    if (!isCurrent()) return null

    validateTotalsRow(response.total, 'summary')
    if (!Number.isSafeInteger(response.page) || response.page !== page
      || !Number.isSafeInteger(response.totalPages) || response.totalPages < 0 || response.totalPages > MAX_PAGES
      || !Number.isSafeInteger(response.totalGroups) || response.totalGroups < 0
      || !Array.isArray(response.groups)) {
      throw new Error('Invalid member work pagination response')
    }
    if (page === 1) {
      if (response.totalPages === 0) {
        if (response.totalGroups !== 0 || response.groups.length !== 0) throw new Error('Invalid member work pagination response')
        return { groups: [], total: response.total }
      }
      pages = response.totalPages
      totalGroups = response.totalGroups
      total = response.total
    }
    if (response.totalPages !== pages || response.totalGroups !== totalGroups || page > (pages ?? 0)
      || (page < (pages ?? 0) && response.groups.length === 0)) {
      throw new Error('Inconsistent member work pagination response')
    }
    for (const group of response.groups) {
      validateGroup(group)
      if (typeof group.groupKey !== 'string' || keys.has(group.groupKey)) throw new Error('Invalid member work group response')
      keys.add(group.groupKey)
      groups.push(group)
    }
    if (page === pages) {
      if (groups.length !== totalGroups) throw new Error('Incomplete member work pagination response')
      return { groups, total: total! }
    }
  }
}
