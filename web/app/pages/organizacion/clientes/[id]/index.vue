<script setup lang="ts">
import { Archive, ArchiveRestore, ArrowLeft, ArrowRight, Globe, Lock, Mail, Pencil, Phone, RefreshCw } from '@lucide/vue'
import StackedBarChart from '@/components/charts/StackedBarChart.vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import ClientEditDialog from '@/components/clients/ClientEditDialog.vue'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { PROJECT_OTHERS_KEY, projectRemainder, rankProjects } from '@/lib/project-chart'
import type { TotalsGroup } from '@/lib/totals-map'
import { groupByProject, sumTaskEntries } from '@/lib/aggregate'
import { displayUrlWithoutScheme, isSafeLinkUrl } from '@/lib/client-contact'
import { buildLocalDayBoundaries, utcInstantToLocalDay } from '@/lib/local-day'
import { computeAverageCost } from '@/lib/measurement-quality'
import { resolvePreset } from '@/lib/period'
import { computeAverageCostFromTotal, totalsByGroupKey } from '@/lib/totals-map'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'

const { t } = useI18n()
const { formatCost, formatDuration } = useFormatters()
const route = useRoute()
const { ensureLoaded, byId, refreshFavicon } = useClients()
const { ensureLoaded: ensureProjects, byClient: projectsByClient } = useProjects()
const { fetchRange } = useTaskEntries()
const { fetchRangeTotals, fetchTotals } = useTotals()
const { isOwner, canWrite } = useAuth()
const editor = useClientEditor()
const { saving, archiving } = editor
watch(() => route.params.id, editor.close, { flush: 'sync' })
onBeforeUnmount(editor.close)
const toast = useToast()
const detailClient = computed(() => byId(String(route.params.id)))
const detailProjects = computed(() => detailClient.value ? projectsByClient(detailClient.value.id) : [])
useHead({ title: computed(() => detailClient.value?.name ?? t('clients.title')) })

const loading = ref(true)
const error = ref(false)
const totals = ref({ workMs: 0, cost: 0, count: 0 })
const averageCost = ref<{ average: number | null, excludedCount: number, includedCount: number }>({ average: null, excludedCount: 0, includedCount: 0 })
const metric = ref<'work' | 'cost'>('work')
const trendPoints = ref<{ day: string, values: Record<string, number> }[]>([])
const seriesKeys = ref<string[]>([])
const seriesLabels = ref<Record<string, string>>({})
const chartLoading = ref(false)
const chartError = ref(false)
const chartPartial = ref(false)
const chartCostUnknown = ref(false)
const chartRange = ref({ start: '', end: '' })
const chartName = computed(() => `${t(metric.value === 'work' ? 'dashboard.chart.work' : 'dashboard.chart.cost')} · ${chartRange.value.start} – ${chartRange.value.end}`)
let chartVersion = 0
let reloadChart: (() => Promise<void>) | undefined
watch(metric, () => reloadChart?.(), { flush: 'sync' })
onBeforeUnmount(() => { loadVersion++; chartVersion++; reloadChart = undefined })
const truncated = ref(false)
const truncatedEntryCount = ref(0)
const totalsByProject = ref<Record<string, { cost: number, workMs: number }>>({})
const projectsTruncated = ref(false)
const projectsTruncatedEntryCount = ref(0)
const cardClientCost = ref<number | null>(null)
const cardProjectCosts = ref<Record<string, number | null>>({})
const cardCostsReady = ref(false)

function projectCostShare(project: string) {
  const clientCost = cardClientCost.value
  // An absent project has no known available row, not an invented zero.
  const projectCost = cardProjectCosts.value[project] ?? null
  const unavailable = { state: 'unavailable' as const, percentage: null, projectCost, clientCost }
  if (!cardCostsReady.value || projectCost === null || clientCost === null
    || !Number.isFinite(projectCost) || projectCost < 0 || !Number.isFinite(clientCost) || clientCost < 0) return unavailable
  if (clientCost === 0) return projectCost === 0 ? { ...unavailable, state: 'zero' as const } : unavailable
  const ratio = projectCost / clientCost * 100
  if (!Number.isFinite(ratio) || ratio < 0) return unavailable
  return { state: 'known' as const, percentage: Math.min(100, ratio), projectCost, clientCost }
}

