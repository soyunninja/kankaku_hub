<script setup lang="ts">
import { Archive, ArchiveRestore, ArrowRight, Globe, LayoutGrid, List, Lock, Mail, Pencil, Phone, Plus, RefreshCw, Search, StickyNote } from '@lucide/vue'
import ClientAvatar from '@/components/clients/ClientAvatar.vue'
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
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { groupByClient } from '@/lib/aggregate'
import {
  displayUrlWithoutScheme,
  isSafeLinkUrl,
  isValidEmail,
  isValidWebsiteUrl,
  mapPocketBaseFieldErrors,
  normalizePhone,
  normalizeWebsiteUrl,
} from '@/lib/client-contact'
import { resolvePreset } from '@/lib/period'
import type { ClientRecord } from '@/lib/pocketbase-types'
import { totalsByGroupKey } from '@/lib/totals-map'
import { TotalsRouteUnavailableError } from '@/composables/useTotals'

const { t } = useI18n()
useHead({ title: computed(() => t('clients.title')) })
const { formatCost, formatDuration } = useFormatters()

const { clients, loading, ensureLoaded, create, update, byId, refreshFavicon } = useClients()
const { ensureLoaded: ensureProjects, byClient: projectsByClient } = useProjects()
const { fetchRange } = useTaskEntries()
const { fetchRangeTotals } = useTotals()
const toast = useToast()
const { isOwner, canWrite } = useAuth()

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

// --- create/edit dialog ---------------------------------------------------

const dialogOpen = ref(false)
const editing = ref<ClientRecord | null>(null)
const form = reactive({
  name: '',
  code: '',
  active: true,
  website: '',
  contact_email: '',
  contact_phone: '',
  notes: '',
})
const fieldErrors = reactive<Record<string, string>>({})

function resetFieldErrors() {
  for (const key of Object.keys(fieldErrors)) Reflect.deleteProperty(fieldErrors, key)
}

function openCreate() {
  editing.value = null
  form.name = ''
  form.code = ''
  form.active = true
  form.website = ''
  form.contact_email = ''
  form.contact_phone = ''
  form.notes = ''
  resetFieldErrors()
  dialogOpen.value = true
}

function openEdit(client: ClientRecord) {
  editing.value = client
  form.name = client.name
  form.code = client.code
  form.active = client.active
  // Degrade gracefully: on a PocketBase instance that hasn't applied the
  // contact-fields migration yet, these come back as `undefined`, not `''`.
  form.website = client.website ?? ''
  form.contact_email = client.contact_email ?? ''
  form.contact_phone = client.contact_phone ?? ''
  form.notes = client.notes ?? ''
  resetFieldErrors()
  dialogOpen.value = true
}

function onWebsiteBlur() {
  form.website = normalizeWebsiteUrl(form.website)
}

async function onSubmit() {
  resetFieldErrors()
  form.contact_phone = normalizePhone(form.contact_phone)

  if (!isValidWebsiteUrl(form.website)) fieldErrors.website = t('clients.invalidWebsite')
  if (!isValidEmail(form.contact_email)) fieldErrors.contact_email = t('clients.invalidEmail')
  if (Object.keys(fieldErrors).length > 0) return

  const payload = {
    name: form.name,
    code: form.code,
    active: form.active,
    website: form.website,
    contact_email: form.contact_email,
    contact_phone: form.contact_phone,
    notes: form.notes,
  }

  try {
    const oldWebsite = editing.value?.website ?? ''
    const saved = editing.value
      ? await update(editing.value.id, payload)
      : await create({ ...payload, unassigned: false })

    // Fire-and-forget favicon fetch when `website` actually changed
    // (including being cleared — the route clears the stored icon
    // server-side for an empty website). Never awaited: the dialog
    // closes immediately regardless of how the fetch turns out. Never
    // triggered for the unassigned client (it has no website field in
    // the UI at all) and swallows any error — a route 404 against a
    // PocketBase instance that hasn't applied the favicon migration/hook
    // yet must not surface as a page error.
    if (!saved.unassigned && payload.website !== oldWebsite) {
      refreshFavicon(saved.id).catch(() => {})
    }

    // PocketBase silently drops unknown fields instead of erroring (see
    // AGENTS.md / docs/contract.md verification notes), so a create/update
    // against a not-yet-migrated instance would otherwise look like a
    // silent success while quietly losing the contact fields the owner
    // just typed. Detect that and say so instead of pretending it worked.
    const contactFieldsDropped = (['website', 'contact_email', 'contact_phone', 'notes'] as const)
      .some(field => payload[field] !== '' && saved[field] === undefined)

    if (contactFieldsDropped) {
      toast.error(t('clients.migrationPending'))
    }
    else {
      toast.success(t('common.saved'))
    }
    dialogOpen.value = false
  }
  catch (err) {
    const mapped = mapPocketBaseFieldErrors(err)
    if (Object.keys(mapped).length > 0) {
      Object.assign(fieldErrors, mapped)
    }
    else {
      toast.error(t('common.error'))
    }
  }
}

