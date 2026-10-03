<script setup lang="ts">
import { Translation as I18nT } from 'vue-i18n'
import { onBeforeUnmount, onMounted } from 'vue'
import StackedBarChart from '@/components/charts/StackedBarChart.vue'
import ClientName from '@/components/clients/ClientName.vue'
import ExportMenu from '@/components/common/ExportMenu.vue'
import BreakdownTable from '@/components/dashboard/BreakdownTable.vue'
import DateRangePicker from '@/components/dashboard/DateRangePicker.vue'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupByClient, groupByProject, sumTaskEntries } from '@/lib/aggregate'
import { resolveAgent } from '@/lib/agents'
import { cacheHitRatio } from '@/lib/cache-hit'
import { DASHBOARD_PREFERENCES_KEY, parseDashboardPreferences } from '@/lib/dashboard-preferences'
import { buildDashboardExport, createCsvExport, createXlsxExport, type DashboardExportMetadata } from '@/lib/export'
import { buildLocalDayBoundaries, localDateRangeToUtcFilters, utcInstantToLocalDay } from '@/lib/local-day'
import { computeAverageCost, LEGACY_AGENT, listDistinctAgents, summarizeWorkTimeQuality } from '@/lib/measurement-quality'
import { PROJECT_OTHERS_KEY, projectRemainder, rankProjects } from '@/lib/project-chart'
import type { DateRange, PresetKey } from '@/lib/period'
import { previousEquivalentPeriod, resolvePreset } from '@/lib/period'
import type { ClientRecord, TaskEntryRecord } from '@/lib/pocketbase-types'
import {
  computeAverageCostFromTotal,
  type GroupTotalsLike,
  groupsToGroupTotals,
  summarizeWorkTimeQualityFromTotal,
  type TotalsGroup,
  type TotalsRow,
  ZERO_TOTALS_ROW,
} from '@/lib/totals-map'
import { TotalsRouteUnavailableError, type TotalsFilters } from '@/composables/useTotals'

const { t } = useI18n()
const { user } = useAuth()
const displayName = computed(() => user.value?.name?.trim() ?? '')
const toast = useToast()
useHead({ title: computed(() => t('dashboard.title')) })
const { formatCost, formatDuration, formatPercent, formatTokensCompact } = useFormatters()

const { $pb } = useNuxtApp()
const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { fetchRange, subscribe } = useTaskEntries()
const { fetchTotals } = useTotals()

const preset = ref<PresetKey>('30d')
const range = ref<DateRange>(resolvePreset('30d'))
const includeUnassigned = ref(false)
const metric = ref<'work' | 'cost'>('work')
const stackBy = ref<'none' | 'client' | 'project'>('project')
const agentFilter = ref('')

const loading = ref(true)
const summaryError = ref(false)
const chartLoading = ref(true)
const chartError = ref(false)
/** True once a totals-route call has 404'd this session — sticky for the
 * page's lifetime so every subsequent `load()` goes straight to the
 * fallback instead of re-probing on every debounced realtime refresh
 * (design requirement: "route missing → fall back ... no error toast"). */
const totalsRouteUnavailable = ref(false)

const unassignedClientId = computed(() => clients.value.find(c => c.unassigned)?.id)

function clientName(id: string) {
  return clients.value.find(c => c.id === id)?.name ?? id
}
function clientById(id: string) {
  return clients.value.find(c => c.id === id)
}
function projectName(id: string) {
  return projects.value.find(c => c.id === id)?.name ?? id
}

function agentLabel(slug: string) {
  if (slug === LEGACY_AGENT) return t('entries.detail.quality.agentLegacy')
  return resolveAgent(slug)?.label ?? slug
}

// --- server-summed state (docs/architecture/aggregation.md "the server
// sums; the browser displays") — populated by `load()`/`loadChart()`
// below, or by `loadFallback()` when the totals route isn't available
// yet (owner hasn't restarted PocketBase since this feature shipped). ---
const totals = ref<TotalsRow>(ZERO_TOTALS_ROW)
const previousTotals = ref<TotalsRow>(ZERO_TOTALS_ROW)
const cacheHit = computed(() => cacheHitRatio(totals.value.input, totals.value.cacheRead, totals.value.cacheWrite))
const workTimeQuality = ref(summarizeWorkTimeQualityFromTotal(ZERO_TOTALS_ROW))
const averageCost = ref(computeAverageCostFromTotal(ZERO_TOTALS_ROW))
const byClient = ref<(GroupTotalsLike & { label: string })[]>([])
const byProject = ref<(GroupTotalsLike & { label: string })[]>([])
const topExpensive = ref<Pick<TaskEntryRecord, 'id' | 'client' | 'project' | 'cost' | 'work_ms' | 'model'>[]>([])
const agentOptions = ref<string[]>([])
// Keep export metadata paired with the data, even if a later load fails.
const exportSnapshot = ref<(LoadSnapshot & { metadata: DashboardExportMetadata }) | null>(null)

