<script setup lang="ts">
/**
 * Content of the task detail sheet on the tasks board
 * (app/pages/tasks/index.vue) — header (title, project, a Tabs-based
 * status control for open/doing/done — the touch/keyboard-accessible
 * replacement for the board's old "Mover a" buttons, TASKS-REQ-011 — and
 * an "Edit" action back to the existing edit dialog) and a "Sessions"
 * section listing every kankaku session that touched this task, sourced
 * from `useSessions().fetchSessionTotals` (server-summed, falling back
 * to the row-level `fetchSessionsForTask` — already-consolidated
 * `task_entries` rows either way, D6, never `work_records`). The page
 * keeps the `<Sheet>`/`<SheetContent>` wrapper (padding, scroll
 * container, open state, session fetching) and owns the edit dialog;
 * this component is the presentational body, built following the same
 * pattern as `components/entries/EntryDetailSheet.vue` (focus exposure,
 * resume command block, `<CopyButton>`) — it never talks to PocketBase
 * directly. Its `sessions` prop is `TaskSessionRow[]`, a shape-agnostic
 * view model the page maps both the totals-backed and fallback session
 * sources into (see `lib/session-aggregate.ts#TaskSessionRow`), so this
 * component never needs to know which source produced a row.
 *
 * Each session row also has a disclosure ("Feature 2") that lists EVERY
 * `task_entries` row of that session — including rows belonging to
 * another task or to no task at all — fetched lazily on first expand.
 * The fetch itself still lives on the page (`sessionEntries` prop,
 * `expand-session` emit) so this component keeps its "never talks to
 * PocketBase directly" rule; only which sessions are expanded, and
 * classifying each fetched row against the CURRENTLY-VIEWED task
 * (`toSessionEntryRow`, re-evaluated live off `props.task.id` — never
 * cached at fetch time), are this component's own concern.
 */
import { ChevronDown, Pencil } from '@lucide/vue'
import AgentBadge from '@/components/agents/AgentBadge.vue'
import CopyButton from '@/components/commands/CopyButton.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TaskEntryRecord, TaskRecord, TaskStatus } from '@/lib/pocketbase-types'
import { MIXED, type TaskSessionRow } from '@/lib/session-aggregate'
import { toSessionEntryRow } from '@/lib/session-entries'
import { buildResumeCommand } from '@/lib/session-resume'

/** Fetch state for one session's expanded entries list, keyed by
 * `sessionId` — owned and populated by the page (`app/pages/tasks/index.vue`),
 * this component only reads it. `undefined` for a session never expanded
 * (or not yet fetched) — the loading skeleton/list distinguish
 * "loading" from "loaded with 0 rows" via `items.length`, never `undefined`
 * vs. present. */
export interface SessionEntriesState {
  loading: boolean
  items: TaskEntryRecord[]
  totalItems: number
}

const props = withDefaults(defineProps<{
  task: TaskRecord
  projectName: string
  sessions: TaskSessionRow[]
  sessionsLoading: boolean
  sessionEntries: Record<string, SessionEntriesState>
  /** False for a non-owner (viewer) — hides the status control and the
   * "Edit" button below (odd/tasks/viewer-role.md T2). Defaults to
   * `true` so any other, older caller behaves exactly as before. */
  canWrite?: boolean
}>(), {
  canWrite: true,
})

const emit = defineEmits<{ edit: []; statusChange: [status: TaskStatus]; expandSession: [sessionId: string] }>()

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