async function toggleArchive(client: ClientRecord) {
  if (client.unassigned) return
  try {
    await update(client.id, { active: !client.active })
  }
  catch {
    toast.error(t('common.error'))
  }
}

// --- detail sheet ----------------------------------------------------------

const detailOpen = ref(false)
const detailClient = ref<ClientRecord | null>(null)

function openDetail(client: ClientRecord) {
  detailClient.value = client
  detailOpen.value = true
}

const detailProjects = computed(() => detailClient.value ? projectsByClient(detailClient.value.id) : [])

// The website link right below is `inline-flex` (not `flex`) so its
// initial-auto-focus ring hugs the link text instead of painting
// full-width across the sheet. Redirecting focus to the sheet's own
// title (tabindex="-1": focusable programmatically, never in the normal
// Tab order) is the other half of that fix — normal manual Tab order
// still reaches the link like any other focusable element.
const sheetTitleRef = ref<HTMLElement | null>(null)
function onDetailOpenAutoFocus(event: Event) {
  event.preventDefault()
  sheetTitleRef.value?.focus()
}

const faviconRefreshing = ref(false)

async function onRefreshFavicon() {
  if (!detailClient.value || faviconRefreshing.value) return
  const id = detailClient.value.id
  faviconRefreshing.value = true
  try {
    const result = await refreshFavicon(id)
    const updated = byId(id)
    if (updated) detailClient.value = updated
    if (result.ok) {
      toast.success(t('clients.favicon.toast.ok'))
    }
    else if (result.reason === 'no_website') {
      toast.info(t('clients.favicon.toast.no_website'))
    }
    else {
      toast.error(t(`clients.favicon.toast.${result.reason}`))
    }
  }
  catch {
    toast.error(t('common.error'))
  }
  finally {
    faviconRefreshing.value = false
  }
}
</script>

