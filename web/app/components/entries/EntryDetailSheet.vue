<script setup lang="ts">
/**
 * Content of the entry detail sheet on the entries explorer
 * (app/pages/entries/index.vue) — header, summary, assignment, tokens,
 * segments, prompt, work_records drill-down and a collapsed-by-default
 * technical details disclosure. The page keeps the `<Sheet>`/
 * `<SheetContent>` wrapper (padding, scroll container, open state); this
 * component is the presentational body plus the few computed views the
 * template needs, built on the pure helpers in app/lib/entry-detail.ts.
 *
 * `client`/`project` are v-model'd back to the page because "Asignación"
 * keeps driving `useEntriesExplorer().updateAssignment` from there — this
 * component never talks to PocketBase directly.
 */
import { ChevronDown, CircleCheck, CircleX, Info, TriangleAlert } from '@lucide/vue'
import AgentBadge from '@/components/agents/AgentBadge.vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import CopyButton from '@/components/commands/CopyButton.vue'
import { Badge } from '@/components/ui/badge'
import { cacheHitRatio } from '@/lib/cache-hit'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  computeWorkWaitRatio,
  deriveEntryTitle,
  normalizeSegments,
  resolveRelation,
  safeDisplayValue,
  statusPresentation,
  truncateMiddle,
} from '@/lib/entry-detail'
import { describeEntryQuality, normalizeAgentInfo } from '@/lib/measurement-quality'
import { entryTaskOptions, keepTaskForSelection } from '@/lib/entry-task-options'
import type { ClientRecord, ProjectRecord, TaskEntryRecord, TaskRecord, WorkRecordRecord } from '@/lib/pocketbase-types'
import { buildResumeCommand } from '@/lib/session-resume'
import { resolveThinkingLevel } from '@/lib/thinking-level'

const props = withDefaults(defineProps<{
  entry: TaskEntryRecord
  workRecords: WorkRecordRecord[]
  clients: ClientRecord[]
  projects: ProjectRecord[]
  tasks: TaskRecord[]
  /** False for a non-owner (viewer) — the assignment section renders the
   * current client/project/task as read-only text instead of selects,
   * and hides "Save" (odd/tasks/viewer-role.md T2). Defaults to `true`
   * so any other, older caller behaves exactly as before. */
  canWrite?: boolean
  /** The page owns the stable dialog title across loading and failure. */
  headerTitleProvided?: boolean
}>(), {
  canWrite: true,
})

const emit = defineEmits<{ save: [] }>()

const client = defineModel<string>('client', { required: true })
const project = defineModel<string>('project', { required: true })
const task = defineModel<string>('task', { required: true })

const { t, locale } = useI18n()
const guideUrl = computed(() => `https://kankaku.io${locale.value === 'en' ? '' : `/${locale.value}`}/docs/guide#settings`)
const { formatCost, formatDateTime, formatDuration, formatPercent, formatTokens } = useFormatters()

// -- focus management: the page's SheetContent @open-auto-focus hands
// focus here instead of the reka-ui default (first focusable = a link).
const titleEl = ref<HTMLElement | null>(null)
function focusTitle() {
  titleEl.value?.focus()
}
defineExpose({ focusTitle })

// -- header -------------------------------------------------------------

const titleSource = computed(() => deriveEntryTitle(props.entry))
const titleText = computed(() => {
  const src = titleSource.value
  if (src.kind === 'session_name' || src.kind === 'prompt') return src.text
  return t('entries.detail.fallbackTitle', { id: src.shortId })
})
const titleTooltip = computed(() => titleSource.value.kind === 'prompt' && titleSource.value.truncated ? props.entry.prompt : undefined)

const status = computed(() => statusPresentation(props.entry.status))
const statusIcon = computed(() => ({ check: CircleCheck, x: CircleX, 'alert-triangle': TriangleAlert })[status.value.icon])

const startedAtHuman = computed(() => formatDateTime(props.entry.started_at))

// -- summary --------------------------------------------------------------

const ratio = computed(() => computeWorkWaitRatio(props.entry.work_ms, props.entry.waiting_ms, props.entry.wall_ms))
const workWaitBarLabel = computed(() => t('entries.detail.workWaitBarLabel', {
  work: formatDuration(props.entry.work_ms),
  wait: formatDuration(props.entry.waiting_ms),
  wall: formatDuration(props.entry.wall_ms),
}))

// -- agent + measurement quality --------------------------------------------

