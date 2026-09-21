<script setup lang="ts">
import { sessionMarkerLabel } from '@/lib/session-marker'
import { ChevronLeft, ChevronRight, X } from '@lucide/vue'
import AgentIcon from '@/components/agents/AgentIcon.vue'
import ClientName from '@/components/clients/ClientName.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import EntryDetailSheet from '@/components/entries/EntryDetailSheet.vue'
import SessionMarker from '@/components/entries/SessionMarker.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { EntriesExplorerFilters } from '@/composables/useEntriesExplorer'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'
import { resolveAgent } from '@/lib/agents'
import { type EntriesSessionGroup, groupEntriesBySession } from '@/lib/entries-session-group'
import { LEGACY_AGENT } from '@/lib/measurement-quality'
import type { TaskEntryRecord, WorkRecordRecord } from '@/lib/pocketbase-types'
import { resolveThinkingLevel } from '@/lib/thinking-level'

const { t } = useI18n()
useHead({ title: computed(() => t('entries.title')) })
const { formatCost, formatDateTime, formatDuration } = useFormatters()
const route = useRoute()

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { list, getOne, listWorkRecords, updateAssignment, fetchAgentOptions, listAgents } = useEntriesExplorer()
const toast = useToast()

/** Deep-link support so the dashboard's measurement-quality notice can
 * navigate here pre-filtered (e.g. `/entries?quality=waitingUnavailable
 * &dateStart=...&dateEnd=...&agent=...`) — every field stays optional and
 * this is the only place reading `route.query`, so a normal visit with no
 * query params behaves exactly as before. */
function queryString(key: string): string | undefined {
  const value = route.query[key]
  return typeof value === 'string' && value ? value : undefined
}
const initialQuality = queryString('quality')
const filters = reactive<EntriesExplorerFilters>({
  agent: queryString('agent'),
  quality: initialQuality === 'waitingUnavailable' || initialQuality === 'costUnknown' ? initialQuality : undefined,
  dateStart: queryString('dateStart'),
  dateEnd: queryString('dateEnd'),
  session_id: queryString('session_id'),
})
const page = ref(1)
const perPage = 25
const sort = ref('-started_at')
const loading = ref(true)
const items = ref<TaskEntryRecord[]>([])
const totalItems = ref(0)
const totalPages = ref(1)
const agentOptions = ref<string[]>([])

// -- session marker / filter / grouping ----------------------------------

/** Persisted "Group by session" choice (localStorage, try/catch — same
 * defensive pattern as app.vue's own locale persistence: private mode /
 * blocked storage silently falls back to the default, off). Grouping is
 * a PRESENTATION of the current page's already-fetched rows only — see
 * `displayRows` below — server pagination/sort are untouched by it. */
const GROUP_BY_SESSION_STORAGE_KEY = 'kankaku-entries-group-by-session'
const groupBySession = ref(false)
onMounted(() => {
  try {
    groupBySession.value = window.localStorage.getItem(GROUP_BY_SESSION_STORAGE_KEY) === '1'
  }
  catch {
    // localStorage unavailable (private mode, etc.) — grouping off stands.
  }
})
watch(groupBySession, (value) => {
  try {
    window.localStorage.setItem(GROUP_BY_SESSION_STORAGE_KEY, value ? '1' : '0')
  }
  catch {
    // ignore — nothing to persist to
  }
})

function filterToSession(sessionId: string) {
  filters.session_id = sessionId || undefined
}
function clearSessionFilter() {
  filters.session_id = undefined
}
/** Label for the active session-filter chip: the matching row's
 * `session_name` when the filtered session happens to be present on the
 * current page (e.g. the filter was just set by clicking a row's own
 * marker), else the short-id fallback — same rule
 * `sessionMarkerLabel` applies everywhere else. */
const sessionFilterLabel = computed(() => {
  if (!filters.session_id) return ''
  const match = items.value.find(e => e.session_id === filters.session_id)
  return sessionMarkerLabel(filters.session_id, match?.session_name)
})