const exporting = ref(false)
async function downloadExport(format: 'csv' | 'xlsx') {
  const snapshot = exportSnapshot.value
  if (loading.value || exporting.value || !snapshot) return
  exporting.value = true
  try {
    const table = buildDashboardExport({
      generatedAt: new Date().toISOString(),
      metadata: snapshot.metadata,
      period: snapshot.range,
      includeUnassigned: snapshot.includeUnassigned,
      agent: snapshot.agent,
      totals: totals.value,
      byClient: byClient.value,
      byProject: byProject.value,
      topExpensive: topExpensive.value,
    })
    const payload = format === 'csv' ? createCsvExport(table) : await createXlsxExport(table)
    const url = URL.createObjectURL(new Blob([payload.content], { type: payload.mimeType }))
    const link = document.createElement('a')
    try {
      link.href = url
      link.download = `dashboard-${snapshot.range.start}-${snapshot.range.end}.${payload.extension}`
      document.body.appendChild(link)
      link.click()
    }
    finally {
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    toast.success(t('dashboard.export.started'))
  }
  catch {
    toast.error(t('dashboard.export.failed'))
  }
  finally {
    exporting.value = false
  }
}

/** One-click drill-down into the entries explorer, pre-filtered to the
 * rows the work-time notice is talking about (same range and agent filter
 * as the dashboard is currently showing). */
const workTimeUpperBoundDrilldown = computed(() => ({
  path: '/entries',
  query: {
    quality: 'waitingUnavailable',
    dateStart: range.value.start,
    dateEnd: range.value.end,
    ...(agentFilter.value ? { agent: agentFilter.value } : {}),
  },
}))

const committedProjectKeys = ref<string[]>([])
const projectChartMetric = ref(metric.value)
const chartPartial = ref(false)
const chartSeriesKeys = computed(() => {
  if (stackBy.value === 'client') return byClient.value.slice(0, 5).map(g => g.key)
  if (stackBy.value === 'project') return committedProjectKeys.value
  return ['total']
})
const chartSeriesLabels = computed<Record<string, string>>(() => {
  if (stackBy.value === 'client') return Object.fromEntries(byClient.value.map(g => [g.key, g.label]))
  if (stackBy.value === 'project') return Object.fromEntries(committedProjectKeys.value.map(key => [key, key === PROJECT_OTHERS_KEY ? t('dashboard.chart.others') : projectName(key)]))
  return { total: metric.value === 'work' ? t('dashboard.chart.work') : t('dashboard.chart.cost') }
})
const chartSeriesClients = computed(() => {
  if (stackBy.value !== 'client') return undefined
  const map: Record<string, ClientRecord> = {}
  for (const key of chartSeriesKeys.value) {
    const client = clientById(key)
    if (client) map[key] = client
  }
  return map
})

// Raw per-local-day groups keyed by series ('total' when unstacked, else
// a client/project id) — `chartPoints` re-derives from this on every
// `metric` toggle without a refetch (only `stackBy`/range/filters changes
// re-fetch, via `loadChart()`).
const dayLabels = ref<string[]>([])
const dayGroupsBySeries = ref<Record<string, TotalsGroup[]>>({})

const chartPoints = computed(() => {
  if (chartLoading.value || chartError.value || summaryError.value) return []
  if (stackBy.value === 'project' && projectChartMetric.value !== metric.value) return []
  return dayLabels.value.map((day, idx) => {
    const values: Record<string, number> = {}
    for (const key of chartSeriesKeys.value) {
      const row = dayGroupsBySeries.value[key]?.find(g => g.groupKey === String(idx))
      if (row) values[key] = metric.value === 'work' ? row.workMs : row.cost
    }
    return { day, values }
  })
})

/** Server-side equivalent of the old client-side `includeUnassigned`/
 * `agentFilter` row filtering — every totals call below passes this so
 * the server never sums rows the dashboard wouldn't show. */
function snapshotLoad() {
  return {
    range: { ...range.value },
    includeUnassigned: includeUnassigned.value,
    unassignedClientId: unassignedClientId.value,
    agent: agentFilter.value,
  }
}
type LoadSnapshot = ReturnType<typeof snapshotLoad>

function buildServerFilters(snapshot: LoadSnapshot): TotalsFilters {
  const filters: TotalsFilters = {}
  if (!snapshot.includeUnassigned && snapshot.unassignedClientId) filters.exclude_unassigned_client = snapshot.unassignedClientId
  if (snapshot.agent) filters.agent = snapshot.agent === LEGACY_AGENT ? '' : snapshot.agent
  return filters
}

let loadGeneration = 0
let chartGeneration = 0
let chartDataGeneration = 0
let chartSnapshot: LoadSnapshot | null = null
let mounted = true
const isCurrent = (generation: number) => mounted && generation === loadGeneration

/** Fetches the local-day chart, bounded to at most 5 extra calls when
 * stacked by client/project (one per top-5 series, reusing the single
 * `filters.client`/`filters.project` scalar filter the totals endpoint
 * supports) — never an unbounded row fetch. */
async function loadChart(snapshot: LoadSnapshot, generation: number) {
  const chartRequest = ++chartGeneration
  const stacking = stackBy.value
  const selectedMetric = metric.value
  const { boundaries, labels } = buildLocalDayBoundaries(snapshot.range)
  const baseFilters = buildServerFilters(snapshot)
  const current = () => isCurrent(generation) && chartRequest === chartGeneration
  chartLoading.value = true
  chartError.value = false
  try {
    if (totalsRouteUnavailable.value) {
      await loadFallbackChart(snapshot, generation, chartRequest)
      return
    }
    let groups: Record<string, TotalsGroup[]>
    if (stacking === 'none') {
      const resp = await fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters: baseFilters, perPage: boundaries.length })
      groups = { total: resp.groups }
    }
    else if (stacking === 'project') {
      const utc = localDateRangeToUtcFilters(snapshot.range)
      const ranked = await fetchTotals({ from: utc.start, to: utc.end, groupBy: 'project', sort: selectedMetric === 'work' ? '-work_ms' : '-cost', filters: baseFilters, perPage: 6 })
      const keys = ranked.groups.filter(g => g.groupKey).slice(0, 5).map(g => g.groupKey)
      const [overall, ...selected] = await Promise.all([
        fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters: baseFilters, perPage: boundaries.length }),
        ...keys.map(project => fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters: { ...baseFilters, project }, perPage: boundaries.length })),
      ])
      groups = Object.fromEntries(keys.map((key, idx) => [key, selected[idx]!.groups]))
      const remainder = projectRemainder(overall!.groups, groups)
      if (remainder.some(row => (selectedMetric === 'work' ? row.workMs : row.cost) !== 0)) groups[PROJECT_OTHERS_KEY] = remainder
    }
    else {
      const keys = stacking === 'client' ? byClient.value.slice(0, 5).map(g => g.key) : byProject.value.slice(0, 5).map(g => g.key)
      const results = await Promise.all(keys.map(async (key) => {
        const filters: TotalsFilters = { ...baseFilters, ...(stacking === 'client' ? { client: key } : { project: key }) }
        const resp = await fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters, perPage: boundaries.length })
        return [key, resp.groups] as const
      }))
      groups = Object.fromEntries(results)
    }
    if (!isCurrent(generation) || chartRequest !== chartGeneration || stacking !== stackBy.value || (stacking === 'project' && selectedMetric !== metric.value)) return
    if (stacking === 'project') {
      committedProjectKeys.value = Object.keys(groups)
      projectChartMetric.value = selectedMetric
    }
    chartPartial.value = false
    dayLabels.value = labels
    dayGroupsBySeries.value = groups
  }
  catch (err) {
    if (!current()) return
    if (err instanceof TotalsRouteUnavailableError) {
      totalsRouteUnavailable.value = true
      try {
        await loadFallbackChart(snapshot, generation, chartRequest)
      }
      catch {
        if (current()) chartError.value = true
      }
    }
    else chartError.value = true
  }
  finally {
    if (current()) chartLoading.value = false
  }
}

