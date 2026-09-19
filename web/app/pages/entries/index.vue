<script setup lang="ts">
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCost, formatDateTime, formatDuration } from '@/lib/format'
import type { EntriesExplorerFilters } from '@/composables/useEntriesExplorer'
import type { TaskEntryRecord, WorkRecordRecord } from '@/lib/pocketbase-types'

const { t } = useI18n()
useHead({ title: computed(() => t('entries.title')) })

const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { list, getOne, listWorkRecords, updateAssignment } = useEntriesExplorer()
const toast = useToast()

const filters = reactive<EntriesExplorerFilters>({})
const page = ref(1)
const perPage = 25
const sort = ref('-started_at')
const loading = ref(true)
const items = ref<TaskEntryRecord[]>([])
const totalItems = ref(0)
const totalPages = ref(1)

async function load() {
  loading.value = true
  try {
    const res = await list({ page: page.value, perPage, sort: sort.value, filters })
    items.value = res.items
    totalItems.value = res.totalItems
    totalPages.value = res.totalPages
  }
  finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([ensureClients(), ensureProjects()])
  await load()
})

watch([filters, sort], () => { page.value = 1; load() }, { deep: true })
watch(page, load)

function clientName(id: string) {
  return clients.value.find(c => c.id === id)?.name ?? id
}
function projectName(id: string) {
  return id ? (projects.value.find(p => p.id === id)?.name ?? id) : '—'
}

function toggleSort(field: string) {
  if (sort.value === field) sort.value = `-${field}`
  else if (sort.value === `-${field}`) sort.value = field
  else sort.value = `-${field}`
}

// Detail drawer
const detailOpen = ref(false)
const detail = ref<TaskEntryRecord | null>(null)
const detailWorkRecords = ref<WorkRecordRecord[]>([])
const detailClient = ref('')
const detailProject = ref('')

async function openDetail(entry: TaskEntryRecord) {
  detailOpen.value = true
  detail.value = await getOne(entry.id)
  detailClient.value = detail.value.client
  detailProject.value = detail.value.project
  detailWorkRecords.value = await listWorkRecords(entry.id) as unknown as WorkRecordRecord[]
}