function costShareLabel(project: { id: string, name: string }) {
  const share = projectCostShare(project.id)
  if (share.state === 'unavailable') return t('clients.detail.costShareUnavailable', { project: project.name })
  return t(share.state === 'zero' ? 'clients.detail.costShareZero' : 'clients.detail.costShare', {
    project: project.name, projectCost: formatCost(share.projectCost!), clientCost: formatCost(share.clientCost!),
    percent: share.percentage === null ? '' : String(Number(share.percentage.toFixed(2))),
  })
}
let loadVersion = 0

async function load() {
  const version = ++loadVersion
  const clientId = String(route.params.id)
  const isCurrent = () => version === loadVersion && clientId === String(route.params.id)
  loading.value = true
  error.value = false
  totals.value = { workMs: 0, cost: 0, count: 0 }
  averageCost.value = { average: null, excludedCount: 0, includedCount: 0 }
  trendPoints.value = []
  seriesKeys.value = []
  seriesLabels.value = {}
  chartVersion++
  reloadChart = undefined
  chartLoading.value = false
  chartError.value = false
  chartPartial.value = false
  chartCostUnknown.value = false
  truncated.value = false
  truncatedEntryCount.value = 0
  totalsByProject.value = {}
  projectsTruncated.value = false
  projectsTruncatedEntryCount.value = 0
  cardClientCost.value = null
  cardProjectCosts.value = {}
  cardCostsReady.value = false
  try {
    await ensureLoaded()
    if (!isCurrent() || !detailClient.value) return
    await ensureProjects()
    if (!isCurrent()) return
    // Match project detail's fixed 30d-through-today window in viewer-local days.
    const range = { start: resolvePreset('30d').start, end: resolvePreset('today').end }
    const { boundaries, labels } = buildLocalDayBoundaries(range)
    chartRange.value = range
    // Reuse a fallback scan only for an identical range within this client load.
    // Calendar-month card metrics must never borrow the different 30d totals.
    const fallbackRanges = new Map<string, ReturnType<typeof fetchRange>>()
    function cachedRange(requestRange: typeof range) {
      const key = `${requestRange.start}/${requestRange.end}`
      let result = fallbackRanges.get(key)
      if (!result) {
        result = fetchRange(requestRange, { client: clientId })
        fallbackRanges.set(key, result)
      }
      return result
    }
    let fallbackOnly = false
    let overallDays: TotalsGroup[] = []
    async function loadChart() {
      const request = ++chartVersion
      const selectedMetric = metric.value
      const current = () => isCurrent() && request === chartVersion && selectedMetric === metric.value
      chartLoading.value = true
      chartError.value = false
      chartPartial.value = false
      chartCostUnknown.value = false
      trendPoints.value = []
      const value = (row: { workMs: number, cost: number }) => selectedMetric === 'work' ? row.workMs : row.cost
      function commit(groups: Record<string, readonly { groupKey: string, workMs: number, cost: number }[]>) {
        if (!current()) return
        seriesKeys.value = Object.keys(groups)
        seriesLabels.value = Object.fromEntries(seriesKeys.value.map(key => [key,
          key === PROJECT_OTHERS_KEY ? t('dashboard.chart.others')
            : detailProjects.value.find(project => project.id === key)?.name ?? key,
        ]))
        trendPoints.value = labels.map((day, index) => ({ day, values: Object.fromEntries(
          Object.entries(groups).map(([key, rows]) => [key, value(rows.find(row => row.groupKey === String(index)) ?? { workMs: 0, cost: 0 })]),
        ) }))
      }
      async function fallbackChart() {
        const result = await cachedRange(range)
        if (!current()) return
        // A bounded subset cannot establish a complete top-five or remainder.
        chartPartial.value = result.truncated
        truncated.value = result.truncated
        truncatedEntryCount.value = result.entries.length
        if (result.truncated) return
        chartCostUnknown.value = selectedMetric === 'cost' && result.entries.some(entry => entry.cost_quality === 'unknown' || entry.cost_quality === 'estimated')
        const rows = groupByProject(result.entries).map(group => ({ groupKey: group.key, workMs: group.workMs, cost: group.cost }))
        const keys = rankProjects(rows, selectedMetric)
        const groups: Record<string, { groupKey: string, workMs: number, cost: number }[]> = Object.fromEntries(keys.map(key => [key, []]))
        const selected = new Set(keys)
        for (const entry of result.entries) {
          const day = utcInstantToLocalDay(entry.started_at)
          const index = labels.indexOf(day)
          if (index < 0) continue
          const key = selected.has(entry.project) ? entry.project : PROJECT_OTHERS_KEY
          const bucket = groups[key] ?? (groups[key] = [])
          let row = bucket.find(row => row.groupKey === String(index))
          if (!row) { row = { groupKey: String(index), workMs: 0, cost: 0 }; bucket.push(row) }
          row.workMs += entry.work_ms ?? 0
          row.cost += entry.cost ?? 0
        }
        commit(groups)
      }
      try {
        if (fallbackOnly) { await fallbackChart(); return }
        // Fetch the complete bounded ranking page, then sort locally for ties.
        // A paginated ranking is not a safe top-five: use the capped filtered scan.
        const ranked = await fetchRangeTotals(range, { groupBy: 'project', filters: { client: clientId }, perPage: 200 })
        if (!current()) return
        if (!Number.isFinite(ranked.totalPages) || ranked.totalPages > 1 || ranked.totalGroups > ranked.groups.length) {
          await fallbackChart()
          return
        }
        const keys = rankProjects(ranked.groups, selectedMetric)
        const responses = await Promise.allSettled(keys.map(project => fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters: { client: clientId, project }, perPage: boundaries.length })))
        for (const response of responses) {
          if (response.status === 'rejected' && !(response.reason instanceof TotalsRouteUnavailableError)) throw response.reason
        }
        const unavailable = responses.find(response => response.status === 'rejected')
        if (unavailable?.status === 'rejected') throw unavailable.reason
        if (!current()) return
        const groups = Object.fromEntries(keys.map((key, index) => [key, (responses[index] as PromiseFulfilledResult<{ groups: TotalsGroup[] }>).value.groups]))
        const remainder = projectRemainder(overallDays, groups)
        if (remainder.some(row => value(row) !== 0)) groups[PROJECT_OTHERS_KEY] = remainder
        chartCostUnknown.value = selectedMetric === 'cost' && overallDays.some(row => row.costUnknownEntries > 0 || row.costEstimatedEntries > 0)
        commit(groups)
      }
      catch (err) {
        if (!current()) return
        if (err instanceof TotalsRouteUnavailableError) {
          try { await fallbackChart() }
          catch { if (current()) chartError.value = true }
        }
        else chartError.value = true
      }
      finally { if (current()) chartLoading.value = false }
    }
    try {
      const [overall, daily] = await Promise.allSettled([
        fetchRangeTotals(range, { groupBy: 'none', filters: { client: clientId } }),
        fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters: { client: clientId }, perPage: boundaries.length }),
      ])
      // A real denied/network read must not be hidden by a simultaneous 404.
      for (const result of [overall, daily]) {
        if (result.status === 'rejected' && !(result.reason instanceof TotalsRouteUnavailableError)) throw result.reason
      }
      if (overall.status === 'rejected') throw overall.reason
      if (daily.status === 'rejected') throw daily.reason
      if (!isCurrent()) return
      totals.value = overall.value.total
      averageCost.value = computeAverageCostFromTotal(overall.value.total)
      overallDays = daily.value.groups
    }
    catch (err) {
      if (!isCurrent()) return
      if (!(err instanceof TotalsRouteUnavailableError)) throw err
      const { entries, truncated: wasTruncated } = await cachedRange(range)
      if (!isCurrent()) return
      totals.value = sumTaskEntries(entries)
      averageCost.value = computeAverageCost(entries)
      truncated.value = wasTruncated
      truncatedEntryCount.value = entries.length
      fallbackOnly = true
    }
    if (!isCurrent()) return
    reloadChart = loadChart
    await loadChart()
    if (!isCurrent()) return
    const projectRange = { start: resolvePreset('lastMonth').start, end: range.end }
    async function loadProjectFallback() {
      const { entries, truncated: wasTruncated } = await cachedRange(projectRange)
      if (!isCurrent()) return
      const grouped = groupByProject(entries.filter(entry => entry.project))
      totalsByProject.value = Object.fromEntries(grouped.map(group => [group.key, { cost: group.cost, workMs: group.workMs }]))
      projectsTruncated.value = wasTruncated
      projectsTruncatedEntryCount.value = entries.length
    }
    try {
      const [response, clientOverall] = await Promise.allSettled([
        fetchRangeTotals(projectRange, { groupBy: 'project', filters: { client: clientId }, perPage: 200 }),
        fetchRangeTotals(projectRange, { groupBy: 'none', filters: { client: clientId } }),
      ])
      if (!isCurrent()) return
      // A denied/network read takes precedence over an unavailable companion.
      for (const result of [response, clientOverall]) {
        if (result.status === 'rejected' && !(result.reason instanceof TotalsRouteUnavailableError)) throw result.reason
      }
      if (response.status === 'rejected') throw response.reason
      if (clientOverall.status === 'rejected') throw clientOverall.reason
      // Keep reads bounded without treating omitted or unknown groups as zeros.
      if (response.value.totalPages > 1 || response.value.totalGroups > response.value.groups.length
        || clientOverall.value.totalPages > 1) await loadProjectFallback()
      else {
        totalsByProject.value = totalsByGroupKey(response.value.groups)
      }
    }
    catch (err) {
      if (!isCurrent()) return
      if (!(err instanceof TotalsRouteUnavailableError)) throw err
      await loadProjectFallback()
    }
    // Shares exclusively describe this bounded retrieved subset, not server totals.
    // Estimated costs are known available values; only unknown quality is excluded.
    const available = await cachedRange(projectRange)
    if (!isCurrent()) return
    const known = available.entries.filter(entry => entry.cost_quality !== 'unknown'
      && Number.isFinite(entry.cost) && entry.cost >= 0)
    cardClientCost.value = known.length ? known.reduce((sum, entry) => sum + entry.cost, 0) : null
    cardProjectCosts.value = Object.fromEntries(groupByProject(known.filter(entry => entry.project))
      .map(group => [group.key, group.cost]))
    cardCostsReady.value = true
  }
  catch {
    // Denied/network reads are errors, not an empty client or zero totals.
    if (isCurrent()) error.value = true
  }
  finally {
    if (isCurrent()) loading.value = false
  }
}
onMounted(load)
watch(() => route.params.id, load, { flush: 'sync' })

