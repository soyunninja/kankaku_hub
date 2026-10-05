<script setup lang="ts">
import { Archive, ArchiveRestore, ArrowRight, LayoutGrid, List, Lock, Pencil, Plus, Search, StickyNote } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import ClientEditDialog from '@/components/clients/ClientEditDialog.vue'
import ClientName from '@/components/clients/ClientName.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import RowActions from '@/components/common/RowActions.vue'
import SkeletonRows from '@/components/common/SkeletonRows.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { groupByClient } from '@/lib/aggregate'
import { displayUrlWithoutScheme } from '@/lib/client-contact'
import { resolvePreset } from '@/lib/period'
import type { ClientRecord } from '@/lib/pocketbase-types'
import { totalsByGroupKey } from '@/lib/totals-map'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'

const props = defineProps<{ embedded?: boolean }>()
const { t } = useI18n()
if (!props.embedded) useHead({ title: computed(() => t('clients.title')) })
const { formatCost, formatDuration } = useFormatters()

const { clients, loading, ensureLoaded } = useClients()
const { ensureLoaded: ensureProjects } = useProjects()
const { fetchRange } = useTaskEntries()
const { fetchRangeTotals } = useTotals()
const { canWrite } = useAuth()

const search = ref('')
const view = ref<'grid' | 'list'>('grid')
const filteredClients = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return clients.value.filter(client =>
    [client.name, client.code, client.website ?? ''].some(value => value.toLocaleLowerCase().includes(query)),
  )
})

const totalsByClient = ref<Record<string, { cost: number, workMs: number }>>({})
/** True when the fallback path's `fetchRange` scan was capped before
 * covering the full range — surfaces `totals.fallbackTruncated`. */
const truncated = ref(false)
const truncatedEntryCount = ref(0)

onMounted(async () => {
  await Promise.all([ensureLoaded(), ensureProjects()])
  // Totals over the last calendar month through today.
  const range = { start: resolvePreset('lastMonth').start, end: resolvePreset('today').end }
  try {
    const resp = await fetchRangeTotals(range, { groupBy: 'client', perPage: 200 })
    // There won't be more than 200 clients in practice — warn rather than
    // silently truncate the list; missing groups just show as 0 below.
    if (resp.totalPages > 1) console.warn(`clients/index.vue: totals route reports ${resp.totalGroups} client groups across ${resp.totalPages} pages — only the first 200 are shown`)
    totalsByClient.value = totalsByGroupKey(resp.groups)
  }
  catch (err) {
    if (!(err instanceof TotalsRouteUnavailableError)) throw err
    const { entries, truncated: wasTruncated } = await fetchRange(range)
    truncated.value = wasTruncated
    truncatedEntryCount.value = entries.length
    const grouped = groupByClient(entries)
    totalsByClient.value = Object.fromEntries(grouped.map(g => [g.key, { cost: g.cost, workMs: g.workMs }]))
  }
})

const editor = useClientEditor()
const { openCreate, openEdit, toggleArchive } = editor
onBeforeUnmount(editor.close)

function openDetail(client: ClientRecord) {
  return navigateTo(`/organizacion/clientes/${client.id}`)
}
</script>

