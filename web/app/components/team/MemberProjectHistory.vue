<script setup lang="ts">
import { ArrowLeft, ChevronDown, ChevronRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import KpiCard from '@/components/dashboard/KpiCard.vue'
import StackedBarChart from '@/components/charts/StackedBarChart.vue'
import { TotalsRouteUnavailableError, useTotals } from '@/composables/useTotals'
import { IgnoredSessionsTotalsUnavailableError, loadMemberProjectHistory, loadMemberProjectSessionTasks, type MemberProjectHistory, type MemberProjectHistorySession, type MemberProjectHistoryTask } from '@/lib/member-project-history'
import type { ClientRecord, ProjectRecord, TaskRecord, TeamMemberRecord } from '@/lib/pocketbase-types'
import type { TotalsRow } from '@/lib/totals-map'

const props = defineProps<{
  memberId: string
  projectId: string
  backTo: { path: string, query: Record<string, string> }
}>()

const { t } = useI18n()
const { isOwner } = useAuth()
const { fetchTotals } = useTotals()
const { $pb } = useNuxtApp()
const { tasks, refresh: refreshTasks } = useTasks()
const { formatCost, formatDateTime, formatDuration, formatTokens } = useFormatters()

const history = ref<MemberProjectHistory | null>(null)
const metadata = ref<{ member: TeamMemberRecord, project: ProjectRecord, client: ClientRecord } | null>(null)
const loading = ref(false)
const error = ref<'load' | 'unavailable' | 'not-found' | ''>('')
const chartMetric = ref<'time' | 'cost'>('time')
const sessionLimit = ref(20)
const expandedSessions = ref(new Set<string>())
type SessionTaskState = { loading: boolean, error: boolean, tasks: MemberProjectHistoryTask[] | null }
const taskStates = ref<Record<string, SessionTaskState | undefined>>({})
let generation = 0
const sessionTaskGenerations = new Map<string, number>()

const member = computed(() => metadata.value?.member)
const project = computed(() => metadata.value?.project)
const client = computed(() => metadata.value?.client)
const taskNames = computed(() => new Map(tasks.value.map(task => [task.id, task.title])))
const chronologicalSessions = computed(() => [...(history.value?.sessions ?? [])].sort((a, b) => a.minStartedAt.localeCompare(b.minStartedAt) || a.groupKey.localeCompare(b.groupKey)))
const visibleSessions = computed(() => chronologicalSessions.value.slice(0, sessionLimit.value))
const chart = computed(() => history.value?.chart)
const chartPoints = computed(() => (chart.value?.points ?? []).map((point) => ({
  day: point.period,
  values: { history: chartMetric.value === 'time' ? point.workMs : point.costKnownSum },
})))
const chartLabel = computed(() => t(chartMetric.value === 'time' ? 'team.historyChartTime' : 'team.historyChartCost'))

function isCurrent(request: number, memberId: string, projectId: string) {
  return request === generation && props.memberId === memberId && props.projectId === projectId && isOwner.value
}

function resetState() {
  history.value = null
  metadata.value = null
  error.value = ''
  loading.value = false
  sessionLimit.value = 20
  expandedSessions.value = new Set()
  taskStates.value = {}
}

async function load() {
  const request = ++generation
  const memberId = props.memberId
  const projectId = props.projectId
  resetState()
  if (!isOwner.value) return
  if (!memberId.trim() || !projectId.trim()) {
    error.value = 'not-found'
    return
  }
  loading.value = true
  try {
    const [memberRecord, projectRecord] = await Promise.all([
      $pb.collection('team_members').getOne<TeamMemberRecord>(memberId),
      $pb.collection('projects').getOne<ProjectRecord>(projectId),
    ])
    if (!isCurrent(request, memberId, projectId)) return
    if (memberRecord.id !== memberId || projectRecord.id !== projectId || !projectRecord.client) {
      error.value = 'not-found'
      return
    }
    const clientRecord = await $pb.collection('clients').getOne<ClientRecord>(projectRecord.client)
    if (!isCurrent(request, memberId, projectId)) return
    if (clientRecord.id !== projectRecord.client) {
      error.value = 'not-found'
      return
    }
    metadata.value = { member: memberRecord, project: projectRecord, client: clientRecord }
    const [result] = await Promise.all([
      loadMemberProjectHistory(fetchTotals, memberId, projectId, () => isCurrent(request, memberId, projectId)),
      refreshTasks(),
    ])
    if (!isCurrent(request, memberId, projectId)) return
    if (result) history.value = result
    else error.value = 'load'
  }
  catch (cause) {
    if (isCurrent(request, memberId, projectId)) {
      const status = (cause as { status?: number })?.status
      error.value = cause instanceof TotalsRouteUnavailableError || cause instanceof IgnoredSessionsTotalsUnavailableError
        ? 'unavailable'
        : status === 404 ? 'not-found' : 'load'
    }
  }
  finally {
    if (isCurrent(request, memberId, projectId)) loading.value = false
  }
}

function tokens(row: Pick<TotalsRow, 'input' | 'output'>) {
  return formatTokens(row.input + row.output)
}

function costValue(row: Pick<TotalsRow, 'costKnownEntries' | 'costKnownSum' | 'costUnknownEntries'>) {
  if (row.costKnownEntries === 0 && row.costUnknownEntries > 0) return '—'
  if (row.costKnownEntries === 0) return '—'
  return formatCost(row.costKnownSum)
}

function costQuality(row: Pick<TotalsRow, 'costKnownEntries' | 'costUnknownEntries' | 'costEstimatedEntries'>) {
  const notes: string[] = []
  if (row.costUnknownEntries > 0) notes.push(t('team.historyUnknownCost', { count: row.costUnknownEntries }))
  if (row.costEstimatedEntries > 0) notes.push(t('team.historyEstimatedCost', { count: row.costEstimatedEntries }))
  if (row.costKnownEntries > 0 && row.costUnknownEntries > 0) notes.unshift(t('team.historyKnownSubtotal'))
  return notes.join(' · ')
}

function toggleSession(session: MemberProjectHistorySession) {
  if (!session.identifiable) return
  const next = new Set(expandedSessions.value)
  if (next.has(session.groupKey)) {
    next.delete(session.groupKey)
    expandedSessions.value = next
    sessionTaskGenerations.set(session.groupKey, (sessionTaskGenerations.get(session.groupKey) ?? 0) + 1)
    if (taskStates.value[session.groupKey]?.loading) {
      taskStates.value = { ...taskStates.value, [session.groupKey]: undefined }
    }
    return
  }
  next.add(session.groupKey)
  expandedSessions.value = next
  if (!taskStates.value[session.groupKey]) void loadSessionTasks(session)
}

async function loadSessionTasks(session: MemberProjectHistorySession) {
  const request = generation
  const memberId = props.memberId
  const projectId = props.projectId
  const taskRequest = (sessionTaskGenerations.get(session.groupKey) ?? 0) + 1
  sessionTaskGenerations.set(session.groupKey, taskRequest)
  const isTaskCurrent = () => isCurrent(request, memberId, projectId)
    && sessionTaskGenerations.get(session.groupKey) === taskRequest
    && expandedSessions.value.has(session.groupKey)
  taskStates.value = { ...taskStates.value, [session.groupKey]: { loading: true, error: false, tasks: null } }
  try {
    const result = await loadMemberProjectSessionTasks(fetchTotals, memberId, projectId, session.groupKey,
      session, isTaskCurrent)
    if (!isTaskCurrent() || !result) return
    taskStates.value = { ...taskStates.value, [session.groupKey]: { loading: false, error: false, tasks: result } }
  }
  catch {
    if (isTaskCurrent()) taskStates.value = { ...taskStates.value, [session.groupKey]: { loading: false, error: true, tasks: null } }
  }
  finally {
    const state = taskStates.value[session.groupKey]
    if (isTaskCurrent() && state?.loading) {
      taskStates.value = { ...taskStates.value, [session.groupKey]: { ...state, loading: false } }
    }
  }
}

function retryTasks(session: MemberProjectHistorySession) {
  taskStates.value = { ...taskStates.value, [session.groupKey]: undefined }
  void loadSessionTasks(session)
}

function taskLabel(task: MemberProjectHistoryTask) {
  if (!task.groupKey) return t('team.historyUnassignedTask')
  return taskNames.value.get(task.groupKey) ?? t('team.historyUnknownTask', { id: task.groupKey })
}

function showMoreSessions() {
  sessionLimit.value = Math.min(sessionLimit.value + 20, chronologicalSessions.value.length)
}

watch([() => props.memberId, () => props.projectId, isOwner], () => { void load() })
onMounted(() => { void load() })
onBeforeUnmount(() => { generation++ })
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-6">
    <p v-if="!isOwner" role="alert">{{ t('team.ownerOnly') }}</p>
    <p v-else-if="loading" role="status">{{ t('common.loading') }}</p>
    <div v-else-if="error" role="alert" class="flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm">
      <span>{{ t(error === 'not-found' ? 'team.historyNotFound' : error === 'unavailable' ? 'team.historyUnavailable' : 'team.historyLoadFailed') }}</span>
      <Button v-if="error !== 'not-found'" variant="outline" size="sm" @click="load">{{ t('team.retry') }}</Button>
    </div>
    <template v-else-if="history && member && project && client">
      <header class="flex min-w-0 flex-wrap items-center gap-3">
        <Button as-child variant="ghost" size="icon" class="shrink-0">
          <NuxtLink :to="backTo" :aria-label="t('common.back')" :title="t('common.back')"><ArrowLeft aria-hidden="true" class="size-4" /></NuxtLink>
        </Button>
        <div class="min-w-0 flex-1">
          <h1 class="break-words text-xl font-semibold tracking-tight sm:text-2xl">{{ project.name }}</h1>
          <p class="mt-1 break-words text-sm text-muted-foreground">{{ client.name }} · {{ member.name }}</p>
        </div>
      </header>

      <div v-if="!history.complete" role="alert" class="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        {{ t('team.historyIncomplete') }}
      </div>
      <template v-else>
        <Card>
          <CardContent class="grid gap-4 pt-5 sm:grid-cols-3">
            <div><p class="text-xs text-muted-foreground">{{ t('team.historyFirstRecorded') }}</p><p class="mt-1 break-words text-sm font-medium">{{ history.firstActivity ? formatDateTime(history.firstActivity) : '—' }}</p></div>
            <div><p class="text-xs text-muted-foreground">{{ t('team.historyLastRecorded') }}</p><p class="mt-1 break-words text-sm font-medium">{{ history.lastActivity ? formatDateTime(history.lastActivity) : '—' }}</p></div>
            <div><p class="text-xs text-muted-foreground">{{ t('team.historyActiveDays') }}</p><p class="mt-1 text-sm font-medium tabular-nums">{{ history.activeDays?.length ?? 0 }}</p></div>
          </CardContent>
        </Card>
        <p class="-mt-3 text-xs text-muted-foreground">{{ t('team.historyAttributionNote') }}</p>

        <section class="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" :aria-label="t('team.memberWork')">
          <KpiCard :title="t('team.memberTotalMinutes')" :value="formatDuration(history.total.workMs)" />
          <KpiCard :title="t('team.workSessions')" :value="String(history.total.distinctSessions)" />
          <KpiCard :title="t('team.historyDistinctTasks')" :value="history.distinctTasks === null ? '—' : String(history.distinctTasks)" />
          <KpiCard :title="t('team.memberTotalCost')" :value="costValue(history.total)">
            <span class="text-muted-foreground">{{ costQuality(history.total) }}</span>
          </KpiCard>
        </section>

        <Card data-testid="member-project-history-chart">
          <CardHeader class="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle class="text-base">{{ t('team.historyChartTitle') }}</CardTitle>
            <div role="group" :aria-label="t('team.historyChartLabel')" class="control-group flex max-w-full gap-1 bg-muted">
              <Button type="button" size="segment" :variant="chartMetric === 'time' ? 'secondary' : 'ghost'" :aria-pressed="chartMetric === 'time'" @click="chartMetric = 'time'">{{ t('team.historyChartTime') }}</Button>
              <Button type="button" size="segment" :variant="chartMetric === 'cost' ? 'secondary' : 'ghost'" :aria-pressed="chartMetric === 'cost'" @click="chartMetric = 'cost'">{{ t('team.historyChartCost') }}</Button>
            </div>
          </CardHeader>
          <CardContent class="space-y-3">
            <p v-if="chartMetric === 'cost' && history.total.costUnknownEntries" class="text-xs text-muted-foreground">{{ t('team.historyChartUnknownCost', { count: history.total.costUnknownEntries }) }}</p>
            <p v-if="chartMetric === 'cost' && history.total.costEstimatedEntries" class="text-xs text-muted-foreground">{{ t('team.historyEstimatedCost', { count: history.total.costEstimatedEntries }) }}</p>
            <StackedBarChart
              v-if="chartPoints.length"
              :points="chartPoints"
              :series-keys="['history']"
              :series-labels="{ history: chartLabel }"
              :format-value="chartMetric === 'time' ? formatDuration : formatCost"
              :tick-unit="chartMetric === 'time' ? 3_600_000 : 1"
            />
            <p v-else class="py-8 text-center text-sm text-muted-foreground">{{ t('team.historyNoActivity') }}</p>
          </CardContent>
        </Card>

        <section class="space-y-4" aria-labelledby="member-project-history-sessions">
          <div class="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 id="member-project-history-sessions" class="text-lg font-semibold">{{ t('team.historySessionsTitle') }}</h2>
              <p class="text-xs text-muted-foreground">{{ t('team.historySessionScope') }}</p>
            </div>
            <span class="text-xs text-muted-foreground">{{ t('team.historySessionCount', { count: history.sessions.length }) }}</span>
          </div>
          <p v-if="!history.sessions.length" class="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{{ t('team.historyNoActivity') }}</p>
          <div v-else class="space-y-3">
            <Card v-for="session in visibleSessions" :key="session.groupKey || 'unidentified'" class="min-w-0">
              <CardHeader class="flex flex-row items-start justify-between gap-3">
                <div class="min-w-0">
                  <CardTitle class="break-words text-sm">{{ session.sessionName || t('team.workUnknownSession') }} <span v-if="session.ignoredSession" class="ml-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-normal text-muted-foreground">{{ t('team.historyIgnoredSession') }}</span></CardTitle>
                  <p class="mt-1 text-xs text-muted-foreground">{{ formatDateTime(session.minStartedAt) }} – {{ formatDateTime(session.maxEndedAt) }}</p>
                </div>
                <Button v-if="session.identifiable" variant="outline" size="sm" class="shrink-0" :aria-expanded="expandedSessions.has(session.groupKey)" @click="toggleSession(session)">
                  <component :is="expandedSessions.has(session.groupKey) ? ChevronDown : ChevronRight" aria-hidden="true" class="size-4" />
                  {{ t('team.historyTasks') }}
                </Button>
                <span v-else class="max-w-40 text-right text-xs text-muted-foreground">{{ t('team.historyUnidentifiedSession') }}</span>
              </CardHeader>
              <CardContent class="grid grid-cols-2 gap-3 border-t pt-3 text-sm sm:grid-cols-4">
                <div><p class="text-xs text-muted-foreground">{{ t('team.memberTotalMinutes') }}</p><p class="mt-1 font-medium tabular-nums">{{ formatDuration(session.workMs) }}</p></div>
                <div><p class="text-xs text-muted-foreground">{{ t('team.historyTokens') }}</p><p class="mt-1 font-medium tabular-nums">{{ tokens(session) }}</p></div>
                <div><p class="text-xs text-muted-foreground">{{ t('team.memberTotalCost') }}</p><p class="mt-1 font-medium tabular-nums">{{ costValue(session) }}</p><p v-if="costQuality(session)" class="text-xs text-muted-foreground">{{ costQuality(session) }}</p></div>
                <div><p class="text-xs text-muted-foreground">{{ t('team.historyDistinctTasks') }}</p><p class="mt-1 font-medium tabular-nums">{{ session.distinctTask }}</p></div>
              </CardContent>
              <div v-if="expandedSessions.has(session.groupKey)" class="border-t px-4 py-3">
                <p v-if="taskStates[session.groupKey]?.loading" role="status" class="text-sm text-muted-foreground">{{ t('common.loading') }}</p>
                <div v-else-if="taskStates[session.groupKey]?.error" role="alert" class="flex flex-wrap items-center gap-2 text-sm">
                  <span>{{ t('team.historyTasksFailed') }}</span><Button variant="outline" size="sm" @click="retryTasks(session)">{{ t('team.retry') }}</Button>
                </div>
                <p v-else-if="taskStates[session.groupKey]?.tasks?.length === 0" class="text-sm text-muted-foreground">{{ t('team.historyNoTasks') }}</p>
                <ul v-else-if="taskStates[session.groupKey]?.tasks" class="divide-y">
                  <li v-for="task in taskStates[session.groupKey]!.tasks" :key="task.groupKey || 'unassigned'" class="grid min-w-0 gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div class="min-w-0"><p class="break-words font-medium">{{ taskLabel(task) }}</p><p class="text-xs text-muted-foreground">{{ tokens(task) }} · {{ costValue(task) }}<span v-if="costQuality(task)"> · {{ costQuality(task) }}</span></p></div>
                    <p class="font-medium tabular-nums">{{ formatDuration(task.workMs) }}</p>
                  </li>
                </ul>
              </div>
            </Card>
            <Button v-if="sessionLimit < history.sessions.length" variant="outline" class="w-full" @click="showMoreSessions">{{ t('team.historyShowMore', { count: Math.min(20, history.sessions.length - sessionLimit) }) }}</Button>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
