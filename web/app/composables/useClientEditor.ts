import { reactive, ref, watch } from 'vue'
import { isValidEmail, isValidWebsiteUrl, mapPocketBaseFieldErrors, normalizePhone, normalizeWebsiteUrl } from '@/lib/client-contact'
import type { ClientRecord } from '@/lib/pocketbase-types'

/** Shared catalog/detail editor. A generation fences responses after dismissal or route changes. */
export function useClientEditor() {
  const { t } = useI18n()
  const { canWrite, user } = useAuth()
  const { $pb } = useNuxtApp()
  const { create, update, setActiveCommitted, refresh: refreshClients, patch: patchClient, refreshFavicon } = useClients()
  const { refresh: refreshProjects } = useProjects()
  const toast = useToast()
  const dialogOpen = ref(false)
  const confirmationOpen = ref(false)
  const archiveTarget = ref<ClientRecord | null>(null)
  const editing = ref<ClientRecord | null>(null)
  const saving = ref(false)
  const archiving = ref(false)
  const form = reactive({ name: '', code: '', active: true, website: '', contact_email: '', contact_phone: '', notes: '' })
  const fieldErrors = reactive<Record<string, string>>({})
  let generation = 0

  function resetFieldErrors() {
    for (const key of Object.keys(fieldErrors)) Reflect.deleteProperty(fieldErrors, key)
  }

  function close() {
    generation++
    dialogOpen.value = false
    confirmationOpen.value = false
    archiveTarget.value = null
    editing.value = null
    saving.value = false
    archiving.value = false
    resetFieldErrors()
  }

  watch(canWrite, allowed => { if (!allowed) close() }, { flush: 'sync' })
  watch(() => user.value?.id, (id, previousId) => { if (id !== previousId) close() }, { flush: 'sync' })

  function authScope() {
    return { ownerId: user.value?.id, token: $pb.authStore.token }
  }

  function isCurrentAuthScope(scope: ReturnType<typeof authScope>) {
    return canWrite.value && user.value?.id === scope.ownerId && $pb.authStore.token === scope.token
  }

  function openCreate() {
    if (!canWrite.value) return
    close()
    Object.assign(form, { name: '', code: '', active: true, website: '', contact_email: '', contact_phone: '', notes: '' })
    dialogOpen.value = true
  }

  function openEdit(client: ClientRecord) {
    if (!canWrite.value || client.unassigned) return
    close()
    editing.value = client
    // Older schema versions omit contact fields entirely.
    Object.assign(form, { name: client.name, code: client.code, active: client.active,
      website: client.website ?? '', contact_email: client.contact_email ?? '',
      contact_phone: client.contact_phone ?? '', notes: client.notes ?? '' })
    dialogOpen.value = true
  }

  function onWebsiteBlur() {
    form.website = normalizeWebsiteUrl(form.website)
  }

  async function onSubmit() {
    if (!canWrite.value || editing.value?.unassigned || !dialogOpen.value || saving.value) return
    resetFieldErrors()
    form.contact_phone = normalizePhone(form.contact_phone)
    if (!isValidWebsiteUrl(form.website)) fieldErrors.website = t('clients.invalidWebsite')
    if (!isValidEmail(form.contact_email)) fieldErrors.contact_email = t('clients.invalidEmail')
    if (Object.keys(fieldErrors).length > 0) return
    const version = generation
    const client = editing.value
    const payload = { ...form }
    const oldWebsite = client?.website ?? ''
    saving.value = true
    try {
      const saved = client
        ? await update(client.id, payload)
        : await create({ ...payload, unassigned: false })
      if (version !== generation) return
      // Fire-and-forget, including clearing a website; unavailable hooks are harmless.
      if (canWrite.value && !saved.unassigned && payload.website !== oldWebsite) {
        refreshFavicon(saved.id).catch(() => {})
      }
      // PocketBase silently drops unknown fields on older schemas.
      const contactFieldsDropped = (['website', 'contact_email', 'contact_phone', 'notes'] as const)
        .some(field => payload[field] !== '' && saved[field] === undefined)
      if (contactFieldsDropped) toast.error(t('clients.migrationPending'))
      else toast.success(t('common.saved'))
      close()
    }
    catch (err) {
      if (version !== generation) return
      const mapped = mapPocketBaseFieldErrors(err)
      if (Object.keys(mapped).length > 0) Object.assign(fieldErrors, mapped)
      else toast.error(t('common.error'))
    }
    finally {
      if (version === generation) saving.value = false
    }
  }

  function requestArchive(client: ClientRecord) {
    if (!canWrite.value || client.unassigned || saving.value || archiving.value) return
    if (client.active) {
      archiveTarget.value = client
      confirmationOpen.value = true
      return
    }
    void toggleArchive(client)
  }

  function cancelArchive() {
    if (archiving.value) return
    confirmationOpen.value = false
    archiveTarget.value = null
  }

  function onConfirmationOpenChange(open: boolean) {
    if (open) return
    cancelArchive()
  }

  async function confirmArchive() {
    const client = archiveTarget.value
    if (!canWrite.value || !client || client.unassigned || !client.active || !confirmationOpen.value || archiving.value) return
    const version = generation
    const scope = authScope()
    archiving.value = true
    try {
      const saved = await setActiveCommitted(client.id, false)
      // The committed response is authoritative even if either catalog read fails.
      const refreshResults = await Promise.allSettled([refreshClients(), refreshProjects()])
      // Cache reconciliation is fenced by auth scope, not route generation.
      if (isCurrentAuthScope(scope)) patchClient(saved)
      if (version !== generation) return
      if (!isCurrentAuthScope(scope)) {
        // A same-owner auth refresh must not leave a retryable confirmation after commit.
        if (canWrite.value && user.value?.id === scope.ownerId) {
          confirmationOpen.value = false
          archiveTarget.value = null
        }
        return
      }
      confirmationOpen.value = false
      archiveTarget.value = null
      if (refreshResults.some(result => result.status === 'rejected')) toast.info(t('clients.archive.refreshWarning'))
    }
    catch {
      if (version === generation) toast.error(t('clients.archive.writeFailed'))
    }
    finally {
      if (version === generation) archiving.value = false
    }
  }

  async function toggleArchive(client: ClientRecord) {
    if (!canWrite.value || client.unassigned || client.active || archiving.value || saving.value) return
    const version = generation
    const scope = authScope()
    archiving.value = true
    try {
      const saved = await setActiveCommitted(client.id, true)
      await Promise.allSettled([refreshClients(), refreshProjects()])
      if (isCurrentAuthScope(scope)) patchClient(saved)
    }
    catch {
      if (version === generation) toast.error(t('common.error'))
    }
    finally {
      if (version === generation) archiving.value = false
    }
  }

  return { dialogOpen, confirmationOpen, archiveTarget, editing, form, fieldErrors, saving, archiving, close, openCreate, openEdit, onWebsiteBlur, onSubmit, requestArchive, cancelArchive, onConfirmationOpenChange, confirmArchive, toggleArchive }
}