function sessionName(session: TaskSessionRow) {
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

// -- session entries disclosure (Feature 2) ------------------------------

/** Which sessions' entry lists are currently expanded — local UI state,
 * collapsed by default. Keyed by `sessionId` across the whole component
 * lifetime (not reset when the sheet reopens for a different task): a
 * session already expanded once for one task stays expanded if the owner
 * later opens a different task that shares it, which is harmless since
 * the same-task/other-task classification below is always computed live
 * against `props.task.id`, never cached. */
const expandedSessionIds = ref<Set<string>>(new Set())

function isSessionExpanded(sessionId: string): boolean {
  return expandedSessionIds.value.has(sessionId)
}

function toggleSessionEntries(sessionId: string) {
  const next = new Set(expandedSessionIds.value)
  if (next.has(sessionId)) {
    next.delete(sessionId)
  }
  else {
    next.add(sessionId)
    // Fetch on first expand only — a session already present in
    // `sessionEntries` (loaded or loading) is never re-requested just
    // because it's toggled closed and open again.
    if (!props.sessionEntries[sessionId]) emit('expandSession', sessionId)
  }
  expandedSessionIds.value = next
}

/** Maps one session's raw fetched rows (`props.sessionEntries[sessionId].items`,
 * `TaskEntryRecord[]` with `expand: 'task'`) into the view model the
 * template renders — classified against the CURRENTLY-VIEWED task, live. */
function sessionEntryRows(sessionId: string) {
  const state = props.sessionEntries[sessionId]
  if (!state) return []
  return state.items.map(item => toSessionEntryRow(item, props.task.id))
}

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
      <div v-if="canWrite" data-testid="write-action" class="flex flex-col gap-1.5">
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
      <div v-else class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-muted-foreground">
          {{ t('common.status') }}
        </span>
        <Badge variant="outline" class="w-fit">
          {{ t(`tasks.status.${task.status}`) }}
        </Badge>
      </div>
      <Button v-if="canWrite" data-testid="write-action" size="sm" variant="outline" class="w-fit gap-1.5" @click="emit('edit')">
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
              <dd class="tabular-nums" :title="row.session.workMsMayOverlap ? t('tasks.detail.sessions.workApproxTitle') : undefined">
                {{ row.session.workMsMayOverlap ? '≈' : '' }}{{ formatDuration(row.session.workMs) }}
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-muted-foreground">
                {{ t('tasks.detail.sessions.elapsed') }}
              </dt>
              <dd class="tabular-nums">
                {{ formatDuration(row.session.elapsedMs) }}
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

          <!-- Every entry of this session (Feature 2), collapsed by default,
               fetched lazily on first expand. -->
          <div class="border-t border-border pt-2">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 text-xs font-medium"
              :aria-expanded="isSessionExpanded(row.session.sessionId)"
              :aria-controls="`session-entries-${row.session.sessionId}`"
              @click="toggleSessionEntries(row.session.sessionId)"
            >
              {{ t('tasks.detail.sessions.entriesToggle') }}
              <ChevronDown class="size-3.5 shrink-0 text-muted-foreground transition-transform" :class="isSessionExpanded(row.session.sessionId) ? 'rotate-180' : ''" />
            </button>

            <div v-show="isSessionExpanded(row.session.sessionId)" :id="`session-entries-${row.session.sessionId}`" class="mt-2">
              <div v-if="sessionEntries[row.session.sessionId]?.loading" class="space-y-1.5">
                <Skeleton class="h-6 w-full" />
                <Skeleton class="h-6 w-full" />
              </div>
              <template v-else-if="sessionEntries[row.session.sessionId]">
                <EmptyState v-if="sessionEntryRows(row.session.sessionId).length === 0" :title="t('tasks.detail.sessions.entriesEmpty')" />
                <ul v-else class="divide-y divide-border rounded-md border border-border text-xs">
                  <li v-for="entry in sessionEntryRows(row.session.sessionId)" :key="entry.id" data-testid="session-entry-row" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5">
                    <span class="shrink-0 tabular-nums text-muted-foreground">{{ formatDateTime(entry.startedAt) }}</span>
                    <span class="min-w-0 flex-1 truncate">
                      <span v-if="entry.promptHidden" class="text-muted-foreground italic">{{ t('tasks.detail.sessions.entryPromptHidden') }}</span>
                      <span v-else>{{ entry.promptExcerpt }}</span>
                    </span>
                    <span class="shrink-0 tabular-nums">{{ formatDuration(entry.workMs) }}</span>
                    <span class="shrink-0 tabular-nums">{{ formatCost(entry.cost) }}</span>
                    <Badge v-if="entry.taskBadge.kind === 'no-task'" variant="outline" class="shrink-0">
                      {{ t('tasks.detail.sessions.entryNoTask') }}
                    </Badge>
                    <Badge v-else-if="entry.taskBadge.kind === 'other-task'" variant="outline" class="shrink-0">
                      {{ t('tasks.detail.sessions.entryOtherTask', { title: entry.taskBadge.taskTitle }) }}
                    </Badge>
                  </li>
                </ul>
                <p
                  v-if="sessionEntries[row.session.sessionId]!.totalItems > sessionEntries[row.session.sessionId]!.items.length"
                  class="mt-1.5 text-[11px] text-muted-foreground"
                >
                  {{ t('tasks.detail.sessions.entriesTruncated', {
                    shown: sessionEntries[row.session.sessionId]!.items.length,
                    total: sessionEntries[row.session.sessionId]!.totalItems,
                  }) }}
                </p>
              </template>
            </div>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>
