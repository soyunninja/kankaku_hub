<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import StackedBarChart from '@/components/charts/StackedBarChart.vue'
import ClientName from '@/components/clients/ClientName.vue'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupByModel, sumTaskEntries } from '@/lib/aggregate'
import { buildLocalDayBoundaries, localDateRangeToUtcFilters, utcInstantToLocalDay } from '@/lib/local-day'
import { computeAverageCost } from '@/lib/measurement-quality'
import { resolvePreset } from '@/lib/period'
import type { TaskEntryRecord } from '@/lib/pocketbase-types'
import { computeAverageCostFromTotal, groupsToGroupTotals } from '@/lib/totals-map'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'

/** Rendered top-10-by-cost — matches the pre-migration `.slice(0, 10)`. */
const TOP_PROMPTS_LIMIT = 10

const { t } = useI18n()
const { formatCost, formatDuration } = useFormatters()
const route = useRoute()
const projectId = route.params.id as string
const { $pb } = useNuxtApp()

const { byId: projectById, ensureLoaded: ensureProjects } = useProjects()
const { byId: clientById, ensureLoaded: ensureClients } = useClients()
const { byProject: tasksByProject, ensureLoaded: ensureTasks } = useTasks()
const { fetchRange } = useTaskEntries()
const { fetchTotals, fetchRangeTotals } = useTotals()

const project = computed(() => projectById(projectId))
const client = computed(() => project.value ? clientById(project.value.client) : undefined)
useHead({ title: computed(() => project.value?.name ?? 'Project') })

// Fixed 30d-to-today window — this page has no date-range selector.
const range = { start: resolvePreset('30d').start, end: resolvePreset('today').end }

const loading = ref(true)
/** Sticky once the totals route 404s this session, so every later
 * refresh goes straight to the fallback instead of re-probing (same
 * pattern as `pages/index.vue`). */
const totalsRouteUnavailable = ref(false)
/** True when the fallback path's `fetchRange` scan was capped before
 * covering the full range — surfaces `totals.fallbackTruncated`. */
const truncated = ref(false)

const totals = ref<{ workMs: number, cost: number, count: number }>({ workMs: 0, cost: 0, count: 0 })
// Excludes rows whose cost_quality is 'unknown' from the average rather
// than averaging in a zero — same shared semantics the dashboard uses
// (measurement-quality.ts / totals-map.ts), not a hand-rolled
// totals.cost / totals.count.
const averageCost = ref<{ average: number | null, excludedCount: number, includedCount: number }>({ average: null, excludedCount: 0, includedCount: 0 })
const byModel = ref<{ key: string, workMs: number, cost: number }[]>([])
const topPrompts = ref<Pick<TaskEntryRecord, 'id' | 'prompt' | 'cost'>[]>([])
const trendPoints = ref<{ day: string, values: { total: number } }[]>([])
const tasks = computed(() => tasksByProject(projectId))

async function fetchTopPrompts(): Promise<Pick<TaskEntryRecord, 'id' | 'prompt' | 'cost'>[]> {
  const utc = localDateRangeToUtcFilters(range)
  const filter = [
    `started_at >= "${utc.start}"`,
    `started_at <= "${utc.end}"`,
    `project = "${projectId}"`,
  ].join(' && ')
  const result = await $pb.collection('task_entries').getList<TaskEntryRecord>(1, TOP_PROMPTS_LIMIT, {
    filter,
    sort: '-cost',
    fields: 'id,prompt,cost,started_at',
  })
  return result.items
}

async function loadServer() {
  const { boundaries, labels } = buildLocalDayBoundaries(range)

  const [totalsResp, dayResp, modelResp, promptsRows] = await Promise.all([
    fetchRangeTotals(range, { groupBy: 'none', filters: { project: projectId } }),
    fetchTotals({ groupBy: 'day', dayBoundaries: boundaries, filters: { project: projectId }, perPage: boundaries.length }),
    fetchRangeTotals(range, { groupBy: 'model', filters: { project: projectId } }),
    fetchTopPrompts(),
  ])

  totals.value = totalsResp.total
  averageCost.value = computeAverageCostFromTotal(totalsResp.total)
  byModel.value = groupsToGroupTotals(modelResp.groups, modelResp.total)
  topPrompts.value = promptsRows
  truncated.value = false

  trendPoints.value = labels.map((day, idx) => {
    const bucket = dayResp.groups.find(g => g.groupKey === String(idx))
    return { day, values: { total: bucket?.workMs ?? 0 } }
  })
}

/** Pre-totals-route path: fetches the full range as rows and aggregates
 * client-side, exactly as this page did before the totals migration.
 * Used only when POST /api/kankaku/totals 404s — no error toast, this is
 * a silent, documented degrade-gracefully path.
 *
 * "Most expensive prompts" reuses the rows already fetched by
 * `fetchRange` (sorted/sliced the same way as before) rather than
 * issuing a second query: `fetchRange`'s `FIELDS` already includes
 * `prompt`, so this stays simplest and preserves pre-migration behavior
 * exactly.
 */
