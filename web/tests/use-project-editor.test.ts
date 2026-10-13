import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import type { ProjectRecord } from '../app/lib/pocketbase-types'

const project = { id: 'project-a', client: 'client-a', name: 'Project A', code: 'a', active: true, repo_paths: ['/repo/a'] } as ProjectRecord

async function setup() {
  const canWrite = ref(true)
  const user = ref({ id: 'owner-a', role: 'owner' })
  const route = { params: { id: 'client-a', projectId: 'project-a' } }
  const authStore = reactive({ record: { id: 'owner-a' }, token: 'token-a' })
  const clients = ref([{ id: 'client-a', active: true }, { id: 'client-b', active: false }])
  const getOne = vi.fn().mockImplementation(async id => clients.value.find(client => client.id === id))
  const updateCommitted = vi.fn().mockImplementation(async (id, payload) => ({ ...project, ...payload, id }))
  const setActiveCommitted = vi.fn().mockImplementation(async (id, active) => ({ ...project, id, active }))
  const refresh = vi.fn().mockResolvedValue(undefined)
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
  const navigateTo = vi.fn()
  vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
  vi.stubGlobal('useAuth', () => ({ canWrite, user }))
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useProjects', () => ({ updateCommitted, setActiveCommitted, refresh }))
  vi.stubGlobal('useClients', () => ({ clients, byId: (id: string) => clients.value.find(client => client.id === id) }))
  vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ getOne }) } }))
  vi.stubGlobal('useToast', () => toast)
  vi.stubGlobal('navigateTo', navigateTo)
  const { useProjectEditor } = await import('../app/composables/useProjectEditor')
  return { editor: useProjectEditor(), canWrite, user, route, authStore, clients, getOne, updateCommitted, setActiveCommitted, refresh, toast, navigateTo }
}
afterEach(() => vi.unstubAllGlobals())