<template>
  <TooltipProvider>
    <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-semibold tracking-tight">
            {{ t('clients.title') }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{ t(clients.length === 1 ? 'clients.countOne' : 'clients.count', { count: clients.length }) }}
          </p>
        </div>
        <Button v-if="canWrite" data-testid="write-action" size="sm" @click="openCreate">
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
            :placeholder="t('clients.search')"
            class="h-12 rounded-2xl bg-card pl-11"
          />
        </div>
        <div role="group" :aria-label="t('clients.viewLabel')" class="flex shrink-0 gap-1 self-start rounded-2xl bg-muted p-1 sm:self-auto">
          <Button :variant="view === 'list' ? 'secondary' : 'ghost'" :aria-pressed="view === 'list'" class="rounded-xl" @click="view = 'list'">
            <List aria-hidden="true" class="size-4" />
            {{ t('clients.listView') }}
          </Button>
          <Button :variant="view === 'grid' ? 'secondary' : 'ghost'" :aria-pressed="view === 'grid'" class="rounded-xl" @click="view = 'grid'">
            <LayoutGrid aria-hidden="true" class="size-4" />
            {{ t('clients.gridView') }}
          </Button>
        </div>
      </div>

      <template v-if="view === 'grid'">
        <div v-if="loading && clients.length === 0" role="status" :aria-label="t('common.loading')" class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
          <div v-for="n in 4" :key="n" class="h-48 animate-pulse rounded-3xl bg-muted" />
        </div>
        <div v-else class="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
          <article v-for="c in filteredClients" :key="c.id" data-testid="client-card" class="flex min-w-0 flex-col gap-3 rounded-3xl border border-border/50 bg-card p-2 transition-colors hover:border-border sm:gap-5 sm:p-5">
            <div class="grid min-w-0 grid-cols-[auto_1fr] items-start gap-2 sm:gap-3">
              <ClientAvatar :client="c" size="md" class="size-7 shrink-0" />
              <div class="col-span-2 row-start-2 min-w-0">
                <h2 class="flex items-start gap-1 text-sm font-semibold sm:text-base">
                  <span class="min-w-0 [overflow-wrap:anywhere]" :title="c.name">{{ c.name }}</span>
                  <Lock v-if="c.unassigned" class="size-3.5 shrink-0 text-muted-foreground" :aria-label="t('clients.protected')" />
                  <Tooltip v-if="c.notes">
                    <TooltipTrigger as-child>
                      <button type="button" :aria-label="t('clients.hasNotes')" class="shrink-0 rounded focus-visible:ring-2 focus-visible:ring-ring">
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

      <Dialog v-model:open="dialogOpen">
        <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{{ editing ? t('clients.edit') : t('clients.new') }}</DialogTitle>
          </DialogHeader>
          <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
            <div class="flex flex-col gap-1.5">
              <Label for="c-name">{{ t('common.name') }}</Label>
              <Input id="c-name" v-model="form.name" required />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label for="c-code">{{ t('common.code') }}</Label>
              <Input id="c-code" v-model="form.code" required />
              <p class="text-xs text-muted-foreground">
                {{ t('clients.codeHint') }}
              </p>
            </div>
            <label class="flex items-center gap-2 text-sm">
              <Switch v-model="form.active" />
              {{ t('common.active') }}
            </label>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div class="flex flex-col gap-1.5">
                <Label for="c-website">{{ t('clients.website') }}</Label>
                <Input
                  id="c-website"
                  v-model="form.website"
                  type="url"
                  placeholder="https://example.com"
                  :aria-invalid="!!fieldErrors.website"
                  @blur="onWebsiteBlur"
                  @input="delete fieldErrors.website"
                />
                <p v-if="fieldErrors.website" class="text-xs text-destructive">
                  {{ fieldErrors.website }}
                </p>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="c-contact-email">{{ t('clients.contactEmail') }}</Label>
                <Input
                  id="c-contact-email"
                  v-model="form.contact_email"
                  type="email"
                  :aria-invalid="!!fieldErrors.contact_email"
                  @input="delete fieldErrors.contact_email"
                />
                <p v-if="fieldErrors.contact_email" class="text-xs text-destructive">
                  {{ fieldErrors.contact_email }}
                </p>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="c-contact-phone">{{ t('clients.contactPhone') }}</Label>
                <Input
                  id="c-contact-phone"
                  v-model="form.contact_phone"
                  type="tel"
                  :aria-invalid="!!fieldErrors.contact_phone"
                  @input="delete fieldErrors.contact_phone"
                />
                <p v-if="fieldErrors.contact_phone" class="text-xs text-destructive">
                  {{ fieldErrors.contact_phone }}
                </p>
              </div>
              <div class="flex flex-col gap-1.5 md:col-span-2">
                <Label for="c-notes">{{ t('clients.notes') }}</Label>
                <Textarea id="c-notes" v-model="form.notes" rows="4" />
                <p class="text-xs text-muted-foreground">
                  {{ t('clients.notesHint') }}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit">
                {{ t('common.save') }}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Sheet v-model:open="detailOpen">
        <SheetContent side="right" class="flex w-full flex-col sm:w-[28rem] sm:max-w-md" @open-auto-focus="onDetailOpenAutoFocus">
          <div v-if="detailClient" class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-8 pb-6">
            <div>
              <!-- pr-8 keeps the badge clear of the sheet's absolutely
                   positioned close (X) button in the top-right corner. -->
              <!-- items-start (not center): the text block is two lines (name +
                   code), and the badge must sit level with the NAME line. -->
              <div class="flex items-start gap-3 pr-8">
                <ClientAvatar :client="detailClient" size="md" class="mt-0.5" />
                <div class="min-w-0 flex-1">
                  <h2
                    ref="sheetTitleRef"
                    data-testid="detail-client-name"
                    tabindex="-1"
                    :title="detailClient.name"
                    class="truncate text-base leading-6 font-semibold outline-none"
                  >
                    {{ detailClient.name }}
                  </h2>
                  <p data-testid="detail-client-code" class="truncate text-sm text-muted-foreground">
                    {{ detailClient.code }}
                  </p>
                </div>
                <Badge data-testid="detail-client-status-badge" :variant="detailClient.active ? 'success' : 'outline'" class="mt-0.5 shrink-0">
                  {{ detailClient.active ? t('common.active') : t('common.inactive') }}
                </Badge>
                <Lock v-if="detailClient.unassigned" class="mt-1.5 size-3.5 shrink-0 text-muted-foreground" :title="t('clients.protected')" />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1 rounded-md border border-border p-3">
                <p class="text-xs text-muted-foreground">
                  {{ t('clients.totalTime') }}
                </p>
                <p class="text-sm font-medium tabular-nums">
                  {{ formatDuration(totalsByClient[detailClient.id]?.workMs ?? 0) }}
                </p>
              </div>
              <div class="space-y-1 rounded-md border border-border p-3">
                <p class="text-xs text-muted-foreground">
                  {{ t('clients.totalCost') }}
                </p>
                <p class="text-sm font-medium tabular-nums">
                  {{ formatCost(totalsByClient[detailClient.id]?.cost ?? 0) }}
                </p>
              </div>
            </div>

            <div class="space-y-2 border-t border-border pt-4">
              <div class="flex items-center justify-between gap-2">
                <h3 class="text-sm font-medium">
                  {{ t('clients.detail.contactTitle') }}
                </h3>
                <Button
                  v-if="isOwner && !detailClient.unassigned"
                  data-testid="favicon-refresh-button write-action"
                  variant="ghost"
                  size="icon"
                  class="size-7"
                  :disabled="faviconRefreshing"
                  :aria-label="t('clients.favicon.refresh')"
                  :title="t('clients.favicon.refresh')"
                  @click="onRefreshFavicon"
                >
                  <RefreshCw data-testid="favicon-refresh-icon" class="size-3.5" :class="faviconRefreshing ? 'animate-spin' : ''" />
                </Button>
              </div>
              <a
                v-if="isSafeLinkUrl(detailClient.website ?? '')"
                :href="detailClient.website"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center gap-1.5 text-sm hover:underline"
              >
                <Globe class="size-3.5 shrink-0" />
                {{ displayUrlWithoutScheme(detailClient.website ?? '') }}
              </a>
              <p v-else class="text-sm text-muted-foreground">
                {{ t('clients.detail.noWebsite') }}
              </p>

              <a
                v-if="detailClient.contact_email"
                :href="`mailto:${detailClient.contact_email}`"
                class="flex items-center gap-1.5 text-sm hover:underline"
              >
                <Mail class="size-3.5 shrink-0" />
                {{ detailClient.contact_email }}
              </a>
              <p v-else class="text-sm text-muted-foreground">
                {{ t('clients.detail.noContactEmail') }}
              </p>

              <a
                v-if="detailClient.contact_phone"
                :href="`tel:${detailClient.contact_phone}`"
                class="flex items-center gap-1.5 text-sm hover:underline"
              >
                <Phone class="size-3.5 shrink-0" />
                {{ detailClient.contact_phone }}
              </a>
              <p v-else class="text-sm text-muted-foreground">
                {{ t('clients.detail.noContactPhone') }}
              </p>
            </div>

            <div class="space-y-2 border-t border-border pt-4">
              <h3 class="text-sm font-medium">
                {{ t('clients.notes') }}
              </h3>
              <p v-if="detailClient.notes" class="text-sm whitespace-pre-wrap text-muted-foreground">
                {{ detailClient.notes }}
              </p>
              <p v-else class="text-sm text-muted-foreground">
                {{ t('clients.detail.noNotes') }}
              </p>
            </div>

            <div class="space-y-2 border-t border-border pt-4">
              <h3 class="text-sm font-medium">
                {{ t('clients.detail.projectsTitle') }}
              </h3>
              <ul v-if="detailProjects.length > 0" class="flex flex-col gap-1">
                <li v-for="p in detailProjects" :key="p.id" class="text-sm">
                  <NuxtLink :to="`/projects/${p.id}`" class="hover:underline" @click="detailOpen = false">
                    {{ p.name }}
                  </NuxtLink>
                </li>
              </ul>
              <p v-else class="text-sm text-muted-foreground">
                {{ t('clients.detail.noProjects') }}
              </p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  </TooltipProvider>
</template>
