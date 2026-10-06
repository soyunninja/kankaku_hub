<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import TaskDetailSheet from '@/components/tasks/TaskDetailSheet.vue'
import TaskEditDialog from '@/components/tasks/TaskEditDialog.vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import EntryDetailSheet from '@/components/entries/EntryDetailSheet.vue'
import { deriveEntryTitle } from '@/lib/entry-detail'
import type { ClientRecord, ProjectRecord, TaskEntryRecord, TaskRecord, TaskStatus, WorkRecordRecord } from '@/lib/pocketbase-types'

const { t } = useI18n()
const route = useRoute()
const { canWrite } = useAuth()
const { projects, byId: projectById, ensureLoaded: ensureProjects } = useProjects()
const { clients, byId: clientById, ensureLoaded: ensureClients } = useClients()
const { tasks, ensureLoaded: ensureTasks } = useTasks()
const { getOne, listWorkRecords, updateAssignment } = useEntriesExplorer()
const toast = useToast()
const { summary, summaryLoading, summaryUnavailable, summaryError, sessionCountUnavailable, task, loading, error, sessions, sessionsLoading, sessionsError, sessionEntries, load, expandSession, refreshAfterAssignment, changeStatus: updateStatus, dispose } = useTaskDetail()
const editOpen = ref(false)
const projectName = computed(() => projects.value.find(row => row.id === task.value?.project)?.name ?? '')
useHead({ title: computed(() => task.value?.title ?? t('tasks.title')) })
let version = 0
let ownerCurrent: () => boolean = () => false
const detailContext = computed(() => {
  if (!taskAuthorized()) return undefined
  const project = projectById(task.value!.project)
  const client = project && clientById(project.client)
  if (!project || !client) return undefined
  return {
    client: { name: client.name, to: `/organizacion/clientes/${client.id}` },
    project: { name: project.name, to: `/organizacion/clientes/${client.id}/proyectos/${project.id}` },
  }
})

async function loadPage() {
  closeDetail()
  const current = ++version
  const clientId = String(route.params.id)
  const projectId = String(route.params.projectId)
  const taskId = String(route.params.taskId)
  let validated = false
  let published = false
  const isCurrent = () => current === version
    && clientId === String(route.params.id) && projectId === String(route.params.projectId) && taskId === String(route.params.taskId)
    && (!validated || (!!clientById(clientId) && projectById(projectId)?.client === clientId
      && (!published || tasks.value.find(row => row.id === taskId)?.project === projectId)))
  ownerCurrent = isCurrent
  editOpen.value = false
  await load(taskId, {
    isCurrent,
    validate: async record => {
      // Resolve the actual required chain before task/session/resume publication.
      await Promise.all([ensureProjects(), ensureClients()])
      if (!isCurrent() || record.project !== projectId || !clientById(clientId)
        || projectById(projectId)?.client !== clientId) return false
      validated = true
      return true
    },
  })
  published = true
}
onMounted(loadPage)
watch(() => [route.params.id, route.params.projectId, route.params.taskId], loadPage, { flush: 'sync' })
onBeforeUnmount(() => { closeDetail(); version++; dispose() })
watch(task, () => { if (!task.value) editOpen.value = false }, { flush: 'sync' })

