<script setup lang="ts">
import { ChevronDown, ChevronLeft, ChevronRight } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupUnassigned, unassignedGroupKey } from '@/lib/aggregate'
import { collectAllPages } from '@/lib/paginate'
import type { TaskEntryRecord } from '@/lib/pocketbase-types'
import { suggestClient } from '@/lib/suggest-client'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'

const { t } = useI18n()
useHead({ title: computed(() => t('unassigned.title')) })
const { formatCost, formatDate, formatDuration } = useFormatters()

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { fetchUnassignedGroups, fetchGroupEntries, fetchUnassigned, bulkAssign } = useUnassignedQueue()
const toast = useToast()
const { canWrite } = useAuth()

/** Groups-listing page size (mirrors `entries/index.vue`'s `perPage`). */
const GROUPS_PAGE_SIZE = 25
/** Per-group expansion page size — the visible, paginated row list shown
 * when a group is expanded. */
const GROUP_ENTRIES_PAGE_SIZE = 25
/** Page size used only when paging through a group's rows COMPLETELY to
 * collect every entry id before a whole-group `bulkAssign` — a larger
 * page than the expansion UI's, to keep that round-trip count down, same
 * idea as `sessions-without-task/index.vue`'s `ENTRY_ID_FETCH_PAGE_SIZE`. */
const GROUP_ENTRIES_COLLECT_PAGE_SIZE = 200

const loading = ref(true)
const loadError = ref(false)
let loadRequest = 0
const retryPage = ref(1)
const fallbackMode = ref(false)
const selected = ref<Set<string>>(new Set())
const expanded = ref<Set<string>>(new Set())

const unassignedClientId = computed(() => clients.value.find(c => c.unassigned)?.id)
const assignableClients = computed(() => clients.value.filter(c => !c.unassigned && c.active))

// -- Primary path: server-totals-backed group listing, server-paginated -
const page = ref(1)
const totalGroups = ref(0)
const totalPages = ref(1)
const totalsGroups = ref<Awaited<ReturnType<typeof fetchUnassignedGroups>>['groups']>([])

// -- Fallback path (TotalsRouteUnavailableError): client-side grouping --
// over one hard-capped `fetchUnassigned` page; `fallbackTruncated` drives
// the `totals.fallbackTruncated` notice.
const fallbackTruncated = ref(false)
const fallbackEntries = ref<TaskEntryRecord[]>([])
const fallbackGroups = computed(() => groupUnassigned(fallbackEntries.value))

/** One display row, shared by both data sources above — `workMs`/`cost`
 * read from `TotalsGroup`'s flat fields on the totals path, from
 * `Totals.workMs`/`.cost` (nested under `.totals`) on the fallback path;
 * reshaped here so the template and every helper below only ever deal
 * with one shape. */
interface DisplayGroup {
  legacyLabel: string
  repoProject: string
  count: number
  workMs: number
  cost: number
}

const groups = computed<DisplayGroup[]>(() => {
  if (fallbackMode.value) {
    return fallbackGroups.value.map(g => ({
      legacyLabel: g.legacyLabel,
      repoProject: g.repoProject,
      count: g.count,
      workMs: g.totals.workMs,
      cost: g.totals.cost,
    }))
  }
  return totalsGroups.value.map(g => ({
    legacyLabel: g.legacyLabel,
    repoProject: g.repoProject,
    count: g.count,
    workMs: g.workMs,
    cost: g.cost,
  }))
})

/** Stable identity for one (legacyLabel, repoProject) group — see
 * `unassignedGroupKey`'s doc comment (`app/lib/aggregate.ts`) for why a
 * JSON tuple key, not `${legacyLabel} ${repoProject}` string
 * concatenation, is required here. */
function groupKey(g: { legacyLabel: string, repoProject: string }) {
  return unassignedGroupKey(g.legacyLabel, g.repoProject)
}

