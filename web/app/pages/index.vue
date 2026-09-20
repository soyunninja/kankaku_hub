<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import StackedBarChart from '@/components/charts/StackedBarChart.vue'
import BreakdownTable from '@/components/dashboard/BreakdownTable.vue'
import DateRangePicker from '@/components/dashboard/DateRangePicker.vue'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { avgCostPerTask, groupByClient, groupByProject, sumTaskEntries } from '@/lib/aggregate'
import { formatCost, formatDuration, formatTokensCompact } from '@/lib/format'
import type { DateRange, PresetKey } from '@/lib/period'
import { previousEquivalentPeriod, resolvePreset } from '@/lib/period'
import type { TaskEntryRecord } from '@/lib/pocketbase-types'

const { t } = useI18n()
useHead({ title: computed(() => t('dashboard.title')) })

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { fetchRange, subscribe } = useTaskEntries()

const preset = ref<PresetKey>('30d')
const range = ref<DateRange>(resolvePreset('30d'))
const includeUnassigned = ref(false)
const metric = ref<'work' | 'cost'>('work')
const stackBy = ref<'none' | 'client' | 'project'>('none')

const currentEntries = ref<TaskEntryRecord[]>([])
const previousEntries = ref<TaskEntryRecord[]>([])
const loading = ref(true)

const unassignedClientId = computed(() => clients.value.find(c => c.unassigned)?.id)

function clientName(id: string) {
  return clients.value.find(c => c.id === id)?.name ?? id
}
function projectName(id: string) {
  return projects.value.find(c => c.id === id)?.name ?? id
}

const visibleCurrent = computed(() => includeUnassigned.value
  ? currentEntries.value
  : currentEntries.value.filter(e => e.client !== unassignedClientId.value))

const visiblePrevious = computed(() => includeUnassigned.value
  ? previousEntries.value
  : previousEntries.value.filter(e => e.client !== unassignedClientId.value))

const totals = computed(() => sumTaskEntries(visibleCurrent.value))
const previousTotals = computed(() => sumTaskEntries(visiblePrevious.value))

const byClient = computed(() => groupByClient(visibleCurrent.value).map(g => ({ ...g, label: clientName(g.key) })))
const byProject = computed(() => groupByProject(visibleCurrent.value.filter(e => e.project)).map(g => ({ ...g, label: projectName(g.key) })))

const topExpensive = computed(() => [...visibleCurrent.value].sort((a, b) => b.cost - a.cost).slice(0, 10))

const chartSeriesKeys = computed(() => {
  if (stackBy.value === 'client') return byClient.value.slice(0, 5).map(g => g.key)
  if (stackBy.value === 'project') return byProject.value.slice(0, 5).map(g => g.key)
  return ['total']
})
const chartSeriesLabels = computed<Record<string, string>>(() => {
  if (stackBy.value === 'client') return Object.fromEntries(byClient.value.map(g => [g.key, g.label]))
  if (stackBy.value === 'project') return Object.fromEntries(byProject.value.map(g => [g.key, g.label]))
  return { total: metric.value === 'work' ? t('dashboard.chart.work') : t('dashboard.chart.cost') }
})

const chartPoints = computed(() => {
  const byDay = new Map<string, Record<string, number>>()
  for (const e of visibleCurrent.value) {
    const day = e.started_at.slice(0, 10)
    const bucket = byDay.get(day) ?? {}
    const key = stackBy.value === 'client' ? e.client : stackBy.value === 'project' ? (e.project || '—') : 'total'
    if (chartSeriesKeys.value.includes(key)) {
      bucket[key] = (bucket[key] ?? 0) + (metric.value === 'work' ? (e.work_ms ?? 0) : (e.cost ?? 0))
    }
    byDay.set(day, bucket)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, values]) => ({ day, values }))
})

async function load() {
  loading.value = true
  try {
    const prevRange = previousEquivalentPeriod(range.value)
    const [current, previous] = await Promise.all([
      fetchRange(range.value),
      fetchRange(prevRange),
    ])
    currentEntries.value = current
    previousEntries.value = previous
  }
  finally {
    loading.value = false
  }
}

