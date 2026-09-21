<script setup lang="ts">
/**
 * "Sesiones sin tarea" queue (ADR 0024): every kankaku session whose
 * entries are all task-less, surfaced so the owner can explicitly
 * convert it into a new task, attach it to an existing one, or ignore
 * it. Same UX/code pattern as `pages/unassigned/index.vue` (grouped
 * rows -> here, one row per session; bulk-select; per-row and bulk
 * actions; progress + toast; optimistic removal with rollback on
 * failure) — see `docs/adr/0024-sessions-link-to-tasks-by-explicit-action.md`
 * and `docs/specs/web-unassigned-queue.md` for the pattern this mirrors.
 * kankaku/hub never links a session to a task on its own; every path
 * below is an explicit, confirmed owner action.
 */
import { Check, FilePlus2, Info, Link2, Loader2, MoreHorizontal, Search } from '@lucide/vue'
import AgentIcon from '@/components/agents/AgentIcon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { MIXED, type SessionSummary } from '@/lib/session-aggregate'

const { t } = useI18n()
useHead({ title: computed(() => t('sessionsQueue.title')) })
const { formatCost, formatDate, formatDuration } = useFormatters()

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { tasks, ensureLoaded: ensureTasks, refreshOne: refreshTask } = useTasks()
const { fetchUnassignedSessions } = useSessions()
const { convertToTask, attachToExisting, ignoreSession } = useSessionsQueue()
const { refresh: refreshQueueCount } = useSessionsQueueCount()
const toast = useToast()

const loading = ref(true)
const sessions = ref<SessionSummary[]>([])
const truncated = ref(false)
const selected = ref<Set<string>>(new Set())

async function load() {
  loading.value = true
  await Promise.all([ensureClients(), ensureProjects(), ensureTasks()])
  const result = await fetchUnassignedSessions()
  sessions.value = result.sessions
  truncated.value = result.truncated
  loading.value = false
}
onMounted(load)

function removeSessions(ids: string[]) {
  const idSet = new Set(ids)
  sessions.value = sessions.value.filter(s => !idSet.has(s.sessionId))
}

/** Re-inserts sessions a failed action optimistically removed, keeping the same most-recent-first order `groupBySession` produces. */
function restoreSessions(restored: SessionSummary[]) {
  if (restored.length === 0) return
  sessions.value = [...sessions.value, ...restored].sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1))
}

function sessionName(session: SessionSummary) {
  return session.sessionName || t('sessionsQueue.nameFallback')
}
function clientLabel(session: SessionSummary) {
  if (session.client === MIXED) return t('sessionsQueue.mixed')
  return session.client ? (clients.value.find(c => c.id === session.client)?.name ?? session.client) : '—'
}
function projectLabel(session: SessionSummary) {
  if (session.project === MIXED) return t('sessionsQueue.mixed')
  return session.project ? (projects.value.find(p => p.id === session.project)?.name ?? session.project) : '—'
}
/** Wall/waiting time no longer get their own always-visible columns (they fit poorly at 1280px) — this is their tooltip text on the Work time cell instead. */
/** Session elapsed span ("first activity to last activity") and waiting
 * time, shown as the Work time cell's tooltip. `elapsedMs`, not the old
 * summed `wallMs`, which overstates a session's wall time once its rows'
 * intervals can overlap — see app/lib/session-aggregate.ts. */
function elapsedWaitingTooltip(session: SessionSummary) {
  return t('sessionsQueue.elapsedWaitingTooltip', { elapsed: formatDuration(session.elapsedMs), waiting: formatDuration(session.waitingMs) })
}