const quality = computed(() => describeEntryQuality(props.entry))
const agentInfo = computed(() => normalizeAgentInfo(props.entry))

const agentVersionDisplay = computed(() => safeDisplayValue(agentInfo.value.agentVersion))
const pluginDisplay = computed(() => safeDisplayValue(agentInfo.value.plugin))
const pluginVersionDisplay = computed(() => safeDisplayValue(agentInfo.value.pluginVersion))

const costApproxLabel = computed(() => quality.value.costIsApprox === 'estimated' ? t('entries.detail.quality.costEstimated') : t('entries.detail.quality.costUnknown'))
const costApproxHint = computed(() => quality.value.costIsApprox === 'estimated' ? t('entries.detail.quality.costEstimatedHint') : t('entries.detail.quality.costUnknownHint'))

// -- reasoning effort (thinking_level) ---------------------------------

/** `''` when `thinking_level` is empty/unknown — the caller never renders
 * an "Effort: —" placeholder for it (see `resolveThinkingLevel`'s doc
 * comment), unlike every other quality field on this sheet. */
function thinkingLevelLabel(raw: string | null | undefined): string {
  const resolved = resolveThinkingLevel(raw)
  if (!resolved) return ''
  return resolved.kind === 'known' ? t(`entries.detail.thinkingLevel.${resolved.value}`) : resolved.value
}

const entryEffortLabel = computed(() => thinkingLevelLabel(props.entry.thinking_level))

// -- resume session -----------------------------------------------------------

const resumeCommand = computed(() => buildResumeCommand({
  sessionId: props.entry.session_id,
  repoProject: props.entry.repo_project || undefined,
  sessionDir: props.entry.session_dir || undefined,
  agent: props.entry.agent || undefined,
}))

// -- assignment -------------------------------------------------------------

const clientRelation = computed(() => resolveRelation(props.entry.client, props.entry.expand?.client))
const projectRelation = computed(() => resolveRelation(props.entry.project, props.entry.expand?.project))
const taskRelation = computed(() => resolveRelation(
  props.entry.task,
  props.entry.expand?.task ? { name: props.entry.expand.task.title } : undefined,
))

const taskSelectOptions = computed(() => [
  { value: '', label: t('entries.detail.noTask') },
  ...entryTaskOptions({ tasks: props.tasks, projects: props.projects, client: client.value, project: project.value, current: props.entry.task })
    .map(option => ({ value: option.id, label: `${option.title} · ${t(`tasks.status.${option.status}`)}` })),
])

// A task must never end up under a client/project it does not belong to:
// when the USER changes either, a task that no longer fits is cleared. The
// entry's own stored pair is left alone, so opening the sheet (which sets
// both models) never drops an existing assignment, even a mismatched one.
watch([client, project], ([nextClient, nextProject]) => {
  if (nextClient === props.entry.client && nextProject === props.entry.project) return
  task.value = keepTaskForSelection({ tasks: props.tasks, projects: props.projects, client: nextClient, project: nextProject, task: task.value })
})

const projectSelectOptions = computed(() => [
  { value: '', label: t('common.none') },
  ...props.projects.filter(p => p.client === client.value).map(p => ({ value: p.id, label: p.name })),
])

const repoProjectTruncated = computed(() => props.entry.repo_project ? truncateMiddle(props.entry.repo_project, 36) : '')

// -- tokens -----------------------------------------------------------------

const cacheHit = computed(() => cacheHitRatio(props.entry.input, props.entry.cache_read, props.entry.cache_write))

const tokenFields = computed(() => [
  { key: 'input', label: t('entries.detail.tokensIn'), value: props.entry.input },
  { key: 'output', label: t('entries.detail.tokensOut'), value: props.entry.output },
  { key: 'cache_read', label: t('entries.detail.tokensCacheRead'), value: props.entry.cache_read },
  { key: 'cache_write', label: t('entries.detail.tokensCacheWrite'), value: props.entry.cache_write },
])

// -- segments -----------------------------------------------------------------

const segments = computed(() => normalizeSegments(props.entry.segments))

// -- work records -----------------------------------------------------------------

function workRecordStatusVariant(wr: WorkRecordRecord): 'success' | 'destructive' | 'warning' {
  return statusPresentation(wr.status).tone
}

// -- technical details (collapsed by default) --------------------------------

const technicalOpen = ref(false)

interface TechnicalField {
  key: string
  label: string
  value: string
  iso?: string
  copyable?: boolean
}

