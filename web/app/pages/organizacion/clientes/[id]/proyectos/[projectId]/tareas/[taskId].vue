<script setup lang="ts">
import { ArrowLeft } from '@lucide/vue'
import TaskDetailSheet from '@/components/tasks/TaskDetailSheet.vue'
import TaskEditDialog from '@/components/tasks/TaskEditDialog.vue'
import { Button } from '@/components/ui/button'
import type { TaskStatus } from '@/lib/pocketbase-types'

const { t } = useI18n()
const route = useRoute()
const { canWrite } = useAuth()
const { projects, byId: projectById, ensureLoaded: ensureProjects } = useProjects()
const { byId: clientById, ensureLoaded: ensureClients } = useClients()
const { tasks } = useTasks()
const toast = useToast()
const { task, loading, error, sessions, sessionsLoading, sessionsError, sessionEntries, load, expandSession, changeStatus: updateStatus, dispose } = useTaskDetail()
const editOpen = ref(false)
const projectName = computed(() => projects.value.find(row => row.id === task.value?.project)?.name ?? '')
useHead({ title: computed(() => task.value?.title ?? t('tasks.title')) })
let version = 0
let ownerCurrent: () => boolean = () => false

async function loadPage() {
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
onBeforeUnmount(() => { version++; dispose() })
watch(task, () => { if (!task.value) editOpen.value = false }, { flush: 'sync' })

function backToProject() {
  return navigateTo(`/organizacion/clientes/${String(route.params.id)}/proyectos/${String(route.params.projectId)}`)
}
function taskAuthorized() { return !!task.value && ownerCurrent() }
function openEdit() {
  if (canWrite.value && taskAuthorized()) editOpen.value = true
}
async function changeStatus(status: TaskStatus) {
  if (!canWrite.value || !taskAuthorized()) return
  try { await updateStatus(status) }
  catch { toast.error(t('common.error')) }
}
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-6">
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
        :project-name="projectName"
        :sessions="sessions"
        :sessions-loading="sessionsLoading"
        :session-entries="sessionEntries"
        :can-write="canWrite"
        @edit="openEdit"
        @status-change="changeStatus"
        @expand-session="expandSession"
      >
        <template #back>
          <Button variant="ghost" size="icon" class="shrink-0" :aria-label="t('common.back')" :title="t('common.back')" @click="backToProject">
            <ArrowLeft aria-hidden="true" class="size-4" />
          </Button>
        </template>
      </TaskDetailSheet>
      <TaskEditDialog v-model:open="editOpen" :task="task" :can-write="canWrite" :is-authorized="taskAuthorized" @deleted="backToProject" />
    </template>
  </div>
</template>