function retryChart() {
  if (chartDataGeneration === loadGeneration && chartSnapshot) void loadChart(snapshotLoad(), loadGeneration)
}

async function fetchTopExpensive(snapshot: LoadSnapshot) {
  const utc = localDateRangeToUtcFilters(snapshot.range)
  const parts = [`started_at >= "${utc.start}"`, `started_at <= "${utc.end}"`]
  if (!snapshot.includeUnassigned && snapshot.unassignedClientId) parts.push(`client != "${snapshot.unassignedClientId}"`)
  if (snapshot.agent) parts.push(snapshot.agent === LEGACY_AGENT ? 'agent = ""' : `agent = "${snapshot.agent}"`)
  const result = await $pb.collection('task_entries').getList<TaskEntryRecord>(1, 10, {
    filter: parts.join(' && '),
    sort: '-cost',
    fields: 'id,client,project,cost,work_ms,model',
  })
  return result.items
}

async function load() {
  if (!mounted) return
  const generation = ++loadGeneration
  ++chartGeneration
  chartDataGeneration = 0
  chartSnapshot = null
  const snapshot = snapshotLoad()
  loading.value = true
  summaryError.value = false
  chartError.value = false
  chartLoading.value = true
  try {
    if (totalsRouteUnavailable.value) {
      await loadFallback(snapshot, generation)
      return
    }
    try {
      await loadServer(snapshot, generation)
    }
    catch (err) {
      if (!isCurrent(generation)) return
      if (!(err instanceof TotalsRouteUnavailableError)) throw err
      totalsRouteUnavailable.value = true
      await loadFallback(snapshot, generation)
    }
  }
  catch {
    if (isCurrent(generation)) summaryError.value = true
  }
  finally {
    if (isCurrent(generation)) {
      loading.value = false
      if (summaryError.value) chartLoading.value = false
    }
  }
}

