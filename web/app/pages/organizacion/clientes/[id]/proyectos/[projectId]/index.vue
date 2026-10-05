<script setup lang="ts">
import { ArrowLeft, ArrowRight } from '@lucide/vue'
import StackedBarChart from '@/components/charts/StackedBarChart.vue'
import ClientName from '@/components/clients/ClientName.vue'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { sumTaskEntries } from '@/lib/aggregate'
import { buildLocalDayBoundaries, utcInstantToLocalDay } from '@/lib/local-day'
import { computeAverageCost } from '@/lib/measurement-quality'
import { resolvePreset } from '@/lib/period'
import { rankProjects as rankTasks, projectRemainder as taskRemainder, PROJECT_OTHERS_KEY as TASK_OTHERS_KEY } from '@/lib/project-chart'
import { computeAverageCostFromTotal } from '@/lib/totals-map'
import type { TotalsGroup } from '@/lib/totals-map'
import { loadTaskSessionCounts, type SessionCountEntry } from '@/lib/task-session-counts'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'

const { t } = useI18n()
const { formatCost, formatDuration } = useFormatters()
const route = useRoute()
const clientId = computed(() => String(route.params.id))
const projectId = computed(() => String(route.params.projectId))
const { byId: projectById, ensureLoaded: ensureProjects } = useProjects()
const { byId: clientById, ensureLoaded: ensureClients } = useClients()
const { byProject: tasksByProject, ensureLoaded: ensureTasks } = useTasks()
const { fetchRange } = useTaskEntries()
const { fetchTotals, fetchRangeTotals } = useTotals()
const { $pb } = useNuxtApp()
const project = computed(() => projectById(projectId.value))
const client = computed(() => clientById(clientId.value))
const validOwner = computed(() => !!client.value && !!project.value && project.value.client === clientId.value)
const tasks = computed(() => validOwner.value ? tasksByProject(projectId.value) : [])
useHead({ title: computed(() => validOwner.value ? project.value?.name : t('projects.title')) })

// Work/cost measurements share this window; total sessions are explicitly all-time.
const range = { start: resolvePreset('30d').start, end: resolvePreset('today').end }
const { boundaries, labels } = buildLocalDayBoundaries(range)
const loading = ref(true)
const error = ref(false)
const truncated = ref(false)
const totals = ref({ workMs: 0, cost: 0, count: 0 })
const averageCost = ref<{ average: number | null, excludedCount: number, includedCount: number }>({ average: null, excludedCount: 0, includedCount: 0 })
const metric = ref<'work' | 'cost'>('work')
const chartLoading = ref(false)
const chartError = ref(false)
const chartPartial = ref(false)
const chartCostUnknown = ref(false)
const trendPoints = ref<{ day: string, values: Record<string, number> }[]>([])
const seriesKeys = ref<string[]>([])
const seriesLabels = ref<Record<string, string>>({})
const taskTotals = ref<Record<string, { workMs: number, cost: number, costUnknownEntries: number, costEstimatedEntries: number }>>({})
const cardsReady = ref(false)
const sessionCounts = ref<Record<string, number> | null>(null)
const sessionsLoading = ref(false)
function taskSessions(id: string) {
  if (sessionsLoading.value) return t('common.loading')
  return sessionCounts.value ? String(sessionCounts.value[id] ?? 0) : t('projects.detail.metricsUnavailable')
}
async function loadSessions(scope: { client: string, project: string }, current: () => boolean) {
  sessionsLoading.value = true
  try {
    const counts = await loadTaskSessionCounts(scope, {
      fetchTotals,
      readEntries: (page, perPage, options) => $pb.collection('task_entries').getList<SessionCountEntry>(page, perPage, options),
      isUnavailable: error => error instanceof TotalsRouteUnavailableError,
    })
    if (current()) sessionCounts.value = counts
  }
  catch { if (current()) sessionCounts.value = null }
  finally { if (current()) sessionsLoading.value = false }
}
const chartName = computed(() => `${t(metric.value === 'work' ? 'dashboard.chart.work' : 'dashboard.chart.cost')} · ${t('projects.detail.tasksTitle')} · ${range.start} – ${range.end}`)
function taskName(id: string) { return tasks.value.find(task => task.id === id)?.title?.trim() || t('projects.detail.unnamedTask') }
function validCost(cost: unknown): cost is number {
  return typeof cost === 'number' && Number.isFinite(cost) && cost >= 0
}
function availableCost(cost: unknown) {
  return validCost(cost) ? formatCost(cost) : t('projects.detail.metricsUnavailable')
}
function taskCost(id: string) {
  if (!cardsReady.value) return t('projects.detail.metricsUnavailable')
  const row = taskTotals.value[id]
  // An absent task in a complete response has no activity; a present bad cost is not zero.
  return row?.costUnknownEntries ? t('projects.detail.metricsUnavailable') : availableCost(row ? row.cost : 0)
}
function addCost(total: number, cost: unknown) {
  const sum = validCost(total) && validCost(cost) ? total + cost : NaN
  return validCost(sum) ? sum : NaN
}
function usableCosts(rows: readonly { cost: number }[]) {
  let total = 0
  for (const row of rows) total = addCost(total, row.cost)
  return validCost(total)
}
let loadVersion = 0
let chartVersion = 0
let reloadChart: (() => Promise<void>) | undefined
async function loadChart() { await reloadChart?.() }
watch(metric, loadChart, { flush: 'sync' })
onBeforeUnmount(() => { loadVersion++; chartVersion++; reloadChart = undefined })

