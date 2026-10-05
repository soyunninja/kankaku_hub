import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { ClientRecord } from '../app/lib/pocketbase-types'

const client = { id: 'client-a', name: 'Client A', code: 'a', active: true, unassigned: false, website: 'https://example.com', contact_email: 'a@example.com', contact_phone: '+123', notes: 'Notes' } as ClientRecord

async function setup() {
  const canWrite = ref(true)
  const create = vi.fn().mockImplementation(async payload => ({ ...payload, id: 'new' }))
  const update = vi.fn().mockImplementation(async (id, payload) => ({ ...client, ...payload, id }))
  const refreshFavicon = vi.fn().mockResolvedValue({ ok: true })
  const toast = { success: vi.fn(), error: vi.fn() }
  vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
  vi.stubGlobal('useAuth', () => ({ canWrite }))
  vi.stubGlobal('useClients', () => ({ create, update, refreshFavicon }))
  vi.stubGlobal('useToast', () => toast)
  const { useClientEditor } = await import('../app/composables/useClientEditor')
  return { editor: useClientEditor(), canWrite, create, update, refreshFavicon, toast }
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

  it('toggles archive/unarchive, reports errors, and prevents duplicate pending requests', async () => {
    const { editor, update, toast } = await setup()
    await editor.toggleArchive(client)
    expect(update).toHaveBeenLastCalledWith(client.id, { active: false })
    await editor.toggleArchive({ ...client, active: false })
    expect(update).toHaveBeenLastCalledWith(client.id, { active: true })
    let reject!: (error: Error) => void
    update.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
    const pending = editor.toggleArchive(client)
    expect(editor.archiving.value).toBe(true)
    await editor.toggleArchive(client)
    expect(update).toHaveBeenCalledTimes(3)
    reject(new Error('denied'))
    await pending
    expect(toast.error).toHaveBeenCalledWith('common.error')
    expect(editor.archiving.value).toBe(false)
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
