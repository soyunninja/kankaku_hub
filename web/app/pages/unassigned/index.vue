<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupUnassigned } from '@/lib/aggregate'
import type { TaskEntryRecord } from '@/lib/pocketbase-types'
import { suggestClient } from '@/lib/suggest-client'

const { t } = useI18n()
useHead({ title: computed(() => t('unassigned.title')) })
const { formatCost, formatDate, formatDuration } = useFormatters()

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { fetchUnassigned, bulkAssign } = useUnassignedQueue()
const toast = useToast()

const loading = ref(true)
const entries = ref<TaskEntryRecord[]>([])
const expanded = ref<Set<string>>(new Set())
const selected = ref<Set<string>>(new Set())

const unassignedClientId = computed(() => clients.value.find(c => c.unassigned)?.id)
const assignableClients = computed(() => clients.value.filter(c => !c.unassigned && c.active))

async function load() {
  loading.value = true
  await Promise.all([ensureClients(), ensureProjects()])
  if (unassignedClientId.value) {
    entries.value = await fetchUnassigned(unassignedClientId.value)
  }
  loading.value = false
}
onMounted(load)

const groups = computed(() => groupUnassigned(entries.value))

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

function groupKey(g: { legacyLabel: string, repoProject: string }) {
  return `${g.legacyLabel} ${g.repoProject}`
}

function assignableClientById(id: string) {
  return assignableClients.value.find(c => c.id === id)
}

function toggleExpand(key: string) {
  if (expanded.value.has(key)) expanded.value.delete(key)
  else expanded.value.add(key)
}

function groupState(g: { entryIds: string[] }): boolean | 'indeterminate' {
  const selectedCount = g.entryIds.filter(id => selected.value.has(id)).length
  if (selectedCount === 0) return false
  if (selectedCount === g.entryIds.length) return true
  return 'indeterminate'
}

function toggleGroup(g: { entryIds: string[] }) {
  const allSelected = g.entryIds.every(id => selected.value.has(id))
  for (const id of g.entryIds) {
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

function entriesInGroup(g: { legacyLabel: string, repoProject: string }) {
  return entries.value.filter(e =>
    (e.legacy_client_label || '(sin etiqueta)') === g.legacyLabel
    && (e.repo_project || '(sin proyecto)') === g.repoProject,
  )
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
let pendingIds: string[] = []

function openAssign(ids: string[], suggestedClientId?: string) {
  pendingIds = ids
  // Pre-fill from the suggestion when there is one — the picker still
  // opens on it, the user still has to hit "assign" to confirm it. Never
  // skips the dialog, never assigns without confirmation.
  assignClient.value = suggestedClientId ?? ''
  assignProject.value = ''
  lastResult.value = null
  progressDone.value = 0
  progressTotal.value = ids.length
  assignOpen.value = true
}

const projectOptions = computed(() => assignClient.value ? projects.value.filter(p => p.client === assignClient.value) : [])

async function confirmAssign() {
  if (!assignClient.value) return
  assigning.value = true
  const { succeeded, failed } = await bulkAssign(
    pendingIds,
    { client: assignClient.value, project: assignProject.value || undefined },
    (done, total) => { progressDone.value = done; progressTotal.value = total },
  )
  assigning.value = false
  lastResult.value = { succeeded: succeeded.length, failed: failed.length }
  const succeededSet = new Set(succeeded)
  entries.value = entries.value.filter(e => !succeededSet.has(e.id))
  for (const id of succeeded) selected.value.delete(id)
  selected.value = new Set(selected.value)
  const destination = assignableClients.value.find(c => c.id === assignClient.value)?.name ?? assignClient.value
  if (succeeded.length > 0) {
    toast.success(t('unassigned.movedTo', { count: succeeded.length, client: destination }))
  }
  if (failed.length > 0) {
    toast.error(t('unassigned.failedCount', { count: failed.length }))
  }
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

    <div v-if="selectedCount > 0" class="flex items-center justify-between rounded-md border border-border bg-muted/40 px-4 py-2">
      <span class="text-sm">{{ t('unassigned.selected', { count: selectedCount }) }}</span>
      <Button size="sm" @click="openAssign([...selected])">
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
                {{ t('common.work') }}
              </TableHead>
              <TableHead class="text-right">
                {{ t('common.cost') }}
              </TableHead>
              <TableHead class="text-right">
                {{ t('common.actions') }}
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
                    @click="toggleExpand(groupKey(g))"
                  >
                    <ChevronDown v-if="expanded.has(groupKey(g))" class="size-4" />
                    <ChevronRight v-else class="size-4" />
                  </button>
                </TableCell>
                <TableCell>
                  <Checkbox
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
                  {{ formatDuration(g.totals.workMs) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatCost(g.totals.cost) }}
                </TableCell>
                <TableCell class="text-right">
                  <Button size="sm" variant="outline" @click="openAssign(g.entryIds, suggestedClientByGroup.get(groupKey(g))?.id)">
                    {{ t('unassigned.assignGroup') }}
                  </Button>
                </TableCell>
              </TableRow>
              <template v-if="expanded.has(groupKey(g))">
                <TableRow v-for="e in entriesInGroup(g)" :key="e.id" class="bg-muted/20">
                  <TableCell />
                  <TableCell>
                    <Checkbox
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
            </template>
          </TableBody>
        </Table>
        <EmptyState v-else :title="t('unassigned.empty')" class="m-4" />
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