async function loadFallback() {
  const { entries, truncated: wasTruncated } = await fetchRange(range, { project: projectId })
  truncated.value = wasTruncated

  totals.value = sumTaskEntries(entries)
  averageCost.value = computeAverageCost(entries)
  byModel.value = groupByModel(entries)
  topPrompts.value = [...entries].sort((a, b) => b.cost - a.cost).slice(0, TOP_PROMPTS_LIMIT)

  const byDay = new Map<string, number>()
  for (const e of entries) {
    // Local day, not a raw slice of the stored UTC instant — see
    // app/lib/local-day.ts and the day-boundary finding.
    const day = utcInstantToLocalDay(e.started_at)
    byDay.set(day, (byDay.get(day) ?? 0) + (e.work_ms ?? 0))
  }
  trendPoints.value = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, values: { total: v } }))
}

async function load() {
  loading.value = true
  try {
    if (totalsRouteUnavailable.value) {
      await loadFallback()
      return
    }
    try {
      await loadServer()
    }
    catch (err) {
      if (!(err instanceof TotalsRouteUnavailableError)) throw err
      totalsRouteUnavailable.value = true
      await loadFallback()
    }
  }
  finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([ensureProjects(), ensureClients(), ensureTasks()])
  await load()
})
</script>

<template>
  <div v-if="project" class="flex flex-col gap-6">
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="icon" :aria-label="t('common.back')" :title="t('common.back')" @click="navigateTo('/projects')">
        <ArrowLeft class="size-4" />
      </Button>
      <div>
        <h1 class="text-xl font-semibold tracking-tight">
          {{ project.name }}
        </h1>
        <ClientName v-if="client" :client="client" size="xs" class="text-sm text-muted-foreground" />
        <p v-else class="text-sm text-muted-foreground">
          {{ project.client }}
        </p>
      </div>
      <Badge class="ml-2" :variant="project.active ? 'success' : 'outline'">
        {{ project.active ? t('common.active') : t('common.inactive') }}
      </Badge>
    </div>

    <p v-if="truncated" class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
      {{ t('totals.fallbackTruncated', { count: totals.count }) }}
    </p>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard :title="t('dashboard.kpi.workTime')" :value="formatDuration(totals.workMs)" />
      <KpiCard :title="t('dashboard.kpi.cost')" :value="formatCost(totals.cost)" />
      <KpiCard :title="t('dashboard.kpi.tasks')" :value="String(totals.count)" />
      <KpiCard :title="t('dashboard.kpi.avgCostPerTask')" :value="formatCost(averageCost.average ?? 0)">
        <p v-if="averageCost.excludedCount > 0" class="mt-1 text-xs text-muted-foreground">
          {{ t('dashboard.kpi.avgCostExcludedNotice', { count: averageCost.excludedCount }) }}
        </p>
      </KpiCard>
    </div>

    <Card>
      <CardHeader><CardTitle class="text-sm font-medium text-foreground">
        {{ t('projects.detail.trend') }}
      </CardTitle></CardHeader>
      <CardContent>
        <StackedBarChart
          v-if="trendPoints.length > 0"
          :points="trendPoints"
          :series-keys="['total']"
          :series-labels="{ total: t('dashboard.kpi.workTime') }"
          :format-value="formatDuration"
          :tick-unit="3_600_000"
        />
        <p v-else class="py-10 text-center text-sm text-muted-foreground">
          {{ t('dashboard.noData') }}
        </p>
      </CardContent>
    </Card>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle class="text-sm font-medium text-foreground">
          {{ t('projects.detail.tasksTitle') }}
        </CardTitle></CardHeader>
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ t('common.name') }}</TableHead>
                <TableHead>{{ t('common.status') }}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="task in tasks" :key="task.id">
                <TableCell>{{ task.title }}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {{ t(`tasks.status.${task.status}`) }}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow v-if="tasks.length === 0">
                <TableCell colspan="2" class="text-center text-muted-foreground">
                  {{ t('tasks.empty') }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle class="text-sm font-medium text-foreground">
          {{ t('projects.detail.byModel') }}
        </CardTitle></CardHeader>
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ t('common.model') }}</TableHead>
                <TableHead class="text-right">
                  {{ t('common.work') }}
                </TableHead>
                <TableHead class="text-right">
                  {{ t('common.cost') }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="m in byModel" :key="m.key">
                <TableCell>{{ m.key }}</TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatDuration(m.workMs) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatCost(m.cost) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader><CardTitle class="text-sm font-medium text-foreground">
        {{ t('projects.detail.topPrompts') }}
      </CardTitle></CardHeader>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{{ t('common.prompt') }}</TableHead>
              <TableHead class="text-right">
                {{ t('common.cost') }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="e in topPrompts" :key="e.id">
              <TableCell class="max-w-md truncate" :title="e.prompt">
                {{ e.prompt || '—' }}
              </TableCell>
              <TableCell class="text-right tabular-nums">
                {{ formatCost(e.cost) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