/** `''` when `thinking_level` is empty/unknown — never renders an
 * "Effort" placeholder, see `resolveThinkingLevel`'s doc comment. */
function effortLabel(entry: Pick<TaskEntryRecord, 'thinking_level'>): string {
  const resolved = resolveThinkingLevel(entry.thinking_level)
  if (!resolved) return ''
  return resolved.kind === 'known' ? t(`entries.detail.thinkingLevel.${resolved.value}`) : resolved.value
}

/**
 * Flattened row list the table body actually iterates: either every
 * fetched entry (grouping off, the pre-existing behaviour, unchanged) or
 * one 'header' row per session followed by that session's 'row' entries
 * (grouping on) — a single `v-for` renders both, so the per-row `<tr>`
 * markup is written exactly once regardless of the toggle. Purely a
 * presentation of `items` (the current page's already-fetched rows);
 * never re-fetches, re-sorts, or re-paginates (see `groupEntriesBySession`'s
 * own doc comment).
 */
type DisplayRow =
  | { kind: 'header', group: EntriesSessionGroup<TaskEntryRecord> }
  | { kind: 'row', entry: TaskEntryRecord }

const displayRows = computed<DisplayRow[]>(() => {
  if (!groupBySession.value) return items.value.map(entry => ({ kind: 'row', entry }))
  return groupEntriesBySession(items.value).flatMap((group) => {
    const rows: DisplayRow[] = [{ kind: 'header', group }]
    for (const entry of group.entries) rows.push({ kind: 'row', entry })
    return rows
  })
})

async function load() {
  loading.value = true
  try {
    const res = await list({ page: page.value, perPage, sort: sort.value, filters })
    items.value = res.items
    totalItems.value = res.totalItems
    totalPages.value = res.totalPages
  }
  finally {
    loading.value = false
  }
}

function agentLabel(slug: string) {
  if (slug === LEGACY_AGENT) return t('entries.detail.quality.agentLegacy')
  return resolveAgent(slug)?.label ?? slug
}

/** Server-totals-backed primary path (`group_by: 'agent'`); falls back to
 * the deprecated unbounded `listAgents` scan on a 404 from the totals
 * route, same silent-fallback contract as every other totals call site
 * (see `TotalsRouteUnavailableError`'s doc comment). */
async function loadAgentOptions() {
  try {
    agentOptions.value = await fetchAgentOptions()
  }
  catch (err) {
    if (!(err instanceof TotalsRouteUnavailableError)) throw err
    agentOptions.value = await listAgents()
  }
}

onMounted(async () => {
  await Promise.all([ensureClients(), ensureProjects(), loadAgentOptions()])
  await load()
})

watch([filters, sort], () => { page.value = 1; load() }, { deep: true })
watch(page, load)

function clientName(id: string) {
  return clients.value.find(c => c.id === id)?.name ?? id
}
function clientById(id: string) {
  return clients.value.find(c => c.id === id)
}
function projectName(id: string) {
  return id ? (projects.value.find(p => p.id === id)?.name ?? id) : '—'
}

function toggleSort(field: string) {
  if (sort.value === field) sort.value = `-${field}`
  else if (sort.value === `-${field}`) sort.value = field
  else sort.value = `-${field}`
}

// Detail drawer
const detailOpen = ref(false)
const detail = ref<TaskEntryRecord | null>(null)
const detailWorkRecords = ref<WorkRecordRecord[]>([])
const detailClient = ref('')
const detailProject = ref('')

async function openDetail(entry: TaskEntryRecord) {
  detailOpen.value = true
  detail.value = await getOne(entry.id)
  detailClient.value = detail.value.client
  detailProject.value = detail.value.project
  detailWorkRecords.value = await listWorkRecords(entry.id) as unknown as WorkRecordRecord[]
}

async function saveAssignment() {
  if (!detail.value) return
  try {
    await updateAssignment(detail.value.id, { client: detailClient.value, project: detailProject.value })
    toast.success(t('common.saved'))
    await load()
  }
  catch {
    toast.error(t('common.error'))
  }
}

