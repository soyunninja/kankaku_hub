<script setup lang="ts">
import { ArrowRight, LayoutGrid, List, Plus, Search, Trash2 } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import ClientName from '@/components/clients/ClientName.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonRows from '@/components/common/SkeletonRows.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TooltipProvider } from '@/components/ui/tooltip'
import { groupByProject } from '@/lib/aggregate'
import { resolvePreset } from '@/lib/period'
import { initialSortDirection, sortProjects } from '@/lib/project-sort'
import type { SortDirection, SortKey } from '@/lib/project-sort'
import { totalsByGroupKey } from '@/lib/totals-map'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'

const props = defineProps<{ embedded?: boolean }>()
const { t, locale } = useI18n()
const { formatCost, formatDuration } = useFormatters()
if (!props.embedded) useHead({ title: computed(() => t('projects.title')) })

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, loading, ensureLoaded, create } = useProjects()
const { fetchRange } = useTaskEntries()
const { fetchRangeTotals } = useTotals()
const toast = useToast()
const { canWrite, user, isAuthenticated } = useAuth()
const { $pb } = useNuxtApp()
const route = useRoute()

const filterClient = ref('')
const search = ref('')
const view = ref<'grid' | 'list'>('grid')
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
  const query = search.value.trim().toLocaleLowerCase()
  const visible = projects.value.filter(p =>
    (!filterClient.value || p.client === filterClient.value)
    && [p.name, p.code, clientName(p.client)].some(value => value.toLocaleLowerCase().includes(query)),
  )
  return sortProjects(visible, sortKey.value, sortDirection.value, locale.value, clientName, totalsByProject.value)
})
const groupedFiltered = computed(() => [
  { active: true, projects: filtered.value.filter(p => clientById(p.client)?.active === true) },
  { active: false, projects: filtered.value.filter(p => clientById(p.client)?.active !== true) },
])

const dialogOpen = ref(false)
const createBusy = ref(false)
const createGeneration = ref(0)
const createDialogIdentity = ref(0)
const createScope = () => [user.value, isAuthenticated.value, $pb.authStore.record?.id ?? null, $pb.authStore.token, canWrite.value, route.path] as const
const invalidateCreate = () => {
  createGeneration.value++
  createBusy.value = false
  if (dialogOpen.value) dialogOpen.value = false
}
watch(createScope, invalidateCreate, { flush: 'sync' })
watch(dialogOpen, (open, wasOpen) => {
  if (wasOpen && !open) {
    createGeneration.value++
    createBusy.value = false
  }
}, { flush: 'sync' })
const form = reactive({ name: '', client: '', code: '', notes: '', active: false, repoPaths: [] as string[] })
const selectedClientActive = computed(() => clients.value.find(client => client.id === form.client)?.active === true)
watch(() => form.client, () => {
  if (form.active && !selectedClientActive.value) form.active = false
}, { flush: 'sync' })

function openCreate() {
  if (createBusy.value || !canWrite.value) return
  createDialogIdentity.value++
  form.name = ''
  form.client = clients.value.find(client => client.active === true)?.id ?? clients.value[0]?.id ?? ''
  form.code = ''
  form.notes = ''
  form.active = selectedClientActive.value
  form.repoPaths = []
  dialogOpen.value = true
}

function addPath() {
  form.repoPaths.push('')
}
function removePath(i: number) {
  form.repoPaths.splice(i, 1)
}

function guardDialogDismiss(event: Event) {
  if (createBusy.value) event.preventDefault()
}

async function latestClientIsActive(id: string) {
  const latestClient = await $pb.collection('clients').getOne<{ active?: boolean }>(id)
  return latestClient.active === true
}

function isCreateCurrent(submission: { generation: number, dialogIdentity: number, ownerId: string | null, token: string, permission: boolean, routePath: string, client: string, active: boolean }) {
  return submission.generation === createGeneration.value
    && submission.dialogIdentity === createDialogIdentity.value
    && dialogOpen.value
    && submission.ownerId === ($pb.authStore.record?.id ?? null)
    && submission.token === $pb.authStore.token
    && submission.permission === canWrite.value
    && submission.permission
    && submission.routePath === route.path
    && submission.client === form.client
    && submission.active === form.active
}

async function onSubmit() {
  if (createBusy.value || !canWrite.value || !dialogOpen.value) return
  createBusy.value = true
  const payload = { name: form.name, client: form.client, code: form.code, notes: form.notes, active: form.active, repo_paths: form.repoPaths.map(p => p.trim()).filter(Boolean) }
  const submission = {
    generation: ++createGeneration.value,
    dialogIdentity: createDialogIdentity.value,
    ownerId: $pb.authStore.record?.id ?? null,
    token: $pb.authStore.token,
    permission: canWrite.value,
    routePath: route.path,
    client: payload.client,
    active: payload.active,
  }
  try {
    if (payload.active) {
      const parentActive = await latestClientIsActive(payload.client)
      if (!isCreateCurrent(submission) || !parentActive) return
    }
    if (!isCreateCurrent(submission)) return
    await create(payload)
    if (isCreateCurrent(submission)) {
      toast.success(t('common.saved'))
      dialogOpen.value = false
    }
  }
  catch {
    if (isCreateCurrent(submission)) toast.error(t('common.error'))
  }
  finally {
    if (createGeneration.value === submission.generation) createBusy.value = false
  }
}

