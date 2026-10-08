import type { TotalsRequest } from '../composables/useTotals'
import { buildLocalDayBoundaries, utcInstantToLocalDay } from './local-day'
import type { TotalsGroup, TotalsResponse, TotalsRow } from './totals-map'

export type MemberProjectHistoryFetcher = (request: TotalsRequest) => Promise<TotalsResponse>

export class IgnoredSessionsTotalsUnavailableError extends Error {
  constructor() {
    super('This PocketBase totals route does not confirm that ignored sessions were included.')
    this.name = 'IgnoredSessionsTotalsUnavailableError'
  }
}

export interface MemberProjectHistorySession extends TotalsGroup {
  identifiable: boolean
  /** Loaded on demand for identifiable sessions; null means not loaded. */
  tasks: MemberProjectHistoryTask[] | null
}

export type MemberProjectHistoryTask = TotalsGroup

export interface MemberProjectHistoryChartPoint {
  period: string
  workMs: number
  cost: number
  costKnownSum: number
  costUnknownEntries: number
  costEstimatedEntries: number
  activeDays: string[]
}

export interface MemberProjectHistory {
  total: TotalsRow
  sessions: MemberProjectHistorySession[]
  distinctTasks: number | null
  complete: boolean
  firstActivity: string | null
  lastActivity: string | null
  activeDays: string[] | null
  chart: { granularity: 'day' | 'month', points: MemberProjectHistoryChartPoint[] } | null
}

const PAGE_SIZE = 200
const MAX_SESSION_PAGES = 500
const MAX_HISTORY_DAYS = 50_000
const MAX_DAY_BOUNDARIES = 401
const TOTAL_METRIC_FIELDS = ['wallMs', 'workMs', 'waitingMs', 'cost', 'costKnownSum'] as const
const TOTAL_COUNT_FIELDS = [
  'entries', 'input', 'output', 'cacheRead', 'cacheWrite', 'waitingUnavailableEntries',
  'costUnknownEntries', 'costEstimatedEntries', 'costKnownEntries', 'unlinkedEntries', 'distinctSessions', 'count',
] as const
const GROUP_COUNT_FIELDS = ['distinctClient', 'distinctProject', 'distinctTask', 'distinctAgent'] as const

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validateTotals(row: unknown, label: string): asserts row is TotalsRow {
  if (!row || typeof row !== 'object') throw new Error(`Invalid member project history ${label}`)
  const values = row as Record<string, unknown>
  if (TOTAL_METRIC_FIELDS.some(field => typeof values[field] !== 'number' || !Number.isFinite(values[field]) || (values[field] as number) < 0)
    || TOTAL_COUNT_FIELDS.some(field => !isCount(values[field]))) {
    throw new Error(`Invalid member project history ${label}`)
  }
  if (values.count !== values.entries || (values.costUnknownEntries as number) > (values.entries as number)
    || (values.costEstimatedEntries as number) > (values.costKnownEntries as number)
    || (values.costKnownEntries as number) > (values.entries as number)
    || (values.distinctSessions as number) > (values.entries as number)) {
    throw new Error(`Inconsistent member project history ${label}`)
  }
}

function validateGroup(group: unknown): asserts group is TotalsGroup {
  if (!group || typeof group !== 'object') throw new Error('Invalid member project history group')
  const values = group as Record<string, unknown>
  validateTotals(group, 'group totals')
  if (GROUP_COUNT_FIELDS.some(field => !isCount(values[field])) || typeof values.groupKey !== 'string') {
    throw new Error('Invalid member project history group metadata')
  }
}

function validatePage(response: TotalsResponse, page: number, perPage: number, label: string): void {
  validateTotals(response.total, `${label} summary`)
  if (response.page !== page || response.perPage !== perPage
    || !Number.isSafeInteger(response.totalPages) || response.totalPages < 0
    || !Number.isSafeInteger(response.totalGroups) || response.totalGroups < 0 || !Array.isArray(response.groups)) {
    throw new Error(`Invalid member project history ${label} pagination`)
  }
  const expectedPages = response.totalGroups === 0 ? 0 : Math.ceil(response.totalGroups / perPage)
  if (response.totalPages !== expectedPages) throw new Error(`Invalid member project history ${label} pagination`)
  const expectedRows = page > response.totalPages ? 0 : Math.min(perPage, response.totalGroups - (page - 1) * perPage)
  if (response.groups.length !== expectedRows) throw new Error(`Incomplete member project history ${label} pagination`)
}

const RECONCILED_METRICS = ['wallMs', 'workMs', 'waitingMs', 'input', 'output', 'cacheRead', 'cacheWrite', 'cost', 'costKnownSum'] as const
const RECONCILED_COUNTS = ['entries', 'waitingUnavailableEntries', 'costUnknownEntries', 'costEstimatedEntries', 'costKnownEntries', 'unlinkedEntries'] as const