function backToProject() {
  return navigateTo(`/organizacion/clientes/${String(route.params.id)}/proyectos/${String(route.params.projectId)}`)
}
function taskAuthorized() { return !!task.value && ownerCurrent() }
function openEdit() {
  if (canWrite.value && taskAuthorized() && !detailOpen.value) editOpen.value = true
}
async function changeStatus(status: TaskStatus) {
  if (!canWrite.value || !taskAuthorized()) return
  try { await updateStatus(status) }
  catch { toast.error(t('common.error')) }
}
// The canonical task page owns the same wrapper as Registros; the shared
// body retains full stored prompts, assignment compatibility and raw detail.
const pageRoot = ref<HTMLElement | null>(null)
const detailOpen = ref(false)
const detail = ref<TaskEntryRecord | null>(null)
const detailTarget = ref<TaskEntryRecord | null>(null)
const detailWorkRecords = ref<WorkRecordRecord[]>([])
const detailClient = ref('')
const detailProject = ref('')
const detailTask = ref('')
const detailLoading = ref(false)
const detailError = ref(false)
const detailSaving = ref(false)
const detailTitle = ref<HTMLElement | null>(null)
const entryClients = ref<ClientRecord[]>([])
const entryProjects = ref<ProjectRecord[]>([])
const entryTasks = ref<TaskRecord[]>([])
let detailGeneration = 0
let saveEpoch = 0
let detailOrigin: HTMLElement | null = null
const detailHeading = computed(() => {
  if (!detail.value) return t('entries.detail.panelTitle')
  const title = deriveEntryTitle(detail.value)
  return title.kind === 'fallback' ? t('entries.detail.fallbackTitle', { id: title.shortId }) : title.text
})
function wipeDetail() {
  detailGeneration++
  saveEpoch++
  detail.value = null
  detailTarget.value = null
  detailWorkRecords.value = []
  detailClient.value = detailProject.value = detailTask.value = ''
  entryClients.value = []
  entryProjects.value = []
  entryTasks.value = []
  detailLoading.value = detailError.value = detailSaving.value = false
}
function closeDetail() {
  detailOpen.value = false
  wipeDetail()
}
watch(detailOpen, open => { if (!open) wipeDetail() }, { flush: 'sync' })
watch(() => taskAuthorized(), valid => { if (!valid) closeDetail() }, { flush: 'sync' })
watch(canWrite, writable => { if (!writable) { saveEpoch++; detailSaving.value = false } }, { flush: 'sync' })

async function openDetail(entry: TaskEntryRecord, origin?: HTMLElement) {
  if (!taskAuthorized() || editOpen.value) return
  if (origin) detailOrigin = origin
  wipeDetail()
  const generation = detailGeneration
  const routeVersion = version
  const taskId = task.value!.id
  detailTarget.value = entry
  detailOpen.value = true
  detailLoading.value = true
  const valid = () => generation === detailGeneration && routeVersion === version && detailOpen.value
    && detailTarget.value?.id === entry.id && taskAuthorized() && task.value?.id === taskId
  try {
    const record = await getOne(entry.id)
    if (!valid()) return
    if (record.id !== entry.id) throw new Error('Entry identity mismatch')
    const [records] = await Promise.all([listWorkRecords(entry.id), ensureTasks(), ensureProjects(), ensureClients()])
    if (!valid()) return
    entryClients.value = [...clients.value]
    entryProjects.value = [...projects.value]
    entryTasks.value = [...tasks.value]
    detailClient.value = record.client
    detailProject.value = record.project
    detailTask.value = record.task
    detail.value = record
    detailWorkRecords.value = records as unknown as WorkRecordRecord[]
  }
  catch { if (valid()) detailError.value = true }
  finally { if (valid()) detailLoading.value = false }
}
async function saveAssignment() {
  if (!canWrite.value || !taskAuthorized() || !detailOpen.value || !detail.value || detailSaving.value) return
  const entry = detail.value
  const generation = detailGeneration
  const epoch = ++saveEpoch
  const routeVersion = version
  const taskId = task.value!.id
  const valid = () => epoch === saveEpoch && generation === detailGeneration && routeVersion === version
    && detailOpen.value && detail.value?.id === entry.id && canWrite.value && taskAuthorized() && task.value?.id === taskId
  detailSaving.value = true
  try {
    if (!valid()) return
    await updateAssignment(entry.id, { client: detailClient.value, project: detailProject.value, task: detailTask.value })
    if (!valid()) return
    const updated = await getOne(entry.id)
    if (!valid()) return
    if (updated.id !== entry.id) throw new Error('Entry identity mismatch')
    detail.value = updated
    detailClient.value = updated.client
    detailProject.value = updated.project
    detailTask.value = updated.task
    await refreshAfterAssignment([...new Set([entry.session_id, updated.session_id])], valid)
    if (valid()) {
      entryTasks.value = [...tasks.value]
      toast.success(t('common.saved'))
    }
  }
  catch { if (valid()) toast.error(t('common.error')) }
  finally { if (epoch === saveEpoch) detailSaving.value = false }
}
function onDetailOpenAutoFocus(event: Event) {
  event.preventDefault()
  nextTick(() => { if (detailOpen.value) detailTitle.value?.focus() })
}
function onDetailCloseAutoFocus(event: Event) {
  event.preventDefault()
  const origin = detailOrigin?.isConnected && !detailOrigin.matches(':disabled') && detailOrigin.getClientRects().length
    ? detailOrigin : pageRoot.value?.querySelector<HTMLElement>('h1, button')
  origin?.focus({ preventScroll: true })
}
</script>

