<script setup lang="ts">
import { sessionMarkerLabel } from '@/lib/session-marker'
import { ChevronDown, ChevronLeft, ChevronRight, X } from '@lucide/vue'
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
import type { SessionTotal } from '@/composables/useSessions'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'
import { resolveAgent } from '@/lib/agents'
import { entriesDateRangeToTotalsRange, splitEntriesFiltersForTotals } from '@/lib/entries-session-filters'
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
const { tasks, ensureLoaded: ensureTasks, refresh: refreshTasks, byId: taskById } = useTasks()
const { list, getOne, listWorkRecords, updateAssignment, fetchAgentOptions, listAgents } = useEntriesExplorer()
const { fetchSessionTotalsForEntries } = useSessions()
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
 * blocked storage silently falls back to the default). Absent key means
 * a fresh browser, which now defaults to grouped (owner decision,
 * 2026-09-22): the session is the unit the owner reasons in day to day,
 * the entry is the finer-grained audit unit. `'0'` still means flat,
 * `'1'` still means grouped — only the "never set" case changed. */
const GROUP_BY_SESSION_STORAGE_KEY = 'kankaku-entries-group-by-session'
const groupBySession = ref(true)
onMounted(() => {
  try {
    const stored = window.localStorage.getItem(GROUP_BY_SESSION_STORAGE_KEY)
    groupBySession.value = stored === null ? true : stored === '1'
  }
  catch {
    // localStorage unavailable (private mode, etc.) — the default (grouped) stands.
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
/** Reload whenever the toggle changes (server-backed grouped mode needs
 * its own fetch, unlike the old purely-presentational toggle) — reset to
 * page 1, same as a filter change. Registered before `refresh` reads
 * `groupBySession.value` below is declared further down, but that's
 * fine: the watcher callback only runs later, once `refresh` exists. */
watch(groupBySession, () => { page.value = 1; refresh() })

// -- server-backed grouped mode (primary) --------------------------------

/** `true` once a `group_by: 'session'` totals fetch has 404'd for this
 * session — falls back to the old flat-page + client-side grouping
 * (`displayRows` below) exactly as before. Reset to `false` at the start
 * of every grouped-mode load attempt, so a route that comes back later
 * (the owner restarts PocketBase) is picked up without a reload. */
const groupingFallback = ref(false)
/** `true` only while the server-backed session rows are the active
 * render path — grouped mode AND the totals route answered. Everywhere
 * else (flat mode, or grouped mode that fell back) renders the
 * pre-existing `displayRows` table body unchanged. */
const primaryGrouped = computed(() => groupBySession.value && !groupingFallback.value)

/** The Entries filters the totals contract can honor, split from the
 * ones it cannot (`app/lib/entries-session-filters.ts`) — used both for
 * the session-totals fetch below and for a session row's lazy entries
 * fetch. The unsupported side (`model`/`quality`/`search`) doesn't need
 * a separate name here: their controls are disabled outright whenever
 * `primaryGrouped` is true, per the feature's own "always disabled, not
 * only when active" design (see the filter bar's `:disabled` bindings). */
const entriesFiltersSplit = computed(() => splitEntriesFiltersForTotals(filters))

const sessionRows = ref<SessionTotal[]>([])
const sessionTotalGroups = ref(0)
const sessionTotalPages = ref(1)

/** Per-session lazy fetch state for the expanded entries list, keyed by
 * `sessionId` — same shape/idiom as `pages/tasks/index.vue`'s
 * `sessionEntriesRaw`, but with an explicit `error` flag (this screen
 * shows a retry, rather than silently rendering zero rows) per the
 * feature's own requirement. */
interface SessionRowEntriesState {
  loading: boolean
  error: boolean
  items: TaskEntryRecord[]
}
/** A `reactive` Map (not a plain `Record`): Vue's collection reactivity
 * tracks `.set`/`.delete`/`.clear()` directly, and `.clear()` lets a
 * reload reset every session's cached entries in one call without
 * dynamically `delete`-ing computed keys. */
const sessionRowEntries = reactive(new Map<string, SessionRowEntriesState>())
const expandedSessions = reactive(new Set<string>())

async function loadSessionEntries(sessionId: string) {
  sessionRowEntries.set(sessionId, { loading: true, error: false, items: [] })
  try {
    const res = await list({
      page: 1,
      perPage: 200,
      sort: sort.value,
      filters: { ...entriesFiltersSplit.value.groupable, dateStart: filters.dateStart, dateEnd: filters.dateEnd, session_id: sessionId },
    })
    sessionRowEntries.set(sessionId, { loading: false, error: false, items: res.items })
  }
  catch {
    sessionRowEntries.set(sessionId, { loading: false, error: true, items: [] })
  }
}

function toggleSession(sessionId: string) {
  if (expandedSessions.has(sessionId)) {
    expandedSessions.delete(sessionId)
    return
  }
  expandedSessions.add(sessionId)
  if (!sessionRowEntries.has(sessionId)) loadSessionEntries(sessionId)
}

async function loadSessions() {
  expandedSessions.clear()
  sessionRowEntries.clear()

  const { from, to } = entriesDateRangeToTotalsRange(filters)
  const res = await fetchSessionTotalsForEntries({
    filters: entriesFiltersSplit.value.groupable,
    from,
    to,
    page: page.value,
    perPage,
  })
  sessionRows.value = res.sessions
  sessionTotalGroups.value = res.totalGroups
  sessionTotalPages.value = res.totalPages || 1
}

function taskName(id: string): string {
  if (!id) return ''
  return taskById(id)?.title ?? id
}

const displayTotalItems = computed(() => primaryGrouped.value ? sessionTotalGroups.value : totalItems.value)
const displayTotalPages = computed(() => primaryGrouped.value ? sessionTotalPages.value : totalPages.value)

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
 * `sessionMarkerLabel` applies everywhere else. Checks the flat/fallback
 * `items` first, then the primary grouped mode's own `sessionRows` (the
 * two are never both populated at once — see `refresh`). */
const sessionFilterLabel = computed(() => {
  if (!filters.session_id) return ''
  const flatMatch = items.value.find(e => e.session_id === filters.session_id)
  if (flatMatch) return sessionMarkerLabel(filters.session_id, flatMatch.session_name)
  const sessionMatch = sessionRows.value.find(s => s.sessionId === filters.session_id)
  return sessionMarkerLabel(filters.session_id, sessionMatch?.sessionName)
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

const groupOf = computed(() => {
  const map = new Map<string, EntriesSessionGroup<TaskEntryRecord>>()
  // Only meaningful for the flat-page client-side grouping path (flat mode
  // renders no headers at all; the primary server-backed grouped mode
  // never reads this — see `displayRows`/the template's `v-else` branch).
  if (groupBySession.value && groupingFallback.value) for (const group of groupEntriesBySession(items.value)) for (const e of group.entries) map.set(e.id, group)
  return map
})

/** `true` when some group on this page disagrees on client or project —
 * the only case the extra column exists for. */
const anyMixedGroup = computed(() => [...new Set(groupOf.value.values())].some(g => g.clientIds.length > 1 || g.projectIds.length > 1))

/** What a row still has to say itself while grouped: nothing when its
 * group agrees on client and project (the header already said it). */
function mixedGroupCell(entry: TaskEntryRecord): string {
  const group = groupOf.value.get(entry.id)
  if (!group) return ''
  const parts: string[] = []
  if (group.clientIds.length > 1) parts.push(clientName(entry.client))
  if (group.projectIds.length > 1) parts.push(projectName(entry.project))
  return parts.join(' · ')
}

/** Columns the table currently renders: session+client+project collapse
 * into one "only when they differ" column while grouping — flat mode and
 * the primary server-backed grouped mode both show the full flat column
 * set (9): the primary mode's session-summary row spans across it, and
 * its expanded entries are the same flat rows as flat mode's. Only the
 * fallback client-side grouping still collapses to the narrower
 * "mixed"-or-not layout, exactly as before. */
const columnCount = computed(() => {
  if (!groupBySession.value) return 9
  if (groupingFallback.value) return anyMixedGroup.value ? 7 : 6
  return 9
})

const displayRows = computed<DisplayRow[]>(() => {
  if (!groupBySession.value || !groupingFallback.value) return items.value.map(entry => ({ kind: 'row', entry }))
  return groupEntriesBySession(items.value).flatMap((group) => {
    const rows: DisplayRow[] = [{ kind: 'header', group }]
    for (const entry of group.entries) rows.push({ kind: 'row', entry })
    return rows
  })
})

/** Flat, entry-level fetch (unchanged): the pre-existing behaviour used
 * by flat mode, and by grouped mode's fallback when the totals route
 * 404s (`refresh` below). */
async function loadFlat() {
  const res = await list({ page: page.value, perPage, sort: sort.value, filters })
  items.value = res.items
  totalItems.value = res.totalItems
  totalPages.value = res.totalPages
}

/**
 * Single entry point every mount/filter/sort/page/toggle change calls.
 * Flat mode: the pre-existing entry-level fetch. Grouped mode: the
 * server-backed `group_by: 'session'` totals fetch — on
 * `TotalsRouteUnavailableError` (the owner hasn't restarted PocketBase
 * since this feature shipped), falls back to the flat fetch and lets the
 * pre-existing `displayRows` client-side grouping render it, exactly as
 * "Group by session" behaved before this feature.
 */
async function refresh() {
  loading.value = true
  try {
    if (!groupBySession.value) {
      groupingFallback.value = false
      await loadFlat()
      return
    }
    try {
      await loadSessions()
      groupingFallback.value = false
    }
    catch (err) {
      if (!(err instanceof TotalsRouteUnavailableError)) throw err
      groupingFallback.value = true
      await loadFlat()
    }
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
  await Promise.all([ensureClients(), ensureProjects(), ensureTasks(), loadAgentOptions()])
  await refresh()
})

watch([filters, sort], () => { page.value = 1; refresh() }, { deep: true })
watch(page, refresh)

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
const detailTask = ref('')

async function openDetail(entry: TaskEntryRecord) {
  detailOpen.value = true
  detail.value = await getOne(entry.id)
  detailClient.value = detail.value.client
  detailProject.value = detail.value.project
  detailTask.value = detail.value.task
  detailWorkRecords.value = await listWorkRecords(entry.id) as unknown as WorkRecordRecord[]
}

async function saveAssignment() {
  if (!detail.value) return
  try {
    const taskChanged = detailTask.value !== detail.value.task
    await updateAssignment(detail.value.id, { client: detailClient.value, project: detailProject.value, task: detailTask.value })
    toast.success(t('common.saved'))
    // Re-read the entry so the sheet's read-only summary shows the new task,
    // and the task list too: linking work moves an open task to "doing"
    // on the hub (task-auto-doing hook).
    detail.value = await getOne(detail.value.id)
    await Promise.all([refresh(), taskChanged ? refreshTasks() : Promise.resolve()])
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
v-model="filters.quality" class="w-48" :disabled="primaryGrouped" :title="primaryGrouped ? t('entries.sessionGroup.unsupportedFilterHint') : undefined" :placeholder="t('entries.filtersFields.quality')" :options="[
          { value: '', label: t('common.all') },
          { value: 'waitingUnavailable', label: t('entries.qualityFilter.waitingUnavailable') },
          { value: 'costUnknown', label: t('entries.qualityFilter.costUnknown') },
        ]"
        />
        <Input v-model="filters.model" :placeholder="t('common.model')" class="w-32" :disabled="primaryGrouped" :title="primaryGrouped ? t('entries.sessionGroup.unsupportedFilterHint') : undefined" />
        <Input v-model="filters.machine" :placeholder="t('entries.filtersFields.machine')" class="w-32" />
        <Input v-model="filters.dateStart" type="date" class="w-36" />
        <Input v-model="filters.dateEnd" type="date" class="w-36" />
        <Input v-model="filters.search" :placeholder="t('entries.searchPrompt')" class="w-56" :disabled="primaryGrouped" :title="primaryGrouped ? t('entries.sessionGroup.unsupportedFilterHint') : undefined" />
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
              <!-- Flat mode, and the primary server-backed grouped mode (its
                   expanded rows are these same flat cells, so they need
                   these same headings): session, client and project each
                   get their own column. Only the fallback client-side
                   grouping still collapses them into one "only when they
                   differ" column below — see `columnCount`'s doc comment. -->
              <template v-if="!groupingFallback">
                <TableHead>{{ t('entries.session') }}</TableHead>
                <TableHead>{{ t('common.client') }}</TableHead>
                <TableHead>{{ t('common.project') }}</TableHead>
              </template>
              <TableHead v-else-if="anyMixedGroup">{{ t('entries.sessionGroup.mixedColumn') }}</TableHead>
              <TableHead>{{ t('common.status') }}</TableHead>
              <TableHead>{{ t('common.agent') }}</TableHead>
              <TableHead>{{ t('common.model') }}</TableHead>

              <TableHead class="cursor-pointer text-right" @click="toggleSort('work_ms')">
                <span :title="t('common.timeHint')">{{ t('common.time') }}</span>
              </TableHead>
              <TableHead class="cursor-pointer text-right" @click="toggleSort('cost')">
                {{ t('common.cost') }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="loading">
              <TableRow v-for="i in 6" :key="i">
                <TableCell :colspan="columnCount">
                  <Skeleton class="h-5 w-full" />
                </TableCell>
              </TableRow>
            </template>
            <template v-else-if="primaryGrouped">
              <!-- PRIMARY grouped mode: one row per SERVER-SUMMARIZED session
                   (`fetchSessionTotalsForEntries`, paginated by session — the
                   page's own pagination controls below now page sessions,
                   not entries), lazily expandable to that session's entries. -->
              <template v-for="row in sessionRows" :key="row.sessionId">
                <TableRow class="cursor-pointer bg-muted/40 hover:bg-muted/40" @click="toggleSession(row.sessionId)">
                  <TableHead scope="colgroup" :colspan="columnCount" class="h-auto py-2 font-normal">
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <SessionMarker :session-id="row.sessionId" :session-name="row.sessionName" @click="filterToSession(row.sessionId)" />
                      <template v-if="row.distinctClient === 1">
                        <ClientName v-if="clientById(row.sampleClient)" :client="clientById(row.sampleClient)!" size="xs" class="max-w-48 text-foreground" />
                        <span v-else class="text-foreground">{{ clientName(row.sampleClient) }}</span>
                      </template>
                      <span v-else class="text-foreground">{{ t('entries.sessionGroup.clients', { count: row.distinctClient }) }}</span>
                      <span v-if="row.distinctProject === 1" class="text-foreground">{{ projectName(row.sampleProject) }}</span>
                      <span v-else class="text-foreground">{{ t('entries.sessionGroup.projects', { count: row.distinctProject }) }}</span>
                      <span v-if="row.distinctTask > 1" class="text-muted-foreground">{{ t('entries.sessionGroup.tasks', { count: row.distinctTask }) }}</span>
                      <span v-else-if="row.sampleTask" class="text-muted-foreground">{{ taskName(row.sampleTask) }}</span>
                      <span v-else class="text-muted-foreground" :title="t('entries.detail.noTask')">—</span>
                      <span class="text-xs text-muted-foreground">{{ t('entries.sessionGroup.count', { count: row.entries }) }}</span>
                      <span class="text-xs tabular-nums text-muted-foreground"><span :title="t('common.timeHint')">{{ t('common.time') }}</span>: {{ formatDuration(row.workMs) }}</span>
                      <span class="text-xs tabular-nums text-muted-foreground">{{ t('common.cost') }}: {{ formatCost(row.cost) }}</span>
                      <button
                        type="button"
                        class="ml-auto rounded p-0.5 hover:bg-muted-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        :aria-label="t('entries.sessionGroup.entriesToggle')"
                        :aria-expanded="expandedSessions.has(row.sessionId)"
                        @click.stop="toggleSession(row.sessionId)"
                      >
                        <ChevronDown class="size-4 transition-transform" :class="{ 'rotate-180': expandedSessions.has(row.sessionId) }" aria-hidden="true" />
                      </button>
                    </div>
                  </TableHead>
                </TableRow>
                <template v-if="expandedSessions.has(row.sessionId)">
                  <TableRow v-if="sessionRowEntries.get(row.sessionId)?.loading">
                    <TableCell :colspan="columnCount" class="text-sm text-muted-foreground">
                      {{ t('entries.sessionGroup.loadingEntries') }}
                    </TableCell>
                  </TableRow>
                  <TableRow v-else-if="sessionRowEntries.get(row.sessionId)?.error">
                    <TableCell :colspan="columnCount">
                      <div class="flex items-center gap-2 text-sm text-destructive">
                        <span>{{ t('entries.sessionGroup.loadError') }}</span>
                        <Button size="sm" variant="outline" @click.stop="loadSessionEntries(row.sessionId)">
                          {{ t('entries.sessionGroup.retry') }}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow v-else-if="(sessionRowEntries.get(row.sessionId)?.items.length ?? 0) === 0">
                    <TableCell :colspan="columnCount" class="text-sm text-muted-foreground">
                      {{ t('entries.empty') }}
                    </TableCell>
                  </TableRow>
                  <TableRow v-for="entry in sessionRowEntries.get(row.sessionId)?.items ?? []" :key="entry.id" class="cursor-pointer" @click="openDetail(entry)">
                    <TableCell class="tabular-nums">
                      {{ formatDateTime(entry.started_at) }}
                    </TableCell>
                    <TableCell>
                      <SessionMarker :session-id="entry.session_id" :session-name="entry.session_name" @click="filterToSession(entry.session_id)" />
                    </TableCell>
                    <TableCell>
                      <ClientName v-if="clientById(entry.client)" :client="clientById(entry.client)!" size="xs" class="max-w-36" />
                      <span v-else>{{ clientName(entry.client) }}</span>
                    </TableCell>
                    <TableCell>{{ projectName(entry.project) }}</TableCell>
                    <TableCell>{{ t(`entries.status.${entry.status}`) }}</TableCell>
                    <TableCell>
                      <AgentIcon :agent="entry.agent" size="sm" />
                    </TableCell>
                    <TableCell class="text-muted-foreground">
                      {{ entry.model }}
                      <span v-if="effortLabel(entry)" class="text-[10px] text-muted-foreground/70">({{ effortLabel(entry) }})</span>
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                      {{ formatDuration(entry.work_ms) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums">
                      {{ formatCost(entry.cost) }}
                    </TableCell>
                  </TableRow>
                </template>
              </template>
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
                  <TableHead scope="colgroup" :colspan="columnCount" class="h-auto py-2 font-normal">
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <SessionMarker :session-id="dr.group.sessionId" :session-name="dr.group.sessionName" @click="filterToSession(dr.group.sessionId)" />
                      <template v-if="dr.group.clientIds.length === 1">
                        <ClientName v-if="clientById(dr.group.clientIds[0]!)" :client="clientById(dr.group.clientIds[0]!)!" size="xs" class="max-w-48 text-foreground" />
                        <span v-else class="text-foreground">{{ clientName(dr.group.clientIds[0]!) }}</span>
                      </template>
                      <span v-else class="text-foreground">{{ t('entries.sessionGroup.clients', { count: dr.group.clientIds.length }) }}</span>
                      <span v-if="dr.group.projectIds.length === 1" class="text-foreground">{{ projectName(dr.group.projectIds[0]!) }}</span>
                      <span v-else class="text-foreground">{{ t('entries.sessionGroup.projects', { count: dr.group.projectIds.length }) }}</span>
                      <span class="text-xs text-muted-foreground">{{ t('entries.sessionGroup.count', { count: dr.group.entries.length }) }}</span>
                      <span class="text-xs tabular-nums text-muted-foreground"><span :title="t('common.timeHint')">{{ t('common.time') }}</span>: {{ formatDuration(dr.group.workMs) }}</span>
                      <span class="text-xs tabular-nums text-muted-foreground">{{ t('common.cost') }}: {{ formatCost(dr.group.cost) }}</span>
                    </div>
                  </TableHead>
                </TableRow>
                <TableRow v-else class="cursor-pointer" @click="openDetail(dr.entry)">
                  <TableCell class="tabular-nums">
                    {{ formatDateTime(dr.entry.started_at) }}
                  </TableCell>
                  <template v-if="!groupBySession">
                    <TableCell>
                      <SessionMarker :session-id="dr.entry.session_id" :session-name="dr.entry.session_name" @click="filterToSession(dr.entry.session_id)" />
                    </TableCell>
                    <TableCell>
                      <ClientName v-if="clientById(dr.entry.client)" :client="clientById(dr.entry.client)!" size="xs" class="max-w-36" />
                      <span v-else>{{ clientName(dr.entry.client) }}</span>
                    </TableCell>
                    <TableCell>{{ projectName(dr.entry.project) }}</TableCell>
                  </template>
                  <!-- Grouped: empty unless the group's rows DISAGREE on client
                       or project — then each row keeps saying its own, so
                       lifting them to the header never hides a difference. -->
                  <TableCell v-else-if="anyMixedGroup" class="text-muted-foreground">
                    {{ mixedGroupCell(dr.entry) }}
                  </TableCell>
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
        <EmptyState v-if="!loading && (primaryGrouped ? sessionRows.length === 0 : items.length === 0)" :title="t('entries.empty')" class="m-4" />

        <div class="flex items-center justify-between border-t border-border p-3 text-sm text-muted-foreground">
          <span>{{ displayTotalItems }} · {{ page }}/{{ displayTotalPages }}</span>
          <div class="flex gap-2">
            <Button size="icon" variant="outline" :disabled="page <= 1" :aria-label="t('entries.pagination.previous')" :title="t('entries.pagination.previous')" @click="page--">
              <ChevronLeft class="size-4" />
            </Button>
            <Button size="icon" variant="outline" :disabled="page >= displayTotalPages" :aria-label="t('entries.pagination.next')" :title="t('entries.pagination.next')" @click="page++">
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
          v-model:task="detailTask"
          :entry="detail"
          :work-records="detailWorkRecords"
          :clients="clients"
          :projects="projects"
          :tasks="tasks"
          @save="saveAssignment"
        />
      </SheetContent>
    </Sheet>
  </div>
</template>