function metricMatches(actual: number, expected: number): boolean {
  const tolerance = Math.max(1e-9, Math.abs(expected) * 1e-9)
  return Math.abs(actual - expected) <= tolerance
}

function assertTotalsEqual(actual: TotalsRow, expected: TotalsRow, label: string, includeDistinctSessions = true): void {
  for (const field of RECONCILED_COUNTS) {
    if (actual[field] !== expected[field]) throw new Error(`Member project history ${label} ${field} mismatch`)
  }
  for (const field of RECONCILED_METRICS) {
    if (!metricMatches(actual[field], expected[field])) throw new Error(`Member project history ${label} ${field} mismatch`)
  }
  if (includeDistinctSessions && actual.distinctSessions !== expected.distinctSessions) {
    throw new Error(`Member project history ${label} distinctSessions mismatch`)
  }
}

function assertGroupsEqualTotal(groups: readonly TotalsGroup[], expected: TotalsRow, label: string, includeDistinctSessions = false): void {
  const actual = {
    ...expected,
    entries: 0, count: 0, wallMs: 0, workMs: 0, waitingMs: 0,
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, costKnownSum: 0,
    waitingUnavailableEntries: 0, costUnknownEntries: 0, costEstimatedEntries: 0,
    costKnownEntries: 0, unlinkedEntries: 0, distinctSessions: 0,
  }
  for (const group of groups) {
    actual.entries += group.entries
    actual.count += group.entries
    for (const field of RECONCILED_METRICS) actual[field] += group[field]
    for (const field of RECONCILED_COUNTS) if (field !== 'entries') actual[field] += group[field]
    if (includeDistinctSessions) actual.distinctSessions += group.distinctSessions
  }
  assertTotalsEqual(actual, expected, label, includeDistinctSessions)
}

function emptyResult(total: TotalsRow, sessions: MemberProjectHistorySession[] = []): MemberProjectHistory {
  return { total, sessions, distinctTasks: null, complete: false, firstActivity: null, lastActivity: null, activeDays: null, chart: null }
}

