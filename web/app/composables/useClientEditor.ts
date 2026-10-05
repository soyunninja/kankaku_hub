import { reactive, ref } from 'vue'
import { isValidEmail, isValidWebsiteUrl, mapPocketBaseFieldErrors, normalizePhone, normalizeWebsiteUrl } from '@/lib/client-contact'
import type { ClientRecord } from '@/lib/pocketbase-types'

/** Shared catalog/detail editor. A generation fences responses after dismissal or route changes. */
export function useClientEditor() {
  const { t } = useI18n()
  const { canWrite } = useAuth()
  const { create, update, refreshFavicon } = useClients()
  const toast = useToast()
  const dialogOpen = ref(false)
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
    editing.value = null
    saving.value = false
    archiving.value = false
    resetFieldErrors()
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

  async function toggleArchive(client: ClientRecord) {
    if (!canWrite.value || client.unassigned || archiving.value) return
    const version = generation
    archiving.value = true
    try {
      await update(client.id, { active: !client.active })
    }
    catch {
      if (version === generation) toast.error(t('common.error'))
    }
    finally {
      if (version === generation) archiving.value = false
    }
  }

  return { dialogOpen, editing, form, fieldErrors, saving, archiving, close, openCreate, openEdit, onWebsiteBlur, onSubmit, toggleArchive }
}
