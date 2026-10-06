<script setup lang="ts">
import { Columns3, History, List, Pencil, Plus, Trash2 } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import RowActions from '@/components/common/RowActions.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TooltipProvider } from '@/components/ui/tooltip'
import { groupByKey } from '@/lib/aggregate'
import { listCompletedTasks } from '@/lib/task-history'
import { loadTaskTotalsPages } from '@/lib/task-totals-pages'
import { taskDetailRoute } from '@/lib/task-detail-route'
import type { ListResult } from 'pocketbase'
import { resolvePreset } from '@/lib/period'
import type { TaskRecord, TaskStatus } from '@/lib/pocketbase-types'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'

const props = defineProps<{ embedded?: boolean }>()
const { t } = useI18n()
if (!props.embedded) useHead({ title: computed(() => t('tasks.title')) })
const { formatCost, formatDuration } = useFormatters()

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { tasks, loading, ensureLoaded, create, update, remove, moveStatus } = useTasks()
const { fetchRange } = useTaskEntries()
const { fetchTotals } = useTotals()
const toast = useToast()
const { canWrite } = useAuth()
const { $pb } = useNuxtApp()

const filterClient = ref('')
const filterProject = ref('')
const availableProjects = computed(() => filterClient.value
  ? projects.value.filter(p => p.client === filterClient.value)
  : projects.value)

function clientById(id: string) {
  return clients.value.find(c => c.id === id)
}

function selectClient(clientId: string) {
  if (clientId && filterProject.value && !projects.value.some(p => p.id === filterProject.value && p.client === clientId)) {
    filterProject.value = ''
  }
  filterClient.value = clientId
}
const view = ref<'board' | 'list' | 'history'>('board')
const historySearch = ref('')
const historyPage = ref(1)
const historyResult = ref<ListResult<TaskRecord> | null>(null)
const historyLoading = ref(false)
const historyError = ref(false)
const historyControl = ref<InstanceType<typeof Button> | null>(null)
let historyRequest = 0

async function loadHistory() {
  const request = ++historyRequest
  historyLoading.value = true
  historyError.value = false
  historyResult.value = null
  try {
    const result = await listCompletedTasks($pb, historyPage.value, historySearch.value, filterProject.value, filterClient.value)
    if (request === historyRequest) historyResult.value = result
  }
  catch {
    if (request === historyRequest) historyError.value = true
  }
  finally {
    if (request === historyRequest) historyLoading.value = false
  }
}

watch([historySearch, filterProject, filterClient], () => { historyPage.value = 1 }, { flush: 'sync' })
watch([view, historyPage, historySearch, filterProject, filterClient], () => {
  // Invalidate even when leaving history, so a late response cannot replace a newer page.
  if (view.value === 'history') void loadHistory()
  else ++historyRequest
}, { flush: 'sync' })

async function refreshHistory() {
  if (view.value !== 'history') return
  if (historyPage.value !== 1) historyPage.value = 1 // the last item on a page may have moved or been deleted
  else await loadHistory()
}

async function changeStatus(id: string, status: TaskStatus) {
  await moveStatus(id, status)
  await refreshHistory()
}
const totalsByTask = ref<Record<string, { cost: number, workMs: number }>>({})
/** Distinct session count per task, for the board card's session chip
 * (Task 2). */
const sessionCountByTask = ref<Record<string, number>>({})
/** True when `loadTaskTotals`'s fallback (`fetchRange`, see below) was
 * capped before covering the full all-time range — surfaces
 * `totals.fallbackTruncated`, same pattern as clients/index.vue and
 * projects/index.vue. */
const taskTotalsFallbackTruncated = ref(false)
const taskTotalsFallbackEntryCount = ref(0)