<template>
  <div ref="pageRoot" class="flex w-full min-w-0 flex-col gap-6">
    <Button v-if="loading || error || !task" variant="ghost" size="icon" class="self-start" :aria-label="t('common.back')" :title="t('common.back')" @click="backToProject">
      <ArrowLeft aria-hidden="true" class="size-4" />{{ t('common.back') }}
    </Button>
    <p v-if="loading" role="status">{{ t('common.loading') }}</p>
    <p v-else-if="error" role="alert">{{ t('common.error') }}</p>
    <p v-else-if="!task" role="status">{{ t('tasks.detail.notFound') }}</p>
    <template v-else>
      <p v-if="sessionsError" role="alert">{{ t('common.error') }}</p>
      <TaskDetailSheet
        page-mode
        :task="task"
        :summary="summary"
        :summary-loading="summaryLoading"
        :summary-unavailable="summaryUnavailable"
        :summary-error="summaryError"
        :session-count-unavailable="sessionCountUnavailable"
        :context="detailContext"
        :project-name="projectName"
        :sessions="sessions"
        :sessions-loading="sessionsLoading"
        :session-entries="sessionEntries"
        :can-write="canWrite"
        @edit="openEdit"
        @status-change="changeStatus"
        @expand-session="expandSession"
        @open-entry="openDetail"
      >
        <template #back>
          <Button variant="ghost" size="icon" class="shrink-0" :aria-label="t('common.back')" :title="t('common.back')" @click="backToProject">
            <ArrowLeft aria-hidden="true" class="size-4" />
          </Button>
        </template>
      </TaskDetailSheet>
      <TaskEditDialog v-model:open="editOpen" :task="task" :can-write="canWrite" :is-authorized="taskAuthorized" @deleted="backToProject" />
    </template>
    <Sheet v-model:open="detailOpen">
      <SheetContent side="right" data-testid="task-detail-entry-drawer" class="flex w-full flex-col sm:w-[36rem] sm:max-w-xl" @open-auto-focus="onDetailOpenAutoFocus" @close-auto-focus="onDetailCloseAutoFocus">
        <div class="px-6 pt-8">
          <SheetTitle as-child>
            <h2 ref="detailTitle" tabindex="-1" class="text-base leading-snug font-semibold break-words outline-none">{{ detailHeading }}</h2>
          </SheetTitle>
          <SheetDescription class="mt-2">{{ t('entries.detail.panelDescription') }}</SheetDescription>
        </div>
        <p v-if="detailLoading" role="status" class="px-6 text-sm text-muted-foreground">{{ t('entries.detail.loading') }}</p>
        <div v-else-if="detailError" class="space-y-3 px-6">
          <p role="alert" class="text-sm text-destructive">{{ t('entries.detail.loadError') }}</p>
          <Button variant="outline" @click="detailTarget && openDetail(detailTarget)">{{ t('entries.loadRetry') }}</Button>
          <Button variant="ghost" @click="detailOpen = false">{{ t('common.close') }}</Button>
        </div>
        <EntryDetailSheet
          v-if="detail"
          v-model:client="detailClient"
          v-model:project="detailProject"
          v-model:task="detailTask"
          :entry="detail"
          :work-records="detailWorkRecords"
          :clients="entryClients"
          :projects="entryProjects"
          :tasks="entryTasks"
          :can-write="canWrite"
          header-title-provided
          @save="saveAssignment"
        />
      </SheetContent>
    </Sheet>
  </div>
</template>