async function loadServer(snapshot: LoadSnapshot, generation: number) {
  const utcCurrent = localDateRangeToUtcFilters(snapshot.range)
  const prevRange = previousEquivalentPeriod(snapshot.range)
  const utcPrev = localDateRangeToUtcFilters(prevRange)
  const filters = buildServerFilters(snapshot)

  const [currentResp, previousResp, clientResp, projectResp, agentResp, topExpensiveRows] = await Promise.all([
    fetchTotals({ from: utcCurrent.start, to: utcCurrent.end, groupBy: 'none', filters }),
    fetchTotals({ from: utcPrev.start, to: utcPrev.end, groupBy: 'none', filters }),
    fetchTotals({ from: utcCurrent.start, to: utcCurrent.end, groupBy: 'client', filters, perPage: 200 }),
    fetchTotals({ from: utcCurrent.start, to: utcCurrent.end, groupBy: 'project', filters, perPage: 200 }),
    // Distinct `agent` values across the currently-loaded date range, NOT
    // scoped by `agentFilter`/`includeUnassigned` (matches the old
    // `listDistinctAgents(currentEntries.value)`, which read the
    // unfiltered fetch) — so picking a filter never shrinks the option
    // list out from under itself.
    fetchTotals({ from: utcCurrent.start, to: utcCurrent.end, groupBy: 'agent', sort: 'group_key', perPage: 200 }),
    fetchTopExpensive(snapshot),
  ])

  if (!isCurrent(generation)) return
  totals.value = currentResp.total
  previousTotals.value = previousResp.total
  workTimeQuality.value = summarizeWorkTimeQualityFromTotal(totals.value)
  averageCost.value = computeAverageCostFromTotal(totals.value)

  byClient.value = groupsToGroupTotals(clientResp.groups, currentResp.total).map(g => ({ ...g, label: clientName(g.key) }))
  byProject.value = groupsToGroupTotals(projectResp.groups.filter(g => g.groupKey !== ''), currentResp.total).map(g => ({ ...g, label: projectName(g.key) }))
  topExpensive.value = topExpensiveRows
  exportSnapshot.value = { ...snapshot, metadata: {
    dataSource: 'totals_endpoint',
    clientBreakdownLimit: 200, projectBreakdownLimit: 200, topExpensiveLimit: 10,
    clientBreakdownTruncated: clientResp.totalGroups > clientResp.groups.length,
    projectBreakdownTruncated: projectResp.totalGroups > projectResp.groups.length,
    fallbackRowsTruncated: null,
  } }

  const rawAgentKeys = agentResp.groups.map(g => g.groupKey === '' ? LEGACY_AGENT : g.groupKey)
  agentOptions.value = rawAgentKeys.sort((a, b) => {
    if (a === LEGACY_AGENT) return 1
    if (b === LEGACY_AGENT) return -1
    return a.localeCompare(b)
  })

  chartDataGeneration = generation
  chartSnapshot = snapshot
  await loadChart(snapshot, generation)
}