const faviconRefreshing = ref(false)
async function onRefreshFavicon() {
  if (!detailClient.value || !isOwner.value || detailClient.value.unassigned || faviconRefreshing.value) return
  const id = detailClient.value.id
  faviconRefreshing.value = true
  try {
    const result = await refreshFavicon(id)
    if (result.ok) toast.success(t('clients.favicon.toast.ok'))
    else if (result.reason === 'no_website') toast.info(t('clients.favicon.toast.no_website'))
    else toast.error(t(`clients.favicon.toast.${result.reason}`))
  }
  catch {
    toast.error(t('common.error'))
  }
  finally {
    faviconRefreshing.value = false
  }
}
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-6">
    <Button v-if="loading || error || !detailClient" variant="ghost" size="icon" class="self-start" :aria-label="t('common.back')" :title="t('common.back')" @click="navigateTo('/organizacion?tab=clients')">
      <ArrowLeft aria-hidden="true" class="size-4" />
    </Button>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="error" role="alert">{{ t('common.error') }}</p>
    <p v-else-if="!detailClient" role="status">{{ t('clients.detail.notFound') }}</p>
    <template v-else>
      <div data-testid="client-detail-header" class="flex items-center gap-3">
        <Button data-testid="client-detail-back" variant="ghost" size="icon" class="shrink-0" :aria-label="t('common.back')" :title="t('common.back')" @click="navigateTo('/organizacion?tab=clients')">
          <ArrowLeft aria-hidden="true" class="size-4" />
        </Button>
        <ClientAvatar :client="detailClient" size="md" />
        <div class="min-w-0 flex-1">
          <h1 data-testid="detail-client-name" class="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">{{ detailClient.name }}</h1>
          <p data-testid="detail-client-code" class="text-sm text-muted-foreground">{{ detailClient.code }}</p>
        </div>
        <Badge data-testid="detail-client-status-badge" :variant="detailClient.active ? 'success' : 'outline'">
          {{ detailClient.active ? t('common.active') : t('common.inactive') }}
        </Badge>
        <Lock v-if="detailClient.unassigned" class="size-3.5 shrink-0 text-muted-foreground" :title="t('clients.protected')" />
      </div>
      <p v-if="truncated" class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
        {{ t('totals.fallbackTruncated', { count: truncatedEntryCount }) }}
      </p>
      <div class="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div data-testid="client-main" class="min-w-0 space-y-6">
      <section data-testid="client-analytics" :aria-label="chartName" class="space-y-6">
        <div data-testid="client-kpis" class="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
          <KpiCard :title="t('dashboard.kpi.workTime')" :value="formatDuration(totals.workMs)" />
          <KpiCard :title="t('dashboard.kpi.cost')" :value="formatCost(totals.cost)" />
          <KpiCard :title="t('clients.detail.projectsTitle')" :value="String(detailProjects.length)" />
          <KpiCard :title="t('dashboard.kpi.avgCostPerTask')" :value="formatCost(averageCost.average ?? 0)">
            <p v-if="averageCost.excludedCount > 0" class="mt-1 text-xs text-muted-foreground">
              {{ t('dashboard.kpi.avgCostExcludedNotice', { count: averageCost.excludedCount }) }}
            </p>
          </KpiCard>
        </div>
        <Card data-testid="client-time-series" role="region" :aria-label="chartName">
          <CardHeader class="flex items-end pb-2">
            <div class="flex w-full min-w-0 flex-wrap items-center justify-end gap-2">
              <Select v-model="metric" class="w-full min-w-0 sm:w-[12.5rem]" :aria-label="t('dashboard.chart.metric')" :options="[
                { value: 'work', label: t('dashboard.chart.work') },
                { value: 'cost', label: t('dashboard.chart.cost') },
              ]" />
            </div>
          </CardHeader>
          <CardContent>
            <p v-if="chartLoading" role="status" class="py-10 text-center text-sm text-muted-foreground">{{ t('dashboard.chart.loading') }}</p>
            <p v-else-if="chartError" role="alert" class="py-10 text-center text-sm">{{ t('dashboard.chart.error') }}</p>
            <p v-else-if="chartPartial" role="status" class="py-10 text-center text-sm text-muted-foreground">{{ t('dashboard.chart.partial') }}</p>
            <template v-else>
            <p v-if="chartCostUnknown" role="status" class="mb-2 text-sm text-muted-foreground">{{ t('dashboard.chart.partial') }}</p>
            <StackedBarChart
              v-if="totals.count > 0"
              :points="trendPoints"
              :series-keys="seriesKeys"
              :series-labels="seriesLabels"
              :format-value="metric === 'work' ? formatDuration : (n) => formatCost(n)"
              :tick-unit="metric === 'work' ? 3_600_000 : 1"
            />
            <p v-else class="py-10 text-center text-sm text-muted-foreground">
              {{ t('dashboard.noData') }}
            </p>
            </template>
          </CardContent>
        </Card>
      </section>
      <section data-testid="client-projects" class="space-y-4 pt-4">
        <h2 class="text-sm font-bold">{{ t('clients.detail.projectsTitle') }}</h2>
        <p v-if="projectsTruncated" role="status" class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
          {{ t('totals.fallbackTruncated', { count: projectsTruncatedEntryCount }) }}
        </p>
        <div v-if="detailProjects.length > 0" class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
          <article v-for="p in detailProjects" :key="p.id" data-testid="project-card" class="flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-2 transition-colors sm:gap-5 sm:p-5">
            <div class="flex min-w-0 flex-col gap-2">
              <h3 class="min-w-0 text-sm font-semibold [overflow-wrap:anywhere] sm:text-base">{{ p.name }}</h3>
              <div class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <ClientAvatar :client="detailClient" size="xs" class="shrink-0" />
                <p class="min-w-0 truncate" :title="detailClient.name + (p.code ? ` / ${p.code}` : '')">
                  {{ detailClient.name }}<span v-if="p.code"> / {{ p.code }}</span>
                </p>
              </div>
            </div>
            <dl class="grid min-w-0 grid-cols-1 gap-3 text-sm [overflow-wrap:anywhere] sm:grid-cols-2">
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground" :title="t('common.timeHint')">{{ t('common.time') }}</dt>
                <dd class="mt-1 font-medium tabular-nums">{{ formatDuration(totalsByProject[p.id]?.workMs ?? 0) }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">{{ t('common.cost') }}</dt>
                <dd class="mt-1 font-medium tabular-nums">{{ formatCost(totalsByProject[p.id]?.cost ?? 0) }}</dd>
              </div>
            </dl>
            <div class="space-y-1">
              <div
                data-testid="project-cost-share" class="h-2 w-full overflow-hidden rounded-full bg-background"
                :role="projectCostShare(p.id).state === 'known' ? 'meter' : 'img'"
                :aria-label="costShareLabel(p)"
                :aria-valuemin="projectCostShare(p.id).state === 'known' ? 0 : undefined"
                :aria-valuemax="projectCostShare(p.id).state === 'known' ? 100 : undefined"
                :aria-valuenow="projectCostShare(p.id).percentage ?? undefined"
              >
                <div data-testid="project-cost-share-fill" aria-hidden="true" class="h-full bg-primary" :style="{ width: `${projectCostShare(p.id).percentage ?? 0}%` }" />
              </div>
              <p v-if="projectCostShare(p.id).state === 'unavailable'" class="text-xs text-muted-foreground">{{ costShareLabel(p) }}</p>
            </div>
            <div class="mt-auto flex flex-wrap items-center justify-between gap-1">
              <Badge :variant="p.active ? 'success' : 'outline'" class="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{{ p.active ? t('common.active') : t('common.inactive') }}</Badge>
              <NuxtLink :to="`/organizacion/clientes/${p.client}/proyectos/${p.id}`" :aria-label="t('projects.openDetail', { name: p.name })" class="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ArrowRight aria-hidden="true" class="size-5" />
              </NuxtLink>
            </div>
          </article>
        </div>
        <p v-else class="text-sm text-muted-foreground">{{ t('clients.detail.noProjects') }}</p>
      </section>
        </div>
        <aside data-testid="client-sidebar" class="min-w-0 space-y-6 [overflow-wrap:anywhere]">
          <div v-if="canWrite" data-testid="client-actions" class="flex flex-wrap justify-end gap-2">
            <Button data-testid="client-edit" :disabled="detailClient.unassigned || saving || archiving" @click="editor.openEdit(detailClient)">
              <Pencil aria-hidden="true" class="size-4" />{{ t('common.edit') }}
            </Button>
            <Button data-testid="client-archive" variant="outline" :disabled="detailClient.unassigned || saving || archiving" :aria-busy="archiving" @click="editor.toggleArchive(detailClient)">
              <component :is="detailClient.active ? Archive : ArchiveRestore" aria-hidden="true" class="size-4" />
              {{ detailClient.active ? t('common.archive') : t('common.unarchive') }}
            </Button>
          </div>
          <section class="space-y-2 border-t border-border pt-4">
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-medium">{{ t('clients.detail.contactTitle') }}</h2>
              <Button v-if="isOwner && !detailClient.unassigned" data-testid="favicon-refresh-button write-action" variant="ghost" size="icon" class="size-7" :disabled="faviconRefreshing" :aria-label="t('clients.favicon.refresh')" :title="t('clients.favicon.refresh')" @click="onRefreshFavicon">
                <RefreshCw data-testid="favicon-refresh-icon" class="size-3.5" :class="faviconRefreshing ? 'animate-spin' : ''" />
              </Button>
            </div>
            <a v-if="isSafeLinkUrl(detailClient.website ?? '')" :href="detailClient.website" target="_blank" rel="noopener noreferrer" class="inline-flex max-w-full items-center gap-1.5 text-sm hover:underline">
              <Globe class="size-3.5 shrink-0" />{{ displayUrlWithoutScheme(detailClient.website ?? '') }}
            </a>
            <p v-else class="text-sm text-muted-foreground">{{ t('clients.detail.noWebsite') }}</p>
            <a v-if="detailClient.contact_email" :href="`mailto:${detailClient.contact_email}`" class="flex items-center gap-1.5 text-sm hover:underline">
              <Mail class="size-3.5 shrink-0" />{{ detailClient.contact_email }}
            </a>
            <p v-else class="text-sm text-muted-foreground">{{ t('clients.detail.noContactEmail') }}</p>
            <a v-if="detailClient.contact_phone" :href="`tel:${detailClient.contact_phone}`" class="flex items-center gap-1.5 text-sm hover:underline">
              <Phone class="size-3.5 shrink-0" />{{ detailClient.contact_phone }}
            </a>
            <p v-else class="text-sm text-muted-foreground">{{ t('clients.detail.noContactPhone') }}</p>
          </section>
          <section class="space-y-2 border-t border-border pt-4">
            <h2 class="text-sm font-medium">{{ t('clients.notes') }}</h2>
            <p v-if="detailClient.notes" class="text-sm whitespace-pre-wrap text-muted-foreground">{{ detailClient.notes }}</p>
            <p v-else class="text-sm text-muted-foreground">{{ t('clients.detail.noNotes') }}</p>
          </section>
        </aside>
      </div>
      <ClientEditDialog :editor="editor" />
    </template>
  </div>
</template>
