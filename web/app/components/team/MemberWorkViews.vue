<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import StackedBarChart from '@/components/charts/StackedBarChart.vue'
import DateRangePicker from '@/components/dashboard/DateRangePicker.vue'
import { TotalsRouteUnavailableError, useTotals } from '@/composables/useTotals'
import { dateRangeFromQuery } from '@/components/team/activity'
import { resolvePreset, type DateRange, type PresetKey } from '@/lib/period'
import { countRecordedMemberProjects, loadMemberProjectChart, loadMemberWorkGroups, memberWorkProjectCacheKey, type MemberWorkView } from '@/lib/member-work-views'
import { PROJECT_OTHERS_KEY } from '@/lib/project-chart'
import type { TotalsGroup, TotalsRow } from '@/lib/totals-map'
import { ArrowRight } from '@lucide/vue'
import { memberProjectDestination, memberSessionDestination } from '@/lib/member-work-navigation'

const props = defineProps<{ memberId: string }>()
const { t } = useI18n()
const route = useRoute()
const { isOwner } = useAuth()
const { ensureLoaded: ensureProjects, projects } = useProjects()
const { ensureLoaded: ensureClients, clients } = useClients()
const { fetchTotals } = useTotals()
const { formatCost, formatDuration } = useFormatters()
const initialRange = resolvePreset('30d')
const bookmarkedRange = dateRangeFromQuery(route.query.dateStart, route.query.dateEnd, initialRange)
const range = ref<DateRange>(bookmarkedRange)
const preset = ref<PresetKey>(bookmarkedRange.start === initialRange.start && bookmarkedRange.end === initialRange.end ? '30d' : 'custom')
const dateStart = computed({ get: () => range.value.start, set: (start: string) => { range.value.start = start } })
const dateEnd = computed({ get: () => range.value.end, set: (end: string) => { range.value.end = end } })
const view = ref<MemberWorkView>('projects')
const groups = ref<TotalsGroup[]>([])
const totals = ref<TotalsRow | null>(null)
const projectChart = ref<Awaited<ReturnType<typeof loadMemberProjectChart>>>(null)
const overviewLoading = ref(false)
const overviewError = ref<'load' | 'unavailable' | 'range' | ''>('')
const listLoading = ref(false)
const listReady = ref(false)
const listError = ref<'load' | 'unavailable' | 'range' | ''>('')
const projectCount = ref<number | null>(null)
const projectCountCache = new Map<string, number>()
let overviewGeneration = 0
let listGeneration = 0
let mounted = false

const projectNames = computed(() => new Map(projects.value.map(project => [project.id, project.name])))
const hasProjectChartWork = computed(() => {
  const chart = projectChart.value
  return Boolean(chart?.points.some(point => chart.seriesKeys.some(key => (point.values[key] ?? 0) > 0)))
})
const groupLabel = (group: TotalsGroup) => {
  if (view.value === 'projects') {
    if (!group.groupKey) return t('team.unassigned')
    return projectNames.value.get(group.groupKey) ?? t('team.workUnknownProject', { id: group.groupKey })
  }
  return group.sessionName || t('team.workUnknownSession')
}
const groupProjectLabel = (group: TotalsGroup) => {
  if (group.distinctProject > 1) return t('team.workMultipleProjects')
  if (!group.distinctProject || !group.sampleProject) return t('team.unassigned')
  return projectNames.value.get(group.sampleProject) ?? t('team.workUnknownProject', { id: group.sampleProject })
}

async function loadOverview() {
  const request = ++overviewGeneration
  const memberId = props.memberId
  const selectedRange = { start: dateStart.value, end: dateEnd.value }
  const cacheKey = memberWorkProjectCacheKey(memberId, selectedRange)
  const isCurrent = () => request === overviewGeneration && props.memberId === memberId
    && dateStart.value === selectedRange.start && dateEnd.value === selectedRange.end
  const isRequestCurrent = () => isCurrent() && isOwner.value
  totals.value = null
  projectChart.value = null
  projectCount.value = projectCountCache.get(cacheKey) ?? null
  overviewError.value = ''
  if (!isOwner.value) { overviewLoading.value = false; return }
  if (!selectedRange.start || !selectedRange.end || selectedRange.start > selectedRange.end) {
    overviewError.value = 'range'
    overviewLoading.value = false
    return
  }
  overviewLoading.value = true
  try {
    await Promise.all([ensureProjects(), ensureClients()])
    if (!isRequestCurrent()) return
    const [projectResult, chartResult] = await Promise.all([
      loadMemberWorkGroups(fetchTotals, memberId, selectedRange, 'project', isRequestCurrent),
      loadMemberProjectChart(fetchTotals, memberId, selectedRange, isRequestCurrent),
    ])
    if (!isRequestCurrent() || !projectResult || !chartResult) return
    const count = countRecordedMemberProjects(projectResult.groups, projects.value, clients.value)
    projectCountCache.set(cacheKey, count)
    projectCount.value = count
    totals.value = projectResult.total
    projectChart.value = chartResult
  }
  catch (cause) {
    if (isRequestCurrent()) overviewError.value = cause instanceof TotalsRouteUnavailableError ? 'unavailable' : 'load'
  }
  finally {
    if (isRequestCurrent()) overviewLoading.value = false
  }
}

