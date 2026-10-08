<script setup lang="ts">
import { Button } from '@/components/ui/button'
import type { TaskEntryRecord } from '@/lib/pocketbase-types'
import type { TotalsResponse } from '@/lib/totals-map'
import { resolvePreset } from '@/lib/period'
import { activityFilters, dateRangeFromQuery, entryDestination } from './activity'

const props = defineProps<{ memberId?: string }>()
const { t } = useI18n()
const route = useRoute()
const { isOwner } = useAuth()
const { departments, members, refresh } = useTeamCatalog()
const explorer = useEntriesExplorer()
const { fetchRangeTotals } = useTotals()
const member = ref('*')
const department = ref('*')
const initialRange = resolvePreset(props.memberId === undefined ? 'today' : '30d')
const bookmarkedRange = dateRangeFromQuery(route.query.dateStart, route.query.dateEnd, initialRange)
const dateStart = ref(bookmarkedRange.start)
const dateEnd = ref(bookmarkedRange.end)
const page = ref(1)
const totalPages = ref(0)
type ActivityEntry = TaskEntryRecord & { member?: string, department?: string }
const entries = ref<ActivityEntry[]>([])
const totals = ref<TotalsResponse | null>(null)
const loading = ref(false)
const error = ref('')
const filters = computed(() => activityFilters(props.memberId, member.value, department.value))
let generation = 0
async function load() {
  const request = ++generation
  entries.value = []
  totals.value = null
  totalPages.value = 0
  error.value = ''
  if (!isOwner.value) { loading.value = false; return }
  if (!dateStart.value || !dateEnd.value || dateStart.value > dateEnd.value) {
    error.value = t('team.invalidRange')
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [rows, summary] = await Promise.all([
      explorer.list({ page: page.value, perPage: 25, sort: '-started_at,id', filters: { ...filters.value, dateStart: dateStart.value, dateEnd: dateEnd.value } }),
      fetchRangeTotals({ start: dateStart.value, end: dateEnd.value }, { filters: filters.value }),
    ])
    if (request !== generation) return
    entries.value = rows.items
    totalPages.value = rows.totalPages
    totals.value = summary
  }
  catch { if (request === generation) error.value = t('team.activityFailed') }
  finally { if (request === generation) loading.value = false }
}
function identity(id: string | undefined, rows: { id: string, name: string }[]) {
  return id ? rows.find(row => row.id === id)?.name || id : t('team.unassigned')
}
watch(() => [route.query.dateStart, route.query.dateEnd], ([start, end]) => {
  const range = dateRangeFromQuery(start, end, initialRange)
  dateStart.value = range.start
  dateEnd.value = range.end
})
watch([filters, dateStart, dateEnd], () => {
  if (page.value !== 1) page.value = 1
  else void load()
})
watch([page, isOwner], () => { void load() })
onBeforeUnmount(() => { generation++ })
onMounted(async () => {
  if (!isOwner.value) return
  try { await refresh(); await load() }
  catch { error.value = t('team.requestFailed') }
})
</script>

<template>
  <div class="space-y-6">
    <p v-if="!isOwner">{{ t('team.ownerOnly') }}</p>
    <template v-else>
      <p class="text-sm text-muted-foreground">{{ t('team.activityDescription') }}</p>
      <div class="grid gap-3 sm:grid-cols-4">
        <template v-if="props.memberId === undefined">
          <label>{{ t('team.member') }}
            <select v-model="member" class="h-9 w-full rounded-md border bg-background px-3">
              <option value="*">{{ t('team.all') }}</option>
              <option value="">{{ t('team.unassigned') }}</option>
              <option v-for="row in members" :key="row.id" :value="row.id">{{ row.name }}</option>
            </select>
          </label>
          <label>{{ t('team.department') }}
            <select v-model="department" class="h-9 w-full rounded-md border bg-background px-3">
              <option value="*">{{ t('team.all') }}</option>
              <option value="">{{ t('team.unassigned') }}</option>
              <option v-for="row in departments" :key="row.id" :value="row.id">{{ row.name }}</option>
            </select>
          </label>
        </template>
        <label>{{ t('team.from') }}<input v-model="dateStart" type="date" class="block h-9 w-full rounded-md border bg-background px-3"></label>
        <label>{{ t('team.to') }}<input v-model="dateEnd" type="date" class="block h-9 w-full rounded-md border bg-background px-3"></label>
      </div>
      <p v-if="loading" role="status">{{ t('common.loading') }}</p>
      <div v-if="error" role="alert">{{ error }} <Button variant="outline" @click="load">{{ t('team.retry') }}</Button></div>
      <p v-if="totals" class="rounded-lg border p-4">
        {{ t('team.summary', { count: totals.total.entries, minutes: (totals.total.workMs / 60000).toFixed(1), cost: totals.total.cost.toFixed(4) }) }}
      </p>
      <p v-if="!loading && !error && !entries.length">{{ t('team.empty') }}</p>
      <ul class="divide-y rounded-lg border px-4">
        <li v-for="entry in entries" :key="entry.id" class="space-y-1 py-3">
          <p class="font-medium [overflow-wrap:anywhere]">{{ entry.prompt || entry.session_name || entry.task_id }}</p>
          <p class="text-sm text-muted-foreground">{{ entry.started_at }} · {{ entry.machine || t('team.unassigned') }}</p>
          <p class="text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {{ entry.expand?.client?.name || t('team.unassigned') }} ·
            {{ entry.expand?.project?.name || t('team.unassigned') }} ·
            {{ entry.expand?.task?.title || t('team.unassigned') }}
          </p>
          <p class="text-sm">{{ identity(entry.member, members) }} · {{ identity(entry.department, departments) }}</p>
          <p class="text-sm">{{ t('team.entryMetrics', { minutes: (entry.work_ms / 60000).toFixed(1), cost: entry.cost.toFixed(4) }) }}</p>
          <NuxtLink v-if="entry.session_id" :to="entryDestination(entry, dateStart, dateEnd)" class="text-sm underline">{{ t('team.viewSession') }}</NuxtLink>
        </li>
      </ul>
      <nav class="flex items-center gap-3" :aria-label="t('team.pages')">
        <Button variant="outline" :disabled="loading || page <= 1" @click="page--">{{ t('team.previous') }}</Button>
        <span>{{ page }} / {{ Math.max(1, totalPages) }}</span>
        <Button variant="outline" :disabled="loading || page >= totalPages" @click="page++">{{ t('team.next') }}</Button>
      </nav>
    </template>
  </div>
</template>