/** Adapts the pre-totals `Totals`/`GroupTotals` shapes
 * (`app/lib/aggregate.ts`) to the `TotalsRow` shape the rest of this
 * page's state now uses, filling in the measurement-quality fields the
 * server response carries but the old client-side sum never computed —
 * derived here from the same raw rows so the fallback path stays exactly
 * equivalent to what the server would have returned for the same rows. */
function toTotalsRow(entries: TaskEntryRecord[]): TotalsRow {
  const base = sumTaskEntries(entries)
  const costUnknown = entries.filter(e => e.cost_quality === 'unknown').length
  const costEstimated = entries.filter(e => e.cost_quality === 'estimated').length
  const costKnownEntries = entries.length - costUnknown
  const costKnownSum = entries.filter(e => e.cost_quality !== 'unknown').reduce((sum, e) => sum + (e.cost ?? 0), 0)
  return {
    entries: base.count,
    count: base.count,
    wallMs: base.wallMs,
    workMs: base.workMs,
    waitingMs: base.waitingMs,
    input: base.input,
    output: base.output,
    cacheRead: base.cacheRead,
    cacheWrite: base.cacheWrite,
    cost: base.cost,
    waitingUnavailableEntries: entries.filter(e => e.waiting_quality === 'unavailable').length,
    costUnknownEntries: costUnknown,
    costEstimatedEntries: costEstimated,
    costKnownEntries,
    costKnownSum,
    unlinkedEntries: entries.filter(e => e.subagent_linkage === 'unlinked').length,
    distinctSessions: new Set(entries.map(e => e.session_id).filter(Boolean)).size,
  }
}

/** Pre-totals-route path: fetches the full range as rows and aggregates
 * client-side, exactly as this page did before this feature. Used only
 * when POST /api/kankaku/totals 404s (the owner hasn't restarted
 * PocketBase yet) — no error toast, this is a silent, documented
 * degrade-gracefully path. */
let fallbackRows: { snapshot: LoadSnapshot, current: Awaited<ReturnType<typeof fetchRange>> } | null = null

function visibleFallback(entries: TaskEntryRecord[], snapshot: LoadSnapshot) {
  return entries.filter(e => (snapshot.includeUnassigned || e.client !== snapshot.unassignedClientId)
    && (!snapshot.agent || (snapshot.agent === LEGACY_AGENT ? !e.agent?.trim() : e.agent?.trim() === snapshot.agent)))
}

async function loadFallback(snapshot: LoadSnapshot, generation: number) {
  const prevRange = previousEquivalentPeriod(snapshot.range)
  const [current, previous] = await Promise.all([
    fetchRange(snapshot.range),
    fetchRange(prevRange),
  ])
  if (!isCurrent(generation)) return
  fallbackRows = { snapshot, current }
  const currentEntries = current.entries
  const visibleCurrent = visibleFallback(currentEntries, snapshot)
  const visiblePrevious = visibleFallback(previous.entries, snapshot)

  totals.value = toTotalsRow(visibleCurrent)
  previousTotals.value = toTotalsRow(visiblePrevious)
  workTimeQuality.value = summarizeWorkTimeQuality(visibleCurrent)
  averageCost.value = computeAverageCost(visibleCurrent)
  agentOptions.value = listDistinctAgents(currentEntries)

  byClient.value = groupByClient(visibleCurrent).map(g => ({ ...toTotalsRow(visibleCurrent.filter(e => e.client === g.key)), key: g.key, costShare: g.costShare, workMsShare: g.workMsShare, label: clientName(g.key) }))
  byProject.value = groupByProject(visibleCurrent.filter(e => e.project)).map(g => ({ ...toTotalsRow(visibleCurrent.filter(e => e.project === g.key)), key: g.key, costShare: g.costShare, workMsShare: g.workMsShare, label: projectName(g.key) }))
  topExpensive.value = [...visibleCurrent].sort((a, b) => b.cost - a.cost).slice(0, 10)
  exportSnapshot.value = { ...snapshot, metadata: {
    dataSource: 'fallback_task_entries',
    clientBreakdownLimit: null, projectBreakdownLimit: null, topExpensiveLimit: 10,
    clientBreakdownTruncated: false, projectBreakdownTruncated: false,
    fallbackRowsTruncated: current.truncated,
  } }

  chartSnapshot = snapshot
  chartDataGeneration = generation
  await loadChart(snapshot, generation)
}

