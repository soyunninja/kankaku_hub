<script setup lang="ts">
import { ArrowRight, Plus, Trash2 } from '@lucide/vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { groupByKey } from '@/lib/aggregate'
import type { TaskRecord, TaskStatus } from '@/lib/pocketbase-types'

const { t } = useI18n()
useHead({ title: computed(() => t('tasks.title')) })
const { formatCost, formatDuration } = useFormatters()

const { projects, ensureLoaded: ensureProjects } = useProjects()
const { tasks, loading, ensureLoaded, create, update, remove, setStatus, moveStatus } = useTasks()
const { fetchAll } = useTaskEntries()
const toast = useToast()

const filterProject = ref('')
const view = ref<'board' | 'list'>('board')
const totalsByTask = ref<Record<string, { cost: number, workMs: number }>>({})

onMounted(async () => {
  await Promise.all([ensureProjects(), ensureLoaded()])
  const entries = await fetchAll()
  const grouped = groupByKey(entries.filter(e => e.task), e => e.task!)
  totalsByTask.value = Object.fromEntries(grouped.map(g => [g.key, { cost: g.cost, workMs: g.workMs }]))
})

function projectName(id: string) {
  return projects.value.find(p => p.id === id)?.name ?? id
}

const filtered = computed(() => filterProject.value ? tasks.value.filter(t2 => t2.project === filterProject.value) : tasks.value)

const statuses: TaskStatus[] = ['open', 'doing', 'done']
function byStatus(status: TaskStatus) {
  return filtered.value.filter(t2 => t2.status === status)
}

async function advance(task: TaskRecord) {
  const idx = statuses.indexOf(task.status)
  if (idx < statuses.length - 1) await setStatus(task.id, statuses[idx + 1]!)
}

// Drag-and-drop between board columns. Native HTML5 DnD — no extra
// dependency. The "Mover a: <next status>" button above stays as the
// pointer- and keyboard-accessible alternative for anyone who can't (or
// doesn't want to) drag.
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
        <Button size="sm" @click="openCreate">
          <Plus class="size-4" />
          {{ t('tasks.new') }}
        </Button>
      </div>
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
            draggable="true"
            class="cursor-grab gap-0 py-0 touch-none active:cursor-grabbing"
            :class="draggingTaskId === task.id ? 'opacity-50' : ''"
            role="button"
            tabindex="0"
            :aria-label="`${task.title} — ${t(`tasks.status.${status}`)}`"
            @click="openEdit(task)"
            @keydown.enter="openEdit(task)"
            @dragstart="onDragStart(task, $event)"
            @dragend="onDragEnd"
          >
            <CardContent class="flex flex-col gap-2 p-3">
              <p class="text-sm font-medium">
                {{ task.title }}
              </p>
              <p class="text-xs text-muted-foreground">
                {{ projectName(task.project) }}
              </p>
              <div class="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                <span>{{ formatDuration(totalsByTask[task.id]?.workMs ?? 0) }}</span>
                <span>{{ formatCost(totalsByTask[task.id]?.cost ?? 0) }}</span>
              </div>
              <Button v-if="status !== 'done'" size="sm" variant="outline" class="self-start" @click.stop="advance(task)">
                {{ t('tasks.moveTo') }}: {{ t(`tasks.status.${statuses[statuses.indexOf(status) + 1]}`) }}
                <ArrowRight class="size-3.5" />
              </Button>
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
                <div class="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" @click="openEdit(task)">
                    {{ t('common.edit') }}
                  </Button>
                  <Button variant="ghost" size="icon" @click="onDelete(task)">
                    <Trash2 class="size-4" />
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <EmptyState v-if="!loading && filtered.length === 0" :title="t('tasks.empty')" class="m-4" />
      </CardContent>
    </Card>

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
</template>
