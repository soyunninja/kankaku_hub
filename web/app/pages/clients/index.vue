<script setup lang="ts">
import { ArrowRight, LayoutGrid, List, Lock, Plus, Search, StickyNote } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
import ClientEditDialog from '@/components/clients/ClientEditDialog.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonRows from '@/components/common/SkeletonRows.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { groupByClient } from '@/lib/aggregate'
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
  ).sort((a, b) => Number(b.active) - Number(a.active))
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
const { openCreate } = editor
onBeforeUnmount(editor.close)

function openDetail(client: ClientRecord) {
  return navigateTo(`/organizacion/clientes/${client.id}`)
}
</script>

<template>
  <TooltipProvider>
    <div class="flex flex-col gap-6">
      <div v-if="!props.embedded" class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">
            {{ t('clients.title') }}
          </h1>
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
        <div v-if="loading && clients.length === 0" role="status" :aria-label="t('common.loading')" class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
          <div v-for="n in 4" :key="n" class="h-48 animate-pulse rounded-3xl bg-muted" />
        </div>
        <div v-else class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3 lg:gap-6">
          <article v-for="c in filteredClients" :key="c.id" data-testid="client-card" class="flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-2 transition-colors sm:gap-5 sm:p-5" :class="{ 'opacity-75': !c.active }">
            <div class="grid min-w-0 grid-cols-[auto_1fr] items-start gap-2 sm:gap-3">
              <ClientAvatar :client="c" size="md" class="size-7 shrink-0" />
              <div class="min-w-0">
                <h2 class="flex items-start gap-1 text-sm font-semibold sm:text-base">
                  <span class="min-w-0 [overflow-wrap:anywhere]" :title="c.name">{{ c.name }}</span>
                  <Lock v-if="c.unassigned" class="size-3.5 shrink-0 text-muted-foreground" :aria-label="t('clients.protected')" />
                </h2>
                <p class="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">{{ c.code }}</p>
              </div>
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
              <Badge :variant="c.active ? 'success' : 'outline'" class="min-w-0 whitespace-normal [overflow-wrap:anywhere]" :class="{ 'border-0 bg-orange-600 text-white': !c.active }">
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
                <TableHead>{{ t('common.status') }}</TableHead>
                <TableHead class="text-right">
                  {{ t('clients.totalTime') }}
                </TableHead>
                <TableHead class="text-right">
                  {{ t('clients.totalCost') }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows v-if="loading && clients.length === 0" :rows="4" :cols="4" />
              <TableRow
                v-for="c in filteredClients"
                :key="c.id"
                class="cursor-pointer"
                @click="openDetail(c)"
              >
                <TableCell class="font-medium">
                  <NuxtLink :to="`/organizacion/clientes/${c.id}`" class="flex min-w-0 items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-focus-indicator" @click.stop>
                    <ClientAvatar :client="c" size="sm" />
                    <span class="flex min-w-0 flex-col">
                      <span class="flex min-w-0 items-center gap-1.5">
                        <span class="[overflow-wrap:anywhere]">{{ c.name }}</span>
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
                      <span class="text-sm text-muted-foreground [overflow-wrap:anywhere]">{{ c.code }}</span>
                    </span>
                  </NuxtLink>
                </TableCell>
                <TableCell>
                  <Badge :variant="c.active ? 'success' : 'outline'" :class="{ 'border-0 bg-orange-600 text-white': !c.active }">
                    {{ c.active ? t('common.active') : t('common.inactive') }}
                  </Badge>
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatDuration(totalsByClient[c.id]?.workMs ?? 0) }}
                </TableCell>
                <TableCell class="text-right tabular-nums">
                  {{ formatCost(totalsByClient[c.id]?.cost ?? 0) }}
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
