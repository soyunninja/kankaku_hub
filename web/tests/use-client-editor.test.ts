import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { ClientRecord } from '../app/lib/pocketbase-types'

const client = { id: 'client-a', name: 'Client A', code: 'a', active: true, unassigned: false, website: 'https://example.com', contact_email: 'a@example.com', contact_phone: '+123', notes: 'Notes' } as ClientRecord

async function setup() {
  const canWrite = ref(true)
  const user = ref({ id: 'owner-a', role: 'owner' })
  const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
  const create = vi.fn().mockImplementation(async payload => ({ ...payload, id: 'new' }))
  const update = vi.fn().mockImplementation(async (id, payload) => ({ ...client, ...payload, id }))
  const archive = vi.fn().mockImplementation(async (id, active) => ({ ...client, id, active }))
  const patch = vi.fn()
  const refreshClients = vi.fn().mockResolvedValue(undefined)
  const refreshProjects = vi.fn().mockResolvedValue(undefined)
  const refreshFavicon = vi.fn().mockResolvedValue({ ok: true })
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
  vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
  vi.stubGlobal('useAuth', () => ({ canWrite, user }))
  vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore } }))
  vi.stubGlobal('useClients', () => ({ create, update, setActiveCommitted: archive, refresh: refreshClients, patch, refreshFavicon }))
  vi.stubGlobal('useProjects', () => ({ refresh: refreshProjects }))
  vi.stubGlobal('useToast', () => toast)
  const { useClientEditor } = await import('../app/composables/useClientEditor')
  return { editor: useClientEditor(), canWrite, user, authStore, create, update, archive, refreshClients, refreshProjects, patch, refreshFavicon, toast }
}
afterEach(() => vi.unstubAllGlobals())

