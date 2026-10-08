<script setup lang="ts">
import { sessionMarkerLabel } from '@/lib/session-marker'
import { ChevronDown, ChevronLeft, ChevronRight, Layers, List, X } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import ClientName from '@/components/clients/ClientName.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ExportMenu from '@/components/common/ExportMenu.vue'
import EntryDetailSheet from '@/components/entries/EntryDetailSheet.vue'
import EntriesDateRangeFilter from '@/components/entries/EntriesDateRangeFilter.vue'
import EntriesMobileLedger from '@/components/entries/EntriesMobileLedger.vue'
import SessionMarker from '@/components/entries/SessionMarker.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { EntriesExplorerFilters } from '@/composables/useEntriesExplorer'
import type { Narrative } from '@/composables/useEngramNarrative'
import type { SessionTotal } from '@/composables/useSessions'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'
import { resolveAgent } from '@/lib/agents'
import { formatCompactEntryDateTime } from '@/lib/entries-compact-date'
import { deriveEntryTitle, statusPresentation } from '@/lib/entry-detail'
import { canGroupEntriesFilters, entriesDateRangeToTotalsRange, splitEntriesFiltersForTotals } from '@/lib/entries-session-filters'
import { type EntriesSessionGroup, groupEntriesBySession } from '@/lib/entries-session-group'
import { pageMemberAttribution, sessionMemberAttribution, type MemberAttribution } from '@/lib/entries-member-attribution'
import { buildEntriesDetailExport, createCsvExport, createXlsxExport } from '@/lib/export'
import { LEGACY_AGENT } from '@/lib/measurement-quality'
import { narrativeBody, narrativeBodyLineCount } from '@/lib/narrative-format'
import type { TaskEntryRecord, WorkRecordRecord } from '@/lib/pocketbase-types'
import { sessionTitle } from '@/lib/session-title'
import { resolvePreset } from '@/lib/period'

const { t } = useI18n()
useHead({ title: computed(() => t('entries.title')) })
const { formatCost, formatDuration } = useFormatters()
const route = useRoute()
const router = useRouter()

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { tasks, ensureLoaded: ensureTasks, refresh: refreshTasks, create: createTask, byId: taskById } = useTasks()
const { list, fetchExport, getOne, listWorkRecords, updateAssignment, collectEntryIds, bulkAssignTask, fetchAgentOptions, listAgents } = useEntriesExplorer()
const { fetchSessionTotalsForEntries } = useSessions()
const { ensureStatus: ensureEngramStatus, forSessions: engramForSessions } = useEngramNarrative()
const toast = useToast()
const { canWrite } = useAuth()
const { members: teamMembers, refresh: refreshTeamMembers } = useTeamCatalog()

/** Deep-link support so the dashboard's measurement-quality notice can
 * navigate here pre-filtered (e.g. `/entries?quality=waitingUnavailable
 * &dateStart=...&dateEnd=...&agent=...`) — every field stays optional and
 * this is the only place reading `route.query`, so a normal visit with no
 * query params starts with the shared last-30-local-days preset. */
function queryString(key: string): string | undefined {
  const value = route.query[key]
  return typeof value === 'string' && value ? value : undefined
}
const initialQuality = queryString('quality')
const filters = reactive<EntriesExplorerFilters>({
  agent: queryString('agent'),
  quality: initialQuality === 'waitingUnavailable' || initialQuality === 'costUnknown' ? initialQuality : undefined,
  ...routeDateRange(),
  session_id: queryString('session_id'),
})
// Resolve before the first browse; explicit one-sided bounds stay one-sided.
function routeDateRange() {
  const dateStart = queryString('dateStart')
  const dateEnd = queryString('dateEnd')
  if (dateStart || dateEnd || queryString('dateRange') === 'all') return { dateStart, dateEnd }
  const range = resolvePreset('30d')
  return { dateStart: range.start, dateEnd: range.end }
}
watch(() => [route.query.dateStart, route.query.dateEnd, route.query.dateRange], () => {
  Object.assign(filters, routeDateRange())
})
async function commitDateRange(range: { start?: string, end?: string }) {
  const query = { ...route.query }
  delete query.dateStart
  delete query.dateEnd
  delete query.dateRange
  if (range.start) query.dateStart = range.start
  if (range.end) query.dateEnd = range.end
  if (!range.start && !range.end) query.dateRange = 'all'
  try {
    const failure = await router.push({ query, hash: route.hash })
    if (failure) throw failure
  }
  catch { toast.error(t('entries.clearFiltersError')) }
}
// Move the existing controls, rather than cloning them: visual and keyboard
// order agree at both breakpoints; mobile B moves project into More.
const desktopFilters = ref(false)
const moreFiltersOpen = ref(false)
// One disclosure preference follows the user across the breakpoint.
const advancedFilterCount = computed(() => [filters.model, filters.quality, filters.search, filters.agent, filters.status, filters.machine, ...(!desktopFilters.value ? [filters.project] : [])].filter(Boolean).length)
onMounted(() => {
  const media = window.matchMedia('(min-width: 768px)')
  const inFilters = (element: Element | null): element is HTMLElement => element instanceof HTMLElement && !!(element.closest('[data-testid="entries-filter-controls"]') || element.closest('#entries-advanced-filters') || element.id === 'entries-grouping-switch')
  let lastFocused: HTMLElement | null = null
  const rememberFocus = (event: FocusEvent) => { lastFocused = inFilters(event.target as Element) ? event.target as HTMLElement : null }
  const forgetFocus = () => {
    // CSS can hide desktop controls before matchMedia's change event runs.
    // Retain only that breakpoint-induced blur, not intentional blur to BODY.
    if (media.matches === desktopFilters.value) lastFocused = null
  }
  document.addEventListener('focusin', rememberFocus)
  document.addEventListener('focusout', forgetFocus)
  const update = async () => {
    const active = document.activeElement
    const focused = inFilters(active) ? active : active === document.body ? lastFocused : null
    if (focused && [...(!media.matches ? ['project'] : []), 'model', 'quality', 'search', 'agent', 'status', 'machine'].some(field => focused.id === `entries-filter-${field}`)) moreFiltersOpen.value = true
    desktopFilters.value = media.matches
    await nextTick()
    if (!focused) return
    // Teleport retains the element but DOM relocation drops browser focus.
    // Never restore into disabled/hidden controls or steal unrelated focus.
    const usable = (element: HTMLElement | null): element is HTMLElement => !!element?.isConnected && !element.matches(':disabled, [aria-disabled="true"]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden'
    const fallback = document.getElementById('entries-more-filters')
    const target = usable(focused) ? focused : usable(fallback) ? fallback : document.getElementById(media.matches ? 'entries-date-range' : 'entries-filter-machine')
    if (usable(target) && (document.activeElement === document.body || document.activeElement === focused)) target.focus({ preventScroll: true })
  }
  update()
  if (canWrite.value) void refreshTeamMembers().catch(() => {})
  media.addEventListener('change', update)
  onBeforeUnmount(() => {
    media.removeEventListener('change', update)
    document.removeEventListener('focusin', rememberFocus)
    document.removeEventListener('focusout', forgetFocus)
  })
})
const page = ref(1)
const perPage = 25
const sort = ref('-started_at')
const loading = ref(true)
const browseError = ref(false)
const exporting = ref(false)
interface PendingExport {
  filters: EntriesExplorerFilters
  sort: string
  generatedAt: string
  format: 'csv' | 'xlsx'
  result: Awaited<ReturnType<typeof fetchExport>>
}
const pendingExport = shallowRef<PendingExport | null>(null)

async function deliverExport(snapshot: PendingExport) {
  const { result, format } = snapshot
  const table = buildEntriesDetailExport({ ...snapshot, ...result })
  const payload = format === 'csv' ? createCsvExport(table) : await createXlsxExport(table)
  const url = URL.createObjectURL(new Blob([payload.content], { type: payload.mimeType }))
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = `entries-${snapshot.generatedAt.slice(0, 10)}.${payload.extension}`
    document.body.appendChild(link)
    link.click()
  }
  finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  toast.success(result.truncated
    ? t('entries.export.truncated', { count: result.items.length, total: result.totalItems })
    : t('entries.export.started', { count: result.items.length }))
}