async function loadFallbackChart(snapshot: LoadSnapshot, generation: number, chartRequest: number) {
  const stacking = stackBy.value
  const selectedMetric = metric.value
  const cached = fallbackRows && JSON.stringify(fallbackRows.snapshot) === JSON.stringify(snapshot)
  const current = cached ? fallbackRows!.current : await fetchRange(snapshot.range)
  if (!isCurrent(generation) || chartRequest !== chartGeneration) return
  fallbackRows = { snapshot, current }
  const visibleCurrent = visibleFallback(current.entries, snapshot)
  // Fallback path builds real (partial) `TotalsGroup`-shaped rows — both
  // `workMs` and `cost` summed unconditionally per bucket, not gated by
  // the current `metric` — so `chartPoints`'s computed (which picks the
  // field based on `metric.value` at render time) stays correct across a
  // metric toggle without needing a second aggregation pass.
  const projectKeys = rankProjects(groupByProject(visibleCurrent.filter(e => e.project)).map(g => ({ groupKey: g.key, workMs: g.workMs, cost: g.cost })), selectedMetric)
  const fallbackKeys = stacking === 'project' ? [...projectKeys, PROJECT_OTHERS_KEY] : chartSeriesKeys.value
  const byDay = new Map<string, Record<string, { workMs: number, cost: number }>>()
  for (const e of visibleCurrent) {
    const day = utcInstantToLocalDay(e.started_at)
    const bucket = byDay.get(day) ?? {}
    const key = stacking === 'client' ? e.client : stacking === 'project' ? (projectKeys.includes(e.project) ? e.project : PROJECT_OTHERS_KEY) : 'total'
    if (fallbackKeys.includes(key)) {
      const cell = bucket[key] ?? { workMs: 0, cost: 0 }
      cell.workMs += e.work_ms ?? 0
      cell.cost += e.cost ?? 0
      bucket[key] = cell
    }
    byDay.set(day, bucket)
  }
  const sortedDays = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))
  dayLabels.value = sortedDays.map(([day]) => day)
  const seriesMap: Record<string, TotalsGroup[]> = {}
  sortedDays.forEach(([, values], idx) => {
    for (const [key, cell] of Object.entries(values)) {
      const row: TotalsGroup = {
        ...ZERO_TOTALS_ROW,
        groupKey: String(idx),
        groupKey2: '',
        sessionName: '',
        minStartedAt: '',
        maxEndedAt: '',
        distinctClient: 0,
        sampleClient: '',
        distinctProject: 0,
        sampleProject: '',
        distinctTask: 0,
        sampleTask: '',
        machine: '',
        distinctAgent: 0,
        sampleAgent: '',
        workMs: cell.workMs,
        cost: cell.cost,
      }
      seriesMap[key] = [...(seriesMap[key] ?? []), row]
    }
  })
  if (stacking === 'project') {
    committedProjectKeys.value = fallbackKeys.filter(key => key !== PROJECT_OTHERS_KEY || seriesMap[key]?.some(row => (selectedMetric === 'work' ? row.workMs : row.cost) !== 0))
    projectChartMetric.value = selectedMetric
  }
  chartPartial.value = current.truncated
  dayGroupsBySeries.value = seriesMap
  chartSnapshot = snapshot
  chartDataGeneration = generation
}

let unsubscribe: (() => void) | null = null
let restoringPreferences = true
function persistPreferences() {
  if (restoringPreferences) return
  try {
    localStorage.setItem(DASHBOARD_PREFERENCES_KEY, JSON.stringify({ metric: metric.value, stackBy: stackBy.value }))
  }
  catch { /* Storage may be disabled; preferences remain usable in memory. */ }
}
onMounted(async () => {
  try {
    const saved = parseDashboardPreferences(localStorage.getItem(DASHBOARD_PREFERENCES_KEY))
    metric.value = saved.metric
    stackBy.value = saved.stackBy
  }
  catch { /* Keep work/project defaults when storage is unavailable. */ }
  restoringPreferences = false
  try {
    await Promise.all([ensureClients(), ensureProjects()])
    if (!mounted) return
    await load()
    if (mounted) unsubscribe = subscribe(() => load())
  }
  catch {
    if (mounted) {
      summaryError.value = true
      loading.value = false
      chartLoading.value = false
    }
  }
})
onBeforeUnmount(() => {
  mounted = false
  ++loadGeneration
  ++chartGeneration
  unsubscribe?.()
})