// Only the latest request may commit a page or its error. Pagination keeps
// the displayed page number until its response succeeds.
async function load(p: number, ensureCatalog = false) {
  const request = ++loadRequest
  retryPage.value = p
  loading.value = true
  loadError.value = false
  try {
    if (ensureCatalog) await Promise.all([ensureClients(), ensureProjects()])
    if (!unassignedClientId.value) {
      if (request !== loadRequest) return
      totalsGroups.value = []
      fallbackMode.value = false
      return
    }
    const clientId = unassignedClientId.value
    try {
      const result = await fetchUnassignedGroups(clientId, { page: p, perPage: GROUPS_PAGE_SIZE })
      if (request !== loadRequest) return
      totalsGroups.value = result.groups
      page.value = result.page
      totalGroups.value = result.totalGroups
      totalPages.value = result.totalPages
      fallbackMode.value = false
      fallbackTruncated.value = false
    }
    catch (err) {
      if (!(err instanceof TotalsRouteUnavailableError)) throw err
      // One hard-capped page (see `fetchUnassigned`); `truncated` is the
      // server's own count, so the notice below is never a guess.
      const fallback = await fetchUnassigned(clientId)
      if (request !== loadRequest) return
      fallbackEntries.value = fallback.entries
      fallbackTruncated.value = fallback.truncated
      fallbackMode.value = true
    }
  }
  catch {
    if (request === loadRequest) loadError.value = true
  }
  finally {
    if (request === loadRequest) loading.value = false
  }
}
onMounted(() => { void load(1, true) })
function retryLoad() { void load(retryPage.value, true) }

/** Per-group suggested client (id), a conservative pre-fill hint for the
 * assign dialog — never an auto-assignment. See app/lib/suggest-client.ts. */
const suggestedClientByGroup = computed(() => {
  const candidates = assignableClients.value.map(c => ({ id: c.id, name: c.name, code: c.code }))
  const map = new Map<string, { id: string, name: string }>()
  for (const g of groups.value) {
    const suggestion = suggestClient(g.legacyLabel, candidates)
    if (suggestion) map.set(groupKey(g), suggestion)
  }
  return map
})

function assignableClientById(id: string) {
  return assignableClients.value.find(c => c.id === id)
}

// -- Group expansion (totals path): fetched, paginated per group -------
interface GroupExpansionState {
  loading: boolean
  page: number
  perPage: number
  rows: TaskEntryRecord[]
  totalItems: number
  totalPages: number
}
const EMPTY_EXPANSION: GroupExpansionState = { loading: false, page: 1, perPage: GROUP_ENTRIES_PAGE_SIZE, rows: [], totalItems: 0, totalPages: 1 }
const groupExpansions = reactive(new Map<string, GroupExpansionState>())

function expansionState(g: DisplayGroup): GroupExpansionState {
  return groupExpansions.get(groupKey(g)) ?? EMPTY_EXPANSION
}

async function loadGroupPage(g: DisplayGroup, p: number) {
  if (!unassignedClientId.value) return
  const key = groupKey(g)
  groupExpansions.set(key, { ...expansionState(g), loading: true })
  const res = await fetchGroupEntries(unassignedClientId.value, g.legacyLabel, g.repoProject, { page: p, perPage: GROUP_ENTRIES_PAGE_SIZE })
  groupExpansions.set(key, {
    loading: false,
    page: res.page,
    perPage: res.perPage,
    rows: res.items,
    totalItems: res.totalItems,
    totalPages: res.totalPages,
  })
}

function toggleExpand(g: DisplayGroup) {
  const key = groupKey(g)
  if (expanded.value.has(key)) {
    expanded.value.delete(key)
    return
  }
  expanded.value.add(key)
  if (!fallbackMode.value) loadGroupPage(g, 1)
}

/** Fallback-path-only: pure re-filter of the already-fully-loaded
 * `fallbackEntries` ref — no fetch, unchanged from before this
 * migration. */