async function loadGroups() {
  const request = ++listGeneration
  const memberId = props.memberId
  const selectedView = view.value
  const selectedRange = { start: dateStart.value, end: dateEnd.value }
  const isCurrent = () => request === listGeneration && props.memberId === memberId
    && view.value === selectedView && dateStart.value === selectedRange.start && dateEnd.value === selectedRange.end
  const isRequestCurrent = () => isCurrent() && isOwner.value
  groups.value = []
  listReady.value = false
  listError.value = ''
  if (!isOwner.value) { listLoading.value = false; return }
  if (!selectedRange.start || !selectedRange.end || selectedRange.start > selectedRange.end) {
    listError.value = 'range'
    listLoading.value = false
    return
  }
  listLoading.value = true
  try {
    const result = await loadMemberWorkGroups(fetchTotals, memberId, selectedRange, selectedView === 'projects' ? 'project' : 'session', isRequestCurrent)
    if (isRequestCurrent() && result) {
      groups.value = result.groups
      listReady.value = true
    }
  }
  catch (cause) {
    if (isRequestCurrent()) listError.value = cause instanceof TotalsRouteUnavailableError ? 'unavailable' : 'load'
  }
  finally {
    if (isRequestCurrent()) listLoading.value = false
  }
}

function groupDestination(group: TotalsGroup) {
  return view.value === 'projects'
    ? memberProjectDestination(props.memberId, group.groupKey, dateStart.value, dateEnd.value)
    : memberSessionDestination(props.memberId, group.groupKey, dateStart.value, dateEnd.value)
}

function retryOverview() {
  projectCountCache.delete(memberWorkProjectCacheKey(props.memberId, { start: dateStart.value, end: dateEnd.value }))
  void loadOverview()
}

watch([() => props.memberId, view, () => range.value.start, () => range.value.end, isOwner], (current, previous) => {
  if (!mounted) return
  if (current[0] !== previous[0] || current[2] !== previous[2] || current[3] !== previous[3] || current[4] !== previous[4]) {
    void loadOverview()
  }
  void loadGroups()
})
watch(() => [route.query.dateStart, route.query.dateEnd], ([start, end]) => {
  const bookmarked = dateRangeFromQuery(start, end, initialRange)
  range.value = bookmarked
  preset.value = bookmarked.start === initialRange.start && bookmarked.end === initialRange.end ? '30d' : 'custom'
})
onMounted(() => {
  mounted = true
  void loadOverview()
  void loadGroups()
})
onBeforeUnmount(() => { overviewGeneration++; listGeneration++ })
</script>