let unsubscribe: (() => void) | null = null
onMounted(async () => {
  await Promise.all([ensureClients(), ensureProjects()])
  await load()
  unsubscribe = subscribe(() => load())
})
onBeforeUnmount(() => unsubscribe?.())

watch(range, load, { deep: true })
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-xl font-semibold tracking-tight">
        {{ t('dashboard.title') }}
      </h1>
      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch v-model="includeUnassigned" />
          {{ t('dashboard.includeUnassigned') }}
        </label>
        <DateRangePicker v-model:preset="preset" v-model:range="range" />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard :title="t('dashboard.kpi.workTime')" :value="formatDuration(totals.workMs)" :current-value="totals.workMs" :previous-value="previousTotals.workMs" polarity="neutral" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.wallTime')" :value="formatDuration(totals.wallMs)" :current-value="totals.wallMs" :previous-value="previousTotals.wallMs" polarity="neutral" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.waitingTime')" :value="formatDuration(totals.waitingMs)" :current-value="totals.waitingMs" :previous-value="previousTotals.waitingMs" polarity="lowerIsBetter" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="`${t('dashboard.kpi.cost')} (USD)`" :value="formatCost(totals.cost)" :current-value="totals.cost" :previous-value="previousTotals.cost" polarity="lowerIsBetter" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.tokensIn')" :value="formatTokensCompact(totals.input)" :current-value="totals.input" :previous-value="previousTotals.input" polarity="neutral" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.tokensOut')" :value="formatTokensCompact(totals.output)" :current-value="totals.output" :previous-value="previousTotals.output" polarity="neutral" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.tasks')" :value="String(totals.count)" :current-value="totals.count" :previous-value="previousTotals.count" polarity="neutral" :vs-label="t('dashboard.vsPrevious')" />
      <KpiCard :title="t('dashboard.kpi.avgCostPerTask')" :value="formatCost(avgCostPerTask(totals))" polarity="lowerIsBetter" />
    </div>

    <Card>
      <CardHeader class="flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <CardTitle class="text-sm font-medium text-foreground">
          {{ t('dashboard.chart.title') }}
        </CardTitle>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <Select
v-model="metric" class="min-w-0 sm:min-w-[12.5rem]" :options="[
            { value: 'work', label: t('dashboard.chart.work') },
            { value: 'cost', label: t('dashboard.chart.cost') },
          ]"
          />
          <Select
v-model="stackBy" class="w-40" :options="[
            { value: 'none', label: t('dashboard.chart.none') },
            { value: 'client', label: t('dashboard.chart.client') },
            { value: 'project', label: t('dashboard.chart.project') },
          ]"
          />
        </div>
      </CardHeader>
      <CardContent>
        <StackedBarChart
          v-if="chartPoints.length > 0"
          :points="chartPoints"
          :series-keys="chartSeriesKeys"
          :series-labels="chartSeriesLabels"
          :format-value="metric === 'work' ? formatDuration : (n) => formatCost(n)"
          :tick-unit="metric === 'work' ? 3_600_000 : 1"
        />
        <p v-else class="py-10 text-center text-sm text-muted-foreground">
          {{ t('dashboard.noData') }}
        </p>
      </CardContent>
    </Card>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card data-testid="breakdown-by-client">
        <CardHeader><CardTitle class="text-sm font-medium text-foreground">
          {{ t('dashboard.byClient') }}
        </CardTitle></CardHeader>
        <CardContent class="p-0">
          <BreakdownTable :rows="byClient" :name-header="t('common.client')" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle class="text-sm font-medium text-foreground">
          {{ t('dashboard.byProject') }}
        </CardTitle></CardHeader>
        <CardContent class="p-0">
          <BreakdownTable :rows="byProject" :name-header="t('common.project')" />
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader><CardTitle class="text-sm font-medium text-foreground">
        {{ t('dashboard.topExpensive') }}
      </CardTitle></CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('common.client') }}</TableHead>
              <TableHead>{{ t('common.project') }}</TableHead>
              <TableHead class="text-right">
                {{ t('dashboard.kpi.cost') }}
              </TableHead>
              <TableHead class="text-right">
                {{ t('common.work') }}
              </TableHead>
              <TableHead>{{ t('common.model') }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="e in topExpensive" :key="e.id">
              <TableCell>{{ clientName(e.client) }}</TableCell>
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
