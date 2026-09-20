<script setup lang="ts">
import { History, Keyboard, Pencil, Plus, Trash2 } from '@lucide/vue'
import EmptyState from '@/components/common/EmptyState.vue'
import RowActions from '@/components/common/RowActions.vue'
import TaskDetailSheet from '@/components/tasks/TaskDetailSheet.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { groupByKey } from '@/lib/aggregate'
import type { TaskRecord, TaskStatus } from '@/lib/pocketbase-types'
import type { SessionSummary } from '@/lib/session-aggregate'

const { t } = useI18n()
useHead({ title: computed(() => t('tasks.title')) })
const { formatCost, formatDuration } = useFormatters()

const { projects, ensureLoaded: ensureProjects } = useProjects()
const { tasks, loading, ensureLoaded, create, update, remove, moveStatus } = useTasks()
const { fetchAll } = useTaskEntries()
const { fetchSessionsForTask } = useSessions()
const toast = useToast()

const filterProject = ref('')
const view = ref<'board' | 'list'>('board')
const totalsByTask = ref<Record<string, { cost: number, workMs: number }>>({})
/** Distinct session count per task, for the board card's session chip
 * (Task 2). Perf choice: derived from the same `fetchAll()` call the
 * board already makes for `totalsByTask` — one grouping pass over
 * already-fetched entries, not a second network round-trip and not a
 * per-card `fetchSessionsForTask` call (that composable is reserved for
 * the detail sheet, opened lazily per task). */
const sessionCountByTask = ref<Record<string, number>>({})

onMounted(async () => {
  await Promise.all([ensureProjects(), ensureLoaded()])
  const entries = await fetchAll()
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
})

function projectName(id: string) {
  return projects.value.find(p => p.id === id)?.name ?? id
}

const filtered = computed(() => filterProject.value ? tasks.value.filter(t2 => t2.project === filterProject.value) : tasks.value)

const statuses: TaskStatus[] = ['open', 'doing', 'done']
function byStatus(status: TaskStatus) {
  return filtered.value.filter(t2 => t2.status === status)
}

// Drag-and-drop between board columns. Native HTML5 DnD — no extra
// dependency. Native HTML5 DnD does not work with touch or keyboard, so
// two additional paths reach the same `moveStatus()` call: the status
// control inside TaskDetailSheet.vue (below), and the keyboard shortcuts
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
  if (!id) return
  const task = tasks.value.find(t2 => t2.id === id)
  if (!task || task.status === status) return
  try {
    await moveStatus(id, status)
  }
  catch {
    toast.error(t('common.error'))
  }
}

// Detail sheet — a board card's click/Enter/Space opens this (view-only:
// title, project, status, sessions) instead of jumping straight into the
// edit dialog. The sheet's own "Edit" button routes back to the existing
// edit dialog via openEdit, so editing still works exactly as before.
//
// `detailTask` is derived from `tasks.value` by id (not a snapshot
// reference captured at open time) so that a status change made through
// ANY path — drag-and-drop, the sheet's own status control, or a
// keyboard shortcut on the board — reflects immediately in the open
// sheet too. All three paths write through the same `moveStatus()`, one
// shared reactive `tasks` state, never two parallel sources of truth.
const detailOpen = ref(false)
const detailTaskId = ref<string | null>(null)
const detailTask = computed(() => detailTaskId.value ? (tasks.value.find(t2 => t2.id === detailTaskId.value) ?? null) : null)
const detailSessions = ref<SessionSummary[]>([])
const detailSessionsLoading = ref(false)

async function openDetail(task: TaskRecord) {
  detailTaskId.value = task.id
  detailOpen.value = true
  detailSessionsLoading.value = true
  try {
    detailSessions.value = await fetchSessionsForTask(task.id)
  }
  finally {
    detailSessionsLoading.value = false
  }
}

function onDetailEdit() {
  const task = detailTask.value
  if (!task) return
  detailOpen.value = false
  openEdit(task)
}

async function onDetailStatusChange(status: TaskStatus) {
  const task = detailTask.value
  if (!task) return
  try {
    await moveStatus(task.id, status)
  }
  catch {
    toast.error(t('common.error'))
  }
}

// Same auto-focus override as entries/index.vue's EntryDetailSheet: the
// sheet's default initial-focus target is its first focusable element
// (the "Edit" button) — send it to the title instead.
const detailSheet = ref<InstanceType<typeof TaskDetailSheet> | null>(null)
function onDetailOpenAutoFocus(event: Event) {
  event.preventDefault()
  nextTick(() => detailSheet.value?.focusTitle())
}