function entriesInGroup(g: { legacyLabel: string, repoProject: string }) {
  return fallbackEntries.value.filter(e =>
    (e.legacy_client_label || '(sin etiqueta)') === g.legacyLabel
    && (e.repo_project || '(sin proyecto)') === g.repoProject,
  )
}

// -- Whole-group entry ids (both selection and bulk-assign need every id -
// in the group, not just the currently-displayed expansion page) --------
const resolvedGroupIds = reactive(new Map<string, string[]>())

/** Every entry id in a group, resolved fresh on the totals path (paging
 * through `fetchGroupEntries` COMPLETELY via `collectAllPages`,
 * independent of the expansion UI's current page) and cached per group
 * identity for this session — never a partial list. On the fallback
 * path, `fallbackEntries` is already fully loaded, so this is a pure
 * re-filter, no fetch. */
async function resolveGroupEntryIds(g: DisplayGroup): Promise<string[]> {
  if (fallbackMode.value) return entriesInGroup(g).map(e => e.id)
  const key = groupKey(g)
  const cached = resolvedGroupIds.get(key)
  if (cached) return cached
  if (!unassignedClientId.value) return []
  const clientId = unassignedClientId.value
  const rows = await collectAllPages(p => fetchGroupEntries(clientId, g.legacyLabel, g.repoProject, { page: p, perPage: GROUP_ENTRIES_COLLECT_PAGE_SIZE }))
  const ids = rows.map(e => e.id)
  resolvedGroupIds.set(key, ids)
  return ids
}

/** Best-effort id list for the group header checkbox's tri-state: the
 * full resolved list once known, else just the currently-fetched
 * expansion page (so the checkbox can still reflect a partial selection
 * before the group has been fully resolved). */
function groupIdsForSelection(g: DisplayGroup): string[] {
  if (fallbackMode.value) return entriesInGroup(g).map(e => e.id)
  return resolvedGroupIds.get(groupKey(g)) ?? expansionState(g).rows.map(e => e.id)
}

function groupState(g: DisplayGroup): boolean | 'indeterminate' {
  const ids = groupIdsForSelection(g)
  if (ids.length === 0) return false
  const selectedCount = ids.filter(id => selected.value.has(id)).length
  if (selectedCount === 0) return false
  if (selectedCount === ids.length) return true
  return 'indeterminate'
}

async function toggleGroup(g: DisplayGroup) {
  const ids = await resolveGroupEntryIds(g)
  const allSelected = ids.length > 0 && ids.every(id => selected.value.has(id))
  for (const id of ids) {
    if (allSelected) selected.value.delete(id)
    else selected.value.add(id)
  }
  selected.value = new Set(selected.value)
}

function toggleEntry(id: string) {
  if (selected.value.has(id)) selected.value.delete(id)
  else selected.value.add(id)
  selected.value = new Set(selected.value)
}

const selectedCount = computed(() => selected.value.size)

// Assign dialog state
const assignOpen = ref(false)
const assignClient = ref('')
const assignProject = ref('')
const assigning = ref(false)
const progressDone = ref(0)
const progressTotal = ref(0)
const lastResult = ref<{ succeeded: number, failed: number } | null>(null)
let pendingResolver: () => Promise<string[]> = async () => []

/**
 * Opens the assign dialog. `count` is the best-known-so-far total, shown
 * immediately (a group's own `count` for a whole-group assign — no fetch
 * needed just to show it); `resolveIds` is only called from
 * `confirmAssign`, right before `bulkAssign` — for a whole group this
 * pages through every entry (see `resolveGroupEntryIds`), never just the
 * expanded page the UI happens to be showing.
 */
function openAssign(count: number, resolveIds: () => Promise<string[]>, suggestedClientId?: string) {
  pendingResolver = resolveIds
  // Pre-fill from the suggestion when there is one — the picker still
  // opens on it, the user still has to hit "assign" to confirm it. Never
  // skips the dialog, never assigns without confirmation.
  assignClient.value = suggestedClientId ?? ''
  assignProject.value = ''
  lastResult.value = null
  progressDone.value = 0
  progressTotal.value = count
  assignOpen.value = true
}