// -- Selection --------------------------------------------------------
const selectedCount = computed(() => selected.value.size)
const allSelectedState = computed<boolean | 'indeterminate'>(() => {
  if (sessions.value.length === 0 || selectedCount.value === 0) return false
  return selectedCount.value === sessions.value.length ? true : 'indeterminate'
})
function toggleSession(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
  selected.value = new Set(selected.value)
}
function toggleSelectAll() {
  selected.value = selectedCount.value === sessions.value.length ? new Set() : new Set(sessions.value.map(s => s.sessionId))
}
function selectedSessions() {
  return sessions.value.filter(s => selected.value.has(s.sessionId))
}
function deselect(ids: string[]) {
  for (const id of ids) selected.value.delete(id)
  selected.value = new Set(selected.value)
}

// -- Convert to a new task (single session only — see task prompt: no ----
// meaningful bulk "convert", every session would need its own title) ----
const convertOpen = ref(false)
const convertSession = ref<SessionSummary | null>(null)
const convertForm = reactive({ title: '', project: '' })
const converting = ref(false)

function openConvert(session: SessionSummary) {
  convertSession.value = session
  convertForm.title = session.sessionName
  convertForm.project = session.project !== MIXED ? session.project : ''
  convertOpen.value = true
}

async function confirmConvert() {
  const session = convertSession.value
  if (!session || !convertForm.title.trim() || !convertForm.project) return
  converting.value = true
  try {
    const { task, updatedCount } = await convertToTask(session, { title: convertForm.title.trim(), project: convertForm.project })
    // The new task is created `open`, then `task_entries.task` is
    // batch-assigned to it — a write the `task-auto-doing` PocketBase
    // hook (TASKS-REQ-010) may react to server-side by flipping it to
    // `doing`, outside `useTasks`' own write path. Re-read this one task
    // so the board reflects that without a page reload.
    if (updatedCount > 0) await refreshTask(task.id)
    if (updatedCount >= session.entryIds.length) {
      removeSessions([session.sessionId])
      deselect([session.sessionId])
      toast.success(t('sessionsQueue.convertSuccess', { title: task.title }))
    }
    else {
      // Partial: the task exists, but not every entry moved — re-fetch
      // rather than guess at the session's now-mixed state client-side.
      toast.error(t('sessionsQueue.convertPartial', { title: task.title, succeeded: updatedCount, total: session.entryIds.length }))
      await load()
    }
    refreshQueueCount()
    convertOpen.value = false
  }
  catch {
    toast.error(t('common.error'))
  }
  finally {
    converting.value = false
  }
}

// -- Attach to an existing task (single session or the whole selection) --
const attachOpen = ref(false)
const attachSessions = ref<SessionSummary[]>([])
const attachQuery = ref('')
const attachSelectedTaskId = ref('')
const attaching = ref(false)
const attachProgressDone = ref(0)
const attachProgressTotal = ref(0)
const attachResult = ref<{ succeeded: number, failed: number } | null>(null)

function openAttach(targets: SessionSummary[]) {
  attachSessions.value = targets
  attachQuery.value = ''
  attachSelectedTaskId.value = ''
  attachResult.value = null
  attachProgressDone.value = 0
  attachProgressTotal.value = targets.reduce((sum, s) => sum + s.entryIds.length, 0)
  attachOpen.value = true
}

/** Filters the task picker to the batch's shared project when every session in it agrees on one — never across a mixed batch. */
const attachProjectFilter = computed(() => {
  const projectIds = new Set(attachSessions.value.map(s => s.project))
  if (projectIds.size !== 1) return undefined
  const only = [...projectIds][0]
  return only && only !== MIXED ? only : undefined
})

const attachCandidates = computed(() => {
  const base = attachProjectFilter.value ? tasks.value.filter(t2 => t2.project === attachProjectFilter.value) : tasks.value
  const q = attachQuery.value.trim().toLowerCase()
  return q ? base.filter(t2 => t2.title.toLowerCase().includes(q)) : base
})