/** Fetches only pre-consolidated task_entries totals for this member and project; no inherited date range or raw work_records. */
export async function loadMemberProjectHistory(
  fetchTotals: MemberProjectHistoryFetcher,
  memberId: string,
  projectId: string,
  isCurrent: () => boolean = () => true,
  timeZone?: string,
): Promise<MemberProjectHistory | null> {
  if (!memberId || !projectId) throw new Error('Member and project are required for historical attribution')
  const filters = { member: memberId, project: projectId }
  if (!isCurrent()) return null
  const summary = await fetchTotals({ filters, groupBy: 'none' })
  if (!isCurrent()) return null
  validateTotals(summary.total, 'all-time summary')

  const taskIds = new Set<string>()
  const taskGroupRows: TotalsGroup[] = []
  let taskPages: number | undefined
  let taskGroupCount: number | undefined
  for (let page = 1; ; page++) {
    if (!isCurrent()) return null
    const response = await fetchTotals({ filters, groupBy: 'task', sort: 'group_key', page, perPage: PAGE_SIZE })
    if (!isCurrent()) return null
    validatePage(response, page, PAGE_SIZE, 'project task')
    assertTotalsEqual(response.total, summary.total, 'project task summary')
    if (page === 1) {
      taskPages = response.totalPages
      taskGroupCount = response.totalGroups
      if (taskPages === 0) break
      if (taskPages > MAX_SESSION_PAGES) return emptyResult(summary.total)
    }
    if (response.totalPages !== taskPages || response.totalGroups !== taskGroupCount || page > (taskPages ?? 0)
      || (page < (taskPages ?? 0) && response.groups.length === 0)) throw new Error('Inconsistent member project history task pagination')
    for (const group of response.groups) {
      validateGroup(group)
      if (taskIds.has(group.groupKey)) throw new Error('Duplicate member project history task')
      taskIds.add(group.groupKey)
      taskGroupRows.push(group)
    }
    if (page === taskPages) {
      if (taskIds.size !== taskGroupCount) throw new Error('Incomplete member project history task pagination')
      break
    }
    if (page >= MAX_SESSION_PAGES) return emptyResult(summary.total)
  }
  assertGroupsEqualTotal(taskGroupRows, summary.total, 'project task aggregates')

  const sessions: MemberProjectHistorySession[] = []
  const sessionIds = new Set<string>()
  let expectedPages: number | undefined
  let expectedGroups: number | undefined
  let previousSessionStart = ''
  for (let page = 1; ; page++) {
    if (!isCurrent()) return null
    let response: TotalsResponse
    try {
      response = await fetchTotals({ filters, groupBy: 'session', includeIgnoredSessions: true, sort: 'min_started_at', page, perPage: PAGE_SIZE })
    }
    catch (cause) {
      if ((cause as { status?: number })?.status === 400) throw new IgnoredSessionsTotalsUnavailableError()
      throw cause
    }
    if (!isCurrent()) return null
    validatePage(response, page, PAGE_SIZE, 'session')
    if (response.ignoredSessionsIncluded !== true) throw new IgnoredSessionsTotalsUnavailableError()
    assertTotalsEqual(response.total, summary.total, 'session summary')
    if (page === 1) {
      expectedPages = response.totalPages
      expectedGroups = response.totalGroups
      if (expectedPages === 0) break
      if (expectedPages > MAX_SESSION_PAGES) return emptyResult(summary.total)
    }
    if (response.totalPages !== expectedPages || response.totalGroups !== expectedGroups || page > (expectedPages ?? 0)
      || (page < (expectedPages ?? 0) && response.groups.length === 0)) {
      throw new Error('Inconsistent member project history session pagination')
    }
    for (const group of response.groups) {
      validateGroup(group)
      if (!group.minStartedAt || !group.maxEndedAt || !Number.isFinite(Date.parse(group.minStartedAt)) || !Number.isFinite(Date.parse(group.maxEndedAt))
        || group.minStartedAt > group.maxEndedAt || typeof group.ignoredSession !== 'boolean') {
        throw new Error('Invalid member project history activity dates or ignored-session metadata')
      }
      if (sessionIds.has(group.groupKey)) throw new Error('Duplicate member project history session')
      if (previousSessionStart && group.minStartedAt < previousSessionStart) throw new Error('Unstable member project history session order')
      sessionIds.add(group.groupKey)
      previousSessionStart = group.minStartedAt
      sessions.push({ ...group, identifiable: group.groupKey !== '', tasks: null })
    }
    if (page === expectedPages) {
      if (sessions.length !== expectedGroups) throw new Error('Incomplete member project history session pagination')
      break
    }
    if (page >= MAX_SESSION_PAGES) return emptyResult(summary.total, sessions)
  }

  assertGroupsEqualTotal(sessions, summary.total, 'session aggregates', true)
  if (sessions.length === 0) {
    return { total: summary.total, sessions, distinctTasks: [...taskIds].filter(Boolean).length, complete: true, firstActivity: null, lastActivity: null, activeDays: [], chart: { granularity: 'day', points: [] } }
  }
  if (!isCurrent()) return null
  const firstActivity = sessions.reduce((earliest, session) => session.minStartedAt < earliest ? session.minStartedAt : earliest, sessions[0]!.minStartedAt)
  const lastActivity = sessions.reduce((latest, session) => session.maxEndedAt > latest ? session.maxEndedAt : latest, sessions[0]!.maxEndedAt)
  const start = utcInstantToLocalDay(firstActivity, timeZone)
  const end = utcInstantToLocalDay(lastActivity, timeZone)
  if (start > end || firstActivity > lastActivity) throw new Error('Invalid member project history activity period')
  const { boundaries, labels } = buildLocalDayBoundaries({ start, end }, timeZone)
  if (labels.length > MAX_HISTORY_DAYS) return emptyResult(summary.total, sessions)

  const active = new Map<string, TotalsGroup>()
  const dailyGroups: TotalsGroup[] = []
  for (let offset = 0; offset < labels.length; offset += MAX_DAY_BOUNDARIES - 1) {
    const chunkLabels = labels.slice(offset, offset + MAX_DAY_BOUNDARIES - 1)
    const chunkBoundaries = boundaries.slice(offset, offset + chunkLabels.length + 1)
    const perPage = Math.min(PAGE_SIZE, chunkLabels.length)
    let pageCount: number | undefined
    let groupCount: number | undefined
    let chunkTotal: TotalsRow | undefined
    const chunkGroups: TotalsGroup[] = []
    let seen = 0
    for (let page = 1; ; page++) {
      if (!isCurrent()) return null
      const response = await fetchTotals({ filters, groupBy: 'day', dayBoundaries: chunkBoundaries, page, perPage })
      if (!isCurrent()) return null
      validatePage(response, page, perPage, 'daily')
      if (page === 1) {
        chunkTotal = response.total
        pageCount = response.totalPages
        groupCount = response.totalGroups
        const expected = groupCount === 0 ? 0 : Math.ceil(groupCount / perPage)
        if (pageCount !== expected || (groupCount ?? 0) > chunkLabels.length) throw new Error('Invalid member project history daily pagination')
        if (pageCount === 0) break
      }
      if (!chunkTotal) throw new Error('Missing member project history daily summary')
      assertTotalsEqual(response.total, chunkTotal, 'daily page summary', false)
      if (response.totalPages !== pageCount || response.totalGroups !== groupCount || page > (pageCount ?? 0)
        || (page < (pageCount ?? 0) && response.groups.length === 0)) throw new Error('Inconsistent member project history daily pagination')
      for (const group of response.groups) {
        validateGroup(group)
        if (!/^(0|[1-9]\d*)$/.test(group.groupKey)) throw new Error('Invalid member project history daily bucket')
        const index = Number(group.groupKey)
        if (!Number.isSafeInteger(index) || index < 0 || index >= chunkLabels.length) throw new Error('Invalid member project history daily bucket')
        const day = chunkLabels[index]!
        if (active.has(day)) throw new Error('Duplicate member project history active day')
        active.set(day, group)
        chunkGroups.push(group)
        dailyGroups.push(group)
        seen++
      }
      if (page === pageCount) {
        if (seen !== groupCount) throw new Error('Incomplete member project history daily totals')
        break
      }
    }
    assertGroupsEqualTotal(chunkGroups, chunkTotal!, 'daily chunk aggregates')
  }
  assertGroupsEqualTotal(dailyGroups, summary.total, 'daily aggregates')
  const activeDays = [...active.keys()].sort()
  const granularity = labels.length > 730 ? 'month' : 'day'
  const chartBuckets = new Map<string, MemberProjectHistoryChartPoint>()
  for (const day of labels) {
    const key = granularity === 'month' ? day.slice(0, 7) : day
    if (!chartBuckets.has(key)) chartBuckets.set(key, { period: key, workMs: 0, cost: 0, costKnownSum: 0, costUnknownEntries: 0, costEstimatedEntries: 0, activeDays: [] })
    const group = active.get(day)
    if (!group) continue
    const point = chartBuckets.get(key)!
    point.workMs += group.workMs
    point.cost += group.cost
    point.costKnownSum += group.costKnownSum
    point.costUnknownEntries += group.costUnknownEntries
    point.costEstimatedEntries += group.costEstimatedEntries
    point.activeDays.push(day)
  }
  return {
    total: summary.total,
    sessions,
    distinctTasks: [...taskIds].filter(Boolean).length,
    complete: true,
    firstActivity,
    lastActivity,
    activeDays,
    chart: { granularity, points: [...chartBuckets.values()] },
  }
}