async function confirmExport() {
  if (!pendingExport.value || exporting.value) return
  const snapshot = pendingExport.value
  pendingExport.value = null
  exporting.value = true
  try {
    await deliverExport(snapshot)
  }
  catch {
    toast.error(t('entries.export.failed'))
  }
  finally {
    exporting.value = false
  }
}

async function downloadExport(format: 'csv' | 'xlsx') {
  if (loading.value || exporting.value || pendingExport.value) return
  exporting.value = true
  // Capture the click-time filters/sort so later UI changes cannot relabel the file.
  const snapshot = { filters: { ...filters }, sort: sort.value, generatedAt: new Date().toISOString() }
  try {
    const result = await fetchExport(snapshot)
    const captured = { ...snapshot, format, result }
    if (result.truncated) pendingExport.value = captured
    else await deliverExport(captured)
  }
  catch {
    toast.error(t('entries.export.failed'))
  }
  finally {
    exporting.value = false
  }
}
const items = ref<TaskEntryRecord[]>([])
const totalItems = ref(0)
const totalPages = ref(1)
const agentOptions = ref<string[]>([])
const availableProjects = computed(() => filters.client
  ? projects.value.filter(p => p.client === filters.client)
  : projects.value)

function selectClient(clientId: string) {
  // Clear the incompatible project before changing client: the filters watcher
  // must never fetch a result set with a client/project from different owners.
  if (clientId && filters.project && !projects.value.some(p => p.id === filters.project && p.client === clientId)) {
    filters.project = undefined
  }
  filters.client = clientId || undefined
}

// -- session marker / filter / grouping ----------------------------------

/** Persisted "Group by session" choice (localStorage, try/catch — same
 * defensive pattern as app.vue's own locale persistence: private mode /
 * blocked storage silently falls back to the default). Absent key means
 * a fresh browser, which now defaults to grouped (owner decision,
 * 2026-09-22): the session is the unit the owner reasons in day to day,
 * the entry is the finer-grained audit unit. `'0'` still means flat,
 * `'1'` still means grouped — only the "never set" case changed. */