async function confirmAttach() {
  const taskId = attachSelectedTaskId.value
  if (!taskId) return
  attaching.value = true
  const targets = attachSessions.value
  const total = targets.reduce((sum, s) => sum + s.entryIds.length, 0)
  let done = 0
  let succeededSessions = 0
  let failedSessions = 0
  const movedIds: string[] = []

  for (const session of targets) {
    try {
      const { failed } = await attachToExisting(session, taskId, (sessionDone) => {
        attachProgressDone.value = done + sessionDone
        attachProgressTotal.value = total
      })
      done += session.entryIds.length
      if (failed.length === 0) {
        succeededSessions++
        movedIds.push(session.sessionId)
      }
      else {
        failedSessions++
      }
    }
    catch {
      done += session.entryIds.length
      failedSessions++
    }
  }

  attaching.value = false
  attachResult.value = { succeeded: succeededSessions, failed: failedSessions }
  removeSessions(movedIds)
  deselect(movedIds)
  // Every target session attaches to the same `taskId` — one targeted
  // re-read (not per-session) picks up any server-side `open` -> `doing`
  // transition the task-auto-doing hook made (TASKS-REQ-010), so the
  // board reflects it without a page reload.
  if (succeededSessions > 0) await refreshTask(taskId)
  if (succeededSessions > 0) toast.success(t('sessionsQueue.movedTo', { count: succeededSessions }))
  if (failedSessions > 0) toast.error(t('sessionsQueue.failedCount', { count: failedSessions }))
  refreshQueueCount()
}

// -- Ignore (single row or the whole selection) — a lightweight inline ---
// confirm bar, not a full dialog (no destructive-action dialog precedent
// exists elsewhere in this app — tasks/index.vue's own delete has none —
// so this stays the lightest step that still makes the owner confirm).
const ignoreTargets = ref<SessionSummary[] | null>(null)
const ignoring = ref(false)

function requestIgnore(targets: SessionSummary[]) {
  ignoreTargets.value = targets
}
function cancelIgnore() {
  ignoreTargets.value = null
}