</script>

<template>
  <TooltipProvider>
    <div class="flex flex-col gap-6">
      <div v-if="!props.embedded" class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">{{ t('projects.title') }}</h1>
        </div>
        <div class="flex items-center gap-2">
          <Button v-if="canWrite && !props.embedded" data-testid="write-action" size="sm" @click="openCreate">
            <Plus class="size-4" />
            {{ t('projects.new') }}
          </Button>
        </div>
      </div>

      <p v-if="truncated" class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
        {{ t('totals.fallbackTruncated', { count: truncatedEntryCount }) }}
      </p>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div class="relative min-w-0 flex-1">
          <Search aria-hidden="true" class="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="project-search" v-model="search" type="search" :aria-label="t('projects.search')" :placeholder="t(projects.length === 1 ? 'projects.searchWithCountOne' : 'projects.searchWithCount', { count: projects.length })" class="pl-11" />
        </div>
        <div class="flex min-w-0 flex-col gap-1 sm:w-48">
          <Label for="project-client-filter" class="text-xs leading-normal font-normal text-muted-foreground">{{ t('projects.filterByClient') }}</Label>
          <Select id="project-client-filter" v-model="filterClient" class="border-0 bg-muted dark:bg-muted" :aria-label="t('projects.filterByClient')" :options="[{ value: '', label: t('common.all') }, ...clients.map(c => ({ value: c.id, label: c.name }))]">
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
        <div class="flex min-w-0 flex-wrap items-center gap-3">
        <div role="group" :aria-label="t('projects.viewLabel')" class="control-group flex shrink-0 gap-1 self-start bg-muted sm:self-auto">
          <Button size="segment" :variant="view === 'list' ? 'secondary' : 'ghost'" :aria-pressed="view === 'list'" @click="view = 'list'">
            <List aria-hidden="true" class="size-4" />{{ t('projects.listView') }}
          </Button>
          <Button size="segment" :variant="view === 'grid' ? 'secondary' : 'ghost'" :aria-pressed="view === 'grid'" @click="view = 'grid'">
            <LayoutGrid aria-hidden="true" class="size-4" />{{ t('projects.gridView') }}
          </Button>
        </div>
        <Button v-if="canWrite && props.embedded" data-testid="write-action" size="sm" @click="openCreate">
          <Plus class="size-4" />
          {{ t('projects.new') }}
        </Button>
        </div>
      </div>

      <template v-if="view === 'grid'">
        <div v-if="loading && projects.length === 0" role="status" :aria-label="t('common.loading')" class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
          <div v-for="n in 6" :key="n" class="h-48 animate-pulse rounded-3xl bg-muted" />
        </div>
        <div v-else class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
          <section v-for="group in groupedFiltered" v-show="group.projects.length" :key="String(group.active)" class="col-span-full" :class="{ 'mt-6': !group.active }">
            <h2 v-if="!group.active" class="mb-3 text-sm font-semibold text-muted-foreground">{{ t('projects.inactiveClientProjects') }}</h2>
            <div class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
              <article v-for="p in group.projects" :key="p.id" data-testid="project-card" class="flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-2 transition-colors sm:gap-5 sm:p-5" :class="{ 'opacity-75': !group.active }">
            <div class="flex min-w-0 flex-col gap-2">
              <h2 class="min-w-0 text-sm font-semibold [overflow-wrap:anywhere] sm:text-base">{{ p.name }}</h2>
              <div class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <ClientAvatar :client="clientById(p.client) ?? { id: p.client, name: clientName(p.client), favicon: '', updated: '' }" size="xs" class="shrink-0" />
                <p class="min-w-0 truncate" :title="clientName(p.client)">
                  {{ clientName(p.client) }}
                </p>
              </div>
            </div>
            <dl class="grid min-w-0 grid-cols-1 gap-3 text-sm [overflow-wrap:anywhere] sm:grid-cols-2">
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground" :title="t('common.timeHint')">{{ t('common.time') }}</dt>
                <dd class="mt-1 font-medium tabular-nums">{{ formatDuration(totalsByProject[p.id]?.workMs ?? 0) }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">{{ t('common.cost') }}</dt>
                <dd class="mt-1 font-medium tabular-nums">{{ formatCost(totalsByProject[p.id]?.cost ?? 0) }}</dd>
              </div>
            </dl>
            <div class="mt-auto flex flex-wrap items-center justify-between gap-1">
              <Badge v-if="group.active" :variant="p.active ? 'success' : 'outline'" class="min-w-0 whitespace-normal [overflow-wrap:anywhere]">{{ p.active ? t('common.active') : t('common.inactive') }}</Badge>
              <Button variant="ghost" size="icon" class="ml-auto shrink-0 rounded-full text-muted-foreground" :aria-label="t('projects.openDetail', { name: p.name })" @click="navigateTo(`/organizacion/clientes/${p.client}/proyectos/${p.id}`)">
                <ArrowRight aria-hidden="true" class="size-5" />
              </Button>
            </div>
              </article>
            </div>
          </section>
        </div>
        <EmptyState v-if="!loading && filtered.length === 0" :title="t(projects.length === 0 ? 'projects.empty' : 'projects.noResults')" />
      </template>

      <Card v-else>
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
                    type="button" class="inline-flex items-center gap-1 rounded-sm text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-indicator"
                    :aria-label="nextSortLabel(key, t(`common.${key}`))"
                    @click="activateSort(key)"
                  >
                    <span v-if="key === 'time'" :title="t('common.timeHint')">{{ t('common.time') }}</span>
                    <span v-else>{{ t(`common.${key}`) }}</span>
                    <span v-if="sortKey === key" aria-hidden="true">{{ sortDirection === 'asc' ? '↑' : '↓' }}</span>
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows v-if="loading && projects.length === 0" :rows="4" :cols="5" />
              <template v-for="group in groupedFiltered" :key="String(group.active)">
                <TableRow v-if="!group.active && group.projects.length" class="bg-muted/50">
                  <TableHead scope="rowgroup" colspan="5" class="text-left font-semibold pt-8">
                    {{ t('projects.inactiveClientProjects') }}
                  </TableHead>
                </TableRow>
                <TableRow v-for="p in group.projects" :key="p.id" class="cursor-pointer" :class="{ 'opacity-75': !group.active }" @click="navigateTo(`/organizacion/clientes/${p.client}/proyectos/${p.id}`)">
                <TableCell class="font-medium">
                  <NuxtLink :to="`/organizacion/clientes/${p.client}/proyectos/${p.id}`" class="rounded-sm focus-visible:outline-2 focus-visible:outline-focus-indicator" @click.stop>{{ p.name }}</NuxtLink>
                </TableCell>
                <TableCell class="text-muted-foreground">
                  <ClientName v-if="clientById(p.client)" :client="clientById(p.client)!" size="xs" class="max-w-40" />
                  <span v-else>{{ clientName(p.client) }}</span>
                </TableCell>
                <TableCell>
                  <Badge v-if="group.active" :variant="p.active ? 'success' : 'outline'">
                    {{ p.active ? t('common.active') : t('common.inactive') }}
                  </Badge>
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatDuration(totalsByProject[p.id]?.workMs ?? 0) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatCost(totalsByProject[p.id]?.cost ?? 0) }}
                </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
          <EmptyState v-if="!loading && filtered.length === 0" :title="t(projects.length === 0 ? 'projects.empty' : 'projects.noResults')" class="m-4" />
        </CardContent>
      </Card>

      <Dialog v-model:open="dialogOpen">
        <DialogContent :show-close-button="!createBusy" @escape-key-down="guardDialogDismiss" @interact-outside="guardDialogDismiss">
          <DialogHeader>
            <DialogTitle>{{ t('projects.new') }}</DialogTitle>
          </DialogHeader>
          <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
            <div class="flex flex-col gap-1.5">
              <Label for="p-name">{{ t('common.name') }}</Label>
              <Input id="p-name" v-model="form.name" required :disabled="createBusy" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>{{ t('common.client') }}</Label>
              <Select v-model="form.client" :disabled="createBusy" :aria-label="t('common.client')" :options="clients.map(c => ({ value: c.id, label: c.name }))" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="p-code">{{ t('common.code') }}</Label>
              <Input id="p-code" v-model="form.code" :disabled="createBusy" />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="p-notes">{{ t('projects.notes') }}</Label>
              <Textarea id="p-notes" v-model="form.notes" maxlength="5000" rows="4" :disabled="createBusy" />
              <p class="text-xs text-muted-foreground">{{ t('projects.notesHint') }}</p>
            </div>
            <div class="flex flex-col gap-1.5">
              <Label>{{ t('projects.repoPaths') }}</Label>
              <p class="text-xs text-muted-foreground">
                {{ t('projects.repoPathsHint') }}
              </p>
              <div v-for="(_, i) in form.repoPaths" :key="i" class="flex gap-2">
                <Input v-model="form.repoPaths[i]" placeholder="/home/dev/repos/project" :disabled="createBusy" />
                <Button type="button" variant="ghost" size="icon" :disabled="createBusy" :aria-label="t('projects.removePath')" :title="t('projects.removePath')" @click="removePath(i)">
                  <Trash2 class="size-4" />
                </Button>
              </div>
              <Button type="button" variant="outline" size="sm" class="self-start" :disabled="createBusy" @click="addPath">
                <Plus class="size-4" />
                {{ t('projects.addPath') }}
              </Button>
            </div>
            <p v-if="!selectedClientActive" role="status" class="text-sm text-muted-foreground">{{ t('projects.inactiveParentNotice') }}</p>
            <label class="flex items-center gap-2 text-sm">
              <Switch v-model="form.active" :disabled="createBusy || !selectedClientActive" />
              {{ t('common.active') }}
            </label>
            <DialogFooter>
              <Button type="submit" :disabled="createBusy">
                {{ t('common.save') }}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </TooltipProvider>
</template>