<template>
  <section class="min-w-0 space-y-4" :aria-label="t('team.memberWork')">
    <div class="flex min-w-0 flex-col gap-8">
      <div v-if="isOwner && !overviewLoading && !overviewError && totals" class="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
        <KpiCard :title="t('team.workProjects')" :value="projectCount === null ? '—' : String(projectCount)" />
        <KpiCard :title="t('team.workSessions')" :value="String(totals.distinctSessions)" />
        <KpiCard :title="t('team.memberTotalMinutes')" :value="formatDuration(totals.workMs)" />
        <KpiCard :title="t('team.memberTotalCost')" :value="formatCost(totals.cost)" />
      </div>
      <Card data-testid="member-project-work-chart" role="region" :aria-label="t('dashboard.chart.title')">
        <CardContent class="pt-6">
          <p v-if="overviewLoading" class="py-10 text-center text-sm text-muted-foreground">{{ t('dashboard.chart.loading') }}</p>
          <div v-if="overviewError" role="alert" class="py-10 text-center text-sm">
            {{ t('dashboard.chart.error') }}
            <Button variant="outline" size="sm" @click="retryOverview">{{ t('dashboard.chart.retry') }}</Button>
          </div>
          <StackedBarChart
            v-if="!overviewLoading && !overviewError && hasProjectChartWork"
            :points="projectChart!.points"
            :series-keys="projectChart!.seriesKeys"
            :series-labels="Object.fromEntries(projectChart!.seriesKeys.map(key => [key, key === PROJECT_OTHERS_KEY ? t('dashboard.chart.others') : projectNames.get(key) ?? t('team.workUnknownProject', { id: key })]))"
            :format-value="formatDuration"
            :tick-unit="3_600_000"
          />
          <p v-if="!overviewLoading && !overviewError && !hasProjectChartWork" class="py-10 text-center text-sm text-muted-foreground">{{ t('dashboard.noData') }}</p>
        </CardContent>
      </Card>
      <div class="flex min-w-0 flex-wrap items-center justify-end gap-3">
        <div class="flex min-w-0 flex-wrap items-center justify-end gap-3">
          <DateRangePicker v-model:preset="preset" v-model:range="range" />
          <div role="group" :aria-label="t('team.workViewLabel')" class="control-group flex max-w-full gap-1 bg-muted">
            <Button type="button" size="segment" :variant="view === 'projects' ? 'secondary' : 'ghost'" :class="{ 'font-bold': view === 'projects' }" :aria-pressed="view === 'projects'" @click="view = 'projects'">{{ t('team.workProjects') }}</Button>
            <Button type="button" size="segment" :variant="view === 'sessions' ? 'secondary' : 'ghost'" :class="{ 'font-bold': view === 'sessions' }" :aria-pressed="view === 'sessions'" @click="view = 'sessions'">{{ t('team.workSessions') }}</Button>
          </div>
        </div>
      </div>
    </div>
    <p v-if="!isOwner" role="alert">{{ t('team.ownerOnly') }}</p>
    <p v-else-if="listLoading" role="status">{{ t('common.loading') }}</p>
    <div v-else-if="listError" role="alert" class="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm">
      <span>{{ t(listError === 'unavailable' ? 'team.workUnavailable' : listError === 'range' ? 'team.invalidRange' : 'team.workLoadFailed') }}</span>
      <Button variant="outline" size="sm" @click="loadGroups">{{ t('team.retry') }}</Button>
    </div>
    <template v-else-if="listReady">
      <p v-if="view === 'sessions'" class="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{{ t('team.workSessionWorkNote') }}</p>
      <p v-if="groups.length === 0" class="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{{ t('team.workEmpty') }}</p>
      <div v-else class="grid min-w-0 gap-6 lg:grid-cols-2">
        <Card v-for="group in groups" :key="group.groupKey" class="min-w-0 gap-3 p-4 sm:p-5">
          <CardHeader class="min-w-0 p-0">
            <CardTitle class="break-words text-base">
              {{ groupLabel(group) }}
            </CardTitle>
            <p v-if="view === 'sessions'" class="break-words text-sm text-muted-foreground">{{ groupProjectLabel(group) }}</p>
          </CardHeader>
          <CardContent class="grid min-w-0 grid-cols-2 gap-3 p-0 text-sm sm:grid-cols-3">
            <div class="min-w-0"><p class="text-xs text-muted-foreground">{{ t('team.memberTotalMinutes') }}</p><p class="mt-1 break-words font-medium tabular-nums">{{ formatDuration(group.workMs) }}</p></div>
            <div class="min-w-0"><p class="text-xs text-muted-foreground">{{ t('team.memberTotalCost') }}</p><p class="mt-1 break-words font-medium tabular-nums">{{ formatCost(group.cost) }}</p></div>
            <div class="min-w-0"><p class="text-xs text-muted-foreground">{{ t('team.memberTotalEntries') }}</p><p class="mt-1 break-words font-medium tabular-nums">{{ group.entries }}</p></div>
          </CardContent>
          <div v-if="groupDestination(group)" class="mt-auto flex justify-end">
            <NuxtLink :to="groupDestination(group)!" :aria-label="t(view === 'projects' ? 'team.openProject' : 'team.openSession')" class="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArrowRight aria-hidden="true" class="size-5" />
            </NuxtLink>
          </div>
        </Card>
      </div>
    </template>
  </section>
</template>