watch(range, load, { deep: true })
watch([includeUnassigned, agentFilter], load)
watch(metric, () => {
  if (restoringPreferences) return
  persistPreferences()
  if (stackBy.value !== 'project') return
  ++chartGeneration
  if (chartDataGeneration !== loadGeneration || !chartSnapshot) return
  void loadChart(chartSnapshot, loadGeneration)
}, { flush: 'sync' })
watch(stackBy, () => {
  if (restoringPreferences) return
  persistPreferences()
  ++chartGeneration
  if (chartDataGeneration === loadGeneration && chartSnapshot) {
    void loadChart(chartSnapshot, loadGeneration)
  }
}, { flush: 'sync' })
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="min-w-0 text-xl font-semibold tracking-tight wrap-anywhere">
        <I18nT v-if="displayName" keypath="dashboard.greetingWithName" tag="span">
          <template #name><span class="text-2xl font-extrabold">{{ displayName }}</span></template>
        </I18nT>
        <template v-else>{{ t('dashboard.greeting') }}</template>
      </h1>
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch v-model="includeUnassigned" />
          {{ t('dashboard.includeUnassigned') }}
        </label>
        <Select
v-model="agentFilter" class="w-40" :placeholder="t('common.agent')" :options="[
          { value: '', label: t('common.all') },
          ...agentOptions.map(a => ({ value: a, label: agentLabel(a) })),
        ]"
        />
        <DateRangePicker v-model:preset="preset" v-model:range="range" />
        <ExportMenu :disabled="loading || exporting || !exportSnapshot" @format="downloadExport" />
      </div>
    </div>

    <div v-if="summaryError" role="alert" class="text-sm">
      {{ t('dashboard.summaryError') }}
      <Button variant="outline" size="sm" @click="load">{{ t('dashboard.chart.retry') }}</Button>
    </div>

    <div class="grid grid-cols-2 gap-6 md:grid-cols-4">
      <KpiCard :title="t('dashboard.kpi.workTime')" :value="formatDuration(totals.workMs)" :current-value="totals.workMs" :previous-value="previousTotals.workMs" polarity="neutral" :vs-label="t('dashboard.vsPrevious')">
        <p v-if="workTimeQuality.upperBoundCount > 0" class="mt-1 text-xs text-muted-foreground">
          <NuxtLink :to="workTimeUpperBoundDrilldown" class="underline decoration-dotted underline-offset-2 hover:text-foreground">
            {{ t('dashboard.kpi.workTimeUpperBoundNotice', { count: workTimeQuality.upperBoundCount }) }}
          </NuxtLink>
        </p>
      </KpiCard>
      <KpiCard :title="t('dashboard.kpi.wallTime')" :value="formatDuration(totals.wallMs)" :current-value="totals.wallMs" :previous-value="previousTotals.wallMs" polarity="neutral" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.waitingTime')" :value="formatDuration(totals.waitingMs)" :current-value="totals.waitingMs" :previous-value="previousTotals.waitingMs" polarity="lowerIsBetter" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="`${t('dashboard.kpi.cost')} (USD)`" :value="formatCost(totals.cost)" :current-value="totals.cost" :previous-value="previousTotals.cost" polarity="lowerIsBetter" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.tokensIn')" :value="formatTokensCompact(totals.input)" :current-value="totals.input" :previous-value="previousTotals.input" polarity="neutral" :vs-label="t('dashboard.vsPrevious')">
        <p data-testid="dashboard-cache-hit" class="mt-1 text-xs text-muted-foreground">
          {{ t('dashboard.kpi.cacheHit') }}: <span class="tabular-nums">{{ cacheHit === null ? '—' : formatPercent(cacheHit) }}</span>
        </p>
      </KpiCard>
      <KpiCard :title="t('dashboard.kpi.tokensOut')" :value="formatTokensCompact(totals.output)" :current-value="totals.output" :previous-value="previousTotals.output" polarity="neutral" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.tasks')" :value="String(totals.entries)" :current-value="totals.entries" :previous-value="previousTotals.entries" polarity="neutral" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.avgCostPerTask')" :value="formatCost(averageCost.average ?? 0)" polarity="lowerIsBetter">
        <p v-if="averageCost.excludedCount > 0" class="mt-1 text-xs text-muted-foreground">
          {{ t('dashboard.kpi.avgCostExcludedNotice', { count: averageCost.excludedCount }) }}
        </p>
      </KpiCard>
    </div>

    <Card>
      <CardHeader class="flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle class="text-sm font-medium text-foreground">
          {{ t('dashboard.chart.title') }}
        </CardTitle>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <Select