// The sheet's default initial-focus target is its first focusable element
// (a link, e.g. the client/project links in the assignment section) —
// override it to the sheet's own title instead (WCAG 2.4.3 / a11y spec
// for this screen: focus lands somewhere meaningful, not mid-content).
const detailSheet = ref<InstanceType<typeof EntryDetailSheet> | null>(null)
function onDetailOpenAutoFocus(event: Event) {
  event.preventDefault()
  nextTick(() => detailSheet.value?.focusTitle())
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold tracking-tight">
      {{ t('entries.title') }}
    </h1>

    <Card>
      <CardContent class="flex flex-wrap gap-2 p-3">
        <Select v-model="filters.client" class="w-40" :placeholder="t('common.client')" :options="[{ value: '', label: t('common.all') }, ...clients.map(c => ({ value: c.id, label: c.name }))]" />
        <Select v-model="filters.project" class="w-40" :placeholder="t('common.project')" :options="[{ value: '', label: t('common.all') }, ...projects.map(p => ({ value: p.id, label: p.name }))]" />
        <Select
v-model="filters.status" class="w-36" :placeholder="t('common.status')" :options="[
          { value: '', label: t('common.all') },
          { value: 'completed', label: t('entries.status.completed') },
          { value: 'aborted', label: t('entries.status.aborted') },
          { value: 'interrupted', label: t('entries.status.interrupted') },
        ]"
        />
        <Select
v-model="filters.agent" class="w-40" :placeholder="t('common.agent')" :options="[
          { value: '', label: t('common.all') },
          ...agentOptions.map(a => ({ value: a, label: agentLabel(a) })),
        ]"
        />
        <Select
