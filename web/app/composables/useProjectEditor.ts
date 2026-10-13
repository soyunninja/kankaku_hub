import { computed, reactive, ref, watch } from 'vue'
import type { ProjectRecord } from '@/lib/pocketbase-types'

/** Detail-scoped project actions; write responses and route/auth generations are fenced independently. */
export function useProjectEditor() {
  const { t } = useI18n()
  const { canWrite, user } = useAuth()
  const { $pb } = useNuxtApp()
  const route = useRoute()
  const { updateCommitted, setActiveCommitted, refresh } = useProjects()
  const { clients } = useClients()
  const toast = useToast()
  const dialogOpen = ref(false)
  const confirmationOpen = ref(false)
  const archiveTarget = ref<ProjectRecord | null>(null)
  const editing = ref<ProjectRecord | null>(null)
  const saving = ref(false)
  const archiving = ref(false)
  const form = reactive({ name: '', client: '', code: '', notes: '', active: true, repoPaths: [] as string[] })
  let generation = 0

  function routeMatches(project: ProjectRecord) {
    return String(route.params.projectId) === project.id && String(route.params.id) === project.client
  }

  function close(force = false) {
    if (!force && (saving.value || archiving.value)) return
    generation++
    dialogOpen.value = false
    confirmationOpen.value = false
    archiveTarget.value = null
    editing.value = null
    saving.value = false
    archiving.value = false
  }

  const selectedClientActive = computed(() => clients.value.find(client => client.id === form.client)?.active === true)

  watch(() => form.client, () => {
    if (form.active && !selectedClientActive.value) form.active = false
  }, { flush: 'sync' })
  watch(canWrite, allowed => { if (!allowed) close(true) }, { flush: 'sync' })
  watch(() => [user.value?.id, $pb.authStore.token, route.params.id, route.params.projectId], close.bind(null, true), { flush: 'sync' })

  function authScope() {
    return { ownerId: user.value?.id, token: $pb.authStore.token }
  }

  function isCurrentAuthScope(scope: ReturnType<typeof authScope>) {
    return canWrite.value && user.value?.id === scope.ownerId && $pb.authStore.token === scope.token
  }

  function openEdit(project: ProjectRecord) {
    if (!canWrite.value || !routeMatches(project)) return
    close(true)
    editing.value = project
    Object.assign(form, {
      name: project.name,
      client: project.client,
      code: project.code ?? '',
      notes: project.notes ?? '',
      active: project.active && clients.value.find(client => client.id === project.client)?.active === true,
      repoPaths: [...(project.repo_paths ?? [])],
    })
    dialogOpen.value = true
  }

  function addPath() { form.repoPaths.push('') }
  function removePath(index: number) { form.repoPaths.splice(index, 1) }

  async function onSubmit() {
    const project = editing.value
    if (!canWrite.value || !dialogOpen.value || !project || !routeMatches(project) || saving.value || archiving.value) return
    const version = generation
    const scope = authScope()
    const payload = {
      name: form.name,
      client: form.client,
      code: form.code,
      notes: form.notes,
      active: form.active,
      repo_paths: form.repoPaths.map(path => path.trim()).filter(Boolean),
    }
    saving.value = true
    try {
      if (payload.active) {
        const destination = await $pb.collection('clients').getOne<{ active?: boolean }>(payload.client).catch(() => null)
        if (!destination || destination.active !== true || payload.client !== form.client || !form.active || version !== generation || !isCurrentAuthScope(scope)) return
      }
      const saved = await updateCommitted(project.id, payload)
      if (version !== generation) return
      if (!isCurrentAuthScope(scope)) { close(true); return }
      const refreshed = await Promise.allSettled([refresh()])
      if (version !== generation) return
      if (!isCurrentAuthScope(scope)) { close(true); return }
      close(true)
      toast.success(t('common.saved'))
      if (refreshed.some(result => result.status === 'rejected')) toast.info(t('projects.archive.refreshWarning'))
      if (saved.client !== String(route.params.id)) await navigateTo(`/organizacion/clientes/${saved.client}/proyectos/${saved.id}`)
    }
    catch {
      if (version === generation) toast.error(t('common.error'))
    }
    finally {
      if (version === generation) saving.value = false
    }
  }

  function requestArchive(project: ProjectRecord) {
    if (!canWrite.value || !routeMatches(project) || saving.value || archiving.value) return
    if (project.active) {
      archiveTarget.value = project
      confirmationOpen.value = true
    }
    else void toggleArchive(project)
  }

  function cancelArchive() {
    if (archiving.value) return
    confirmationOpen.value = false
    archiveTarget.value = null
  }

  function onConfirmationOpenChange(open: boolean) {
    if (!open) cancelArchive()
  }

  async function confirmArchive() {
    const project = archiveTarget.value
    if (!canWrite.value || !project || !project.active || !routeMatches(project) || !confirmationOpen.value || saving.value || archiving.value) return
    const version = generation
    const scope = authScope()
    archiving.value = true
    try {
      await setActiveCommitted(project.id, false)
      if (version !== generation) return
      if (!isCurrentAuthScope(scope)) { close(true); return }
      const refreshed = await Promise.allSettled([refresh()])
      if (version !== generation) return
      if (!isCurrentAuthScope(scope)) { close(true); return }
      confirmationOpen.value = false
      archiveTarget.value = null
      if (refreshed.some(result => result.status === 'rejected')) toast.info(t('projects.archive.refreshWarning'))
    }
    catch {
      if (version === generation) toast.error(t('projects.archive.writeFailed'))
    }
    finally {
      if (version === generation) archiving.value = false
    }
  }

  async function toggleArchive(project: ProjectRecord) {
    if (!canWrite.value || !routeMatches(project) || project.active || saving.value || archiving.value) return
    const version = generation
    const scope = authScope()
    archiving.value = true
    try {
      const parent = await $pb.collection('clients').getOne<{ active?: boolean }>(project.client).catch(() => null)
      if (!parent || parent.active !== true || version !== generation || !isCurrentAuthScope(scope)) return
      await setActiveCommitted(project.id, true)
      if (version !== generation) return
      if (!isCurrentAuthScope(scope)) { close(true); return }
      const refreshed = await Promise.allSettled([refresh()])
      if (version !== generation) return
      if (!isCurrentAuthScope(scope)) { close(true); return }
      if (refreshed.some(result => result.status === 'rejected')) toast.info(t('projects.archive.refreshWarning'))
    }
    catch {
      if (version === generation) toast.error(t('common.error'))
    }
    finally {
      if (version === generation) archiving.value = false
    }
  }

  return { dialogOpen, confirmationOpen, archiveTarget, editing, form, saving, archiving, selectedClientActive, close, openEdit, addPath, removePath, onSubmit, requestArchive, cancelArchive, onConfirmationOpenChange, confirmArchive, toggleArchive }
}