v-model="metric" class="min-w-0 sm:min-w-[12.5rem]" :aria-label="t('dashboard.chart.metric')" :options="[
            { value: 'work', label: t('dashboard.chart.work') },
            { value: 'cost', label: t('dashboard.chart.cost') },
          ]"
          />
          <Select
v-model="stackBy" class="w-40" :aria-label="t('dashboard.chart.stackBy')" :options="[
            { value: 'none', label: t('dashboard.chart.none') },
            { value: 'client', label: t('dashboard.chart.client') },
            { value: 'project', label: t('dashboard.chart.project') },
          ]"
          />
        </div>
      </CardHeader>
      <CardContent>
        <p v-if="chartLoading" class="py-10 text-center text-sm text-muted-foreground">{{ t('dashboard.chart.loading') }}</p>
        <div v-else-if="chartError" role="alert" class="py-10 text-center text-sm">
          {{ t('dashboard.chart.error') }}
          <Button variant="outline" size="sm" @click="retryChart">{{ t('dashboard.chart.retry') }}</Button>
        </div>
        <p v-else-if="summaryError" class="py-10 text-center text-sm text-muted-foreground">{{ t('dashboard.chart.summaryUnavailable') }}</p>
        <p v-if="chartPartial && !chartLoading && !chartError && !summaryError" class="mb-2 text-sm text-muted-foreground">{{ t('dashboard.chart.partial') }}</p>
        <StackedBarChart
          v-if="chartPoints.length > 0"
          :points="chartPoints"
          :series-keys="chartSeriesKeys"
          :series-labels="chartSeriesLabels"
          :series-clients="chartSeriesClients"
          :format-value="metric === 'work' ? formatDuration : (n) => formatCost(n)"
          :tick-unit="metric === 'work' ? 3_600_000 : 1"
        />
        <p v-else-if="!chartLoading && !chartError && !summaryError" class="py-10 text-center text-sm text-muted-foreground">
          {{ t('dashboard.noData') }}
        </p>
      </CardContent>
    </Card>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card data-testid="breakdown-by-client">
        <CardHeader><CardTitle class="text-sm font-medium text-foreground">
          {{ t('dashboard.byClient') }}
        </CardTitle></CardHeader>
        <CardContent>
          <BreakdownTable :rows="byClient" :name-header="t('common.client')" :resolve-client="clientById" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle class="text-sm font-medium text-foreground">
          {{ t('dashboard.byProject') }}
        </CardTitle></CardHeader>
        <CardContent>
          <BreakdownTable :rows="byProject" :name-header="t('common.project')" />
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader><CardTitle class="text-sm font-medium text-foreground">
        {{ t('dashboard.topExpensive') }}
      </CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('common.client') }}</TableHead>
              <TableHead>{{ t('common.project') }}</TableHead>
              <TableHead class="text-right">
                {{ t('dashboard.kpi.cost') }}
              </TableHead>
              <TableHead class="text-right">
                <span :title="t('common.timeHint')">{{ t('common.time') }}</span>
              </TableHead>
              <TableHead>{{ t('common.model') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="e in topExpensive" :key="e.id">
              <TableCell>
                <ClientName v-if="clientById(e.client)" :client="clientById(e.client)!" size="xs" class="max-w-40" />
                <span v-else>{{ clientName(e.client) }}</span>
              </TableCell>
              <TableCell>{{ e.project ? projectName(e.project) : '—' }}</TableCell>
              <TableCell class="text-right tabular-nums">
                {{ formatCost(e.cost) }}
              </TableCell>
              <TableCell class="text-right tabular-nums">
                {{ formatDuration(e.work_ms) }}
              </TableCell>
              <TableCell class="text-muted-foreground">
                {{ e.model }}
              </TableCell>
            </TableRow>
            <TableRow v-if="topExpensive.length === 0">
              <TableCell colspan="5" class="text-center text-muted-foreground">
                {{ t('dashboard.noData') }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