/** Deliberately-wide lower bound for the `loadTaskTotals` fallback's
 * "all-time per-task" scan: there is no dedicated all-time preset in
 * `lib/period.ts` (confirmed: no `ALL_TIME`/`allTime` constant anywhere
 * in this codebase), so this fixes a date far enough in the past that no
 * real kankaku row can predate it, paired with `resolvePreset('today').end`
 * as the upper bound. The scan itself still can't become unbounded from
 * this: `fetchRange` caps at `FALLBACK_SCAN_CAP` (2000 rows via
 * `getList`, sorted `-started_at`) regardless of how wide the requested
 * range is — widening the range only risks the *oldest* rows within it
 * being the ones `truncated` drops, which is exactly what
 * `taskTotalsFallbackTruncated` surfaces to the owner below. */
const FALLBACK_ALL_TIME_START = '2000-01-01'

/**
 * All-time per-task totals: the worst offender this feature replaces —
 * previously an unbounded `fetchAll()` (no date filter, grows with every
 * prompt the owner ever runs) followed by a client-side `groupByKey`
 * pass. Now a single `group_by: 'task'` call, server-summed — see
 * docs/architecture/aggregation.md "the server sums; the browser
 * displays" and docs/adr/0027-totals-computed-server-side.md.
 *
 * Falls back to a bounded `fetchRange()`+groupByKey path (see
 * `FALLBACK_ALL_TIME_START` above — `fetchAll()`'s old unbounded
 * `getFullList` scan has been removed) when the totals route isn't
 * loaded yet (owner hasn't restarted PocketBase since this feature
 * shipped) — no error toast, silently uses the previous behavior.
 */
async function loadTaskTotals() {
  try {
    // The helper fetches every group page before returning either map.
    // A failed later page cannot publish partial task totals.
    const { byTask, sessionsByTask } = await loadTaskTotalsPages(fetchTotals)
    totalsByTask.value = byTask
    sessionCountByTask.value = sessionsByTask
  }
  catch (err) {
    if (!(err instanceof TotalsRouteUnavailableError)) throw err
    const range = { start: FALLBACK_ALL_TIME_START, end: resolvePreset('today').end }
    const { entries, truncated } = await fetchRange(range)
    taskTotalsFallbackTruncated.value = truncated
    taskTotalsFallbackEntryCount.value = entries.length
    const grouped = groupByKey(entries.filter(e => e.task), e => e.task!)
    totalsByTask.value = Object.fromEntries(grouped.map(g => [g.key, { cost: g.cost, workMs: g.workMs }]))

    const sessionsByTask = new Map<string, Set<string>>()
    for (const e of entries) {
      if (!e.task || !e.session_id) continue
      const set = sessionsByTask.get(e.task) ?? new Set<string>()
      set.add(e.session_id)
      sessionsByTask.set(e.task, set)
    }
    sessionCountByTask.value = Object.fromEntries([...sessionsByTask].map(([taskId, ids]) => [taskId, ids.size]))
  }
}

onMounted(async () => {
  await Promise.all([ensureClients(), ensureProjects(), ensureLoaded()])
  await loadTaskTotals()
})

function projectName(id: string) {
  return projects.value.find(p => p.id === id)?.name ?? id
}

const filtered = computed(() => tasks.value.filter(t2 => t2.status !== 'done'
  && (!filterProject.value || t2.project === filterProject.value)
  && (!filterClient.value || projects.value.some(p => p.id === t2.project && p.client === filterClient.value))))
const displayedTasks = computed(() => view.value === 'history' ? (historyResult.value?.items ?? []) : filtered.value)

const statuses: TaskStatus[] = ['open', 'doing', 'done']
const activeStatuses: TaskStatus[] = ['open', 'doing']
function byStatus(status: TaskStatus) {
  return filtered.value.filter(t2 => t2.status === status)
}

// Drag-and-drop between board columns. Native HTML5 DnD — no extra
// dependency. Native HTML5 DnD does not work with touch or keyboard, so
// two additional paths reach the same `moveStatus()` call: the status
// control on the canonical task detail page, and the keyboard shortcuts
// on a focused card (also below) — see docs/specs/web-tasks.md
// `TASKS-REQ-011`/`TASKS-REQ-012`.
const draggingTaskId = ref<string | null>(null)
const dragOverStatus = ref<TaskStatus | null>(null)