async function saveAssignment() {
  if (!detail.value) return
  try {
    await updateAssignment(detail.value.id, { client: detailClient.value, project: detailProject.value })
    toast.success(t('common.saved'))
    await load()
  }
  catch {
    toast.error(t('common.error'))
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="text-xl font-semibold tracking-tight">
      {{ t('entries.title') }}
    </h1>

    <Card>
      <CardContent class="flex flex-wrap gap-2 p-3">
        <Select v-model="filters.client" class="w-40" :placeholder="t('common.client')" :options="[{ value: '', label: t('common.all') }, ...clients.map(c => ({ value: c.id, label: c.name }))]" />
        <Select v-model="filters.project" class="w-40" :placeholder="t('common.project')" :options="[{ value: '', label: t('common.all') }, ...projects.map(p => ({ value: p.id, label: p.name }))]" />
        <Select
v-model="filters.status" class="w-36" :placeholder="t('common.status')" :options="[
          { value: '', label: t('common.all') },
          { value: 'completed', label: 'completed' },
          { value: 'aborted', label: 'aborted' },
          { value: 'interrupted', label: 'interrupted' },
        ]"
        />
        <Input v-model="filters.model" placeholder="model" class="w-32" />
        <Input v-model="filters.machine" placeholder="machine" class="w-32" />
        <Input v-model="filters.dateStart" type="date" class="w-36" />
        <Input v-model="filters.dateEnd" type="date" class="w-36" />
        <Input v-model="filters.search" :placeholder="t('entries.searchPrompt')" class="w-56" />
      </CardContent>
    </Card>

    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="cursor-pointer" @click="toggleSort('started_at')">
                {{ t('common.started') }}
              </TableHead>
              <TableHead>{{ t('common.client') }}</TableHead>
              <TableHead>{{ t('common.project') }}</TableHead>
              <TableHead>{{ t('common.status') }}</TableHead>
              <TableHead>{{ t('common.model') }}</TableHead>
              <TableHead class="cursor-pointer text-right" @click="toggleSort('work_ms')">
                {{ t('common.work') }}
              </TableHead>
              <TableHead class="cursor-pointer text-right" @click="toggleSort('cost')">
                {{ t('common.cost') }}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-if="loading">
              <TableRow v-for="i in 6" :key="i">
                <TableCell colspan="7">
                  <Skeleton class="h-5 w-full" />
                </TableCell>
              </TableRow>
            </template>
            <TableRow v-for="e in items" :key="e.id" class="cursor-pointer" @click="openDetail(e)">
              <TableCell class="tabular-nums">
                {{ formatDateTime(e.started_at) }}
              </TableCell>
              <TableCell>{{ clientName(e.client) }}</TableCell>
              <TableCell>{{ projectName(e.project) }}</TableCell>
              <TableCell>{{ e.status }}</TableCell>
              <TableCell class="text-muted-foreground">
                {{ e.model }}
              </TableCell>
              <TableCell class="text-right tabular-nums">
                {{ formatDuration(e.work_ms) }}
              </TableCell>
              <TableCell class="text-right tabular-nums">
                {{ formatCost(e.cost) }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <EmptyState v-if="!loading && items.length === 0" :title="t('entries.empty')" class="m-4" />

        <div class="flex items-center justify-between border-t border-border p-3 text-sm text-muted-foreground">
          <span>{{ totalItems }} · {{ page }}/{{ totalPages }}</span>
          <div class="flex gap-2">
            <Button size="icon" variant="outline" :disabled="page <= 1" @click="page--">
              <ChevronLeft class="size-4" />
            </Button>
            <Button size="icon" variant="outline" :disabled="page >= totalPages" @click="page++">
              <ChevronRight class="size-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <Sheet v-model:open="detailOpen">
      <SheetContent side="right" class="w-full max-w-md overflow-y-auto sm:w-[28rem]">
        <div v-if="detail" class="flex flex-col gap-4 pt-8">
          <h2 class="text-base font-semibold">
            {{ t('entries.detail.title') }}
          </h2>

          <div class="grid grid-cols-2 gap-2 text-xs">
            <div v-for="[k, v] in Object.entries(detail).filter(([k]) => !['expand'].includes(k))" :key="k" class="contents">
              <span class="text-muted-foreground">{{ k }}</span>
              <span class="truncate tabular-nums" :title="String(v)">{{ v === '' || v === null ? '—' : String(v) }}</span>
            </div>
          </div>

          <div class="flex flex-col gap-2 border-t border-border pt-3">
            <h3 class="text-sm font-medium">
              {{ t('entries.detail.assignment') }}
            </h3>
            <Select v-model="detailClient" :options="clients.map(c => ({ value: c.id, label: c.name }))" />
            <Select v-model="detailProject" :placeholder="t('common.none')" :options="[{ value: '', label: t('common.none') }, ...projects.filter(p => p.client === detailClient).map(p => ({ value: p.id, label: p.name }))]" />
            <Button size="sm" class="self-start" @click="saveAssignment">
              {{ t('common.save') }}
            </Button>
          </div>

          <div class="flex flex-col gap-2 border-t border-border pt-3">
            <h3 class="text-sm font-medium">
              {{ t('entries.detail.workRecords') }}
            </h3>
            <p class="rounded-md bg-warning/15 p-2 text-xs text-warning-foreground">
              {{ t('entries.detail.workRecordsWarning') }}
            </p>
            <div v-if="detailWorkRecords.length === 0" class="text-xs text-muted-foreground">
              {{ t('entries.detail.noWorkRecords') }}
            </div>
            <div v-for="wr in detailWorkRecords" :key="wr.id" class="rounded-md border border-border p-2 text-xs">
              <p class="font-medium">
                {{ wr.role }} · pid {{ wr.pid }}
              </p>
              <p class="text-muted-foreground">
                {{ formatDuration(wr.work_ms) }} · {{ formatCost(wr.cost) }} · {{ wr.status }}
              </p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  </div>
</template>
