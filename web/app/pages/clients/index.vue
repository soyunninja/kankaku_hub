<script setup lang="ts">
import { Lock, Plus } from '@lucide/vue'
import EmptyState from '@/components/common/EmptyState.vue'
import SkeletonRows from '@/components/common/SkeletonRows.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { groupByClient } from '@/lib/aggregate'
import { formatCost, formatDuration } from '@/lib/format'
import { resolvePreset } from '@/lib/period'
import type { ClientRecord } from '@/lib/pocketbase-types'

const { t } = useI18n()
useHead({ title: computed(() => t('clients.title')) })

const { clients, loading, ensureLoaded, create, update } = useClients()
const { fetchRange } = useTaskEntries()
const toast = useToast()

const totalsByClient = ref<Record<string, { cost: number, workMs: number }>>({})

onMounted(async () => {
  await ensureLoaded()
  // Totals over the last 90 days, enough for the list's "at a glance" column.
  const range = { start: resolvePreset('30d').start, end: resolvePreset('today').end }
  const entries = await fetchRange({ ...range, start: resolvePreset('lastMonth').start })
  const grouped = groupByClient(entries)
  totalsByClient.value = Object.fromEntries(grouped.map(g => [g.key, { cost: g.cost, workMs: g.workMs }]))
})

const dialogOpen = ref(false)
const editing = ref<ClientRecord | null>(null)
const form = reactive({ name: '', code: '', active: true })

function openCreate() {
  editing.value = null
  form.name = ''
  form.code = ''
  form.active = true
  dialogOpen.value = true
}

function openEdit(client: ClientRecord) {
  editing.value = client
  form.name = client.name
  form.code = client.code
  form.active = client.active
  dialogOpen.value = true
}

async function onSubmit() {
  try {
    if (editing.value) {
      await update(editing.value.id, { name: form.name, code: form.code, active: form.active })
    }
    else {
      await create({ name: form.name, code: form.code, active: form.active, unassigned: false })
    }
    toast.success(t('common.saved'))
    dialogOpen.value = false
  }
  catch {
    toast.error(t('common.error'))
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
</script>

<template>
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
            <SkeletonRows v-if="loading && clients.length === 0" :rows="4" :cols="6" />
            <TableRow v-for="c in clients" :key="c.id">
              <TableCell class="font-medium">
                <span class="flex items-center gap-1.5">
                  {{ c.name }}
                  <Lock v-if="c.unassigned" class="size-3.5 text-muted-foreground" :title="t('clients.protected')" />
                </span>
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
              <TableCell class="text-right">
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ editing ? t('clients.edit') : t('clients.new') }}</DialogTitle>
        </DialogHeader>
        <form class="flex flex-col gap-4" @submit.prevent="onSubmit">
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
          <DialogFooter>
            <Button type="submit">
              {{ t('common.save') }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