const GROUP_BY_SESSION_STORAGE_KEY = 'kankaku-entries-group-by-session'
const groupingEligible = computed(() => canGroupEntriesFilters(filters))
const groupBySession = ref(groupingEligible.value)
// Enforce before any queued refresh sees the new filters. Clearing filters
// unlocks the toggle but does not discard the user's current flat choice.
watch(groupingEligible, eligible => { if (!eligible) groupBySession.value = false }, { flush: 'sync' })
onMounted(() => {
  try {
    const stored = window.localStorage.getItem(GROUP_BY_SESSION_STORAGE_KEY)
    groupBySession.value = groupingEligible.value && (stored === null ? true : stored === '1')
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
watch(groupBySession, () => { page.value = 1 }, { flush: 'sync' })

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
 * fetch. Active unsupported filters enforce flat browse; their controls
 * remain disabled while the user is browsing grouped sessions. */
const entriesFiltersSplit = computed(() => splitEntriesFiltersForTotals(filters))

const sessionRows = ref<SessionTotal[]>([])
const sessionTotalGroups = ref(0)
const sessionTotalPages = ref(1)

/**
 * Engram narrative per session id, populated lazily after each
 * `loadSessions()` resolves (see `loadEngramNarratives` below) — a
 * `reactive` Map so template reads (`sessionNarratives.get(...)`) update
 * once entries arrive, same reactivity idiom `sessionRowEntries` above
 * already uses. Absent entirely (never even attempted) whenever
 * `ensureEngramStatus()` says Engram isn't configured, so a hub without
 * `KANKAKU_ENGRAM_URL` renders byte-for-byte as before this feature.
 */
const sessionNarratives = reactive(new Map<string, Narrative>())
/** Sessions whose expanded narrative block is showing the FULL summary
 * rather than the `line-clamp-6` preview. */
const expandedNarratives = reactive(new Set<string>())
function toggleNarrativeExpanded(sessionId: string) {
  if (expandedNarratives.has(sessionId)) expandedNarratives.delete(sessionId)
  else expandedNarratives.add(sessionId)
}

/** The goal-stripped, heading-flattened text to render under the goal
 * line (`app/lib/narrative-format.ts#narrativeBody`) — `''` when this
 * session has no narrative, or its summary/first_prompt reduces to
 * nothing once the goal section is stripped (see that helper's doc
 * comment). Rendering only checks this, never the raw `summary`/
 * `first_prompt` fields, so the block never shows a repeated goal or raw
 * markdown headings (see odd/tasks/engram-narrative.md task T6). */
function narrativeBodyOf(sessionId: string): string {
  const narrative = sessionNarratives.get(sessionId)
  return narrative ? narrativeBody(narrative) : ''
}
/** Whether the "show more"/"show less" toggle is worth showing at all —
 * only when the body clamps to more than the `line-clamp-6` preview. */
function narrativeHasMore(sessionId: string): boolean {
  return narrativeBodyLineCount(narrativeBodyOf(sessionId)) > 6
}

/**
 * Fire-and-forget: fetches narratives for the sessions just loaded onto
 * this page, ONLY once `ensureEngramStatus()` confirms Engram is
 * configured (so an unconfigured hub makes exactly one status call per
 * page load and no `sessions` calls at all — see
 * `useEngramNarrative`'s own `disabled` short-circuit for why later
 * `loadSessions()` calls on this same page don't repeat the status
 * call either). Never awaited by `refresh()` — the session rows render
 * immediately; narratives fill in whenever they arrive.
 */
async function loadEngramNarratives(sessionIds: string[]) {
  const status = await ensureEngramStatus()
  if (!status?.configured) return
  const narratives = await engramForSessions(sessionIds)
  for (const [id, narrative] of narratives) sessionNarratives.set(id, narrative)
}

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
let pendingSessionExpansion = filters.session_id
let refreshGeneration = 0
function refreshKey() {
  return JSON.stringify([filters, sort.value, page.value, groupBySession.value])
}

async function loadSessionEntries(sessionId: string) {
  const generation = refreshGeneration
  const key = refreshKey()
  const isCurrent = () => generation === refreshGeneration && key === refreshKey()

  sessionRowEntries.set(sessionId, { loading: true, error: false, items: [] })
  try {
    const res = await list({
      page: 1,
      perPage: 200,
      sort: sort.value,
      filters: { ...entriesFiltersSplit.value.groupable, dateStart: filters.dateStart, dateEnd: filters.dateEnd, session_id: sessionId },
    })
    if (isCurrent()) sessionRowEntries.set(sessionId, { loading: false, error: false, items: res.items })
  }
  catch {
    if (isCurrent()) sessionRowEntries.set(sessionId, { loading: false, error: true, items: [] })
  }
}

function toggleSession(sessionId: string) {
  if (expandedSessions.has(sessionId)) {
    expandedSessions.delete(sessionId)
    return
  }
  ensureSessionOpen(sessionId)
}

function ensureSessionOpen(sessionId: string) {
  expandedSessions.add(sessionId)
  if (!sessionRowEntries.has(sessionId)) loadSessionEntries(sessionId)
}

async function loadSessions(isCurrent: () => boolean) {
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
  if (!isCurrent()) return
  sessionRows.value = res.sessions
  sessionTotalGroups.value = res.totalGroups
  sessionTotalPages.value = res.totalPages || 1
}

function taskName(id: string): string {
  if (!id) return ''
  return taskById(id)?.title ?? id
}

function memberLabel(attribution: MemberAttribution, pageLocal = false): string {
  const label = attribution.kind === 'named' ? attribution.name : t(`entries.member.${attribution.kind}`)
  return pageLocal ? t('entries.member.pageLocal', { label }) : label
}

function rowMemberLabel(member: string | undefined): string {
  return memberLabel(pageMemberAttribution([member], canWrite.value ? teamMembers.value : undefined))
}

function sessionMemberLabel(row: SessionTotal): string {
  return memberLabel(sessionMemberAttribution({
    available: row.sessionMemberSummaryAvailable === true && row.distinctMember !== undefined && row.unassignedMemberEntries !== undefined,
    distinctMember: row.distinctMember,
    sampleMember: row.sampleMember,
    unassignedEntries: row.unassignedMemberEntries,
  }, canWrite.value ? teamMembers.value : undefined))
}

const displayTotalItems = computed(() => primaryGrouped.value ? sessionTotalGroups.value : totalItems.value)
const displayTotalPages = computed(() => primaryGrouped.value ? sessionTotalPages.value : totalPages.value)

const filterKeys = ['client', 'project', 'task', 'status', 'model', 'machine', 'agent', 'quality', 'search', 'dateStart', 'dateEnd', 'session_id'] as const satisfies readonly (keyof EntriesExplorerFilters)[]
// The implicit period is baseline, not an extra advanced filter. Explicit
// dates and All time are resettable deviations from that baseline.
const hasActiveFilters = computed(() => filterKeys.some(key => key !== 'dateStart' && key !== 'dateEnd' && !!filters[key]) || !!queryString('dateStart') || !!queryString('dateEnd') || queryString('dateRange') === 'all')
const clearingFilters = ref(false)
async function clearFilters(event: MouseEvent) {
  if (clearingFilters.value) return
  const origin = event.currentTarget as HTMLElement | null
  const query = { ...route.query }
  for (const key of filterKeys) Reflect.deleteProperty(query, key)
  delete query.dateRange
  clearingFilters.value = true
  try {
    // Commit the source URL first: failed navigation must not pretend that
    // bookmark filters were removed. Date watchers see only the clean query.
    const failure = await router.replace({ query, hash: route.hash })
    if (failure) throw failure
    pendingSessionExpansion = undefined
    for (const key of filterKeys) {
      if (key !== 'dateStart' && key !== 'dateEnd') Reflect.deleteProperty(filters, key)
    }
    Object.assign(filters, routeDateRange())
    page.value = 1
    await nextTick()
    // Recover a removed empty-state action immediately, not after a fetch.
    // An intervening interaction with another control always wins.
    if (origin && (document.activeElement === origin || (!origin.isConnected && document.activeElement === document.body))) {
      document.getElementById('entries-date-range')?.focus({ preventScroll: true })
    }
  }
  catch { toast.error(t('entries.clearFiltersError')) }
  finally { clearingFilters.value = false }
}
function filterToSession(sessionId: string) {
  pendingSessionExpansion = primaryGrouped.value ? sessionId || undefined : undefined
  if (sessionId && filters.session_id === sessionId && primaryGrouped.value && !loading.value) {
    ensureSessionOpen(sessionId)
    pendingSessionExpansion = undefined
  }
  filters.session_id = sessionId || undefined
}
function clearSessionFilter() {
  pendingSessionExpansion = undefined
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
  const narrativeTitle = sessionNarratives.get(filters.session_id)?.title
  const flatMatch = items.value.find(e => e.session_id === filters.session_id)
  if (flatMatch) return sessionTitle(filters.session_id, flatMatch.session_name, narrativeTitle)
  const sessionMatch = sessionRows.value.find(s => s.sessionId === filters.session_id)
  return sessionTitle(filters.session_id, sessionMatch?.sessionName, narrativeTitle)
})

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
const anyMixedGroup = computed(() => [...new Set(groupOf.value.values())].some(g => g.projectIds.length > 1))

/** What a row still has to say itself while grouped: nothing when its
 * group agrees on client and project (the header already said it). */
function mixedGroupCell(entry: TaskEntryRecord): string {
  const group = groupOf.value.get(entry.id)
  if (!group) return ''
  const parts: string[] = []
  if (group.projectIds.length > 1) parts.push(projectName(entry.project))
  return parts.join(' · ')
}

/** Columns the table currently renders. Flat mode has seven columns
 * (Inicio/Sesión/Cliente/Proyecto/Estado/Tiempo/Coste). The primary
 * server-backed grouped mode has eight (Inicio/Sesión/Proyecto/Tarea/
 * Entradas/Tiempo/Coste/chevron). Its expanded row is a single colspan-ed
 * cell holding a nested four-column table; this count governs only the outer
 * table. The fallback client-side grouping still collapses session+client+
 * project into one "only when they differ" column. */
const columnCount = computed(() => {
  if (!groupBySession.value) return 7
  if (groupingFallback.value) return anyMixedGroup.value ? 6 : 5
  return 9
})

// Adapt existing grouped values, never introduce a new rollup rule.
const mobileFallbackExpanded = reactive(new Set<string>())
watch(refreshKey, () => mobileFallbackExpanded.clear())
function toggleMobileSession(key: string) {
  if (primaryGrouped.value) toggleSession(key)
  else if (mobileFallbackExpanded.has(key)) mobileFallbackExpanded.delete(key)
  else mobileFallbackExpanded.add(key)
}
const mobileRows = computed(() => {
  if (primaryGrouped.value) return sessionRows.value.map(row => ({
    key: row.sessionId, sessionId: row.sessionId, sessionName: row.sessionName,
    title: sessionTitle(row.sessionId, row.sessionName, sessionNarratives.get(row.sessionId)?.title),
    date: formatCompactEntryDateTime(row.minStartedAt),
    context: `${row.distinctClient === 1 ? clientName(row.sampleClient) || '—' : t('entries.sessionGroup.clients', { count: row.distinctClient })} · ${row.distinctProject === 1 ? projectName(row.sampleProject) : t('entries.sessionGroup.projects', { count: row.distinctProject })}`,
    work: formatDuration(row.workMs), cost: formatCost(row.cost), count: row.entries,
    uncertainty: [row.waitingUnavailableEntries > 0 ? t('entries.qualityFilter.waitingUnavailable') : '', row.costUnknownEntries > 0 ? t('entries.qualityFilter.costUnknown') : '', row.costEstimatedEntries > 0 ? t('entries.detail.quality.costEstimated') : ''].filter(Boolean).join(' · '),
    expanded: expandedSessions.has(row.sessionId), ...sessionRowEntries.get(row.sessionId),
    children: sessionRowEntries.get(row.sessionId)?.items,
  }))
  if (groupBySession.value) return [...new Set(groupOf.value.values())].map(group => ({
    key: group.sessionId, sessionId: group.sessionId, sessionName: group.sessionName,
    title: sessionTitle(group.sessionId, group.sessionName), date: formatCompactEntryDateTime(group.mostRecentStartedAt),
    context: `${group.clientIds.length === 1 ? clientName(group.clientIds[0]!) || '—' : t('entries.sessionGroup.clients', { count: group.clientIds.length })} · ${group.projectIds.length === 1 ? projectName(group.projectIds[0]!) : t('entries.sessionGroup.projects', { count: group.projectIds.length })}`,
    work: formatDuration(group.workMs), cost: formatCost(group.cost), count: group.entries.length,
    expanded: mobileFallbackExpanded.has(group.sessionId), children: group.entries,
  }))
  return items.value.map(entry => ({
    key: entry.id, entry, sessionId: entry.session_id, sessionName: entry.session_name,
    title: sessionTitle(entry.session_id, entry.session_name), date: formatCompactEntryDateTime(entry.started_at),
    context: `${clientName(entry.client) || '—'} · ${projectName(entry.project)}`,
    work: formatDuration(entry.work_ms), cost: formatCost(entry.cost),
  }))
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
async function loadFlat(isCurrent: () => boolean) {
  const res = await list({ page: page.value, perPage, sort: sort.value, filters: { ...filters } })
  if (!isCurrent()) return
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
  const generation = ++refreshGeneration
  const key = refreshKey()
  const isCurrent = () => generation === refreshGeneration && key === refreshKey()
  loading.value = true
  browseError.value = false
  try {
    await ensureBrowseInitialized()
    if (!isCurrent()) return
    if (!groupBySession.value) {
      groupingFallback.value = false
      pendingSessionExpansion = undefined
      await loadFlat(isCurrent)
      return
    }
    try {
      await loadSessions(isCurrent)
      if (!isCurrent()) return
      groupingFallback.value = false
      if (pendingSessionExpansion === filters.session_id && sessionRows.value.some(row => row.sessionId === pendingSessionExpansion)) {
        ensureSessionOpen(pendingSessionExpansion!)
      }
      pendingSessionExpansion = undefined
      // Fire-and-forget: never blocks the just-loaded session rows from
      // rendering, and never rejects (see loadEngramNarratives's own
      // never-throws contract via useEngramNarrative).
      loadEngramNarratives(sessionRows.value.map(r => r.sessionId))
    }
    catch (err) {
      if (!isCurrent()) return
      if (!(err instanceof TotalsRouteUnavailableError)) throw err
      groupingFallback.value = true
      pendingSessionExpansion = undefined
      await loadFlat(isCurrent)
    }
  }
  catch {
    if (isCurrent()) browseError.value = true
  }
  finally {
    if (isCurrent()) loading.value = false
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

// Share in-flight initialization; keep successes so Retry only repeats missing reads.
const browseInitializers = [ensureClients, ensureProjects, ensureTasks, loadAgentOptions]
const initializedReads = new Set<number>()
let initialization: Promise<void> | undefined
function ensureBrowseInitialized(): Promise<void> {
  if (!initialization) {
    initialization = Promise.allSettled(browseInitializers.map(async (initialize, index) => {
      if (initializedReads.has(index)) return
      await initialize()
      initializedReads.add(index)
    })).then((results) => {
      if (results.some(result => result.status === 'rejected')) throw new Error('Entries initialization failed')
    }).finally(() => { initialization = undefined })
  }
  return initialization
}

let browseReady = false
onMounted(() => {
  browseReady = true
  refresh()
})

watch([filters, sort], () => { page.value = 1 }, { deep: true, flush: 'sync' })
// One batched refresh for filter + enforced toggle + page reset, and none
// during storage restoration/catalog initialization.
watch(refreshKey, () => { if (browseReady) refresh() })

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

// Session-scoped bulk selection. Filter changes invalidate even off-page IDs.
const bulkEnabled = computed(() => canWrite.value && !!filters.session_id)
const selectedIds = reactive(new Set<string>())
const bulkBusy = ref(false)
const bulkTask = ref('')
const bulkProject = ref('')
const bulkTitle = ref('')
const bulkDialog = ref<'assign' | 'create' | null>(null)
let selectionGeneration = 0
watch([filters, canWrite], () => {
  selectionGeneration++
  selectedIds.clear()
  bulkDialog.value = null
}, { deep: true, flush: 'sync' })
const visibleEntryIds = computed(() => {
  if (loading.value || browseError.value) return []
  const rows = primaryGrouped.value
    ? [...sessionRowEntries.entries()].filter(([id]) => expandedSessions.has(id)).flatMap(([, state]) => state.items)
    : items.value
  return rows.filter(entry => entry.session_id === filters.session_id).map(entry => entry.id)
})
function toggleEntry(id: string) {
  if (!bulkEnabled.value || bulkBusy.value) return
  if (selectedIds.has(id)) selectedIds.delete(id)
  else selectedIds.add(id)
}
function selectVisible(clear = false) {
  if (!bulkEnabled.value || bulkBusy.value) return
  for (const id of visibleEntryIds.value) {
    if (clear) selectedIds.delete(id)
    else selectedIds.add(id)
  }
}
async function selectAllInSession() {
  if (!bulkEnabled.value || bulkBusy.value) return
  const generation = selectionGeneration
  bulkBusy.value = true
  try {
    const ids = await collectEntryIds({ ...filters })
    if (generation === selectionGeneration && bulkEnabled.value) {
      selectedIds.clear()
      ids.forEach(id => selectedIds.add(id))
    }
  }
  catch { toast.error(t('common.error')) }
  finally { bulkBusy.value = false }
}
async function assignSelected(createNew = false) {
  if (!bulkEnabled.value || bulkBusy.value || !selectedIds.size) return
  if (createNew ? !bulkTitle.value.trim() || !bulkProject.value : !bulkTask.value) return
  const ids = [...selectedIds]
  const generation = selectionGeneration
  bulkBusy.value = true
  try {
    let task = bulkTask.value
    if (createNew) {
      const created = await createTask({ title: bulkTitle.value.trim(), project: bulkProject.value, status: 'open' })
      task = created.id
      bulkTask.value = task
      bulkTitle.value = '' // Retry failed assignments using the task already created.
    }
    if (generation !== selectionGeneration || !bulkEnabled.value) return
    const result = await bulkAssignTask(ids, task)
    if (generation === selectionGeneration) {
      result.succeeded.forEach(id => selectedIds.delete(id))
      // Keep failures in the assignment dialog, reusing any newly created task.
      bulkDialog.value = result.failed.length ? 'assign' : null
    }
    const message = t('entries.bulk.result', { succeeded: result.succeeded.length, failed: result.failed.length })
    if (result.failed.length) toast.error(message)
    else toast.success(message)
    pendingSessionExpansion = filters.session_id
    await Promise.all([refresh(), refreshTasks()])
  }
  catch { toast.error(t('common.error')) }
  finally { bulkBusy.value = false }
}

// Detail drawer
const detailOpen = ref(false)
const detail = ref<TaskEntryRecord | null>(null)
const detailWorkRecords = ref<WorkRecordRecord[]>([])
const detailClient = ref('')
const detailProject = ref('')
const detailTask = ref('')

const detailLoading = ref(false)
const detailError = ref(false)
const detailTarget = ref<TaskEntryRecord | null>(null)
const detailTitle = ref<HTMLElement | null>(null)
let detailGeneration = 0
let detailOrigin: HTMLElement | null = null
const detailHeading = computed(() => {
  if (!detail.value) return t('entries.detail.panelTitle')
  const title = deriveEntryTitle(detail.value)
  return title.kind === 'fallback' ? t('entries.detail.fallbackTitle', { id: title.shortId }) : title.text
})
watch(detailOpen, open => { if (!open) detailGeneration++ }, { flush: 'sync' })
onBeforeUnmount(() => { detailGeneration++ })

async function openDetail(entry: TaskEntryRecord, event?: MouseEvent) {
  if (event) {
    const target = event.currentTarget as HTMLElement | null
    detailOrigin = target?.matches('button') ? target : target?.querySelector<HTMLElement>('[data-entry-detail]') ?? null
  }
  const generation = ++detailGeneration
  const isCurrent = () => generation === detailGeneration && detailOpen.value
  detailTarget.value = entry
  detail.value = null
  detailWorkRecords.value = []
  detailError.value = false
  detailLoading.value = true
  detailOpen.value = true
  try {
    const record = await getOne(entry.id)
    if (!isCurrent()) return
    const records = await listWorkRecords(entry.id) as unknown as WorkRecordRecord[]
    if (!isCurrent()) return
    detailClient.value = record.client
    detailProject.value = record.project
    detailTask.value = record.task
    detail.value = record
    detailWorkRecords.value = records
  }
  catch {
    if (isCurrent()) detailError.value = true
  }
  finally {
    if (isCurrent()) detailLoading.value = false
  }
}

async function saveAssignment() {
  if (!detail.value) return
  const entryId = detail.value.id
  const generation = detailGeneration
  try {
    const taskChanged = detailTask.value !== detail.value.task
    await updateAssignment(detail.value.id, { client: detailClient.value, project: detailProject.value, task: detailTask.value })
    toast.success(t('common.saved'))
    // Re-read the entry so the sheet's read-only summary shows the new task,
    // and the task list too: linking work moves an open task to "doing"
    // on the hub (task-auto-doing hook).
    const updated = await getOne(entryId)
    if (generation === detailGeneration && detailOpen.value) detail.value = updated
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
function onDetailOpenAutoFocus(event: Event) {
  event.preventDefault()
  nextTick(() => { if (detailOpen.value) detailTitle.value?.focus() })
}
function onDetailCloseAutoFocus(event: Event) {
  const origin = detailOrigin?.isConnected && !detailOrigin.matches(':disabled') && detailOrigin.getClientRects().length ? detailOrigin : document.getElementById('entries-date-range')
  if (origin) {
    event.preventDefault()
    origin.focus({ preventScroll: true })
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-xl font-semibold tracking-tight">{{ t('entries.title') }}</h1>
      <div id="entries-mobile-export" />
    </div>

    <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end" data-testid="entries-filter-layout">
        <div class="flex min-w-0 flex-wrap items-end gap-2" data-testid="entries-filter-controls">
        <div id="entries-primary-period" class="contents" />
        <div class="flex flex-col gap-1">
          <label for="entries-filter-client" class="text-xs text-muted-foreground">{{ t('common.client') }}</label>
          <Select id="entries-filter-client" :model-value="filters.client" class="w-40 border-0 bg-muted dark:bg-muted" :placeholder="t('common.client')" :options="[{ value: '', label: t('common.all') }, ...clients.map(c => ({ value: c.id, label: c.name }))]" @update:model-value="selectClient">
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
        <Teleport to="#entries-advanced-project" :disabled="desktopFilters">
        <div class="flex flex-col gap-1">
          <label for="entries-filter-project" class="text-xs text-muted-foreground">{{ t('common.project') }}</label>
          <Select id="entries-filter-project" v-model="filters.project" class="w-40 border-0 bg-muted dark:bg-muted" :placeholder="t('common.project')" :options="[{ value: '', label: t('common.all') }, ...availableProjects.map(p => ({ value: p.id, label: p.name }))]" />
        </div>
        </Teleport>
        <Teleport to="#entries-advanced-status">
        <div class="flex flex-col gap-1">
          <label for="entries-filter-status" class="text-xs text-muted-foreground">{{ t('common.status') }}</label>
          <Select
            id="entries-filter-status" v-model="filters.status" class="w-36" :placeholder="t('common.status')" :options="[
              { value: '', label: t('common.all') },
              { value: 'completed', label: t('entries.status.completed') },
              { value: 'aborted', label: t('entries.status.aborted') },
              { value: 'interrupted', label: t('entries.status.interrupted') },
            ]"
          />
        </div>
        </Teleport>
        <Teleport to="#entries-advanced-agent">
        <div class="flex flex-col gap-1">
          <label for="entries-filter-agent" class="text-xs text-muted-foreground">{{ t('common.agent') }}</label>
          <Select
            id="entries-filter-agent" v-model="filters.agent" class="w-40" :placeholder="t('common.agent')" :options="[
              { value: '', label: t('common.all') },
              ...agentOptions.map(a => ({ value: a, label: agentLabel(a) })),
            ]"
          />
        </div>
        </Teleport>
        <Teleport to="#entries-advanced-quality">
        <div class="flex flex-col gap-1">
          <label for="entries-filter-quality" class="text-xs text-muted-foreground">{{ t('entries.filtersFields.quality') }}</label>
          <Select
            id="entries-filter-quality" v-model="filters.quality" class="w-48" :disabled="primaryGrouped" :title="primaryGrouped ? t('entries.sessionGroup.unsupportedFilterHint') : undefined" :placeholder="t('entries.filtersFields.quality')" :options="[
              { value: '', label: t('common.all') },
              { value: 'waitingUnavailable', label: t('entries.qualityFilter.waitingUnavailable') },
              { value: 'costUnknown', label: t('entries.qualityFilter.costUnknown') },
            ]"
          />
        </div>
        </Teleport>
        <Teleport to="#entries-advanced-model">
        <div class="flex flex-col gap-1">
          <label for="entries-filter-model" class="text-xs text-muted-foreground">{{ t('common.model') }}</label>
          <Input id="entries-filter-model" v-model="filters.model" :placeholder="t('common.model')" class="w-32" :disabled="primaryGrouped" :title="primaryGrouped ? t('entries.sessionGroup.unsupportedFilterHint') : undefined" />
        </div>
        </Teleport>
        <Teleport to="#entries-advanced-machine">
        <div class="flex flex-col gap-1">
          <label for="entries-filter-machine" class="text-xs text-muted-foreground">{{ t('entries.filtersFields.machine') }}</label>
          <Input id="entries-filter-machine" v-model="filters.machine" :placeholder="t('entries.filtersFields.machine')" class="w-32" />
        </div>
        </Teleport>
        <Teleport to="#entries-primary-period">
          <EntriesDateRangeFilter :start="filters.dateStart" :end="filters.dateEnd" @commit="commitDateRange" />
        </Teleport>
        <Teleport to="#entries-advanced-search">
        <div class="flex flex-col gap-1">
          <label for="entries-filter-search" class="text-xs text-muted-foreground">{{ t('entries.filtersFields.search') }}</label>
          <Input id="entries-filter-search" v-model="filters.search" :placeholder="t('entries.searchPrompt')" class="w-56" :disabled="primaryGrouped" :title="primaryGrouped ? t('entries.sessionGroup.unsupportedFilterHint') : undefined" />
        </div>
        </Teleport>
        <div class="entries-mode control-group flex shrink-0 gap-1 self-start bg-muted sm:self-auto" role="group" :aria-label="t('entries.desktopFilters.view')">
          <Button type="button" size="segment" :variant="groupBySession ? 'secondary' : 'ghost'" :aria-pressed="groupBySession" :disabled="!groupingEligible" :aria-describedby="!groupingEligible ? 'entries-grouping-notice' : undefined" @click="groupBySession = true"><Layers class="size-4" aria-hidden="true" />{{ t('entries.desktopFilters.sessions') }}</Button>
          <Button type="button" size="segment" :variant="!groupBySession ? 'secondary' : 'ghost'" :aria-pressed="!groupBySession" @click="groupBySession = false"><List class="size-4" aria-hidden="true" />{{ t('entries.desktopFilters.entries') }}</Button>
        </div>
        <Button id="entries-more-filters" type="button" variant="toolbar" class="entries-more" :aria-expanded="moreFiltersOpen" aria-controls="entries-advanced-filters" @click="moreFiltersOpen = !moreFiltersOpen">
          {{ t('entries.desktopFilters.more', { count: advancedFilterCount }) }}
          <ChevronDown class="size-4" :class="{ 'rotate-180': moreFiltersOpen }" aria-hidden="true" />
        </Button>
        </div>
        <Teleport to="#entries-mobile-export" :disabled="desktopFilters">
        <div class="flex shrink-0 justify-end" data-testid="entries-filter-actions">
          <ExportMenu :label="t('common.export')" :disabled="loading || exporting || pendingExport !== null" @format="downloadExport" />
        </div>
        </Teleport>
        <div id="entries-advanced-filters" class="md:col-span-2" :class="{ hidden: !moreFiltersOpen }">
          <div class="flex flex-wrap items-end gap-3">
            <div id="entries-advanced-project" />
            <div id="entries-advanced-model" />
            <div id="entries-advanced-quality" />
            <div id="entries-advanced-search" />
          </div>
          <p class="my-3 text-sm text-muted-foreground">{{ t('entries.desktopFilters.entryHint') }}</p>
          <div class="flex flex-wrap items-end gap-3">
            <div id="entries-advanced-agent" />
            <div id="entries-advanced-status" />
            <div id="entries-advanced-machine" />
          </div>
        </div>
    </div>

    <div v-if="!groupingEligible || filters.session_id" class="flex flex-wrap items-center gap-3">
      <p v-if="!groupingEligible" id="entries-grouping-notice" class="text-sm text-muted-foreground" role="status">
        {{ t('entries.sessionGroup.activeUnsupportedFilters') }}
      </p>
      <Badge v-if="filters.session_id" variant="secondary" class="gap-1.5">
        {{ t('entries.sessionFilter.chip', { label: sessionFilterLabel }) }}
        <button type="button" class="rounded-full hover:bg-muted-foreground/20" :aria-label="t('entries.sessionFilter.remove')" @click="clearSessionFilter">
          <X class="size-3" aria-hidden="true" />
        </button>
      </Badge>
    </div>

    <div v-if="bulkEnabled" class="flex flex-wrap items-center gap-2 rounded-md border p-3" data-testid="entries-bulk-toolbar">
      <span class="text-sm" aria-live="polite">{{ t('entries.bulk.selected', { count: selectedIds.size }) }}</span>
      <Button size="sm" variant="outline" :disabled="bulkBusy || !visibleEntryIds.length" @click="selectVisible()">{{ t('entries.bulk.selectVisible') }}</Button>
      <Button size="sm" variant="outline" :disabled="bulkBusy" @click="selectAllInSession">{{ t('entries.bulk.allInSession') }}</Button>
      <Button size="icon" variant="ghost" class="size-8" :disabled="bulkBusy || !selectedIds.size" :aria-label="t('entries.bulk.clear')" :title="t('entries.bulk.clear')" @click="selectedIds.clear()">
        <X class="size-4" aria-hidden="true" />
      </Button>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <Button size="sm" :disabled="bulkBusy || !selectedIds.size" @click="bulkDialog = 'assign'">{{ t('entries.bulk.assign') }}</Button>
        <Button size="sm" variant="outline" :disabled="bulkBusy || !selectedIds.size" @click="bulkDialog = 'create'">{{ t('entries.bulk.create') }}</Button>
      </div>
    </div>

    <Dialog :open="pendingExport !== null" @update:open="value => { if (!value) pendingExport = null }">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('entries.export.partialTitle') }}</DialogTitle>
          <DialogDescription>{{ t('entries.export.partialDescription', { count: pendingExport?.result.items.length, total: pendingExport?.result.totalItems }) }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" @click="pendingExport = null">{{ t('common.cancel') }}</Button>
          <Button :disabled="exporting || !pendingExport" @click="confirmExport">{{ t('entries.export.confirmPartial', { count: pendingExport?.result.items.length }) }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="bulkEnabled && bulkDialog !== null" @update:open="value => { if (!value && !bulkBusy) bulkDialog = null }">
      <DialogContent :data-testid="bulkDialog === 'create' ? 'bulk-create-dialog' : 'bulk-assign-dialog'" @escape-key-down="event => { if (bulkBusy) event.preventDefault() }" @interact-outside="event => { if (bulkBusy) event.preventDefault() }">
        <DialogHeader>
          <DialogTitle>{{ bulkDialog === 'create' ? t('entries.bulk.create') : t('entries.bulk.assign') }}</DialogTitle>
          <DialogDescription>{{ t('entries.bulk.selected', { count: selectedIds.size }) }}. {{ t('entries.bulk.dialogHelp') }}</DialogDescription>
        </DialogHeader>
        <div v-if="bulkDialog === 'create'" class="flex flex-col gap-3">
          <label for="bulk-project" class="text-sm">{{ t('common.project') }}</label>
          <Select id="bulk-project" v-model="bulkProject" :disabled="bulkBusy" :placeholder="t('common.project')" :options="projects.map(project => ({ value: project.id, label: project.name }))" />
          <label for="bulk-title" class="text-sm">{{ t('entries.bulk.newTitle') }}</label>
          <Input id="bulk-title" v-model="bulkTitle" :disabled="bulkBusy" :placeholder="t('entries.bulk.newTitle')" />
        </div>
        <div v-else class="flex flex-col gap-2">
          <label for="bulk-task" class="text-sm">{{ t('common.task') }}</label>
          <Select id="bulk-task" v-model="bulkTask" :disabled="bulkBusy" :placeholder="t('common.task')" :options="tasks.map(task => ({ value: task.id, label: task.title }))" />
        </div>
        <DialogFooter>
          <Button variant="outline" :disabled="bulkBusy" @click="bulkDialog = null">{{ t('common.cancel') }}</Button>
          <Button v-if="bulkDialog === 'create'" :disabled="bulkBusy || !selectedIds.size || !bulkProject || !bulkTitle.trim()" @click="assignSelected(true)">{{ t('entries.bulk.createAssignCount', { count: selectedIds.size }) }}</Button>
          <Button v-else :disabled="bulkBusy || !selectedIds.size || !bulkTask" @click="assignSelected()">{{ t('entries.bulk.assignCount', { count: selectedIds.size }) }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Card>
      <CardContent>
        <div v-if="browseError" role="alert" class="flex items-center justify-center gap-3 p-6 text-sm">
          <p class="text-destructive">{{ t('entries.loadError') }}</p>
          <Button variant="outline" size="sm" @click="refresh">{{ t('entries.loadRetry') }}</Button>
        </div>
        <EntriesMobileLedger
          v-else-if="!desktopFilters" :rows="mobileRows" :loading="loading" :grouped="groupBySession" :sort="sort"
          :client-name="clientName" :project-name="projectName" :task-name="taskName" :agent-label="agentLabel"
          :bulk-enabled="bulkEnabled" :bulk-busy="bulkBusy" :selected-ids="selectedIds" :session-filter="filters.session_id"
          @expand="toggleMobileSession" @retry="loadSessionEntries" @detail="openDetail" @session="filterToSession" @sort="toggleSort" @select="toggleEntry"
        >
          <template #context="{ sessionId }">
            <template v-if="primaryGrouped">
              <p v-for="row in sessionRows.filter(row => row.sessionId === sessionId)" :key="row.sessionId">
                {{ row.distinctTask > 1 ? t('entries.sessionGroup.tasks', { count: row.distinctTask }) : taskName(row.sampleTask) || '—' }} · {{ row.distinctAgent === 1 ? agentLabel(row.sampleAgent) : t('entries.sessionGroup.agents', { count: row.distinctAgent }) }}
              </p>
              <div v-if="sessionNarratives.get(sessionId)" data-testid="session-narrative">
                <p v-if="sessionNarratives.get(sessionId)!.goal">{{ t('engram.goal', { goal: sessionNarratives.get(sessionId)!.goal }) }}</p>
                <p :class="expandedNarratives.has(sessionId) ? '' : 'line-clamp-6'" class="whitespace-pre-wrap">{{ narrativeBodyOf(sessionId) }}</p>
                <Button v-if="narrativeHasMore(sessionId)" no-hover variant="ghost" class="min-h-11" @click="toggleNarrativeExpanded(sessionId)">{{ expandedNarratives.has(sessionId) ? t('engram.showLess') : t('engram.showMore') }}</Button>
              </div>
            </template>
          </template>
        </EntriesMobileLedger>
        <Table v-else>
          <TableHeader>
            <!-- Primary server-backed grouped mode gets its OWN header/columns:
                 the session row below is a normal data row (one <td> per
                 column, not a colspan-ed summary blob), so its header must
                 describe exactly those columns — see the session-row and
                 nested-entries-table doc comments below. -->
            <TableRow v-if="primaryGrouped">
              <TableHead>{{ t('common.started') }}</TableHead>
              <TableHead>{{ t('entries.session') }}</TableHead>
              <TableHead>{{ t('common.project') }}</TableHead>
              <TableHead>{{ t('common.task') }}</TableHead>
              <TableHead>{{ t('entries.member.header') }}</TableHead>
              <TableHead class="text-right">{{ t('entries.sessionGroup.columns.entries') }}</TableHead>
              <TableHead class="text-right"><span :title="t('common.timeHint')">{{ t('common.time') }}</span></TableHead>
              <TableHead class="text-right">{{ t('common.cost') }}</TableHead>
              <TableHead class="entries-expander"><span class="sr-only">{{ t('entries.sessionGroup.entriesToggle') }}</span></TableHead>
            </TableRow>
            <TableRow v-else>
              <TableHead :aria-sort="sort === 'started_at' ? 'ascending' : sort === '-started_at' ? 'descending' : 'none'">
                <Button no-hover variant="ghost" size="sm" class="h-auto px-0" @click="toggleSort('started_at')">
                  {{ t('common.started') }}
                  <ChevronDown v-if="sort.replace('-', '') === 'started_at'" class="size-3" :class="{ 'rotate-180': sort === 'started_at' }" aria-hidden="true" />
                </Button>
              </TableHead>
              <!-- Flat mode keeps session and project; Client remains available in filters/details. -->
              <template v-if="!groupingFallback">
                <TableHead>{{ t('entries.session') }}</TableHead>
                <TableHead>{{ t('common.project') }}</TableHead>
              </template>
              <TableHead v-else-if="anyMixedGroup">{{ t('entries.sessionGroup.mixedColumn') }}</TableHead>
              <TableHead>{{ t('entries.member.header') }}</TableHead>
              <TableHead>{{ t('common.status') }}</TableHead>
              <TableHead class="text-right" :aria-sort="sort === 'work_ms' ? 'ascending' : sort === '-work_ms' ? 'descending' : 'none'">
                <Button no-hover variant="ghost" size="sm" class="h-auto px-0" @click="toggleSort('work_ms')">
                  <span :title="t('common.timeHint')">{{ t('common.time') }}</span>
                  <ChevronDown v-if="sort.replace('-', '') === 'work_ms'" class="size-3" :class="{ 'rotate-180': sort === 'work_ms' }" aria-hidden="true" />
                </Button>
              </TableHead>
              <TableHead class="text-right" :aria-sort="sort === 'cost' ? 'ascending' : sort === '-cost' ? 'descending' : 'none'">
                <Button no-hover variant="ghost" size="sm" class="h-auto px-0" @click="toggleSort('cost')">
                  {{ t('common.cost') }}
                  <ChevronDown v-if="sort.replace('-', '') === 'cost'" class="size-3" :class="{ 'rotate-180': sort === 'cost' }" aria-hidden="true" />
                </Button>
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
                   not entries), lazily expandable to that session's entries.
                   Unlike the old design, this row has its OWN real column
                   per cell (matching the header above) instead of one wide
                   colspan-ed summary blob — numbers line up, and nothing
                   needs a "Tiempo:"/"Coste:" label to say what it is. -->
              <template v-for="row in sessionRows" :key="row.sessionId">
                <TableRow data-testid="session-group-row" class="cursor-pointer bg-muted/40" @click="toggleSession(row.sessionId)">
                  <TableCell class="tabular-nums">
                    {{ formatCompactEntryDateTime(row.minStartedAt) }}
                  </TableCell>
                  <TableCell>
                    <div class="flex flex-col gap-0.5">
                      <SessionMarker
                        :session-id="row.sessionId" :session-name="row.sessionName"
                        :label="sessionTitle(row.sessionId, row.sessionName, sessionNarratives.get(row.sessionId)?.title)"
                        @click="filterToSession(row.sessionId)"
                      />
                      <span v-if="sessionNarratives.has(row.sessionId)" data-testid="session-original-label" class="ml-1 max-w-40 truncate text-[11px] text-muted-foreground">
                        {{ sessionMarkerLabel(row.sessionId, row.sessionName) }}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span v-if="row.distinctProject === 1">{{ projectName(row.sampleProject) }}</span>
                    <span v-else class="text-muted-foreground">{{ t('entries.sessionGroup.projects', { count: row.distinctProject }) }}</span>
                  </TableCell>
                  <TableCell>
                    <span v-if="row.distinctTask > 1" class="text-muted-foreground">{{ t('entries.sessionGroup.tasks', { count: row.distinctTask }) }}</span>
                    <span v-else-if="row.sampleTask">{{ taskName(row.sampleTask) }}</span>
                    <span v-else class="text-muted-foreground" :title="t('entries.detail.noTask')">—</span>
                  </TableCell>
                  <TableCell>{{ sessionMemberLabel(row) }}</TableCell>
                  <TableCell data-testid="session-entries-count" class="text-right tabular-nums">
                    {{ row.entries }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ formatDuration(row.workMs) }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ formatCost(row.cost) }}
                  </TableCell>
                  <TableCell class="entries-expander">
                    <button
                      type="button"
                      class="rounded p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-indicator"
                      :aria-label="t('entries.sessionGroup.entriesToggle')"
                      :aria-expanded="expandedSessions.has(row.sessionId)"
                      :aria-controls="`session-group-entries-${row.sessionId}`"
                      @click.stop="toggleSession(row.sessionId)"
                    >
                      <ChevronDown class="size-4 transition-transform" :class="{ 'rotate-180': expandedSessions.has(row.sessionId) }" aria-hidden="true" />
                    </button>
                  </TableCell>
                </TableRow>
                <!-- Expanded: ONE full-width row holding a nested table of
                     this session's entries — the flat entry header MINUS
                     session/client/project/agent/model. Nested rows open the
                     same EntryDetailSheet as flat mode. -->
                <TableRow v-if="expandedSessions.has(row.sessionId)" :id="`session-group-entries-${row.sessionId}`" data-testid="session-group-entries">
                  <TableCell :colspan="columnCount" class="bg-muted/30 p-2">
                    <!-- Engram narrative block, ABOVE the nested entries
                         table — nothing renders when this session has no
                         narrative (not configured, unreachable, or
                         Engram simply has nothing for this session). -->
                    <div v-if="sessionNarratives.get(row.sessionId)" data-testid="session-narrative" class="mb-2 rounded-md border border-border bg-background p-3">
                      <p v-if="sessionNarratives.get(row.sessionId)!.goal" class="text-sm font-medium">
                        {{ t('engram.goal', { goal: sessionNarratives.get(row.sessionId)!.goal }) }}
                      </p>
                      <p v-else-if="sessionNarratives.get(row.sessionId)!.source === 'prompt'" class="text-xs font-medium text-muted-foreground">
                        {{ t('engram.fromFirstPrompt') }}
                      </p>
                      <p
                        v-if="narrativeBodyOf(row.sessionId)"
                        class="whitespace-pre-wrap text-sm text-muted-foreground"
                        :class="expandedNarratives.has(row.sessionId) ? '' : 'line-clamp-6'"
                      >{{ narrativeBodyOf(row.sessionId) }}</p>
                      <Button
                        v-if="narrativeHasMore(row.sessionId)"
                        no-hover
                        size="sm" variant="ghost" class="mt-1 h-auto px-1.5 py-0.5 text-xs" @click.stop="toggleNarrativeExpanded(row.sessionId)"
                      >
                        {{ expandedNarratives.has(row.sessionId) ? t('engram.showLess') : t('engram.showMore') }}
                      </Button>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{{ t('common.started') }}</TableHead>
                          <TableHead>{{ t('common.status') }}</TableHead>
                          <TableHead class="text-right"><span :title="t('common.timeHint')">{{ t('common.time') }}</span></TableHead>
                          <TableHead class="text-right">{{ t('common.cost') }}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow v-if="sessionRowEntries.get(row.sessionId)?.loading">
                          <TableCell colspan="4" class="text-sm text-muted-foreground">
                            {{ t('entries.sessionGroup.loadingEntries') }}
                          </TableCell>
                        </TableRow>
                        <TableRow v-else-if="sessionRowEntries.get(row.sessionId)?.error">
                          <TableCell colspan="4">
                            <div class="flex items-center gap-2 text-sm text-destructive">
                              <span>{{ t('entries.sessionGroup.loadError') }}</span>
                              <Button no-hover size="sm" variant="outline" @click.stop="loadSessionEntries(row.sessionId)">
                                {{ t('entries.sessionGroup.retry') }}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        <TableRow v-else-if="(sessionRowEntries.get(row.sessionId)?.items.length ?? 0) === 0">
                          <TableCell colspan="4" class="text-sm text-muted-foreground">
                            {{ t('entries.empty') }}
                          </TableCell>
                        </TableRow>
                        <TableRow v-for="entry in sessionRowEntries.get(row.sessionId)?.items ?? []" :key="entry.id" class="cursor-pointer" @click="openDetail(entry, $event)">
                          <TableCell class="tabular-nums">
                            <input v-if="bulkEnabled && entry.session_id === filters.session_id" type="checkbox" class="mr-2" :checked="selectedIds.has(entry.id)" :disabled="bulkBusy" :aria-label="t('entries.bulk.selectEntry')" @click.stop @change="toggleEntry(entry.id)">
                            <Button no-hover data-entry-detail variant="ghost" size="sm" class="h-auto px-0 font-normal tabular-nums" :aria-label="t('entries.detail.viewEntry', { context: `${entry.session_name || entry.id} · ${formatCompactEntryDateTime(entry.started_at)}` })" @click.stop="openDetail(entry, $event)">
                              {{ formatCompactEntryDateTime(entry.started_at) }}
                            </Button>
                          </TableCell>
                          <TableCell><Badge :variant="statusPresentation(entry.status).tone">{{ t(`entries.status.${entry.status}`) }}</Badge></TableCell>
                          <TableCell class="text-right tabular-nums">
                            {{ formatDuration(entry.work_ms) }}
                          </TableCell>
                          <TableCell class="text-right tabular-nums">
                            {{ formatCost(entry.cost) }}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableCell>
                </TableRow>
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
                <TableRow v-if="dr.kind === 'header'" class="bg-muted/40">
                  <TableHead scope="colgroup" :colspan="columnCount" class="h-auto py-2 font-normal">
                    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <SessionMarker :session-id="dr.group.sessionId" :session-name="dr.group.sessionName" @click="filterToSession(dr.group.sessionId)" />
                      <span v-if="dr.group.projectIds.length === 1" class="text-foreground">{{ projectName(dr.group.projectIds[0]!) }}</span>
                      <span v-else class="text-foreground">{{ t('entries.sessionGroup.projects', { count: dr.group.projectIds.length }) }}</span>
                      <span class="text-xs text-muted-foreground">{{ memberLabel(pageMemberAttribution(dr.group.entries.map(entry => entry.member), canWrite ? teamMembers : undefined), true) }}</span>
                      <span class="text-xs text-muted-foreground">{{ t('entries.sessionGroup.count', { count: dr.group.entries.length }) }}</span>
                      <span class="text-xs tabular-nums text-muted-foreground"><span :title="t('common.timeHint')">{{ t('common.time') }}</span>: {{ formatDuration(dr.group.workMs) }}</span>
                      <span class="text-xs tabular-nums text-muted-foreground">{{ t('common.cost') }}: {{ formatCost(dr.group.cost) }}</span>
                    </div>
                  </TableHead>
                </TableRow>
                <TableRow v-else class="cursor-pointer" @click="openDetail(dr.entry, $event)">
                  <TableCell class="tabular-nums">
                    <input v-if="bulkEnabled && dr.entry.session_id === filters.session_id" type="checkbox" class="mr-2" :checked="selectedIds.has(dr.entry.id)" :disabled="bulkBusy" :aria-label="t('entries.bulk.selectEntry')" @click.stop @change="toggleEntry(dr.entry.id)">
                    <Button no-hover data-entry-detail variant="ghost" size="sm" class="h-auto px-0 font-normal tabular-nums" :aria-label="t('entries.detail.viewEntry', { context: `${dr.entry.session_name || dr.entry.id} · ${formatCompactEntryDateTime(dr.entry.started_at)}` })" @click.stop="openDetail(dr.entry, $event)">
                      {{ formatCompactEntryDateTime(dr.entry.started_at) }}
                    </Button>
                  </TableCell>
                  <template v-if="!groupBySession">
                    <TableCell>
                      <SessionMarker :session-id="dr.entry.session_id" :session-name="dr.entry.session_name" @click="filterToSession(dr.entry.session_id)" />
                    </TableCell>
                    <TableCell>{{ projectName(dr.entry.project) }}</TableCell>
                  </template>
                  <!-- Fallback grouped rows repeat project only when the
                       page-local group contains multiple projects. -->
                  <TableCell v-else-if="anyMixedGroup" class="text-muted-foreground">
                    {{ mixedGroupCell(dr.entry) }}
                  </TableCell>
                  <TableCell>{{ rowMemberLabel(dr.entry.member) }}</TableCell>
                  <TableCell><Badge :variant="statusPresentation(dr.entry.status).tone">{{ t(`entries.status.${dr.entry.status}`) }}</Badge></TableCell>
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
        <EmptyState v-if="!loading && !browseError && (primaryGrouped ? sessionRows.length === 0 : items.length === 0)" :title="t('entries.empty')" class="m-4">
          <Button v-if="hasActiveFilters" variant="outline" size="sm" :disabled="clearingFilters" @click="clearFilters">{{ t('entries.clearFilters') }}</Button>
        </EmptyState>

        <div class="flex items-center justify-between border-t border-border p-3 text-sm text-muted-foreground">
          <span v-if="!loading && !browseError" data-testid="entries-pagination-count">{{ displayTotalItems }}<template v-if="displayTotalItems > 0 && displayTotalPages > 0"> · {{ page }}/{{ displayTotalPages }}</template></span>
          <div class="flex gap-2">
            <Button size="icon" variant="outline" :disabled="loading || browseError || displayTotalItems === 0 || page <= 1" :aria-label="t('entries.pagination.previous')" :title="t('entries.pagination.previous')" @click="page--">
              <ChevronLeft class="size-4" />
            </Button>
            <Button size="icon" variant="outline" :disabled="loading || browseError || displayTotalItems === 0 || page >= displayTotalPages" :aria-label="t('entries.pagination.next')" :title="t('entries.pagination.next')" @click="page++">
              <ChevronRight class="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Sheet v-model:open="detailOpen">
      <SheetContent side="right" class="flex w-full flex-col sm:w-[36rem] sm:max-w-xl" @open-auto-focus="onDetailOpenAutoFocus" @close-auto-focus="onDetailCloseAutoFocus">
        <div class="px-6 pt-8">
          <SheetTitle as-child>
            <h2 ref="detailTitle" tabindex="-1" class="text-base leading-snug font-semibold break-words outline-none">{{ detailHeading }}</h2>
          </SheetTitle>
          <SheetDescription class="mt-2">{{ t('entries.detail.panelDescription') }}</SheetDescription>
        </div>
        <p v-if="detailLoading" role="status" class="px-6 text-sm text-muted-foreground">{{ t('entries.detail.loading') }}</p>
        <div v-else-if="detailError" class="space-y-3 px-6">
          <p role="alert" class="text-sm text-destructive">{{ t('entries.detail.loadError') }}</p>
          <Button variant="outline" @click="detailTarget && openDetail(detailTarget)">{{ t('entries.loadRetry') }}</Button>
          <Button variant="ghost" @click="detailOpen = false">{{ t('common.close') }}</Button>
        </div>
        <EntryDetailSheet
          v-if="detail"
          v-model:client="detailClient"
          v-model:project="detailProject"
          v-model:task="detailTask"
          :entry="detail"
          :work-records="detailWorkRecords"
          :clients="clients"
          :projects="projects"
          :tasks="tasks"
          :can-write="canWrite"
          header-title-provided
          @save="saveAssignment"
        />
      </SheetContent>
    </Sheet>
  </div>
</template>

<style scoped>
@media (max-width: 767px) {
  [data-testid='entries-filter-controls'] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
  [data-testid='entries-filter-controls'] :deep(button),
  [data-testid='entries-filter-controls'] :deep(input) { width: 100%; min-width: 0; }
  .entries-mode, .entries-more { grid-column: 1 / -1; }
  .entries-mode > button { flex: 1; }
  /* Ordinary actions inherit shared geometry; segmented children remain inset. */
  [data-testid='entries-filter-layout'] { border: 0; padding: 0; }
  [data-testid='entries-filter-layout'] :deep(label) { font-size: .875rem; }
  #entries-advanced-filters :deep(input), #entries-advanced-filters :deep(button) { max-width: 100%; }
  #entries-advanced-filters > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  #entries-advanced-filters > div > div:empty { display: none; }
  #entries-advanced-filters :deep(.flex-col) { min-width: 0; }
}
/* Presentation only: keep the outer grouped disclosure reachable without
   changing measurement columns, table density, or aggregation. */
@media (min-width: 768px) {
  .entries-expander {
    position: sticky;
    right: 0;
    z-index: 1;
    background: var(--card);
  }
  td.entries-expander {
    background: color-mix(in oklab, var(--muted) 40%, var(--card));
  }
  tr[data-state='selected'] > .entries-expander {
    background: var(--muted);
  }
}
</style>
