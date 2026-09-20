<script setup lang="ts">
import { Globe, Lock, Mail, Phone, Plus, StickyNote } from '@lucide/vue'
import EmptyState from '@/components/common/EmptyState.vue'
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
import { formatCost, formatDuration } from '@/lib/format'
import { resolvePreset } from '@/lib/period'
import type { ClientRecord } from '@/lib/pocketbase-types'

const { t } = useI18n()
useHead({ title: computed(() => t('clients.title')) })

const { clients, loading, ensureLoaded, create, update } = useClients()
const { ensureLoaded: ensureProjects, byClient: projectsByClient } = useProjects()
const { fetchRange } = useTaskEntries()
const toast = useToast()

const totalsByClient = ref<Record<string, { cost: number, workMs: number }>>({})

onMounted(async () => {
  await Promise.all([ensureLoaded(), ensureProjects()])
  // Totals over the last 90 days, enough for the list's "at a glance" column.
  const range = { start: resolvePreset('30d').start, end: resolvePreset('today').end }
  const entries = await fetchRange({ ...range, start: resolvePreset('lastMonth').start })
  const grouped = groupByClient(entries)
  totalsByClient.value = Object.fromEntries(grouped.map(g => [g.key, { cost: g.cost, workMs: g.workMs }]))
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
    const saved = editing.value
      ? await update(editing.value.id, payload)
      : await create({ ...payload, unassigned: false })

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
</script>

<template>
  <TooltipProvider>
    <div class="flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold tracking-tight">
          {{ t('clients.title') }}
        </h1>
        <Button size="sm" @click="openCreate">
          <Plus class="size-4" />
          {{ t('clients.new') }}
        </Button>
      </div>

      <Card>
        <CardContent class="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{{ t('common.name') }}</TableHead>
                <TableHead>{{ t('common.code') }}</TableHead>
                <TableHead class="hidden md:table-cell md:max-w-24 lg:max-w-32">
                  {{ t('clients.website') }}
                </TableHead>
                <TableHead class="hidden md:table-cell md:max-w-24 lg:max-w-32">
                  {{ t('clients.contact') }}
                </TableHead>
                <TableHead>{{ t('common.status') }}</TableHead>
                <TableHead class="text-right">
                  {{ t('clients.totalTime') }}
                </TableHead>
                <TableHead class="text-right">
                  {{ t('clients.totalCost') }}
                </TableHead>
                <TableHead class="text-right">
                  {{ t('common.actions') }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows v-if="loading && clients.length === 0" :rows="4" :cols="8" />
              <TableRow
                v-for="c in clients"
                :key="c.id"
                class="cursor-pointer"
                @click="openDetail(c)"
              >
                <TableCell class="font-medium">
                  <span class="flex items-center gap-1.5">
                    {{ c.name }}
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
                </TableCell>
                <TableCell class="text-muted-foreground">
                  {{ c.code }}
                </TableCell>
                <TableCell class="hidden max-w-24 text-muted-foreground md:table-cell lg:max-w-32" @click.stop>
                  <a
                    v-if="isSafeLinkUrl(c.website ?? '')"
                    :href="c.website"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex min-w-0 items-center gap-1 hover:underline"
                  >
                    <Globe class="size-3.5 shrink-0" />
                    <span class="min-w-0 flex-1 truncate">{{ displayUrlWithoutScheme(c.website ?? '') }}</span>
                  </a>
                  <span v-else>—</span>
                </TableCell>
                <TableCell class="hidden max-w-24 text-muted-foreground md:table-cell lg:max-w-32" @click.stop>
                  <div class="flex flex-col gap-0.5">
                    <a
                      v-if="c.contact_email"
                      :href="`mailto:${c.contact_email}`"
                      class="flex min-w-0 items-center gap-1 hover:underline"
                    >
                      <Mail class="size-3.5 shrink-0" />
                      <span class="min-w-0 flex-1 truncate">{{ c.contact_email }}</span>
                    </a>
                    <a
                      v-if="c.contact_phone"
                      :href="`tel:${c.contact_phone}`"
                      class="flex min-w-0 items-center gap-1 hover:underline"
                    >
                      <Phone class="size-3.5 shrink-0" />
                      <span class="min-w-0 flex-1 truncate">{{ c.contact_phone }}</span>
                    </a>
                    <span v-if="!c.contact_email && !c.contact_phone">—</span>
                  </div>
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
                  <div class="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" :disabled="c.unassigned" @click="openEdit(c)">
                      {{ t('common.edit') }}
                    </Button>
                    <Button variant="ghost" size="sm" :disabled="c.unassigned" @click="toggleArchive(c)">
                      {{ c.active ? t('common.archive') : t('common.unarchive') }}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <EmptyState v-if="!loading && clients.length === 0" :title="t('clients.empty')" class="m-4" />
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
        <SheetContent side="right" class="flex w-full max-w-md flex-col sm:w-[28rem]">
          <div v-if="detailClient" class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pt-8 pb-6">
            <div class="space-y-1">
              <h2 class="flex items-center gap-1.5 text-base font-semibold">
                {{ detailClient.name }}
                <Lock v-if="detailClient.unassigned" class="size-3.5 text-muted-foreground" :title="t('clients.protected')" />
              </h2>
              <p class="text-sm text-muted-foreground">
                {{ detailClient.code }}
              </p>
              <Badge class="mt-1" :variant="detailClient.active ? 'success' : 'outline'">
                {{ detailClient.active ? t('common.active') : t('common.inactive') }}
              </Badge>
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
              <h3 class="text-sm font-medium">
                {{ t('clients.detail.contactTitle') }}
              </h3>
              <a
                v-if="isSafeLinkUrl(detailClient.website ?? '')"
                :href="detailClient.website"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-center gap-1.5 text-sm hover:underline"
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