describe('project detail editor', () => {
  it('loads and submits all editable fields and follows a changed parent relation', async () => {
    const h = await setup()
    h.editor.openEdit(project)
    expect(h.editor.form).toEqual({ name: project.name, client: project.client, code: project.code, notes: '', active: true, repoPaths: ['/repo/a'] })
    Object.assign(h.editor.form, { name: 'Renamed', client: 'client-b', code: 'b', active: false, repoPaths: ['/repo/b', ' '] })
    await h.editor.onSubmit()
    expect(h.updateCommitted).toHaveBeenCalledWith('project-a', { name: 'Renamed', client: 'client-b', code: 'b', notes: '', active: false, repo_paths: ['/repo/b'] })
    expect(h.navigateTo).toHaveBeenCalledWith('/organizacion/clientes/client-b/proyectos/project-a')
    expect(h.toast.success).toHaveBeenCalledWith('common.saved')
  })

  it('loads missing notes as empty and submits cleared or multiline Unicode notes unchanged', async () => {
    const h = await setup()
    h.editor.openEdit(project)
    expect(h.editor.form.notes).toBe('')
    await h.editor.onSubmit()
    expect(h.updateCommitted.mock.calls[0]?.[1]).toMatchObject({ notes: '' })

    h.editor.openEdit({ ...project, notes: 'first line\n第二行' } as ProjectRecord)
    expect(h.editor.form.notes).toBe('first line\n第二行')
    h.editor.form.notes = ''
    await h.editor.onSubmit()
    expect(h.updateCommitted.mock.calls[1]?.[1]).toMatchObject({ notes: '' })

    h.editor.openEdit(project)
    h.editor.form.notes = 'café\nメモ'
    await h.editor.onSubmit()
    expect(h.updateCommitted.mock.calls[2]?.[1]).toMatchObject({ notes: 'café\nメモ' })
  })

  it('does not offer editing or archive actions to viewers or a mismatched owner route', async () => {
    const h = await setup()
    h.route.params.id = 'other-client'
    h.editor.openEdit(project)
    h.editor.requestArchive(project)
    expect(h.editor.dialogOpen.value).toBe(false)
    expect(h.editor.confirmationOpen.value).toBe(false)
    h.route.params.id = 'client-a'
    h.canWrite.value = false
    h.editor.openEdit(project)
    h.editor.requestArchive(project)
    expect(h.editor.dialogOpen.value).toBe(false)
    expect(h.updateCommitted).not.toHaveBeenCalled()
    expect(h.setActiveCommitted).not.toHaveBeenCalled()
  })

  it('confirms archive and writes only the selected project active flag', async () => {
    const h = await setup()
    h.editor.requestArchive(project)
    expect(h.editor.confirmationOpen.value).toBe(true)
    h.editor.cancelArchive()
    expect(h.setActiveCommitted).not.toHaveBeenCalled()
    h.editor.requestArchive(project)
    await h.editor.confirmArchive()
    expect(h.setActiveCommitted).toHaveBeenCalledWith(project.id, false)
    expect(h.editor.confirmationOpen.value).toBe(false)
  })

  it('blocks reactivation when the latest parent is inactive and allows it only after explicit parent reactivation', async () => {
    const h = await setup()
    h.route.params.id = 'client-b'
    await h.editor.toggleArchive({ ...project, client: 'client-b', active: false })
    expect(h.getOne).toHaveBeenCalledWith('client-b')
    expect(h.setActiveCommitted).not.toHaveBeenCalled()
    h.clients.value[1]!.active = true
    await h.editor.toggleArchive({ ...project, client: 'client-b', active: false })
    expect(h.setActiveCommitted).toHaveBeenCalledWith(project.id, true)
  })

  it('allows archiving an active legacy project under an inactive parent', async () => {
    const h = await setup()
    h.route.params.id = 'client-b'
    h.editor.requestArchive({ ...project, client: 'client-b' })
    await h.editor.confirmArchive()
    expect(h.setActiveCommitted).toHaveBeenCalledWith(project.id, false)
  })

  it('normalizes active legacy edits and a newly selected inactive parent without auto-enabling later', async () => {
    const h = await setup()
    h.route.params.id = 'client-b'
    h.editor.openEdit({ ...project, client: 'client-b' })
    expect(h.editor.form.active).toBe(false)
    h.editor.form.active = true
    h.editor.form.client = 'client-a'
    h.editor.form.client = 'client-b'
    expect(h.editor.form.active).toBe(false)
    h.clients.value[1]!.active = true
    expect(h.editor.form.active).toBe(false)
  })

  it('blocks an active edit submission if its destination client is inactive', async () => {
    const h = await setup()
    h.editor.openEdit(project)
    h.editor.form.client = 'client-b'
    h.editor.form.active = true
    await h.editor.onSubmit()
    expect(h.updateCommitted).not.toHaveBeenCalled()
  })

  it('does not invite a duplicate write when catalog refresh fails after commit', async () => {
    const h = await setup()
    h.refresh.mockRejectedValueOnce(new Error('read failed'))
    h.editor.requestArchive(project)
    await h.editor.confirmArchive()
    expect(h.setActiveCommitted).toHaveBeenCalledTimes(1)
    expect(h.editor.confirmationOpen.value).toBe(false)
    expect(h.toast.info).toHaveBeenCalledWith('projects.archive.refreshWarning')
    expect(h.toast.error).not.toHaveBeenCalled()
  })

  it('leaves a failed project write retryable and prevents duplicate confirmation writes', async () => {
    const h = await setup()
    h.editor.requestArchive(project)
    h.setActiveCommitted.mockRejectedValueOnce(new Error('write failed'))
    await Promise.all([h.editor.confirmArchive(), h.editor.confirmArchive()])
    expect(h.setActiveCommitted).toHaveBeenCalledTimes(1)
    expect(h.editor.confirmationOpen.value).toBe(true)
    expect(h.toast.error).toHaveBeenCalledWith('projects.archive.writeFailed')
  })

  it('suppresses stale rejected writes after token rotation and releases the old busy state', async () => {
    const h = await setup()
    let rejectWrite!: (error: Error) => void
    h.updateCommitted.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectWrite = reject }))
    h.editor.openEdit(project)
    const pending = h.editor.onSubmit()
    await vi.waitFor(() => expect(h.updateCommitted).toHaveBeenCalled())
    h.authStore.token = 'token-b'
    expect(h.editor.dialogOpen.value).toBe(false)
    expect(h.editor.saving.value).toBe(false)
    rejectWrite(new Error('old token rejected'))
    await pending
    expect(h.toast.error).not.toHaveBeenCalled()

    const archive = await setup()
    let rejectArchive!: (error: Error) => void
    archive.setActiveCommitted.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectArchive = reject }))
    archive.editor.requestArchive(project)
    const archiving = archive.editor.confirmArchive()
    archive.authStore.token = 'token-b'
    expect(archive.editor.archiving.value).toBe(false)
    rejectArchive(new Error('old token rejected'))
    await archiving
    expect(archive.toast.error).not.toHaveBeenCalled()

    const reactivate = await setup()
    let rejectReactivate!: (error: Error) => void
    reactivate.setActiveCommitted.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectReactivate = reject }))
    const reactivating = reactivate.editor.toggleArchive({ ...project, active: false })
    await vi.waitFor(() => expect(reactivate.setActiveCommitted).toHaveBeenCalled())
    reactivate.authStore.token = 'token-b'
    expect(reactivate.editor.archiving.value).toBe(false)
    rejectReactivate(new Error('old token rejected'))
    await reactivating
    expect(reactivate.toast.error).not.toHaveBeenCalled()
  })

  it('fences stale route and auth responses and prevents dismissing while busy', async () => {
    const h = await setup()
    let release!: (record: ProjectRecord) => void
    h.updateCommitted.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    h.editor.openEdit(project)
    const pending = h.editor.onSubmit()
    expect(h.editor.saving.value).toBe(true)
    await vi.waitFor(() => expect(h.updateCommitted).toHaveBeenCalled())
    h.editor.close()
    expect(h.editor.dialogOpen.value).toBe(true)
    h.route.params.projectId = 'project-b'
    h.editor.close(true)
    release(project)
    await pending
    expect(h.navigateTo).not.toHaveBeenCalled()

    const auth = await setup()
    let finish!: (record: ProjectRecord) => void
    auth.updateCommitted.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    auth.editor.openEdit(project)
    const staleAuth = auth.editor.onSubmit()
    await vi.waitFor(() => expect(auth.updateCommitted).toHaveBeenCalled())
    auth.authStore.token = 'token-b'
    finish(project)
    await staleAuth
    expect(auth.editor.dialogOpen.value).toBe(false)
    expect(auth.toast.success).not.toHaveBeenCalled()
  })
})