async function confirmIgnore() {
  const targets = ignoreTargets.value
  if (!targets) return
  ignoreTargets.value = null
  const ids = targets.map(s => s.sessionId)
  removeSessions(ids)
  deselect(ids)
  ignoring.value = true

  let succeeded = 0
  const failedBackups: SessionSummary[] = []
  for (const session of targets) {
    try {
      await ignoreSession(session)
      succeeded++
    }
    catch {
      failedBackups.push(session)
    }
  }
  ignoring.value = false

  restoreSessions(failedBackups)
  if (succeeded > 0) toast.success(t('sessionsQueue.ignoredCount', { count: succeeded }))
  if (failedBackups.length > 0) toast.error(t('sessionsQueue.ignoreFailedCount', { count: failedBackups.length }))
  refreshQueueCount()
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">
        {{ t('sessionsQueue.title') }}
      </h1>
      <p class="text-sm text-muted-foreground">
        {{ t('sessionsQueue.subtitle') }}
      </p>
      <p v-if="truncated" class="text-xs text-muted-foreground">
        {{ t('sessionsQueue.truncatedNotice') }}
      </p>
    </div>

    <div v-if="ignoreTargets" class="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p class="text-sm font-medium">
          {{ ignoreTargets.length === 1 ? t('sessionsQueue.ignoreConfirmTitle') : t('sessionsQueue.ignoreSelected') }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ ignoreTargets.length === 1 ? t('sessionsQueue.ignoreConfirmDescription') : t('sessionsQueue.ignoreSelectedConfirmDescription', { count: ignoreTargets.length }) }}
        </p>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button size="sm" variant="ghost" :disabled="ignoring" @click="cancelIgnore">
          {{ t('common.cancel') }}
        </Button>
        <Button size="sm" variant="destructive" :disabled="ignoring" @click="confirmIgnore">
          <Loader2 v-if="ignoring" class="size-4 animate-spin" />
          {{ t('common.confirm') }}
        </Button>
      </div>
    </div>

    <div v-else-if="selectedCount > 0" class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-4 py-2">
      <span class="text-sm">{{ t('sessionsQueue.selected', { count: selectedCount }) }}</span>
      <div class="flex gap-2">
        <Button size="sm" variant="outline" @click="requestIgnore(selectedSessions())">
          {{ t('sessionsQueue.ignoreSelected') }}
        </Button>
        <Button size="sm" @click="openAttach(selectedSessions())">
          {{ t('sessionsQueue.attachSelected') }}
        </Button>
      </div>
    </div>

    <Card>
      <CardContent class="p-0">
        <div v-if="loading" class="flex flex-col gap-2 p-4">
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-10 w-full" />
        </div>
        <TooltipProvider v-else-if="sessions.length > 0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-8">
                <Checkbox :model-value="allSelectedState" :aria-label="t('sessionsQueue.selectAll')" @update:model-value="toggleSelectAll" />
              </TableHead>
              <TableHead>{{ t('common.name') }}</TableHead>
              <TableHead>{{ t('common.client') }}</TableHead>
              <TableHead>{{ t('common.project') }}</TableHead>
              <TableHead class="text-right">
                {{ t('sessionsQueue.entries') }}
              </TableHead>
              <TableHead class="text-right">
                {{ t('dashboard.kpi.workTime') }}
              </TableHead>
              <TableHead class="text-right">
                {{ t('common.cost') }}
              </TableHead>
              <TableHead class="text-right">
                {{ t('sessionsQueue.lastActivity') }}
              </TableHead>
              <TableHead class="text-right">
                {{ t('common.actions') }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="session in sessions" :key="session.sessionId">
              <TableCell>
                <Checkbox
                  :model-value="selected.has(session.sessionId)"
                  :aria-label="t('sessionsQueue.selectRow', { session: sessionName(session) })"
                  @update:model-value="toggleSession(session.sessionId)"
                />
              </TableCell>
              <TableCell class="font-medium">
                <div class="flex flex-col gap-0.5">
                  <span class="max-w-48 truncate">{{ sessionName(session) }}</span>
                  <span class="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    <span class="max-w-32 truncate">{{ session.machine || '—' }}</span>
                    <span aria-hidden="true">·</span>
                    <span v-if="session.agent === MIXED">{{ t('sessionsQueue.mixed') }}</span>
                    <AgentIcon v-else :agent="session.agent" size="sm" />
                  </span>
                </div>
              </TableCell>
              <TableCell class="max-w-32 truncate">
                {{ clientLabel(session) }}
              </TableCell>
              <TableCell class="max-w-32 truncate">
                {{ projectLabel(session) }}
              </TableCell>
              <TableCell class="text-right tabular-nums">
                {{ session.entryCount }}
              </TableCell>
              <TableCell class="text-right tabular-nums">
                <span class="inline-flex items-center justify-end gap-1">
                  <span :title="session.workMsMayOverlap ? t('tasks.detail.sessions.workApproxTitle') : undefined">
                    {{ session.workMsMayOverlap ? '≈' : '' }}{{ formatDuration(session.workMs) }}
                  </span>
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <button type="button" class="text-muted-foreground" :aria-label="elapsedWaitingTooltip(session)">
                        <Info class="size-3.5" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-xs">
                      {{ elapsedWaitingTooltip(session) }}
                    </TooltipContent>
                  </Tooltip>
                </span>
              </TableCell>
              <TableCell class="text-right tabular-nums">
                {{ formatCost(session.cost) }}
              </TableCell>
              <TableCell class="text-right tabular-nums" :title="`${t('sessionsQueue.firstActivity')}: ${formatDate(session.firstActivity)}`">
                {{ formatDate(session.lastActivity) }}
              </TableCell>
              <TableCell class="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button size="icon-sm" variant="ghost" :aria-label="t('sessionsQueue.actionsAria', { session: sessionName(session) })">
                      <MoreHorizontal class="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @click="openConvert(session)">
                      <FilePlus2 class="size-4" />
                      {{ t('sessionsQueue.convert') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="openAttach([session])">
                      <Link2 class="size-4" />
                      {{ t('sessionsQueue.attach') }}
                    </DropdownMenuItem>
                    <DropdownMenuItem class="text-destructive" @click="requestIgnore([session])">
                      {{ t('sessionsQueue.ignore') }}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        </TooltipProvider>
        <EmptyState v-else :title="t('sessionsQueue.empty')" class="m-4" />
      </CardContent>
    </Card>

    <!-- Convert to a new task -->
    <Dialog v-model:open="convertOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('sessionsQueue.convertTitle') }}</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <Label for="sq-title">{{ t('common.name') }}</Label>
            <Input id="sq-title" v-model="convertForm.title" required />
          </div>
          <div class="flex flex-col gap-1.5">
            <Label>{{ t('common.project') }}</Label>
            <Select v-model="convertForm.project" :placeholder="t('common.select')" :options="projects.map(p => ({ value: p.id, label: p.name }))" />
          </div>
          <DialogFooter>
            <Button :disabled="!convertForm.title.trim() || !convertForm.project || converting" @click="confirmConvert">
              <Loader2 v-if="converting" class="size-4 animate-spin" />
              {{ t('sessionsQueue.convertConfirm') }}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>

    <!-- Attach to an existing task -->
    <Dialog v-model:open="attachOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('sessionsQueue.attachTitle') }}</DialogTitle>
        </DialogHeader>

        <div v-if="!attaching && !attachResult" class="flex flex-col gap-3">
          <div class="flex items-center gap-2 rounded-md border border-input px-3">
            <Search class="size-4 text-muted-foreground" />
            <Input
              v-model="attachQuery"
              role="combobox"
              aria-controls="sq-attach-listbox"
              :aria-expanded="attachCandidates.length > 0"
              :placeholder="t('sessionsQueue.attachSearchPlaceholder')"
              class="border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          <div id="sq-attach-listbox" role="listbox" :aria-label="t('sessionsQueue.attachTitle')" class="max-h-64 overflow-y-auto rounded-md border border-border">
            <button
              v-for="candidate in attachCandidates"
              :key="candidate.id"
              type="button"
              role="option"
              :aria-selected="attachSelectedTaskId === candidate.id"
              class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              :class="attachSelectedTaskId === candidate.id ? 'bg-accent text-accent-foreground' : ''"
              @click="attachSelectedTaskId = candidate.id"
            >
              <span class="min-w-0 truncate">{{ candidate.title }}</span>
              <Check v-if="attachSelectedTaskId === candidate.id" class="size-4 shrink-0" />
            </button>
            <p v-if="attachCandidates.length === 0" class="px-3 py-6 text-center text-xs text-muted-foreground">
              {{ t('sessionsQueue.attachEmpty') }}
            </p>
          </div>
          <DialogFooter>
            <Button :disabled="!attachSelectedTaskId" @click="confirmAttach">
              {{ t('sessionsQueue.attachConfirm') }}
            </Button>
          </DialogFooter>
        </div>

        <div v-else-if="attaching" class="flex flex-col gap-2">
          <p class="text-sm text-muted-foreground">
            {{ t('sessionsQueue.progress', { done: attachProgressDone, total: attachProgressTotal }) }}
          </p>
          <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div class="h-full bg-primary transition-all" :style="{ width: `${attachProgressTotal ? (attachProgressDone / attachProgressTotal) * 100 : 0}%` }" />
          </div>
        </div>

        <div v-else class="flex flex-col gap-3">
          <p class="text-sm">
            {{ t('sessionsQueue.done', { succeeded: attachResult!.succeeded, failed: attachResult!.failed }) }}
          </p>
          <DialogFooter>
            <Button @click="attachOpen = false">
              {{ t('common.close') }}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