describe('shared client editor', () => {
  it('prefills every field and tolerates older schema omissions', async () => {
    const { editor } = await setup()
    editor.openEdit(client)
    expect(editor.form).toEqual({ name: client.name, code: client.code, active: client.active, website: client.website, contact_email: client.contact_email, contact_phone: client.contact_phone, notes: client.notes })
    editor.openEdit({ ...client, website: undefined, contact_email: undefined, contact_phone: undefined, notes: undefined })
    expect(editor.form).toMatchObject({ website: '', contact_email: '', contact_phone: '', notes: '' })
  })

  it('creates with explicit active and unassigned flags and normalized contact values', async () => {
    const { editor, create, refreshFavicon, toast } = await setup()
    editor.openCreate()
    Object.assign(editor.form, { name: 'New', code: 'new', website: 'example.com', contact_phone: ' +34 123 456 ' })
    editor.onWebsiteBlur()
    await editor.onSubmit()
    expect(create).toHaveBeenCalledWith({ name: 'New', code: 'new', active: true, unassigned: false, website: 'https://example.com', contact_email: '', contact_phone: '+34 123 456', notes: '' })
    expect(refreshFavicon).toHaveBeenCalledWith('new')
    expect(toast.success).toHaveBeenCalledWith('common.saved')
    expect(editor.dialogOpen.value).toBe(false)
  })

  it('validates website/email before writing and clears errors on reopening', async () => {
    const { editor, update } = await setup()
    editor.openEdit(client)
    editor.form.website = 'javascript:alert(1)'
    editor.form.contact_email = 'bad'
    await editor.onSubmit()
    expect(editor.fieldErrors).toEqual({ website: 'clients.invalidWebsite', contact_email: 'clients.invalidEmail' })
    expect(update).not.toHaveBeenCalled()
    editor.openEdit(client)
    expect(editor.fieldErrors).toEqual({})
  })

  it.each(['https://example.com', 'https://changed.example', ''])('updates fields and refreshes favicon only when website changed: %s', async website => {
    const { editor, update, refreshFavicon } = await setup()
    editor.openEdit(client)
    editor.form.website = website
    await editor.onSubmit()
    expect(update).toHaveBeenCalledWith(client.id, { name: client.name, code: client.code, active: true, website, contact_email: client.contact_email, contact_phone: client.contact_phone, notes: client.notes })
    expect(refreshFavicon).toHaveBeenCalledTimes(website === client.website ? 0 : 1)
  })

  it('warns about dropped fields and ignores unavailable favicon hooks', async () => {
    const { editor, update, refreshFavicon, toast } = await setup()
    editor.openEdit(client)
    editor.form.website = 'https://new.example'
    update.mockResolvedValueOnce({ ...client, notes: undefined })
    refreshFavicon.mockRejectedValueOnce(new Error('missing hook'))
    await editor.onSubmit()
    expect(toast.error).toHaveBeenCalledWith('clients.migrationPending')
    expect(editor.dialogOpen.value).toBe(false)
  })

  it('maps PocketBase contact errors and reports generic errors without closing', async () => {
    const { editor, update, toast } = await setup()
    editor.openEdit(client)
    update.mockRejectedValueOnce({ data: { data: { website: { message: 'Invalid site' } } } })
    await editor.onSubmit()
    expect(editor.fieldErrors.website).toBe('Invalid site')
    expect(editor.dialogOpen.value).toBe(true)
    update.mockRejectedValueOnce(new Error('denied'))
    await editor.onSubmit()
    expect(toast.error).toHaveBeenCalledWith('common.error')
    expect(editor.saving.value).toBe(false)
  })

  it('guards viewers and protected clients both when opening and when submitting', async () => {
    const { editor, canWrite, update, create, refreshFavicon } = await setup()
    canWrite.value = false
    editor.openCreate()
    editor.openEdit(client)
    expect(editor.dialogOpen.value).toBe(false)
    await editor.toggleArchive(client)
    canWrite.value = true
    editor.openEdit({ ...client, unassigned: true })
    expect(editor.dialogOpen.value).toBe(false)
    await editor.toggleArchive({ ...client, unassigned: true })
    editor.openEdit(client)
    canWrite.value = false
    await editor.onSubmit()
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(refreshFavicon).not.toHaveBeenCalled()
  })

  it('requires confirmation to deactivate, and cancel performs no write', async () => {
    const { editor, archive } = await setup()
    editor.requestArchive(client)
    expect(editor.confirmationOpen.value).toBe(true)
    editor.cancelArchive()
    expect(editor.confirmationOpen.value).toBe(false)
    expect(archive).not.toHaveBeenCalled()
  })

  it('closes after a committed write and distinguishes catalog refresh failure from write failure', async () => {
    const { editor, archive, refreshProjects, toast } = await setup()
    refreshProjects.mockRejectedValueOnce(new Error('read failed'))
    editor.requestArchive(client)
    await editor.confirmArchive()
    expect(archive).toHaveBeenCalledWith(client.id, false)
    expect(refreshProjects).toHaveBeenCalledOnce()
    expect(editor.confirmationOpen.value).toBe(false)
    expect(toast.info).toHaveBeenCalledWith('clients.archive.refreshWarning')
    expect(toast.error).not.toHaveBeenCalled()

    editor.requestArchive(client)
    archive.mockRejectedValueOnce(new Error('write failed'))
    await editor.confirmArchive()
    expect(editor.confirmationOpen.value).toBe(true)
    expect(toast.error).toHaveBeenCalledWith('clients.archive.writeFailed')
    await editor.confirmArchive()
    expect(editor.confirmationOpen.value).toBe(false)
  })

  it('fences a pending confirmation after route close or owner scope loss', async () => {
    const { editor, archive, canWrite, toast } = await setup()
    let reject!: (error: Error) => void
    archive.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    editor.requestArchive(client)
    const pending = editor.confirmArchive()
    editor.close()
    editor.requestArchive({ ...client, id: 'client-b' })
    reject(new Error('stale write error'))
    await pending
    expect(editor.archiveTarget.value?.id).toBe('client-b')
    expect(editor.confirmationOpen.value).toBe(true)
    expect(toast.error).not.toHaveBeenCalled()

    canWrite.value = false
    expect(editor.confirmationOpen.value).toBe(false)
    expect(editor.archiveTarget.value).toBe(null)
  })

  it('blocks duplicate confirmation and dismissal while the write is pending', async () => {
    const { editor, archive } = await setup()
    let resolve!: (value: ClientRecord) => void
    archive.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    editor.requestArchive(client)
    const pending = editor.confirmArchive()
    await editor.confirmArchive()
    editor.onConfirmationOpenChange(false)
    expect(archive).toHaveBeenCalledTimes(1)
    expect(editor.confirmationOpen.value).toBe(true)
    resolve({ ...client, active: false })
    await pending
    expect(editor.confirmationOpen.value).toBe(false)
  })

  it('reconciles committed deactivation after route invalidation and a lagging catalog refresh', async () => {
    const { editor, archive, refreshClients, patch } = await setup()
    let finishRefresh!: () => void
    refreshClients.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
    const saved = { ...client, active: false }
    archive.mockResolvedValueOnce(saved)
    editor.requestArchive(client)
    const pending = editor.confirmArchive()
    await vi.waitFor(() => expect(refreshClients).toHaveBeenCalledOnce())
    editor.close()
    finishRefresh()
    await pending
    expect(patch).toHaveBeenLastCalledWith(saved)
    expect(editor.confirmationOpen.value).toBe(false)
    await editor.confirmArchive()
    expect(archive).toHaveBeenCalledTimes(1)
  })

  it('reconciles committed reactivation after route invalidation and blocks duplicate/retry writes', async () => {
    const { editor, archive, refreshClients, patch } = await setup()
    let finishRefresh!: () => void
    refreshClients.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
    const archived = { ...client, active: false }
    const saved = { ...client, active: true }
    archive.mockResolvedValueOnce(saved)
    const pending = editor.toggleArchive(archived)
    await vi.waitFor(() => expect(refreshClients).toHaveBeenCalledOnce())
    await editor.toggleArchive(archived)
    editor.close()
    finishRefresh()
    await pending
    expect(archive).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenLastCalledWith(saved)
  })

  it('does not reconcile a committed record after switching owners', async () => {
    const { editor, archive, refreshClients, patch, user } = await setup()
    let finishRefresh!: () => void
    refreshClients.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
    archive.mockResolvedValueOnce({ ...client, active: false })
    editor.requestArchive(client)
    const pending = editor.confirmArchive()
    await vi.waitFor(() => expect(refreshClients).toHaveBeenCalledOnce())
    user.value = { id: 'owner-b', role: 'owner' }
    finishRefresh()
    await pending
    expect(patch).not.toHaveBeenCalled()
    expect(editor.confirmationOpen.value).toBe(false)
  })

  it('does not patch across an auth-token change and closes a committed confirmation without retry', async () => {
    const { editor, archive, refreshClients, patch, authStore } = await setup()
    let finishRefresh!: () => void
    refreshClients.mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
    archive.mockResolvedValueOnce({ ...client, active: false })
    editor.requestArchive(client)
    const pending = editor.confirmArchive()
    await vi.waitFor(() => expect(refreshClients).toHaveBeenCalledOnce())
    authStore.token = 'token-refreshed'
    finishRefresh()
    await pending
    expect(patch).not.toHaveBeenCalled()
    expect(editor.confirmationOpen.value).toBe(false)
    await editor.confirmArchive()
    expect(archive).toHaveBeenCalledTimes(1)
  })

  it.each([false, true])('fences stale save success/error from a new route or editor: rejected=%s', async rejected => {
    const { editor, update, refreshFavicon, toast } = await setup()
    let settle!: (value: any) => void
    update.mockImplementationOnce(() => new Promise((resolve, reject) => { settle = rejected ? reject : resolve }))
    editor.openEdit(client)
    editor.form.website = 'https://changed.example'
    const pending = editor.onSubmit()
    await editor.onSubmit()
    expect(update).toHaveBeenCalledTimes(1)
    editor.close()
    editor.openEdit({ ...client, id: 'client-b', name: 'Client B' })
    settle(rejected ? new Error('old failure') : client)
    await pending
    expect(editor.editing.value?.id).toBe('client-b')
    expect(editor.form.name).toBe('Client B')
    expect(editor.dialogOpen.value).toBe(true)
    expect(editor.saving.value).toBe(false)
    expect(refreshFavicon).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})
