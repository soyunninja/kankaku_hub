<script setup lang="ts">
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from '@lucide/vue'
import ClientName from '@/components/clients/ClientName.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import RowActions from '@/components/common/RowActions.vue'
import SkeletonRows from '@/components/common/SkeletonRows.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TooltipProvider } from '@/components/ui/tooltip'
import { groupByProject } from '@/lib/aggregate'
import { resolvePreset } from '@/lib/period'
import { initialSortDirection, sortProjects } from '@/lib/project-sort'
import type { SortDirection, SortKey } from '@/lib/project-sort'
import type { ProjectRecord } from '@/lib/pocketbase-types'
import { totalsByGroupKey } from '@/lib/totals-map'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'

const { t, locale } = useI18n()
const { formatCost, formatDuration } = useFormatters()
useHead({ title: computed(() => t('projects.title')) })

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, loading, ensureLoaded, create, update } = useProjects()
const { fetchRange } = useTaskEntries()
const { fetchRangeTotals } = useTotals()
const toast = useToast()
const { canWrite } = useAuth()

const filterClient = ref('')
const totalsByProject = ref<Record<string, { cost: number, workMs: number }>>({})
/** True when the fallback path's `fetchRange` scan was capped before
 * covering the full range — surfaces `totals.fallbackTruncated`. */
const truncated = ref(false)
const truncatedEntryCount = ref(0)

onMounted(async () => {
  await Promise.all([ensureClients(), ensureLoaded()])
  const range = { start: resolvePreset('lastMonth').start, end: resolvePreset('today').end }
  try {
    const resp = await fetchRangeTotals(range, { groupBy: 'project', perPage: 200 })
    // There won't be more than 200 projects in practice — warn rather
    // than silently truncate the list; missing groups just show as 0.
    if (resp.totalPages > 1) console.warn(`projects/index.vue: totals route reports ${resp.totalGroups} project groups across ${resp.totalPages} pages — only the first 200 are shown`)
    totalsByProject.value = totalsByGroupKey(resp.groups)
  }
  catch (err) {
    if (!(err instanceof TotalsRouteUnavailableError)) throw err
    const { entries, truncated: wasTruncated } = await fetchRange(range)
    truncated.value = wasTruncated
    truncatedEntryCount.value = entries.length
    const grouped = groupByProject(entries.filter(e => e.project))
    totalsByProject.value = Object.fromEntries(grouped.map(g => [g.key, { cost: g.cost, workMs: g.workMs }]))
  }
})

function clientName(id: string) {
  return clients.value.find(c => c.id === id)?.name ?? id
}
function clientById(id: string) {
  return clients.value.find(c => c.id === id)
}

const sortKey = ref<SortKey>('name')
const sortDirection = ref<SortDirection>('asc')
function activateSort(key: SortKey) {
  sortDirection.value = sortKey.value === key
    ? sortDirection.value === 'asc' ? 'desc' : 'asc'
    : initialSortDirection(key)
  sortKey.value = key
}
function nextSortLabel(key: SortKey, column: string) {
  const direction = sortKey.value === key
    ? sortDirection.value === 'asc' ? 'desc' : 'asc'
    : initialSortDirection(key)
  return t(direction === 'asc' ? 'projects.sortAscending' : 'projects.sortDescending', { column })
}
const filtered = computed(() => {
  const visible = filterClient.value ? projects.value.filter(p => p.client === filterClient.value) : projects.value
  return sortProjects(visible, sortKey.value, sortDirection.value, locale.value, clientName, totalsByProject.value)
})

const dialogOpen = ref(false)
const editing = ref<ProjectRecord | null>(null)
const form = reactive({ name: '', client: '', code: '', active: true, repoPaths: [] as string[] })

function openCreate() {
  editing.value = null
  form.name = ''
  form.client = clients.value[0]?.id ?? ''
  form.code = ''
  form.active = true
  form.repoPaths = []
  dialogOpen.value = true
}

function openEdit(project: ProjectRecord) {
  editing.value = project
  form.name = project.name
  form.client = project.client
  form.code = project.code
  form.active = project.active
  form.repoPaths = [...(project.repo_paths || [])]
  dialogOpen.value = true
}

function addPath() {
  form.repoPaths.push('')
}
function removePath(i: number) {
  form.repoPaths.splice(i, 1)
}

async function onSubmit() {
  const repo_paths = form.repoPaths.map(p => p.trim()).filter(Boolean)
  try {
    if (editing.value) {
      await update(editing.value.id, { name: form.name, client: form.client, code: form.code, active: form.active, repo_paths })
    }
    else {
      await create({ name: form.name, client: form.client, code: form.code, active: form.active, repo_paths })
    }
    toast.success(t('common.saved'))
    dialogOpen.value = false
  }
  catch {
    toast.error(t('common.error'))
  }
}