const technicalFields = computed<TechnicalField[]>(() => {
  const e = props.entry
  return [
    { key: 'id', label: t('entries.detail.fieldId'), value: e.id, copyable: true },
    { key: 'task_id', label: t('entries.detail.fieldTaskId'), value: safeDisplayValue(e.task_id), copyable: !!e.task_id },
    { key: 'session_id', label: t('entries.detail.fieldSessionId'), value: safeDisplayValue(e.session_id), copyable: !!e.session_id },
    { key: 'machine', label: t('entries.detail.fieldMachine'), value: safeDisplayValue(e.machine) },
    { key: 'schema', label: t('entries.detail.fieldSchema'), value: safeDisplayValue(e.schema) },
    { key: 'created', label: t('entries.detail.fieldCreated'), value: e.created ? formatDateTime(e.created) : '—', iso: e.created },
    { key: 'updated', label: t('entries.detail.fieldUpdated'), value: e.updated ? formatDateTime(e.updated) : '—', iso: e.updated },
    { key: 'ended_at', label: t('entries.detail.fieldEndedAt'), value: e.ended_at ? formatDateTime(e.ended_at) : '—', iso: e.ended_at },
  ]
})

defineOptions({ inheritAttrs: false })
</script>

<template>
  <TooltipProvider>
    <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6" :class="headerTitleProvided ? 'pt-0' : 'pt-8'">
      <!-- Header -->
      <div class="flex flex-col gap-2">
        <h2
          v-if="!headerTitleProvided"
          ref="titleEl"
          tabindex="-1"
          class="text-base leading-snug font-semibold break-words outline-none"
          :title="titleTooltip"
        >
          {{ titleText }}
        </h2>
        <div class="flex flex-wrap items-center gap-2">
          <Badge :variant="status.tone" class="gap-1">
            <component :is="statusIcon" class="size-3" aria-hidden="true" />
            {{ t(`entries.status.${entry.status}`) }}
          </Badge>
          <span class="text-xs tabular-nums text-muted-foreground" :title="entry.started_at">
            {{ startedAtHuman }}
          </span>
        </div>
      </div>

      <!-- Summary -->
      <section class="space-y-3 border-t border-border pt-4">
        <h3 class="text-sm font-medium">
          {{ t('entries.detail.summary') }}
        </h3>

        <div class="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p class="text-xs text-muted-foreground">
              {{ t('dashboard.kpi.workTime') }}
            </p>
            <p class="inline-flex items-center gap-1 font-medium tabular-nums">
              <span>{{ quality.workTimeIsUpperBound ? `≤ ${formatDuration(entry.work_ms)}` : formatDuration(entry.work_ms) }}</span>
              <Tooltip v-if="quality.workTimeIsUpperBound">
                <TooltipTrigger as-child>
                  <button type="button" class="text-muted-foreground" :aria-label="t('entries.detail.quality.upperBoundHint')">
                    <Info class="size-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent class="max-w-xs">
                  {{ t('entries.detail.quality.upperBoundHint') }}
                </TooltipContent>
              </Tooltip>
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">
              {{ t('dashboard.kpi.wallTime') }}
            </p>
            <p class="font-medium tabular-nums">
              {{ formatDuration(entry.wall_ms) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">
              {{ t('dashboard.kpi.waitingTime') }}
            </p>
            <p class="font-medium tabular-nums">
              {{ formatDuration(entry.waiting_ms) }}
            </p>
          </div>
        </div>

        <div>
          <div class="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" :aria-label="workWaitBarLabel">
            <div class="h-full bg-primary" :style="{ width: `${ratio.workPercent}%` }" />
            <div class="h-full bg-warning" :style="{ width: `${ratio.waitPercent}%` }" />
          </div>
          <div class="mt-1.5 flex gap-3 text-[11px] text-muted-foreground">
            <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-primary" aria-hidden="true" />{{ t('common.work') }}</span>
            <span class="flex items-center gap-1"><span class="size-2 rounded-full bg-warning" aria-hidden="true" />{{ t('entries.detail.waiting') }}</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div class="min-w-0">
            <p class="truncate text-xs text-muted-foreground" :title="t('dashboard.kpi.cost')">
              {{ t('dashboard.kpi.cost') }}
            </p>
            <p class="inline-flex flex-wrap items-center gap-1 font-medium tabular-nums">
              <span>{{ formatCost(entry.cost) }}</span>
              <Tooltip v-if="quality.costIsApprox !== 'measured'">
                <TooltipTrigger as-child>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 rounded-full border border-current px-1.5 py-0 text-[10px] font-normal normal-case text-muted-foreground"
                    :aria-label="costApproxHint"
                  >
                    <Info class="size-3" aria-hidden="true" />
                    {{ costApproxLabel }}
                  </button>
                </TooltipTrigger>
                <TooltipContent class="max-w-xs">
                  {{ costApproxHint }}
                </TooltipContent>
              </Tooltip>
            </p>
          </div>
          <div class="min-w-0">
            <p class="truncate text-xs text-muted-foreground" :title="t('entries.detail.runs')">
              {{ t('entries.detail.runs') }}
            </p>
            <p class="font-medium tabular-nums">
              {{ entry.runs }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="truncate text-xs text-muted-foreground" :title="t('entries.detail.turns')">
              {{ t('entries.detail.turns') }}
            </p>
            <p class="font-medium tabular-nums">
              {{ entry.turns }}
            </p>
          </div>
          <div class="min-w-0">
            <p class="truncate text-xs text-muted-foreground" :title="t('entries.detail.subagents')">
              {{ t('entries.detail.subagents') }}
            </p>
            <p class="font-medium tabular-nums">
              {{ entry.subagent_count }}
            </p>
          </div>
        </div>
      </section>

      <!-- Assignment -->
      <section class="space-y-3 border-t border-border pt-4">
        <h3 class="text-sm font-medium">
          {{ t('entries.detail.assignment') }}
        </h3>

        <dl class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-2">
            <dt class="shrink-0 text-xs text-muted-foreground">
              {{ t('common.client') }}
            </dt>
            <dd class="min-w-0">
              <NuxtLink v-if="clientRelation.state === 'resolved'" :to="`/clients?highlight=${clientRelation.id}`" class="flex min-w-0 items-center gap-2 hover:underline">
                <ClientAvatar :client="entry.expand!.client!" size="xs" />
                <span class="truncate">{{ clientRelation.name }}</span>
              </NuxtLink>
              <span v-else-if="clientRelation.state === 'deleted'" class="text-muted-foreground italic">{{ t('entries.detail.relationDeleted') }}</span>
              <span v-else class="text-muted-foreground">—</span>
            </dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="shrink-0 text-xs text-muted-foreground">
              {{ t('common.project') }}
            </dt>
            <dd class="min-w-0 truncate text-right">
              <NuxtLink v-if="projectRelation.state === 'resolved'" :to="`/projects/${projectRelation.id}`" class="hover:underline">
                {{ projectRelation.name }}
              </NuxtLink>
              <span v-else-if="projectRelation.state === 'deleted'" class="text-muted-foreground italic">{{ t('entries.detail.relationDeleted') }}</span>
              <span v-else class="text-muted-foreground">—</span>
            </dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="shrink-0 text-xs text-muted-foreground">
              {{ t('common.task') }}
            </dt>
            <dd class="min-w-0 truncate text-right">
              <NuxtLink v-if="taskRelation.state === 'resolved'" to="/tasks" class="hover:underline">
                {{ taskRelation.name }}
              </NuxtLink>
              <span v-else-if="taskRelation.state === 'deleted'" class="text-muted-foreground italic">{{ t('entries.detail.relationDeleted') }}</span>
              <span v-else class="text-muted-foreground">—</span>
            </dd>
          </div>
          <div v-if="entry.legacy_client_label" class="flex items-center justify-between gap-2">
            <dt class="shrink-0 text-xs text-muted-foreground">
              {{ t('entries.detail.legacyLabel') }}
            </dt>
            <dd class="min-w-0 truncate text-right">
              {{ entry.legacy_client_label }}
            </dd>
          </div>
          <div v-if="entry.repo_project" class="flex items-center justify-between gap-2">
            <dt class="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
              {{ t('entries.detail.repoPath') }}
            </dt>
            <dd class="flex min-w-0 items-center gap-1.5">
              <span class="truncate font-mono text-xs" :title="entry.repo_project">{{ repoProjectTruncated }}</span>
              <CopyButton :text="entry.repo_project" />
            </dd>
          </div>
        </dl>

        <div v-if="canWrite" data-testid="write-action" class="space-y-2 rounded-md border border-dashed border-border p-3">
          <Select v-model="client" :aria-label="t('common.client')" :options="clients.map(c => ({ value: c.id, label: c.name }))" />
          <Select v-model="project" :aria-label="t('common.project')" :placeholder="t('common.none')" :options="projectSelectOptions" />
          <Select v-model="task" data-testid="entry-task-select" :aria-label="t('common.task')" :options="taskSelectOptions" />
          <Button size="sm" class="self-start" @click="emit('save')">
            {{ t('common.save') }}
          </Button>
        </div>
      </section>

      <!-- Resume session -->
      <section v-if="entry.session_id" class="space-y-3 border-t border-border pt-4">
        <h3 class="text-sm font-medium">
          {{ t('entries.detail.session.title') }}
        </h3>

        <p class="text-sm font-medium">
          {{ entry.session_name || t('entries.detail.session.nameFallback') }}
        </p>

        <div v-if="resumeCommand.ok" class="flex items-start gap-1.5">
          <pre class="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap break-words text-foreground">{{ resumeCommand.command }}</pre>
          <CopyButton :text="resumeCommand.command" />
        </div>
        <p v-else-if="resumeCommand.reason === 'unsupported-agent'" class="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          {{ t('entries.detail.session.unsupportedAgent') }}
        </p>

        <dl class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-2">
            <dt class="shrink-0 text-xs text-muted-foreground">
              {{ t('entries.detail.fieldMachine') }}
            </dt>
            <dd class="min-w-0 truncate text-right">
              {{ safeDisplayValue(entry.machine) }}
            </dd>
          </div>
        </dl>

        <p class="text-xs text-muted-foreground">
          {{ t('entries.detail.session.machineNote') }}
        </p>
      </section>

      <!-- Agent & measurement quality -->
      <section class="space-y-3 border-t border-border pt-4">
        <h3 class="text-sm font-medium">
          {{ t('entries.detail.quality.title') }}
        </h3>

        <div v-if="quality.showsUnlinkedWarning" class="flex items-start gap-2 rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
          <TriangleAlert class="size-3.5 shrink-0" aria-hidden="true" />
          <span class="flex-1">{{ t('entries.detail.quality.unlinkedWarning') }}</span>
          <Tooltip>
            <TooltipTrigger as-child>
              <button type="button" class="shrink-0" :aria-label="t('entries.detail.quality.unlinkedHint')">
                <Info class="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent class="max-w-xs">
              {{ t('entries.detail.quality.unlinkedHint') }}
            </TooltipContent>
          </Tooltip>
        </div>

        <dl class="space-y-2 text-sm">
          <div class="flex items-center justify-between gap-2">
            <dt class="shrink-0 text-xs text-muted-foreground">
              {{ t('entries.detail.quality.agent') }}
            </dt>
            <dd class="flex min-w-0 items-center justify-end gap-1.5 text-right">
              <AgentBadge :agent="entry.agent" size="md" />
              <template v-if="agentVersionDisplay !== '—'">
                <span class="shrink-0 text-muted-foreground">({{ agentVersionDisplay }})</span>
              </template>
            </dd>
          </div>
          <div class="flex items-center justify-between gap-2">
            <dt class="shrink-0 text-xs text-muted-foreground">
              {{ t('entries.detail.quality.plugin') }}
            </dt>
            <dd class="min-w-0 truncate text-right">
              {{ pluginDisplay }}<template v-if="pluginVersionDisplay !== '—'"> ({{ pluginVersionDisplay }})</template>
            </dd>
          </div>
        </dl>
      </section>

      <!-- Tokens -->
      <section class="space-y-2 border-t border-border pt-4">
        <h3 class="text-sm font-medium">
          {{ t('entries.detail.tokens') }}
        </h3>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div v-for="f in tokenFields" :key="f.key">
            <p class="text-xs text-muted-foreground">
              {{ f.label }}
            </p>
            <p class="font-medium tabular-nums">
              {{ formatTokens(f.value) }}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 text-sm">
          <span class="text-xs text-muted-foreground">{{ t('entries.detail.cacheHit') }}:</span>
          <span data-testid="entry-cache-hit" class="font-medium tabular-nums">{{ cacheHit === null ? '—' : formatPercent(cacheHit) }}</span>
          <Tooltip>
            <TooltipTrigger as-child>
              <button type="button" class="text-muted-foreground" :aria-label="t('entries.detail.cacheHitHint')">
                <Info class="size-3.5" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent class="max-w-xs">
              {{ t('entries.detail.cacheHitHint') }}
            </TooltipContent>
          </Tooltip>
        </div>
        <p class="text-sm">
          <span class="text-xs text-muted-foreground">{{ t('common.model') }}: </span>
          <span class="font-medium">{{ entry.model || '—' }}</span>
          <template v-if="entryEffortLabel">
            <span class="text-xs text-muted-foreground"> · {{ t('entries.detail.effort') }}: </span>
            <span class="font-medium">{{ entryEffortLabel }}</span>
          </template>
        </p>
      </section>

      <!-- Segments -->
      <section v-if="segments.length > 0" class="space-y-2 border-t border-border pt-4">
        <div class="flex items-center gap-1.5">
          <h3 class="text-sm font-medium">
            {{ t('entries.detail.segments') }}
          </h3>
          <Tooltip>
            <TooltipTrigger as-child>
              <button type="button" class="text-muted-foreground" :aria-label="t('entries.detail.segmentsHint')">
                <span aria-hidden="true" class="flex size-4 items-center justify-center rounded-full border border-current text-[10px]">?</span>
              </button>
            </TooltipTrigger>
            <TooltipContent class="max-w-xs">
              {{ t('entries.detail.segmentsHint') }}
            </TooltipContent>
          </Tooltip>
        </div>
        <ul class="divide-y divide-border rounded-md border border-border text-sm">
          <li v-for="seg in segments" :key="seg.tag" class="flex items-center justify-between px-3 py-1.5">
            <span class="truncate font-mono text-xs">{{ seg.tag }}</span>
            <span class="tabular-nums text-muted-foreground">{{ formatDuration(seg.ms) }}</span>
          </li>
        </ul>
      </section>

      <!-- Prompt -->
      <section class="space-y-2 border-t border-border pt-4">
        <h3 class="text-sm font-medium">
          {{ t('common.prompt') }}
        </h3>
        <pre v-if="entry.prompt" data-testid="prompt-pre" class="max-h-48 overflow-y-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words text-foreground">{{ entry.prompt }}</pre>
        <p v-else class="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          {{ t('entries.detail.promptEmpty') }}
          <a :href="guideUrl" target="_blank" rel="noopener noreferrer" class="font-medium text-primary hover:underline">
            {{ t('entries.detail.promptEmptyLink') }}
          </a>
        </p>
      </section>

      <!-- work_records drill-down -->
      <section class="space-y-2 border-t border-border pt-4">
        <h3 class="text-sm font-medium">
          {{ t('entries.detail.workRecords') }}
        </h3>
        <p class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
          {{ t('entries.detail.workRecordsWarning') }}
        </p>
        <div v-if="workRecords.length === 0" class="text-xs text-muted-foreground">
          {{ t('entries.detail.noWorkRecords') }}
        </div>
        <ul v-else class="divide-y divide-border rounded-md border border-border text-xs">
          <li v-for="wr in workRecords" :key="wr.id" class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
            <span class="flex items-center gap-1.5">
              <Badge variant="outline" class="capitalize">
                {{ wr.role }}
              </Badge>
              <span class="text-muted-foreground">
                {{ wr.model || '—' }}
                <template v-if="thinkingLevelLabel(wr.thinking_level)"> · {{ thinkingLevelLabel(wr.thinking_level) }}</template>
              </span>
            </span>
            <span class="flex items-center gap-2">
              <Badge :variant="workRecordStatusVariant(wr)">
                {{ t(`entries.status.${wr.status}`) }}
              </Badge>
              <span class="tabular-nums">{{ formatDuration(wr.work_ms) }}</span>
            </span>
          </li>
        </ul>
      </section>

      <!-- Technical details (collapsed by default) -->
      <section class="border-t border-border pt-4">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 text-sm font-medium"
          :aria-expanded="technicalOpen"
          aria-controls="entry-technical-details"
          @click="technicalOpen = !technicalOpen"
        >
          {{ t('entries.detail.technical') }}
          <ChevronDown class="size-4 shrink-0 text-muted-foreground transition-transform" :class="technicalOpen ? 'rotate-180' : ''" />
        </button>
        <dl v-show="technicalOpen" id="entry-technical-details" class="mt-3 space-y-2 text-xs">
          <div v-for="f in technicalFields" :key="f.key" class="flex items-center justify-between gap-2">
            <dt class="shrink-0 text-muted-foreground">
              {{ f.label }}
            </dt>
            <dd class="flex min-w-0 items-center gap-1.5">
              <span class="truncate font-mono" :title="f.iso || f.value">{{ f.value }}</span>
              <CopyButton v-if="f.copyable" :text="f.value" />
            </dd>
          </div>
        </dl>
      </section>
    </div>
  </TooltipProvider>
</template>