v-model="filters.quality" class="w-48" :placeholder="t('entries.filtersFields.quality')" :options="[
          { value: '', label: t('common.all') },
          { value: 'waitingUnavailable', label: t('entries.qualityFilter.waitingUnavailable') },
          { value: 'costUnknown', label: t('entries.qualityFilter.costUnknown') },
        ]"
        />
        <Input v-model="filters.model" :placeholder="t('common.model')" class="w-32" />
        <Input v-model="filters.machine" :placeholder="t('entries.filtersFields.machine')" class="w-32" />
        <Input v-model="filters.dateStart" type="date" class="w-36" />
        <Input v-model="filters.dateEnd" type="date" class="w-36" />
        <Input v-model="filters.search" :placeholder="t('entries.searchPrompt')" class="w-56" />
      </CardContent>
    </Card>

    <div class="flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-sm text-muted-foreground">
        <Switch v-model="groupBySession" />
        {{ t('entries.groupBySession') }}
      </label>
      <Badge v-if="filters.session_id" variant="secondary" class="gap-1.5">
        {{ t('entries.sessionFilter.chip', { label: sessionFilterLabel }) }}
        <button type="button" class="rounded-full hover:bg-muted-foreground/20" :aria-label="t('entries.sessionFilter.remove')" @click="clearSessionFilter">
          <X class="size-3" aria-hidden="true" />
        </button>
      </Badge>
    </div>

    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="cursor-pointer" @click="toggleSort('started_at')">
                {{ t('common.started') }}
              </TableHead>
              <TableHead>{{ t('entries.session') }}</TableHead>
              <TableHead>{{ t('common.client') }}</TableHead>
              <TableHead>{{ t('common.project') }}</TableHead>
              <TableHead>{{ t('common.status') }}</TableHead>
              <TableHead>{{ t('common.agent') }}</TableHead>
              <TableHead>{{ t('common.model') }}</TableHead>

              <TableHead class="cursor-pointer text-right" @click="toggleSort('work_ms')">
                {{ t('common.work') }}
              </TableHead>
              <TableHead class="cursor-pointer text-right" @click="toggleSort('cost')">
                {{ t('common.cost') }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="loading">
              <TableRow v-for="i in 6" :key="i">
                <TableCell colspan="9">
                  <Skeleton class="h-5 w-full" />
                </TableCell>
              </TableRow>
            </template>
            <template v-else>
              <template v-for="dr in displayRows" :key="dr.kind === 'header' ? `group-${dr.group.sessionId}` : dr.entry.id">
                <!-- "Group by session" header row: a presentational summary of the
                     rows immediately below it, never a real task_entries row — see
                     `displayRows`'s doc comment. Real <th scope="colgroup"> semantics
                     (TableHead forwards attrs to its root <th>), and the only
                     interactive control inside it is SessionMarker's own <button>,
                     which is already keyboard-reachable. -->
                <TableRow v-if="dr.kind === 'header'" class="bg-muted/40 hover:bg-muted/40">
                  <TableHead scope="colgroup" :colspan="9" class="h-auto py-2 font-normal">
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <SessionMarker :session-id="dr.group.sessionId" :session-name="dr.group.sessionName" @click="filterToSession(dr.group.sessionId)" />
                      <span class="text-xs text-muted-foreground">{{ t('entries.sessionGroup.count', { count: dr.group.entries.length }) }}</span>
                      <span class="text-xs tabular-nums text-muted-foreground">{{ t('common.work') }}: {{ formatDuration(dr.group.workMs) }}</span>
                      <span class="text-xs tabular-nums text-muted-foreground">{{ t('common.cost') }}: {{ formatCost(dr.group.cost) }}</span>
                    </div>
                  </TableHead>
                </TableRow>
                <TableRow v-else class="cursor-pointer" @click="openDetail(dr.entry)">
                  <TableCell class="tabular-nums">
                    {{ formatDateTime(dr.entry.started_at) }}
                  </TableCell>
                  <TableCell>
                    <SessionMarker :session-id="dr.entry.session_id" :session-name="dr.entry.session_name" @click="filterToSession(dr.entry.session_id)" />
                  </TableCell>
                  <TableCell>
                    <ClientName v-if="clientById(dr.entry.client)" :client="clientById(dr.entry.client)!" size="xs" class="max-w-36" />
                    <span v-else>{{ clientName(dr.entry.client) }}</span>
                  </TableCell>
                  <TableCell>{{ projectName(dr.entry.project) }}</TableCell>
                  <TableCell>{{ t(`entries.status.${dr.entry.status}`) }}</TableCell>
                  <TableCell>
                    <AgentIcon :agent="dr.entry.agent" size="sm" />
                  </TableCell>
                  <TableCell class="text-muted-foreground">
                    {{ dr.entry.model }}
                    <span v-if="effortLabel(dr.entry)" class="text-[10px] text-muted-foreground/70">({{ effortLabel(dr.entry) }})</span>
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ formatDuration(dr.entry.work_ms) }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ formatCost(dr.entry.cost) }}
                  </TableCell>
                </TableRow>
              </template>
            </template>
          </TableBody>
        </Table>
        <EmptyState v-if="!loading && items.length === 0" :title="t('entries.empty')" class="m-4" />

        <div class="flex items-center justify-between border-t border-border p-3 text-sm text-muted-foreground">
          <span>{{ totalItems }} · {{ page }}/{{ totalPages }}</span>
          <div class="flex gap-2">
            <Button size="icon" variant="outline" :disabled="page <= 1" :aria-label="t('entries.pagination.previous')" :title="t('entries.pagination.previous')" @click="page--">
              <ChevronLeft class="size-4" />
            </Button>
            <Button size="icon" variant="outline" :disabled="page >= totalPages" :aria-label="t('entries.pagination.next')" :title="t('entries.pagination.next')" @click="page++">
              <ChevronRight class="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Sheet v-model:open="detailOpen">
      <SheetContent side="right" class="flex w-full flex-col sm:w-[36rem] sm:max-w-xl" @open-auto-focus="onDetailOpenAutoFocus">
        <EntryDetailSheet
          v-if="detail"
          ref="detailSheet"
          v-model:client="detailClient"
          v-model:project="detailProject"
          :entry="detail"
          :work-records="detailWorkRecords"
          :clients="clients"
          :projects="projects"
          @save="saveAssignment"
        />
      </SheetContent>
    </Sheet>
  </div>
</template>