<template>
  <TooltipProvider>
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <component :is="props.embedded ? 'h2' : 'h1'" class="text-xl font-semibold tracking-tight">
            {{ t('clients.title') }}
          </component>
        </div>
        <Button v-if="canWrite && !props.embedded" data-testid="write-action" size="sm" @click="openCreate">
          <Plus class="size-4" />
          {{ t('clients.new') }}
        </Button>
      </div>

      <p v-if="truncated" class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
        {{ t('totals.fallbackTruncated', { count: truncatedEntryCount }) }}
      </p>

      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div class="relative min-w-0 flex-1">
          <Search aria-hidden="true" class="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="client-search"
            v-model="search"
            type="search"
            :aria-label="t('clients.search')"
            :placeholder="t(clients.length === 1 ? 'clients.searchWithCountOne' : 'clients.searchWithCount', { count: clients.length })"
            class="pl-11"
          />
        </div>
        <div class="flex min-w-0 flex-wrap items-center gap-3">
        <div role="group" :aria-label="t('clients.viewLabel')" class="control-group flex shrink-0 gap-1 self-start bg-muted sm:self-auto">
          <Button size="segment" :variant="view === 'list' ? 'secondary' : 'ghost'" :aria-pressed="view === 'list'" @click="view = 'list'">
            <List aria-hidden="true" class="size-4" />
            {{ t('clients.listView') }}
          </Button>
          <Button size="segment" :variant="view === 'grid' ? 'secondary' : 'ghost'" :aria-pressed="view === 'grid'" @click="view = 'grid'">
            <LayoutGrid aria-hidden="true" class="size-4" />
            {{ t('clients.gridView') }}
          </Button>
        </div>
        <Button v-if="canWrite && props.embedded" data-testid="write-action" size="sm" @click="openCreate">
          <Plus class="size-4" />
          {{ t('clients.new') }}
        </Button>
        </div>
      </div>

      <template v-if="view === 'grid'">
        <div v-if="loading && clients.length === 0" role="status" :aria-label="t('common.loading')" class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
          <div v-for="n in 4" :key="n" class="h-48 animate-pulse rounded-3xl bg-muted" />
        </div>
        <div v-else class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
          <article v-for="c in filteredClients" :key="c.id" data-testid="client-card" class="flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-2 transition-colors sm:gap-5 sm:p-5">
            <div class="grid min-w-0 grid-cols-[auto_1fr] items-start gap-2 sm:gap-3">
              <ClientAvatar :client="c" size="md" class="size-7 shrink-0" />
              <div class="col-span-2 row-start-2 min-w-0">
                <h2 class="flex items-start gap-1 text-sm font-semibold sm:text-base">
                  <span class="min-w-0 [overflow-wrap:anywhere]" :title="c.name">{{ c.name }}</span>
                  <Lock v-if="c.unassigned" class="size-3.5 shrink-0 text-muted-foreground" :aria-label="t('clients.protected')" />
                  <Tooltip v-if="c.notes">
                    <TooltipTrigger as-child>
                      <button type="button" :aria-label="t('clients.hasNotes')" class="shrink-0 rounded focus-visible:ring-2 focus-visible:ring-focus-indicator">
                        <StickyNote class="size-3.5 text-muted-foreground" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent class="max-w-xs whitespace-pre-wrap">{{ c.notes }}</TooltipContent>
                  </Tooltip>
                </h2>
                <p class="mt-1 truncate text-sm text-muted-foreground" :title="c.website || c.code">
                  {{ c.website ? displayUrlWithoutScheme(c.website) : c.code }}
                </p>
              </div>
              <RowActions
                v-if="canWrite"
                data-testid="write-action"
                class="col-start-2 row-start-1 flex-wrap"
                :actions="[
                  { icon: Pencil, label: t('common.edit'), onClick: () => openEdit(c), disabled: c.unassigned },
                  { icon: c.active ? Archive : ArchiveRestore, label: c.active ? t('common.archive') : t('common.unarchive'), onClick: () => toggleArchive(c), disabled: c.unassigned },
                ]"
              />
            </div>
            <dl class="grid min-w-0 grid-cols-1 gap-3 text-sm [overflow-wrap:anywhere] sm:grid-cols-2">
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">{{ t('clients.totalTime') }}</dt>
                <dd class="mt-1 font-medium tabular-nums">{{ formatDuration(totalsByClient[c.id]?.workMs ?? 0) }}</dd>
              </div>
              <div class="min-w-0">
                <dt class="text-xs text-muted-foreground">{{ t('clients.totalCost') }}</dt>
                <dd class="mt-1 font-medium tabular-nums">{{ formatCost(totalsByClient[c.id]?.cost ?? 0) }}</dd>
              </div>
            </dl>
            <div class="mt-auto flex flex-wrap items-center justify-between gap-1">
              <Badge :variant="c.active ? 'success' : 'outline'" class="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                {{ c.active ? t('common.active') : t('common.inactive') }}
              </Badge>
              <Button variant="ghost" size="icon" class="rounded-full text-muted-foreground" :aria-label="t('clients.openDetail', { name: c.name })" @click="openDetail(c)">
                <ArrowRight aria-hidden="true" class="size-5" />
              </Button>
            </div>
          </article>
        </div>
        <EmptyState v-if="!loading && filteredClients.length === 0" :title="t(clients.length === 0 ? 'clients.empty' : 'clients.noResults')" />
      </template>

      <Card v-else>
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ t('common.name') }}</TableHead>
                <TableHead>{{ t('common.code') }}</TableHead>
                <TableHead>{{ t('common.status') }}</TableHead>
                <TableHead class="text-right">
                  {{ t('clients.totalTime') }}
                </TableHead>
                <TableHead class="text-right">
                  {{ t('clients.totalCost') }}
                </TableHead>
                <TableHead class="text-right">
                  {{ canWrite ? t('common.actions') : '' }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows v-if="loading && clients.length === 0" :rows="4" :cols="6" />
              <TableRow
                v-for="c in filteredClients"
                :key="c.id"
                class="cursor-pointer"
                @click="openDetail(c)"
              >
                <TableCell class="font-medium">
                  <ClientName :client="c" class="max-w-48">
                    <span class="flex min-w-0 items-center gap-1.5">
                      <span class="truncate">{{ c.name }}</span>
                      <Lock v-if="c.unassigned" class="size-3.5 shrink-0 text-muted-foreground" :title="t('clients.protected')" />
                      <Tooltip v-if="c.notes">
                        <TooltipTrigger as-child>
                          <StickyNote class="size-3.5 shrink-0 text-muted-foreground" :aria-label="t('clients.hasNotes')" />
                        </TooltipTrigger>
                        <TooltipContent class="max-w-xs whitespace-pre-wrap">
                          {{ c.notes }}
                        </TooltipContent>
                      </Tooltip>
                    </span>
                  </ClientName>
                </TableCell>
                <TableCell class="text-muted-foreground">
                  {{ c.code }}
                </TableCell>
                <TableCell>
                  <Badge :variant="c.active ? 'success' : 'outline'">
                    {{ c.active ? t('common.active') : t('common.inactive') }}
                  </Badge>
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatDuration(totalsByClient[c.id]?.workMs ?? 0) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatCost(totalsByClient[c.id]?.cost ?? 0) }}
                </TableCell>
                <TableCell class="text-right" @click.stop>
                  <RowActions
                    v-if="canWrite"
                    no-hover
                    data-testid="write-action"
                    :actions="[
                      { icon: Pencil, label: t('common.edit'), onClick: () => openEdit(c), disabled: c.unassigned },
                      { icon: c.active ? Archive : ArchiveRestore, label: c.active ? t('common.archive') : t('common.unarchive'), onClick: () => toggleArchive(c), disabled: c.unassigned },
                    ]"
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <EmptyState v-if="!loading && filteredClients.length === 0" :title="t(clients.length === 0 ? 'clients.empty' : 'clients.noResults')" class="m-4" />
        </CardContent>
      </Card>

      <ClientEditDialog :editor="editor" />

    </div>
  </TooltipProvider>
</template>
