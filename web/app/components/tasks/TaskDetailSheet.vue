<script setup lang="ts">
/**
 * Content of the task detail sheet on the tasks board
 * (app/pages/tasks/index.vue) — header (title, project, a Tabs-based
 * status control for open/doing/done — the touch/keyboard-accessible
 * replacement for the board's old "Mover a" buttons, TASKS-REQ-011 — and
 * an "Edit" action back to the existing edit dialog) and a "Sessions"
 * section listing every kankaku session that touched this task, sourced
 * from `useSessions().fetchSessionsForTask` (already-consolidated
 * `task_entries` rows — D6, never `work_records`). The page keeps the
 * `<Sheet>`/`<SheetContent>` wrapper (padding, scroll container, open
 * state, session fetching) and owns the edit dialog; this component is
 * the presentational body, built following the same pattern as
 * `components/entries/EntryDetailSheet.vue` (focus exposure, resume
 * command block, `<CopyButton>`) — it never talks to PocketBase
 * directly.
 */
import { Pencil } from '@lucide/vue'
import AgentBadge from '@/components/agents/AgentBadge.vue'
import CopyButton from '@/components/commands/CopyButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TaskRecord, TaskStatus } from '@/lib/pocketbase-types'
import { MIXED, type SessionSummary } from '@/lib/session-aggregate'
import { buildResumeCommand } from '@/lib/session-resume'

const props = defineProps<{
  task: TaskRecord
  projectName: string
  sessions: SessionSummary[]
  sessionsLoading: boolean
}>()

const emit = defineEmits<{ edit: []; statusChange: [status: TaskStatus] }>()

// Touch/keyboard-accessible status control (the "Mover a" board buttons'
// replacement, TASKS-REQ-011): this Tabs segmented control uses the same
// primitive as the board/list toggle on the page above, and drives the
// page's own `moveStatus()` (optimistic + rollback) via `statusChange` —
// this component never talks to PocketBase directly, same as `edit`.
const STATUSES: TaskStatus[] = ['open', 'doing', 'done']
function onStatusTabChange(value: string | number) {
  emit('statusChange', value as TaskStatus)
}

const { t } = useI18n()
const { formatCost, formatDateTime, formatDuration } = useFormatters()

// -- focus management: the page's SheetContent @open-auto-focus hands
// focus here instead of the reka-ui default (first focusable element).
const titleEl = ref<HTMLElement | null>(null)
function focusTitle() {
  titleEl.value?.focus()
}
defineExpose({ focusTitle })

function sessionName(session: SessionSummary) {
  return session.sessionName || t('tasks.detail.sessions.nameFallback')
}

/**
 * DESIGN CHOICE: when a session's entries disagree on `agent` (the
 * `MIXED` sentinel), resume can't know which agent's command syntax to
 * use — fall through to `undefined` rather than surfacing
 * `unsupported-agent`. `buildResumeCommand` already treats a missing
 * agent as the legacy pre-agent-field row (the default `pi` builder),
 * so a mixed session still gets a best-effort resume command instead of
 * being reported as definitively unsupported.
 */
const sessionRows = computed(() => props.sessions.map((session) => {
  const resume = buildResumeCommand({
    sessionId: session.sessionId,
    repoProject: session.repoProject,
    sessionDir: session.sessionDir,
    agent: session.agent === MIXED ? undefined : (session.agent || undefined),
  })
  return {
    session,
    resumeOk: resume.ok,
    resumeCommand: resume.ok ? resume.command : '',
  }
}))

defineOptions({ inheritAttrs: false })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-8 pb-6">
    <!-- Header -->
    <div class="flex flex-col gap-3 pr-8">
      <h2
        ref="titleEl"
        data-testid="task-detail-title"
        tabindex="-1"
        class="text-base leading-snug font-semibold break-words outline-none"
      >
        {{ task.title }}
      </h2>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-muted-foreground">{{ projectName }}</span>
      </div>
      <div class="flex flex-col gap-1.5">
        <span id="task-detail-status-label" class="text-xs font-medium text-muted-foreground">
          {{ t('common.status') }}
        </span>
        <Tabs :model-value="task.status" aria-labelledby="task-detail-status-label" @update:model-value="onStatusTabChange">
          <TabsList>
            <TabsTrigger v-for="s in STATUSES" :key="s" :value="s">
              {{ t(`tasks.status.${s}`) }}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <Button size="sm" variant="outline" class="w-fit gap-1.5" @click="emit('edit')">
        <Pencil class="size-3.5" />
        {{ t('tasks.edit') }}
      </Button>
    </div>

    <!-- Sessions -->
    <section class="space-y-3 border-t border-border pt-4">
      <h3 class="text-sm font-medium">
        {{ t('tasks.detail.sessions.title') }}
      </h3>

      <div v-if="sessionsLoading" class="space-y-2">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>

      <EmptyState v-else-if="sessionRows.length === 0" :title="t('tasks.detail.sessions.empty')" />

      <ul v-else class="space-y-3">
        <li v-for="row in sessionRows" :key="row.session.sessionId" class="space-y-3 overflow-x-auto rounded-md border border-border p-3 text-sm">
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p class="min-w-0 truncate font-medium">
              {{ sessionName(row.session) }}
            </p>
            <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
              {{ formatDateTime(row.session.lastActivity) }}
            </span>
          </div>

          <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-3">
            <div class="min-w-0">
              <dt class="text-muted-foreground">
                {{ t('tasks.detail.sessions.firstActivity') }}
              </dt>
              <dd class="truncate tabular-nums">
                {{ formatDateTime(row.session.firstActivity) }}
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-muted-foreground">
                {{ t('tasks.detail.sessions.entries') }}
              </dt>
              <dd class="tabular-nums">
                {{ row.session.entryCount }}
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-muted-foreground">
                {{ t('dashboard.kpi.workTime') }}
              </dt>
              <dd class="tabular-nums">
                {{ formatDuration(row.session.workMs) }}
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-muted-foreground">
                {{ t('dashboard.kpi.wallTime') }}
              </dt>
              <dd class="tabular-nums">
                {{ formatDuration(row.session.wallMs) }}
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-muted-foreground">
                {{ t('dashboard.kpi.waitingTime') }}
              </dt>
              <dd class="tabular-nums">
                {{ formatDuration(row.session.waitingMs) }}
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-muted-foreground">
                {{ t('dashboard.kpi.cost') }}
              </dt>
              <dd class="tabular-nums">
                {{ formatCost(row.session.cost) }}
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-muted-foreground">
                {{ t('tasks.detail.sessions.machine') }}
              </dt>
              <dd class="truncate" :title="row.session.machine">
                {{ row.session.machine || '—' }}
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-muted-foreground">
                {{ t('tasks.detail.sessions.agent') }}
              </dt>
              <dd class="min-w-0 truncate">
                <span v-if="row.session.agent === MIXED">{{ t('tasks.detail.sessions.agentMixed') }}</span>
                <AgentBadge v-else :agent="row.session.agent" size="md" />
              </dd>
            </div>
          </dl>

          <div v-if="row.resumeOk" class="flex items-start gap-1.5">
            <pre class="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-words text-foreground">{{ row.resumeCommand }}</pre>
            <CopyButton :text="row.resumeCommand" />
          </div>
          <p v-else class="rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
            {{ t('tasks.detail.sessions.resume.unsupportedAgent') }}
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