function onDragStart(task: TaskRecord, event: DragEvent) {
  draggingTaskId.value = task.id
  event.dataTransfer?.setData('text/plain', task.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragEnd() {
  draggingTaskId.value = null
  dragOverStatus.value = null
}

function onColumnDragOver(status: TaskStatus, event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverStatus.value = status
}

function onColumnDragLeave(status: TaskStatus) {
  if (dragOverStatus.value === status) dragOverStatus.value = null
}

async function onColumnDrop(status: TaskStatus, event: DragEvent) {
  event.preventDefault()
  const id = event.dataTransfer?.getData('text/plain') || draggingTaskId.value
  draggingTaskId.value = null
  dragOverStatus.value = null
  if (!canWrite.value) return
  if (!id) return
  const task = tasks.value.find(t2 => t2.id === id)
  if (!task || task.status === status) return
  try {
    await changeStatus(id, status)
  }
  catch {
    toast.error(t('common.error'))
  }
}

// Cards and keyboard activation share the canonical full-page detail.
function openDetail(task: TaskRecord) {
  return navigateTo(taskDetailRoute(task, projects.value))
}

// Keyboard shortcuts on a focused board card (the touch/keyboard-only
// counterpart to drag-and-drop, alongside the detail page status control):
// Enter/Space opens the same canonical detail page a click would;
// ArrowLeft/ArrowRight (aliased to `[`/`]`) move the card to the
// previous/next status column through the same `moveStatus()`, clamped
// at the open/done ends (no-op, never wraps). Focus is restored to the
// moved card's element in its new column, or the history control when completed.
const cardEls = new Map<string, HTMLElement>()
function setCardEl(taskId: string, el: unknown) {
  if (!el) {
    cardEls.delete(taskId)
    return
  }
  const node = (el as { $el?: HTMLElement }).$el ?? (el as HTMLElement)
  cardEls.set(taskId, node)
}

const liveMessage = ref('')

async function moveFocusedTask(task: TaskRecord, status: TaskStatus) {
  try {
    await changeStatus(task.id, status)
    liveMessage.value = t('tasks.statusMovedAnnouncement', { title: task.title, status: t(`tasks.status.${status}`) })
  }
  catch {
    toast.error(t('common.error'))
    return
  }
  await nextTick()
  if (status === 'done') historyControl.value?.$el?.focus()
  else cardEls.get(task.id)?.focus()
}

function onCardKeydown(task: TaskRecord, status: TaskStatus, event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault()
    openDetail(task)
    return
  }

  const isPrev = event.key === 'ArrowLeft' || event.key === '['
  const isNext = event.key === 'ArrowRight' || event.key === ']'
  if (!isPrev && !isNext) return
  if (!canWrite.value) return

  event.preventDefault()
  const idx = statuses.indexOf(status)
  const targetIdx = isPrev ? idx - 1 : idx + 1
  if (targetIdx < 0 || targetIdx >= statuses.length) return // clamped at open/done — no-op, never wraps
  moveFocusedTask(task, statuses[targetIdx]!)
}

const dialogOpen = ref(false)
const editing = ref<TaskRecord | null>(null)
const form = reactive({ title: '', project: '', status: 'open' as TaskStatus, external_ref: '', description: '' })

function openCreate() {
  editing.value = null
  form.title = ''
  form.project = filterProject.value || availableProjects.value[0]?.id || ''
  form.status = 'open'
  form.external_ref = ''
  form.description = ''
  dialogOpen.value = true
}
function openEdit(task: TaskRecord) {
  editing.value = task
  form.title = task.title
  form.project = task.project
  form.status = task.status
  form.external_ref = task.external_ref
  form.description = task.description
  dialogOpen.value = true
}

async function onSubmit() {
  try {
    if (editing.value) {
      await update(editing.value.id, { ...form })
      await refreshHistory()
    }
    else {
      await create({ ...form })
      await refreshHistory()
    }
    toast.success(t('common.saved'))
    dialogOpen.value = false
  }
  catch {
    toast.error(t('common.error'))
  }
}

async function onDelete(task: TaskRecord) {
  try {
    await remove(task.id)
    await refreshHistory()
    toast.success(t('common.saved'))
  }
  catch {
    toast.error(t('common.error'))
  }
}
</script>

<template>
  <TooltipProvider>
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 v-if="!props.embedded" class="text-xl font-semibold tracking-tight">
          {{ t('tasks.title') }}
        </h1>
        <div data-testid="tasks-toolbar" class="flex min-w-0 flex-wrap items-end gap-2" :class="props.embedded ? 'w-full' : 'w-full xl:w-auto'">
          <div class="flex flex-col gap-1" :class="props.embedded ? 'min-w-0 w-full sm:flex-1' : ''">
            <Label for="tasks-filter-client" class="text-xs leading-normal font-normal text-muted-foreground">{{ t('common.client') }}</Label>
            <Select
              id="tasks-filter-client" :model-value="filterClient" class="min-w-0 max-w-full border-0 bg-muted dark:bg-muted" :class="props.embedded ? 'w-full' : 'w-48'" :aria-label="t('common.client')" :placeholder="t('common.client')"
              :options="[{ value: '', label: t('common.all') }, ...clients.map(c => ({ value: c.id, label: c.name }))]"
              @update:model-value="selectClient"
            >
              <template #option="{ option }">
                <span class="flex min-w-0 items-center gap-2">
                  <ClientAvatar v-if="option.value && clientById(option.value)" :client="clientById(option.value)!" size="xs" aria-hidden="true" />
                  <span class="truncate">{{ option.label }}</span>
                </span>
              </template>
              <template #selected="{ option, label }">
                <span class="flex min-w-0 items-center gap-2">
                  <ClientAvatar v-if="option?.value && clientById(option.value)" :client="clientById(option.value)!" size="xs" aria-hidden="true" />
                  <span class="truncate">{{ label }}</span>
                </span>
              </template>
            </Select>
          </div>
          <div class="flex flex-col gap-1" :class="props.embedded ? 'min-w-0 w-full sm:flex-1' : ''">
            <Label for="tasks-filter-project" class="text-xs leading-normal font-normal text-muted-foreground">{{ t('common.project') }}</Label>
            <Select
              id="tasks-filter-project" v-model="filterProject" class="min-w-0 max-w-full border-0 bg-muted dark:bg-muted" :class="props.embedded ? 'w-full' : 'w-48'" :aria-label="t('common.project')" :placeholder="t('common.project')"
              :options="[{ value: '', label: t('common.all') }, ...availableProjects.map(p => ({ value: p.id, label: p.name }))]"
            />
          </div>
          <div role="group" :aria-label="t('tasks.viewLabel')" class="control-group flex shrink-0 gap-1 self-start bg-muted sm:self-auto">
            <Button size="segment" :variant="view === 'board' ? 'secondary' : 'ghost'" :aria-pressed="view === 'board'" @click="view = 'board'">
              <Columns3 class="size-4" aria-hidden="true" />{{ t('tasks.board') }}
            </Button>
            <Button size="segment" :variant="view === 'list' ? 'secondary' : 'ghost'" :aria-pressed="view === 'list'" @click="view = 'list'">
              <List class="size-4" aria-hidden="true" />{{ t('tasks.list') }}
            </Button>
          </div>
          <Button ref="historyControl" variant="toolbar" :aria-pressed="view === 'history'" @click="view = view === 'history' ? 'board' : 'history'">
            {{ t('tasks.history.title') }}
          </Button>
          <Button v-if="canWrite" data-testid="write-action" size="sm" @click="openCreate">
            <Plus class="size-4" />
            {{ t('tasks.new') }}
          </Button>
        </div>
      </div>

      <div data-testid="task-status-announcer" aria-live="polite" class="sr-only">
        {{ liveMessage }}
      </div>

      <p v-if="taskTotalsFallbackTruncated" class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
        {{ t('totals.fallbackTruncated', { count: taskTotalsFallbackEntryCount }) }}
      </p>

      <div v-if="view === 'history'" class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <Label for="history-search">{{ t('tasks.history.search') }}</Label>
          <Input id="history-search" v-model="historySearch" class="max-w-sm" type="search" :placeholder="t('tasks.history.search')" />
        </div>
        <p v-if="historyLoading" role="status">{{ t('common.loading') }}</p>
        <div v-else-if="historyError" role="alert" class="flex items-center gap-2">
          {{ t('tasks.history.error') }}
          <Button variant="outline" @click="loadHistory">{{ t('tasks.history.retry') }}</Button>
        </div>
        <EmptyState v-else-if="historyResult && !historyResult.items.length" :title="t('tasks.history.empty')" />
      </div>

      <p v-if="view !== 'history' && loading" role="status">{{ t('common.loading') }}</p>
      <div v-if="view === 'board' && !loading" class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div
          v-for="status in activeStatuses" :key="status" class="flex flex-col gap-2 rounded-lg p-1 transition-colors"
          :class="dragOverStatus === status ? 'bg-accent/40 ring-2 ring-primary/40' : ''"
          @dragover="onColumnDragOver(status, $event)"
          @dragleave="onColumnDragLeave(status)"
          @drop="onColumnDrop(status, $event)"
        >
          <h2 class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {{ t(`tasks.status.${status}`) }}
            <Badge variant="outline">
              {{ byStatus(status).length }}
            </Badge>
          </h2>
          <div class="flex min-h-16 flex-col gap-2">
            <Card
              v-for="task in byStatus(status)" :key="task.id"
              :ref="(el) => setCardEl(task.id, el)"
              :draggable="canWrite"
              class="gap-0 py-0 touch-none outline-none focus-visible:ring-2 focus-visible:ring-focus-indicator"
              :class="[canWrite ? 'cursor-grab active:cursor-grabbing' : '', draggingTaskId === task.id ? 'opacity-50' : '']"
              role="button"
              tabindex="0"
              :aria-label="`${task.title} — ${t(`tasks.status.${status}`)}`"
              @click="openDetail(task)"
              @keydown="onCardKeydown(task, status, $event)"
              @dragstart="onDragStart(task, $event)"
              @dragend="onDragEnd"
            >
              <CardContent class="flex flex-col gap-2 p-3">
                <div class="flex items-start justify-between gap-2">
                  <p class="text-sm font-medium">
                    {{ task.title }}
                  </p>
                  <Badge
                    v-if="(sessionCountByTask[task.id] ?? 0) > 0"
                    variant="outline"
                    class="shrink-0 gap-1 px-1.5 text-[11px] font-normal text-muted-foreground"
                    :aria-label="t('tasks.detail.sessions.countAria', { count: sessionCountByTask[task.id] })"
                  >
                    <History class="size-3" aria-hidden="true" />
                    {{ sessionCountByTask[task.id] }}
                  </Badge>
                </div>
                <p class="text-xs text-muted-foreground">
                  {{ projectName(task.project) }}
                </p>
                <div class="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                  <span>{{ formatDuration(totalsByTask[task.id]?.workMs ?? 0) }}</span>
                  <span>{{ formatCost(totalsByTask[task.id]?.cost ?? 0) }}</span>
                </div>
              </CardContent>
            </Card>
            <EmptyState v-if="byStatus(status).length === 0" :title="t('tasks.empty')" />
          </div>
        </div>
      </div>

      <div v-if="view === 'board'" class="rounded-lg border border-dashed p-3 text-sm text-muted-foreground" :class="dragOverStatus === 'done' ? 'bg-accent/40 ring-2 ring-primary/40' : ''" @dragover="onColumnDragOver('done', $event)" @dragleave="onColumnDragLeave('done')" @drop="onColumnDrop('done', $event)">
        {{ t('tasks.history.dropToComplete') }}
      </div>

      <Card v-if="view === 'list' || (view === 'history' && !!historyResult?.items.length)">
        <CardContent>
          <div class="relative w-full overflow-auto">
          <table class="w-full text-sm">
            <thead class="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th class="p-3">
                  {{ t('common.name') }}
                </th>
                <th class="p-3">
                  {{ t('common.project') }}
                </th>
                <th class="p-3">
                  {{ t('common.status') }}
                </th>
                <th class="p-3 text-right">
                  <span :title="t('common.timeHint')">{{ t('tasks.time') }}</span>
                </th>
                <th class="p-3 text-right">
                  {{ t('tasks.cost') }}
                </th>
                <th class="p-3 text-right">
                  {{ canWrite ? t('common.actions') : '' }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in displayedTasks" :key="task.id" class="border-b border-border">
                <td class="p-3 font-medium">
                  <NuxtLink :to="taskDetailRoute(task, projects)" class="hover:underline">{{ task.title }}</NuxtLink>
                </td>
                <td class="p-3 text-muted-foreground">
                  {{ projectName(task.project) }}
                </td>
                <td class="p-3">
                  <Badge variant="outline">
                    {{ t(`tasks.status.${task.status}`) }}
                  </Badge>
                </td>
                <td class="p-3 text-right tabular-nums">
                  {{ formatDuration(totalsByTask[task.id]?.workMs ?? 0) }}
                </td>
                <td class="p-3 text-right tabular-nums">
                  {{ formatCost(totalsByTask[task.id]?.cost ?? 0) }}
                </td>
                <td class="p-3 text-right">
                  <RowActions
                    v-if="canWrite"
                    no-hover
                    data-testid="write-action"
                    :actions="[
                      { icon: Pencil, label: t('common.edit'), onClick: () => openEdit(task) },
                      { icon: Trash2, label: t('common.delete'), onClick: () => onDelete(task), destructive: true },
                    ]"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          </div>
          <EmptyState v-if="view === 'list' && !loading && filtered.length === 0" :title="t('tasks.empty')" class="m-4" />
        </CardContent>
      </Card>
      <div v-if="view === 'history' && historyResult && !historyLoading && !historyError && historyResult.totalItems > 0" class="flex items-center justify-end gap-3">
        <span>{{ t('tasks.history.page', { page: historyResult.page, pages: historyResult.totalPages }) }}</span>
        <Button variant="outline" :disabled="historyPage <= 1" @click="historyPage--">{{ t('tasks.history.previous') }}</Button>
        <Button variant="outline" :disabled="historyPage >= historyResult.totalPages" @click="historyPage++">{{ t('tasks.history.next') }}</Button>
      </div>

      <Dialog v-model:open="dialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{{ editing ? t('tasks.edit') : t('tasks.new') }}</DialogTitle>
          </DialogHeader>
          <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
            <div class="flex flex-col gap-1.5">
              <Label for="t-title">{{ t('common.name') }}</Label>
              <Input id="t-title" v-model="form.title" required />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>{{ t('common.project') }}</Label>
              <Select v-model="form.project" :aria-label="t('common.project')" :options="projects.map(p => ({ value: p.id, label: p.name }))" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>{{ t('common.status') }}</Label>
              <Select v-model="form.status" :aria-label="t('common.status')" :options="statuses.map(s => ({ value: s, label: t(`tasks.status.${s}`) }))" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="t-ref">{{ t('common.externalRef') }}</Label>
              <Input id="t-ref" v-model="form.external_ref" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="t-desc">{{ t('common.description') }}</Label>
              <Textarea id="t-desc" v-model="form.description" />
            </div>
            <DialogFooter v-if="canWrite" class="justify-between sm:justify-between">
              <Button v-if="editing" data-testid="write-action" type="button" variant="ghost" class="text-destructive" @click="onDelete(editing); dialogOpen = false">
                <Trash2 class="size-4" />
                {{ t('common.delete') }}
              </Button>
              <Button data-testid="write-action" type="submit">
                {{ t('common.save') }}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </TooltipProvider>
</template>