function openAssignSelection() {
  const ids = [...selected.value]
  openAssign(ids.length, async () => ids)
}

function openAssignGroup(g: DisplayGroup) {
  openAssign(g.count, () => resolveGroupEntryIds(g), suggestedClientByGroup.value.get(groupKey(g))?.id)
}

const projectOptions = computed(() => assignClient.value ? projects.value.filter(p => p.client === assignClient.value) : [])

async function confirmAssign() {
  if (!assignClient.value) return
  assigning.value = true
  const ids = await pendingResolver()
  progressTotal.value = ids.length
  const { succeeded, failed } = await bulkAssign(
    ids,
    { client: assignClient.value, project: assignProject.value || undefined },
    (done, total) => { progressDone.value = done; progressTotal.value = total },
  )
  assigning.value = false
  lastResult.value = { succeeded: succeeded.length, failed: failed.length }
  const succeededSet = new Set(succeeded)
  for (const id of succeeded) selected.value.delete(id)
  selected.value = new Set(selected.value)

  if (fallbackMode.value) {
    fallbackEntries.value = fallbackEntries.value.filter(e => !succeededSet.has(e.id))
  }
  else if (succeeded.length > 0) {
    // Server-side counts/groups may have changed (a group can shrink or
    // disappear entirely) — reload the current groups page from the
    // server rather than patch counts locally, and drop now-stale
    // per-group caches instead of trying to keep them in sync by hand.
    resolvedGroupIds.clear()
    groupExpansions.clear()
    expanded.value = new Set()
  }

  const destination = assignableClients.value.find(c => c.id === assignClient.value)?.name ?? assignClient.value
  if (succeeded.length > 0) {
    toast.success(t('unassigned.movedTo', { count: succeeded.length, client: destination }))
  }
  if (failed.length > 0) {
    // `/api/batch` runs each chunk as ONE DB TRANSACTION (see
    // `bulkAssign`'s doc comment in `useUnassignedQueue.ts`) — a failing
    // sub-request rolls back the WHOLE chunk, so `failed.length` is a
    // count of entries not individually, independently evaluated.
    // `unassigned.failedCount` is worded to stay honest about that
    // (never implying per-item partial success within a chunk).
    toast.error(t('unassigned.failedCount', { count: failed.length }))
  }
  if (!fallbackMode.value && succeeded.length > 0) await load(page.value)
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <h1 class="text-xl font-semibold tracking-tight">
        {{ t('unassigned.title') }}
      </h1>
      <p class="text-sm text-muted-foreground">
        {{ t('unassigned.subtitle') }}
      </p>
    </div>

    <p v-if="!loadError && fallbackMode && fallbackTruncated" class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
      {{ t('totals.fallbackTruncated', { count: fallbackEntries.length }) }}
    </p>

    <div v-if="canWrite && selectedCount > 0" data-testid="write-action" class="flex items-center justify-between rounded-md border border-border bg-muted/40 px-4 py-2">
      <span class="text-sm">{{ t('unassigned.selected', { count: selectedCount }) }}</span>
      <Button size="sm" @click="openAssignSelection">
        {{ t('unassigned.assignSelected') }}
      </Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <div v-if="loading" class="flex flex-col gap-2 p-4">
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-10 w-full" />
          <Skeleton class="h-10 w-full" />
        </div>
        <div v-else-if="loadError" class="flex items-center gap-3 p-4">
          <p role="alert" class="text-sm text-destructive">{{ t('unassigned.loadError') }}</p>
          <Button variant="outline" @click="retryLoad">{{ t('unassigned.retry') }}</Button>
        </div>
        <Table v-else-if="groups.length > 0">
          <TableHeader>
            <TableRow>
              <TableHead class="w-8" />
              <TableHead class="w-8" />
              <TableHead>{{ t('unassigned.legacyLabel') }}</TableHead>
              <TableHead>{{ t('unassigned.repoProject') }}</TableHead>
              <TableHead class="text-right">
                {{ t('unassigned.entries') }}
              </TableHead>
              <TableHead class="text-right">
                <span :title="t('common.timeHint')">{{ t('common.time') }}</span>
              </TableHead>
              <TableHead class="text-right">
                {{ t('common.cost') }}
              </TableHead>
              <TableHead class="text-right">
                {{ canWrite ? t('common.actions') : '' }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="g in groups" :key="groupKey(g)">
              <TableRow>
                <TableCell>
                  <button
                    type="button"
                    :aria-label="t('unassigned.toggleExpand', { group: g.legacyLabel })"
                    :title="t('unassigned.toggleExpand', { group: g.legacyLabel })"
                    :aria-expanded="expanded.has(groupKey(g))"
                    @click="toggleExpand(g)"
                  >
                    <ChevronDown v-if="expanded.has(groupKey(g))" class="size-4" />
                    <ChevronRight v-else class="size-4" />
                  </button>
                </TableCell>
                <TableCell>
                  <Checkbox
                    v-if="canWrite"
                    :model-value="groupState(g)"
                    :aria-label="t('unassigned.selectGroup', { group: g.legacyLabel })"
                    @update:model-value="toggleGroup(g)"
                  />
                </TableCell>
                <TableCell class="font-medium">
                  <div class="flex flex-col">
                    <span>{{ g.legacyLabel }}</span>
                    <span v-if="suggestedClientByGroup.get(groupKey(g))" class="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <ClientAvatar
                        v-if="assignableClientById(suggestedClientByGroup.get(groupKey(g))!.id)"
                        :client="assignableClientById(suggestedClientByGroup.get(groupKey(g))!.id)!"
                        size="xs"
                      />
                      {{ t('unassigned.suggested', { client: suggestedClientByGroup.get(groupKey(g))!.name }) }}
                    </span>
                  </div>
                </TableCell>
                <TableCell class="max-w-xs truncate text-muted-foreground" :title="g.repoProject">
                  {{ g.repoProject }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ g.count }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatDuration(g.workMs) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatCost(g.cost) }}
                </TableCell>
                <TableCell class="text-right">
                  <Button v-if="canWrite" data-testid="write-action" size="sm" variant="outline" @click="openAssignGroup(g)">
                    {{ t('unassigned.assignGroup') }}
                  </Button>
                </TableCell>
              </TableRow>
              <template v-if="expanded.has(groupKey(g))">
                <template v-if="fallbackMode">
                  <TableRow v-for="e in entriesInGroup(g)" :key="e.id" class="bg-muted/20">
                    <TableCell />
                    <TableCell>
                      <Checkbox
                        v-if="canWrite"
                        :model-value="selected.has(e.id)"
                        :aria-label="t('unassigned.selectEntry', { entry: e.session_name || e.session_id || e.id })"
                        @update:model-value="toggleEntry(e.id)"
                      />
                    </TableCell>
                    <TableCell colspan="2" class="text-xs text-muted-foreground">
                      {{ formatDate(e.started_at) }} · {{ e.session_name || e.session_id || e.id }}
                    </TableCell>
                    <TableCell />
                    <TableCell class="text-right tabular-nums text-xs">
                      {{ formatDuration(e.work_ms) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs">
                      {{ formatCost(e.cost) }}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </template>
                <template v-else>
                  <TableRow v-if="expansionState(g).loading">
                    <TableCell colspan="8" class="p-2">
                      <Skeleton class="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                  <TableRow v-for="e in expansionState(g).rows" :key="e.id" class="bg-muted/20">
                    <TableCell />
                    <TableCell>
                      <Checkbox
                        v-if="canWrite"
                        :model-value="selected.has(e.id)"
                        :aria-label="t('unassigned.selectEntry', { entry: e.session_name || e.session_id || e.id })"
                        @update:model-value="toggleEntry(e.id)"
                      />
                    </TableCell>
                    <TableCell colspan="2" class="text-xs text-muted-foreground">
                      {{ formatDate(e.started_at) }} · {{ e.session_name || e.session_id || e.id }}
                    </TableCell>
                    <TableCell />
                    <TableCell class="text-right tabular-nums text-xs">
                      {{ formatDuration(e.work_ms) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs">
                      {{ formatCost(e.cost) }}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  <TableRow v-if="!expansionState(g).loading && expansionState(g).totalPages > 1">
                    <TableCell colspan="8">
                      <div class="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
                        <span>{{ expansionState(g).totalItems }} · {{ expansionState(g).page }}/{{ expansionState(g).totalPages }}</span>
                        <div class="flex gap-1">
                          <Button
                            size="icon"
                            variant="outline"
                            :disabled="expansionState(g).page <= 1"
                            :aria-label="t('entries.pagination.previous')"
                            :title="t('entries.pagination.previous')"
                            @click="loadGroupPage(g, expansionState(g).page - 1)"
                          >
                            <ChevronLeft class="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            :disabled="expansionState(g).page >= expansionState(g).totalPages"
                            :aria-label="t('entries.pagination.next')"
                            :title="t('entries.pagination.next')"
                            @click="loadGroupPage(g, expansionState(g).page + 1)"
                          >
                            <ChevronRight class="size-4" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                </template>
              </template>
            </template>
          </TableBody>
        </Table>
        <EmptyState v-else :title="t('unassigned.empty')" class="m-4" />

        <div v-if="!loading && !loadError && !fallbackMode && groups.length > 0" class="flex items-center justify-between border-t border-border p-3 text-sm text-muted-foreground">
          <span>{{ totalGroups }} · {{ page }}/{{ totalPages }}</span>
          <div class="flex gap-2">
            <Button size="icon" variant="outline" :disabled="page <= 1" :aria-label="t('entries.pagination.previous')" :title="t('entries.pagination.previous')" @click="load(page - 1)">
              <ChevronLeft class="size-4" />
            </Button>
            <Button size="icon" variant="outline" :disabled="page >= totalPages" :aria-label="t('entries.pagination.next')" :title="t('entries.pagination.next')" @click="load(page + 1)">
              <ChevronRight class="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Dialog v-model:open="assignOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('unassigned.assignTo') }}</DialogTitle>
        </DialogHeader>

        <div v-if="!assigning && !lastResult" class="flex flex-col gap-4">
          <Select v-model="assignClient" :placeholder="t('common.client')" :options="assignableClients.map(c => ({ value: c.id, label: c.name }))" />
          <Select v-model="assignProject" :placeholder="t('common.project') + ' (' + t('common.none') + ')'" :options="projectOptions.map(p => ({ value: p.id, label: p.name }))" />
          <DialogFooter>
            <Button :disabled="!assignClient" @click="confirmAssign">
              {{ t('unassigned.assignTo') }}
            </Button>
          </DialogFooter>
        </div>

        <div v-else-if="assigning" class="flex flex-col gap-2">
          <p class="text-sm text-muted-foreground">
            {{ t('unassigned.progress', { done: progressDone, total: progressTotal }) }}
          </p>
          <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div class="h-full bg-primary transition-all" :style="{ width: `${progressTotal ? (progressDone / progressTotal) * 100 : 0}%` }" />
          </div>
        </div>

        <div v-else class="flex flex-col gap-3">
          <p class="text-sm">
            {{ t('unassigned.done', { succeeded: lastResult!.succeeded, failed: lastResult!.failed }) }}
          </p>
          <DialogFooter>
            <Button @click="assignOpen = false">
              {{ t('common.close') }}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