// Keyboard shortcuts on a focused board card (the touch/keyboard-only
// counterpart to drag-and-drop, alongside the sheet's status control
// above): Enter/Space opens the same detail sheet a click would;
// ArrowLeft/ArrowRight (aliased to `[`/`]`) move the card to the
// previous/next status column through the same `moveStatus()`, clamped
// at the open/done ends (no-op, never wraps). Focus is restored to the
// moved card's element in its new column after the reactive re-render.
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
    await moveStatus(task.id, status)
    liveMessage.value = t('tasks.statusMovedAnnouncement', { title: task.title, status: t(`tasks.status.${status}`) })
  }
  catch {
    toast.error(t('common.error'))
    return
  }
  await nextTick()
  cardEls.get(task.id)?.focus()
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
  form.project = filterProject.value || projects.value[0]?.id || ''
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
    }
    else {
      await create({ ...form })
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
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t('tasks.title') }}
        </h1>
        <div class="flex items-center gap-2">
          <Select
            v-model="filterProject" class="w-48" :placeholder="t('projects.filterByClient')"
            :options="[{ value: '', label: t('common.all') }, ...projects.map(p => ({ value: p.id, label: p.name }))]"
          />
          <Tabs v-model="view">
            <TabsList>
              <TabsTrigger value="board">
                {{ t('tasks.board') }}
              </TabsTrigger>
              <TabsTrigger value="list">
                {{ t('tasks.list') }}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Tooltip v-if="view === 'board'">
            <TooltipTrigger as-child>
              <Button size="icon" variant="outline" :aria-label="t('tasks.keyboardHint.label')">
                <Keyboard class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {{ t('tasks.keyboardHint.text') }}
            </TooltipContent>
          </Tooltip>
          <Button size="sm" @click="openCreate">
            <Plus class="size-4" />
            {{ t('tasks.new') }}
          </Button>
        </div>
      </div>

      <div aria-live="polite" class="sr-only">
        {{ liveMessage }}
      </div>

      <div v-if="view === 'board'" class="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div
          v-for="status in statuses" :key="status" class="flex flex-col gap-2 rounded-lg p-1 transition-colors"
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
              draggable="true"
              class="cursor-grab gap-0 py-0 touch-none outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
              :class="draggingTaskId === task.id ? 'opacity-50' : ''"
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

      <Card v-else>
        <CardContent class="p-0">
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
                  {{ t('tasks.time') }}
                </th>
                <th class="p-3 text-right">
                  {{ t('tasks.cost') }}
                </th>
                <th class="p-3 text-right">
                  {{ t('common.actions') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="task in filtered" :key="task.id" class="border-b border-border">
                <td class="p-3 font-medium">
                  {{ task.title }}
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
                    :actions="[
                      { icon: Pencil, label: t('common.edit'), onClick: () => openEdit(task) },
                      { icon: Trash2, label: t('common.delete'), onClick: () => onDelete(task), destructive: true },
                    ]"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-if="!loading && filtered.length === 0" :title="t('tasks.empty')" class="m-4" />
        </CardContent>
      </Card>

      <Sheet v-model:open="detailOpen">
        <SheetContent side="right" class="flex w-full max-w-md flex-col sm:w-[28rem]" @open-auto-focus="onDetailOpenAutoFocus">
          <TaskDetailSheet
            v-if="detailTask"
            ref="detailSheet"
            :task="detailTask"
            :project-name="projectName(detailTask.project)"
            :sessions="detailSessions"
            :sessions-loading="detailSessionsLoading"
            @edit="onDetailEdit"
            @status-change="onDetailStatusChange"
          />
        </SheetContent>
      </Sheet>

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
              <Select v-model="form.project" :options="projects.map(p => ({ value: p.id, label: p.name }))" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>{{ t('common.status') }}</Label>
              <Select v-model="form.status" :options="statuses.map(s => ({ value: s, label: t(`tasks.status.${s}`) }))" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="t-ref">{{ t('common.externalRef') }}</Label>
              <Input id="t-ref" v-model="form.external_ref" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="t-desc">{{ t('common.description') }}</Label>
              <Textarea id="t-desc" v-model="form.description" />
            </div>
            <DialogFooter class="justify-between sm:justify-between">
              <Button v-if="editing" type="button" variant="ghost" class="text-destructive" @click="onDelete(editing); dialogOpen = false">
                <Trash2 class="size-4" />
                {{ t('common.delete') }}
              </Button>
              <Button type="submit">
                {{ t('common.save') }}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </TooltipProvider>
</template>