async function toggleArchive(project: ProjectRecord) {
  try {
    await update(project.id, { active: !project.active })
  }
  catch {
    toast.error(t('common.error'))
  }
}
</script>

<template>
  <TooltipProvider>
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t('projects.title') }}
        </h1>
        <div class="flex items-center gap-2">
          <Select
            v-model="filterClient" class="w-48" :placeholder="t('projects.filterByClient')"
            :options="[{ value: '', label: t('common.all') }, ...clients.map(c => ({ value: c.id, label: c.name }))]"
          />
          <Button v-if="canWrite" data-testid="write-action" size="sm" @click="openCreate">
            <Plus class="size-4" />
            {{ t('projects.new') }}
          </Button>
        </div>
      </div>

      <p v-if="truncated" class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
        {{ t('totals.fallbackTruncated', { count: truncatedEntryCount }) }}
      </p>

      <Card>
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  v-for="key in (['name', 'client', 'status', 'time', 'cost'] as const)" :key="key"
                  :class="key === 'time' || key === 'cost' ? 'text-right' : undefined"
                  :aria-sort="sortKey === key ? sortDirection === 'asc' ? 'ascending' : 'descending' : undefined"
                >
                  <button
                    type="button" class="inline-flex items-center gap-1 rounded-sm text-inherit hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    :aria-label="nextSortLabel(key, t(`common.${key}`))"
                    @click="activateSort(key)"
                  >
                    <span v-if="key === 'time'" :title="t('common.timeHint')">{{ t('common.time') }}</span>
                    <span v-else>{{ t(`common.${key}`) }}</span>
                    <span v-if="sortKey === key" aria-hidden="true">{{ sortDirection === 'asc' ? '↑' : '↓' }}</span>
                  </button>
                </TableHead>
                <TableHead class="text-right">
                  {{ canWrite ? t('common.actions') : '' }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows v-if="loading && projects.length === 0" :rows="4" :cols="6" />
              <TableRow v-for="p in filtered" :key="p.id" class="cursor-pointer" @click="navigateTo(`/projects/${p.id}`)">
                <TableCell class="font-medium">
                  {{ p.name }}
                </TableCell>
                <TableCell class="text-muted-foreground">
                  <ClientName v-if="clientById(p.client)" :client="clientById(p.client)!" size="xs" class="max-w-40" />
                  <span v-else>{{ clientName(p.client) }}</span>
                </TableCell>
                <TableCell>
                  <Badge :variant="p.active ? 'success' : 'outline'">
                    {{ p.active ? t('common.active') : t('common.inactive') }}
                  </Badge>
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatDuration(totalsByProject[p.id]?.workMs ?? 0) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatCost(totalsByProject[p.id]?.cost ?? 0) }}
                </TableCell>
                <TableCell class="text-right" @click.stop>
                  <RowActions
                    v-if="canWrite"
                    data-testid="write-action"
                    :actions="[
                      { icon: Pencil, label: t('common.edit'), onClick: () => openEdit(p) },
                      { icon: p.active ? Archive : ArchiveRestore, label: p.active ? t('common.archive') : t('common.unarchive'), onClick: () => toggleArchive(p) },
                    ]"
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <EmptyState v-if="!loading && filtered.length === 0" :title="t('projects.empty')" class="m-4" />
        </CardContent>
      </Card>

      <Dialog v-model:open="dialogOpen">
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{{ editing ? t('projects.edit') : t('projects.new') }}</DialogTitle>
          </DialogHeader>
          <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
            <div class="flex flex-col gap-1.5">
              <Label for="p-name">{{ t('common.name') }}</Label>
              <Input id="p-name" v-model="form.name" required />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>{{ t('common.client') }}</Label>
              <Select v-model="form.client" :aria-label="t('common.client')" :options="clients.map(c => ({ value: c.id, label: c.name }))" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="p-code">{{ t('common.code') }}</Label>
              <Input id="p-code" v-model="form.code" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>{{ t('projects.repoPaths') }}</Label>
              <p class="text-xs text-muted-foreground">
                {{ t('projects.repoPathsHint') }}
              </p>
              <div v-for="(_, i) in form.repoPaths" :key="i" class="flex gap-2">
                <Input v-model="form.repoPaths[i]" placeholder="/home/dev/repos/project" />
                <Button type="button" variant="ghost" size="icon" :aria-label="t('projects.removePath')" :title="t('projects.removePath')" @click="removePath(i)">
                  <Trash2 class="size-4" />
                </Button>
              </div>
              <Button type="button" variant="outline" size="sm" class="self-start" @click="addPath">
                <Plus class="size-4" />
                {{ t('projects.addPath') }}
              </Button>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <Switch v-model="form.active" />
              {{ t('common.active') }}
            </label>
            <DialogFooter>
              <Button type="submit">
                {{ t('common.save') }}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </TooltipProvider>
</template>
