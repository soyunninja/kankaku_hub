<script setup lang="ts">
import { ArrowLeft, Loader2 } from '@lucide/vue'
import EntryDetailSheet from '@/components/entries/EntryDetailSheet.vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import type { TaskEntryRecord, WorkRecordRecord } from '@/lib/pocketbase-types'

const props = defineProps<{
  open: boolean
  session: { sessionId: string, title: string, entryCount: number, machine: string, firstActivity: string, lastActivity: string } | null
}>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const { t } = useI18n()
const { formatDateTime, formatDuration, formatCost } = useFormatters()
const { list, getOne, listWorkRecords } = useEntriesExplorer()
const { clients, ensureLoaded: ensureClients } = useClients()
const { projects, ensureLoaded: ensureProjects } = useProjects()
const { tasks, ensureLoaded: ensureTasks } = useTasks()

const entries = ref<TaskEntryRecord[]>([])
const entry = ref<TaskEntryRecord | null>(null)
const workRecords = ref<WorkRecordRecord[]>([])
const loading = ref(false)
const error = ref(false)
const entryLoading = ref(false)
const entryError = ref(false)
const detailClient = ref('')
const detailProject = ref('')
const detailTask = ref('')
const titleEl = ref<HTMLElement | null>(null)
const detailSheet = ref<InstanceType<typeof EntryDetailSheet> | null>(null)
let request = 0

function focusTitle() {
  nextTick(() => {
    if (!props.open) return
    if (entry.value) detailSheet.value?.focusTitle()
    else titleEl.value?.focus()
  })
}
function onAutoFocus(event: Event) {
  event.preventDefault()
  focusTitle()
}
function onOpenChange(value: boolean) {
  emit('update:open', value)
}

async function selectEntry(id: string) {
  const current = ++request
  entry.value = null
  entryLoading.value = true
  entryError.value = false
  focusTitle()
  try {
    const loaded = await getOne(id)
    const records = await listWorkRecords(id) as unknown as WorkRecordRecord[]
    if (current !== request || !props.open) return
    entry.value = loaded
    workRecords.value = records
    detailClient.value = loaded.client
    detailProject.value = loaded.project
    detailTask.value = loaded.task
    focusTitle()
  }
  catch {
    if (current === request && props.open) entryError.value = true
  }
  finally {
    if (current === request) entryLoading.value = false
  }
}

async function loadSession() {
  const sessionId = props.session?.sessionId
  const current = ++request
  entries.value = []
  entry.value = null
  workRecords.value = []
  loading.value = true
  error.value = false
  entryError.value = false
  if (!props.open || !sessionId) { loading.value = false; return }
  focusTitle()
  try {
    await Promise.all([ensureClients(), ensureProjects(), ensureTasks()])
    const rows: TaskEntryRecord[] = []
    let page = 1
    for (;;) {
      const result = await list({ page, perPage: 200, sort: 'started_at', filters: { session_id: sessionId } })
      if (current !== request || !props.open) return
      rows.push(...result.items)
      if (page >= result.totalPages) break
      page++
    }
    entries.value = rows
    loading.value = false
    if (rows.length === 1) await selectEntry(rows[0]!.id)
    else focusTitle()
  }
  catch {
    if (current === request && props.open) error.value = true
  }
  finally {
    if (current === request) loading.value = false
  }
}
watch(() => [props.open, props.session?.sessionId] as const, () => {
  if (props.open && props.session) loadSession()
  else {
    request++
    entry.value = null
    entries.value = []
  }
}, { immediate: true })
function back() {
  request++
  entry.value = null
  entryLoading.value = false
  entryError.value = false
  focusTitle()
}
</script>

<template>
  <Sheet :open="open" @update:open="onOpenChange">
    <SheetContent side="right" class="flex w-full flex-col sm:w-[36rem] sm:max-w-xl" @open-auto-focus="onAutoFocus">
      <SheetTitle class="sr-only">{{ session?.title || t('sessionsQueue.nameFallback') }}</SheetTitle>
      <template v-if="entry">
        <Button v-if="entries.length > 1" variant="ghost" class="mx-6 mt-6 self-start" @click="back">
          <ArrowLeft class="size-4" /> {{ t('common.back') }}
        </Button>
        <EntryDetailSheet
          ref="detailSheet"
          v-model:client="detailClient"
          v-model:project="detailProject"
          v-model:task="detailTask"
          :entry="entry"
          :work-records="workRecords"
          :clients="clients"
          :projects="projects"
          :tasks="tasks"
          :can-write="false"
        />
      </template>
      <div v-else class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pt-8 pb-6">
        <h2 ref="titleEl" tabindex="-1" class="text-base font-semibold outline-none">
          {{ session?.title || t('sessionsQueue.nameFallback') }}
        </h2>
        <p v-if="loading || entryLoading" role="status" class="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 class="size-4 animate-spin" /> {{ t('common.loading') }}
        </p>
        <template v-else-if="error || entryError">
          <p role="alert">{{ t('sessionsQueue.detail.loadError') }}</p>
          <Button variant="outline" class="self-start" @click="entryError && entries.length === 1 ? selectEntry(entries[0]!.id) : loadSession()">
            {{ t('sessionsQueue.detail.retry') }}
          </Button>
        </template>
        <template v-else-if="entries.length > 0">
          <p class="text-sm text-muted-foreground">{{ t('sessionsQueue.entries') }}: {{ entries.length }} · {{ session?.machine || '—' }}</p>
          <p class="text-sm text-muted-foreground">{{ t('sessionsQueue.firstActivity') }}: {{ formatDateTime(session?.firstActivity || '') }}</p>
          <p class="text-sm text-muted-foreground">{{ t('sessionsQueue.lastActivity') }}: {{ formatDateTime(session?.lastActivity || '') }}</p>
          <h3 class="text-sm font-semibold">{{ t('sessionsQueue.detail.selectEntry') }}</h3>
          <div class="flex flex-col gap-2">
            <button
              v-for="(item, index) in entries" :key="item.id" type="button"
              class="rounded-md border p-3 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-focus-indicator"
              @click="selectEntry(item.id)"
            >
              <span class="block font-medium">{{ t('sessionsQueue.detail.entryNumber', { number: index + 1 }) }} · {{ formatDateTime(item.started_at) }}</span>
              <span class="block truncate">{{ item.prompt || t('tasks.detail.sessions.entryPromptHidden') }}</span>
              <span class="text-muted-foreground">{{ formatDuration(item.work_ms) }} · {{ formatCost(item.cost) }}</span>
            </button>
          </div>
        </template>
        <p v-else>{{ t('sessionsQueue.detail.empty') }}</p>
      </div>
    </SheetContent>
  </Sheet>
</template>