/** Lazily obtains task aggregates within one identifiable session and the same historical member/project scope. */
export async function loadMemberProjectSessionTasks(
  fetchTotals: MemberProjectHistoryFetcher,
  memberId: string,
  projectId: string,
  sessionId: string,
  expectedSession: TotalsRow,
  isCurrent: () => boolean = () => true,
): Promise<MemberProjectHistoryTask[] | null> {
  if (!memberId || !projectId || !sessionId) throw new Error('Member, project and identifiable session are required')
  validateTotals(expectedSession, 'session task expected aggregate')
  const filters = { member: memberId, project: projectId, session_id: sessionId }
  const groups: MemberProjectHistoryTask[] = []
  const keys = new Set<string>()
  let pages: number | undefined
  let groupCount: number | undefined
  let taskTotal: TotalsRow | undefined
  for (let page = 1; ; page++) {
    if (!isCurrent()) return null
    const response = await fetchTotals({ filters, groupBy: 'task', sort: 'group_key', page, perPage: PAGE_SIZE })
    if (!isCurrent()) return null
    validatePage(response, page, PAGE_SIZE, 'task')
    assertTotalsEqual(response.total, expectedSession, 'session task summary')
    if (page === 1) {
      taskTotal = response.total
      pages = response.totalPages
      groupCount = response.totalGroups
      const expected = groupCount === 0 ? 0 : Math.ceil(groupCount / PAGE_SIZE)
      if (pages !== expected) throw new Error('Invalid member project session task pagination')
      if ((pages ?? 0) > MAX_SESSION_PAGES) throw new Error('Incomplete member project session task pagination')
      if (pages === 0) {
        assertGroupsEqualTotal(groups, taskTotal, 'session task aggregates')
        return []
      }
    }
    if (!taskTotal) throw new Error('Missing member project session task summary')
    assertTotalsEqual(response.total, taskTotal, 'session task page summary')
    if (response.totalPages !== pages || response.totalGroups !== groupCount || page > (pages ?? 0)
      || (page < (pages ?? 0) && response.groups.length === 0)) throw new Error('Inconsistent member project session task pagination')
    for (const group of response.groups) {
      validateGroup(group)
      if (keys.has(group.groupKey)) throw new Error('Duplicate member project session task')
      keys.add(group.groupKey)
      groups.push(group)
    }
    if (page === pages) {
      if (groups.length !== groupCount) throw new Error('Incomplete member project session task pagination')
      assertGroupsEqualTotal(groups, taskTotal, 'session task aggregates')
      return groups
    }
  }
}
