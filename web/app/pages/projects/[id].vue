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
import { formatCost, formatDuration } from '@/lib/format'
import { resolvePreset } from '@/lib/period'
import type { TaskEntryRecord } from '@/lib/pocketbase-types'

const { t } = useI18n()
const route = useRoute()
const projectId = route.params.id as string

const { byId: projectById, ensureLoaded: ensureProjects } = useProjects()
const { byId: clientById, ensureLoaded: ensureClients } = useClients()
const { byProject: tasksByProject, ensureLoaded: ensureTasks } = useTasks()
const { fetchRange } = useTaskEntries()

const project = computed(() => projectById(projectId))
const client = computed(() => project.value ? clientById(project.value.client) : undefined)
useHead({ title: computed(() => project.value?.name ?? 'Project') })

const entries = ref<TaskEntryRecord[]>([])
const loading = ref(true)

onMounted(async () => {
  await Promise.all([ensureProjects(), ensureClients(), ensureTasks()])
  const range = { start: resolvePreset('30d').start, end: resolvePreset('today').end }
  entries.value = await fetchRange(range, { project: projectId })
  loading.value = false
})

const totals = computed(() => sumTaskEntries(entries.value))
const byModel = computed(() => groupByModel(entries.value))
const topPrompts = computed(() => [...entries.value].sort((a, b) => b.cost - a.cost).slice(0, 10))
const tasks = computed(() => tasksByProject(projectId))

const trendPoints = computed(() => {
  const byDay = new Map<string, number>()
  for (const e of entries.value) {
    const day = e.started_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + (e.work_ms ?? 0))
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, values: { total: v } }))
})
</script>

<template>
  <div v-if="project" class="flex flex-col gap-6">
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="icon" @click="navigateTo('/projects')">
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

    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard :title="t('dashboard.kpi.workTime')" :value="formatDuration(totals.workMs)" />
      <KpiCard :title="t('dashboard.kpi.cost')" :value="formatCost(totals.cost)" />
      <KpiCard :title="t('dashboard.kpi.tasks')" :value="String(totals.count)" />
      <KpiCard :title="t('dashboard.kpi.avgCostPerTask')" :value="formatCost(totals.count ? totals.cost / totals.count : 0)" />
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
