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
import { ChevronDown, CircleCheck, CircleX, TriangleAlert } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import CopyButton from '@/components/commands/CopyButton.vue'
import { Badge } from '@/components/ui/badge'
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
import { formatCost, formatDateTime, formatDuration, formatTokens } from '@/lib/format'
import type { ClientRecord, ProjectRecord, TaskEntryRecord, WorkRecordRecord } from '@/lib/pocketbase-types'

const props = defineProps<{
  entry: TaskEntryRecord
  workRecords: WorkRecordRecord[]
  clients: ClientRecord[]
  projects: ProjectRecord[]
}>()

const emit = defineEmits<{ save: [] }>()

const client = defineModel<string>('client', { required: true })
const project = defineModel<string>('project', { required: true })

const { t, locale } = useI18n()

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

const startedAtHuman = computed(() => formatDateTime(props.entry.started_at, locale.value))

// -- summary --------------------------------------------------------------

const ratio = computed(() => computeWorkWaitRatio(props.entry.work_ms, props.entry.waiting_ms, props.entry.wall_ms))
const workWaitBarLabel = computed(() => t('entries.detail.workWaitBarLabel', {
  work: formatDuration(props.entry.work_ms),
  wait: formatDuration(props.entry.waiting_ms),
  wall: formatDuration(props.entry.wall_ms),
}))

// -- assignment -------------------------------------------------------------

const clientRelation = computed(() => resolveRelation(props.entry.client, props.entry.expand?.client))
const projectRelation = computed(() => resolveRelation(props.entry.project, props.entry.expand?.project))
const taskRelation = computed(() => resolveRelation(
  props.entry.task,
  props.entry.expand?.task ? { name: props.entry.expand.task.title } : undefined,
))

const projectSelectOptions = computed(() => [
  { value: '', label: t('common.none') },
  ...props.projects.filter(p => p.client === client.value).map(p => ({ value: p.id, label: p.name })),
])

const repoProjectTruncated = computed(() => props.entry.repo_project ? truncateMiddle(props.entry.repo_project, 36) : '')

// -- tokens -----------------------------------------------------------------

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
    { key: 'created', label: t('entries.detail.fieldCreated'), value: e.created ? formatDateTime(e.created, locale.value) : '—', iso: e.created },
    { key: 'updated', label: t('entries.detail.fieldUpdated'), value: e.updated ? formatDateTime(e.updated, locale.value) : '—', iso: e.updated },
    { key: 'ended_at', label: t('entries.detail.fieldEndedAt'), value: e.ended_at ? formatDateTime(e.ended_at, locale.value) : '—', iso: e.ended_at },
  ]
})

defineOptions({ inheritAttrs: false })
</script>

<template>
  <TooltipProvider>
    <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-8 pb-6">
      <!-- Header -->
      <div class="flex flex-col gap-2">
        <h2
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
            <p class="font-medium tabular-nums">
              {{ formatDuration(entry.work_ms) }}
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
          <div>
            <p class="text-xs text-muted-foreground">
              {{ t('dashboard.kpi.cost') }}
            </p>
            <p class="font-medium tabular-nums">
              {{ formatCost(entry.cost) }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">
              {{ t('entries.detail.runs') }}
            </p>
            <p class="font-medium tabular-nums">
              {{ entry.runs }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">
              {{ t('entries.detail.turns') }}
            </p>
            <p class="font-medium tabular-nums">
              {{ entry.turns }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted-foreground">
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
            <dt class="text-xs text-muted-foreground">
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
            <dt class="text-xs text-muted-foreground">
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
            <dt class="text-xs text-muted-foreground">
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
            <dt class="text-xs text-muted-foreground">
              {{ t('entries.detail.legacyLabel') }}
            </dt>
            <dd class="min-w-0 truncate text-right">
              {{ entry.legacy_client_label }}
            </dd>
          </div>
          <div v-if="entry.repo_project" class="flex items-center justify-between gap-2">
            <dt class="text-xs text-muted-foreground">
              {{ t('entries.detail.repoPath') }}
            </dt>
            <dd class="flex min-w-0 items-center gap-1.5">
              <span class="truncate font-mono text-xs" :title="entry.repo_project">{{ repoProjectTruncated }}</span>
              <CopyButton :text="entry.repo_project" />
            </dd>
          </div>
        </dl>

        <div class="space-y-2 rounded-md border border-dashed border-border p-3">
          <Select v-model="client" :options="clients.map(c => ({ value: c.id, label: c.name }))" />
          <Select v-model="project" :placeholder="t('common.none')" :options="projectSelectOptions" />
          <Button size="sm" class="self-start" @click="emit('save')">
            {{ t('common.save') }}
          </Button>
        </div>
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
        <p class="text-sm">
          <span class="text-xs text-muted-foreground">{{ t('common.model') }}: </span>
          <span class="font-medium">{{ entry.model || '—' }}</span>
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
        <pre v-if="entry.prompt" class="max-h-48 overflow-y-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words text-foreground">{{ entry.prompt }}</pre>
        <p v-else class="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          {{ t('entries.detail.promptEmpty') }}
          <NuxtLink to="/commands#config" class="font-medium text-primary hover:underline">
            {{ t('entries.detail.promptEmptyLink') }}
          </NuxtLink>
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
              <span class="text-muted-foreground">{{ wr.model || '—' }}</span>
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