// Missing groups imply zero only when the entire bounded response is complete.
function incomplete(result: { totalPages: number, totalGroups: number, groups: unknown[] }) {
  return !Number.isFinite(result.totalPages) || !Number.isFinite(result.totalGroups)
    || result.totalPages > 1 || result.totalGroups > result.groups.length
}
function unwrap<T>(responses: PromiseSettledResult<T>[]): T[] {
  for (const response of responses) {
    if (response.status === 'rejected' && !(response.reason instanceof TotalsRouteUnavailableError)) throw response.reason
  }
  return responses.map(response => { if (response.status === 'rejected') throw response.reason; return response.value })
}

async function load() {
  const version = ++loadVersion
  const id = projectId.value
  const owner = clientId.value
  const current = () => version === loadVersion && id === projectId.value && owner === clientId.value && validOwner.value
  const filters = { project: id, client: owner }
  loading.value = true
  error.value = false
  totals.value = { workMs: 0, cost: 0, count: 0 }
  averageCost.value = { average: null, excludedCount: 0, includedCount: 0 }
  trendPoints.value = []
  seriesKeys.value = []
  seriesLabels.value = {}
  taskTotals.value = {}
  cardsReady.value = false
  sessionCounts.value = null
  sessionsLoading.value = false
  truncated.value = false
  chartError.value = false
  chartPartial.value = false
  chartCostUnknown.value = false
  chartLoading.value = false
  chartVersion++
  reloadChart = undefined
  // A single capped scan per route/window load; never shared across owners.
  let fallback: ReturnType<typeof fetchRange> | undefined
  const scan = () => fallback ??= fetchRange(range, filters)
  let fallbackOnly = false
  let overallDays: TotalsGroup[] = []
  try {
    await Promise.all([ensureProjects(), ensureClients(), ensureTasks()])
    if (!current()) return
    // Counts are independent of chart quality, period, metric changes, and failures.
    void loadSessions({ client: owner, project: id }, current)
    try {
      const [overall, daily] = unwrap(await Promise.allSettled([
        fetchRangeTotals(range, { groupBy: 'none', filters }),
        fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters, perPage: boundaries.length }),
      ]))
      if (!current()) return
      if (incomplete(daily!)) throw new Error('Incomplete daily totals')
      totals.value = overall!.total
      averageCost.value = computeAverageCostFromTotal(overall!.total)
      overallDays = daily!.groups
    }
    catch (err) {
      if (!current()) return
      if (!(err instanceof TotalsRouteUnavailableError)) throw err
      const result = await scan()
      if (!current()) return
      totals.value = {
        ...sumTaskEntries(result.entries),
        cost: result.entries.reduce((sum, entry) => addCost(sum, entry.cost), 0),
      }
      averageCost.value = computeAverageCost(result.entries)
      truncated.value = result.truncated
      fallbackOnly = true
    }
    reloadChart = async () => {
      const request = ++chartVersion
      const selectedMetric = metric.value
      const chartCurrent = () => current() && request === chartVersion && selectedMetric === metric.value
      const value = (row: { workMs: number, cost: number }) => selectedMetric === 'work' ? row.workMs : row.cost
      chartLoading.value = true
      chartError.value = false
      chartPartial.value = false
      chartCostUnknown.value = false
      trendPoints.value = []
      cardsReady.value = false
      function commit(groups: Record<string, readonly { groupKey: string, workMs: number, cost: number }[]>) {
        if (!chartCurrent()) return
        seriesKeys.value = Object.keys(groups)
        seriesLabels.value = Object.fromEntries(seriesKeys.value.map(key => [key, key === TASK_OTHERS_KEY ? t('dashboard.chart.others') : taskName(key)]))
        trendPoints.value = labels.map((day, index) => ({ day, values: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, value(rows.find(row => row.groupKey === String(index)) ?? { workMs: 0, cost: 0 })])) }))
      }
      async function fallbackChart() {
        const result = await scan()
        if (!chartCurrent()) return
        chartPartial.value = result.truncated
        if (result.truncated) return
        const ranked = new Map<string, { groupKey: string, workMs: number, cost: number, costUnknownEntries: number, costEstimatedEntries: number }>()
        for (const entry of result.entries) {
          const row = ranked.get(entry.task) ?? { groupKey: entry.task, workMs: 0, cost: 0, costUnknownEntries: 0, costEstimatedEntries: 0 }
          row.workMs += entry.work_ms ?? 0
          row.cost = addCost(row.cost, entry.cost)
          row.costUnknownEntries += Number(entry.cost_quality === 'unknown')
          row.costEstimatedEntries += Number(entry.cost_quality === 'estimated')
          ranked.set(entry.task, row)
        }
        taskTotals.value = Object.fromEntries([...ranked].filter(([key]) => key))
        cardsReady.value = true
        chartCostUnknown.value = selectedMetric === 'cost' && [...ranked.values()].some(row => row.costUnknownEntries || row.costEstimatedEntries)
        if (selectedMetric === 'cost' && !usableCosts([...ranked.values()])) {
          chartPartial.value = true
          return
        }
        const keys = rankTasks([...ranked.values()], selectedMetric)
        const groups: Record<string, { groupKey: string, workMs: number, cost: number }[]> = Object.fromEntries(keys.map(key => [key, []]))
        for (const entry of result.entries) {
          const index = labels.indexOf(utcInstantToLocalDay(entry.started_at))
          if (index < 0) continue
          const key = keys.includes(entry.task) ? entry.task : TASK_OTHERS_KEY
          const rows = groups[key] ?? (groups[key] = [])
          let row = rows.find(row => row.groupKey === String(index))
          if (!row) { row = { groupKey: String(index), workMs: 0, cost: 0 }; rows.push(row) }
          row.workMs += entry.work_ms ?? 0
          row.cost = addCost(row.cost, entry.cost)
        }
        if (selectedMetric === 'cost' && !usableCosts(Object.values(groups).flat())) {
          chartPartial.value = true
          return
        }
        commit(groups)
      }
      try {
        if (fallbackOnly) { await fallbackChart(); return }
        const ranked = await fetchRangeTotals(range, { groupBy: 'task', filters, perPage: 200 })
        if (!chartCurrent()) return
        if (incomplete(ranked)) { await fallbackChart(); return }
        taskTotals.value = Object.fromEntries(ranked.groups.filter(row => row.groupKey).map(row => [row.groupKey, {
          ...row, cost: validCost(row.cost) ? row.cost : NaN,
        }]))
        cardsReady.value = true
        if (selectedMetric === 'cost' && (!usableCosts(ranked.groups) || !usableCosts(overallDays))) {
          chartPartial.value = true
          return
        }
        const keys = rankTasks(ranked.groups, selectedMetric)
        const daily = unwrap(await Promise.allSettled(keys.map(task => fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters: { ...filters, task }, perPage: boundaries.length }))))
        if (!chartCurrent()) return
        if (daily.some(incomplete)) { await fallbackChart(); return }
        const groups = Object.fromEntries(keys.map((key, index) => [key, daily[index]!.groups]))
        if (selectedMetric === 'cost' && !usableCosts(Object.values(groups).flat())) {
          chartPartial.value = true
          return
        }
        // Cost validity must not poison an independent work-time remainder.
        const workOnly = (rows: readonly TotalsGroup[]) => rows.map(row => ({ ...row, cost: 0 }))
        const remainder = selectedMetric === 'work'
          ? taskRemainder(workOnly(overallDays), Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, workOnly(rows)])))
          : taskRemainder(overallDays, groups)
        if (selectedMetric === 'cost' && !usableCosts(remainder)) {
          chartPartial.value = true
          return
        }
        if (remainder.some(row => value(row) !== 0)) groups[TASK_OTHERS_KEY] = remainder
        chartCostUnknown.value = selectedMetric === 'cost' && overallDays.some(row => row.costUnknownEntries > 0 || row.costEstimatedEntries > 0)
        commit(groups)
      }
      catch (err) {
        if (!chartCurrent()) return
        if (err instanceof TotalsRouteUnavailableError) {
          try { await fallbackChart() }
          catch { if (chartCurrent()) { chartError.value = true; cardsReady.value = false } }
        }
        else { chartError.value = true; cardsReady.value = false }
      }
      finally { if (chartCurrent()) chartLoading.value = false }
    }
    await loadChart()
  }
  catch { if (version === loadVersion) error.value = true }
  finally { if (version === loadVersion) loading.value = false }
}
onMounted(load)
watch(() => [route.params.id, route.params.projectId], load, { flush: 'sync' })
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-6">
    <Button v-if="loading || error || !validOwner" variant="ghost" size="icon" class="self-start" :aria-label="t('common.back')" :title="t('common.back')" @click="navigateTo(`/organizacion/clientes/${clientId}`)">
      <ArrowLeft aria-hidden="true" class="size-4" />
    </Button>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="error" role="alert">{{ t('common.error') }}</p>
    <p v-else-if="!validOwner" role="status">{{ t('projects.detail.notFound') }}</p>
    <template v-else-if="project && client">
      <div class="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon" :aria-label="t('common.back')" :title="t('common.back')" @click="navigateTo(`/organizacion/clientes/${clientId}`)">
          <ArrowLeft aria-hidden="true" class="size-4" />
        </Button>
        <div class="min-w-0">
          <h1 class="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">{{ project.name }}</h1>
          <ClientName :client="client" size="xs" class="text-sm text-muted-foreground" />
        </div>
        <Badge class="ml-2" :variant="project.active ? 'success' : 'outline'">{{ project.active ? t('common.active') : t('common.inactive') }}</Badge>
      </div>
      <p data-testid="project-period" class="text-sm text-muted-foreground">{{ t('projects.detail.period', { start: range.start, end: range.end }) }}</p>
      <p v-if="truncated" class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">{{ t('totals.fallbackTruncated', { count: totals.count }) }}</p>
      <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard :title="t('dashboard.kpi.workTime')" :value="formatDuration(totals.workMs)" />
        <KpiCard :title="t('dashboard.kpi.cost')" :value="availableCost(totals.cost)" />
        <KpiCard :title="t('dashboard.kpi.tasks')" :value="String(totals.count)" />
        <KpiCard :title="t('dashboard.kpi.avgCostPerTask')" :value="availableCost(averageCost.average ?? 0)">
          <p v-if="averageCost.excludedCount > 0" class="mt-1 text-xs text-muted-foreground">{{ t('dashboard.kpi.avgCostExcludedNotice', { count: averageCost.excludedCount }) }}</p>
        </KpiCard>
      </div>
      <Card data-testid="project-time-series" role="region" :aria-label="chartName">
        <CardHeader class="flex items-end pb-2">
          <Select v-model="metric" class="w-full min-w-0 sm:w-[12.5rem]" :aria-label="t('dashboard.chart.metric')" :options="[
            { value: 'work', label: t('dashboard.chart.work') },
            { value: 'cost', label: t('dashboard.chart.cost') },
          ]" />
        </CardHeader>
        <CardContent>
          <p v-if="chartLoading" role="status">{{ t('dashboard.chart.loading') }}</p>
          <p v-else-if="chartError" role="alert">{{ t('dashboard.chart.error') }}</p>
          <p v-else-if="chartPartial" role="status">{{ t('dashboard.chart.partial') }}</p>
          <template v-else>
            <p v-if="chartCostUnknown" role="status" class="mb-2 text-sm text-muted-foreground">{{ t('dashboard.chart.partial') }}</p>
            <StackedBarChart v-if="totals.count > 0" :points="trendPoints" :series-keys="seriesKeys" :series-labels="seriesLabels" :format-value="metric === 'work' ? formatDuration : (n) => formatCost(n)" :tick-unit="metric === 'work' ? 3_600_000 : 1" />
            <p v-else class="py-10 text-center text-sm text-muted-foreground">{{ t('dashboard.noData') }}</p>
          </template>
        </CardContent>
      </Card>
      <section class="space-y-4 pt-4">
        <h2 class="text-sm font-bold">{{ t('projects.detail.tasksTitle') }}</h2>
        <div v-if="tasks.length" class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
          <article v-for="task in tasks" :key="task.id" data-testid="task-card" class="flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-2 sm:gap-5 sm:p-5">
            <div class="min-w-0 space-y-2">
              <h3 class="text-sm font-semibold [overflow-wrap:anywhere] sm:text-base">{{ taskName(task.id) }}</h3>
            </div>
            <dl class="grid min-w-0 grid-cols-1 gap-3 text-sm [overflow-wrap:anywhere] sm:grid-cols-2">
              <div><dt class="text-xs text-muted-foreground">{{ t('common.time') }}</dt><dd class="mt-1 font-medium tabular-nums">{{ cardsReady ? formatDuration(taskTotals[task.id]?.workMs ?? 0) : t('projects.detail.metricsUnavailable') }}</dd></div>
              <div><dt class="text-xs text-muted-foreground">{{ t('common.cost') }}</dt><dd class="mt-1 font-medium tabular-nums">{{ taskCost(task.id) }}</dd></div>
              <div class="sm:col-span-2">
                <dt class="text-xs text-muted-foreground">{{ t('projects.detail.totalSessions') }}</dt>
                <dd data-testid="task-total-sessions" class="mt-1 font-medium tabular-nums">{{ taskSessions(task.id) }}</dd>
              </div>
            </dl>
            <p v-if="cardsReady && taskTotals[task.id]?.costEstimatedEntries" class="text-xs text-muted-foreground">{{ t('dashboard.chart.partial') }}</p>
            <div class="mt-auto flex flex-wrap items-center justify-between gap-1">
              <Badge :variant="task.status === 'doing' ? 'success' : 'outline'" class="whitespace-normal">{{ t(`tasks.status.${task.status}`) }}</Badge>
              <NuxtLink :to="`/organizacion/clientes/${clientId}/proyectos/${projectId}/tareas/${task.id}`" :aria-label="t('projects.detail.openTask', { name: taskName(task.id) })" class="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ArrowRight aria-hidden="true" class="size-5" />
              </NuxtLink>
            </div>
          </article>
        </div>
        <p v-else class="text-sm text-muted-foreground">{{ t('tasks.empty') }}</p>
      </section>
    </template>
  </div>
</template>
