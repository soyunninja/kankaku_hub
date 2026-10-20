import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { ProjectRecord } from '../app/lib/pocketbase-types'

afterEach(() => vi.unstubAllGlobals())

describe('project catalog committed updates', () => {
  it('does not publish an older refresh after a committed update or newer refresh', async () => {
    const original = { id: 'p1', client: 'c1', name: 'Old', code: '', active: true, repo_paths: [] } as ProjectRecord
    const projects = ref<ProjectRecord[]>([original])
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    const reads: Array<(items: ProjectRecord[]) => void> = []
    const getFullList = vi.fn(() => new Promise<ProjectRecord[]>(resolve => reads.push(resolve)))
    const update = vi.fn().mockResolvedValue({ ...original, name: 'Committed', client: 'c2', active: false })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ update, getFullList }) } }))
    vi.stubGlobal('useState', (_key: string, initial: () => unknown) => _key === 'projects:list' ? projects : ref(initial()))
    const { useProjects } = await import('../app/composables/useProjects')
    const catalog = useProjects()
    const staleRefresh = catalog.refresh()
    const committed = await catalog.updateCommitted('p1', { name: 'Committed' })
    expect(projects.value[0]).toEqual(committed)
    expect(catalog.loading.value).toBe(false)
    const newerRefresh = catalog.refresh()
    reads[1]([{ ...original, name: 'Newer read' }])
    await newerRefresh
    reads[0]([{ ...original, name: 'Old read', client: 'c1', active: true }])
    await staleRefresh
    expect(projects.value[0]?.name).toBe('Newer read')
  })

  it('forwards optional notes on create without adding them for legacy callers', async () => {
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    const create = vi.fn().mockImplementation(async data => ({ id: 'p1', ...data }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ create, getFullList: vi.fn().mockResolvedValue([]) }) } }))
    vi.stubGlobal('useState', (_key: string, initial: () => unknown) => ref(initial()))
    const { useProjects } = await import('../app/composables/useProjects')
    const catalog = useProjects()

    await catalog.create({ name: 'Legacy', client: 'c1', active: true })
    await catalog.create({ name: 'Documented', client: 'c1', active: true, notes: '設計\nNext steps' })

    expect(create.mock.calls.map(([payload]) => payload)).toEqual([
      { name: 'Legacy', client: 'c1', active: true },
      { name: 'Documented', client: 'c1', active: true, notes: '設計\nNext steps' },
    ])
  })

  it('does not patch or refresh a create response after auth changes', async () => {
    const projects = ref<ProjectRecord[]>([])
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    let finishCreate!: (record: ProjectRecord) => void
    const create = vi.fn(() => new Promise<ProjectRecord>(resolve => { finishCreate = resolve }))
    const getFullList = vi.fn().mockResolvedValue([])
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ create, getFullList }) } }))
    vi.stubGlobal('useState', (_key: string, initial: () => unknown) => _key === 'projects:list' ? projects : ref(initial()))
    const { useProjects } = await import('../app/composables/useProjects')
    const catalog = useProjects()
    const pending = catalog.create({ name: 'Scoped', client: 'c1', active: true })
    authStore.record = { id: 'owner-b' }
    authStore.token = 'token-b'
    finishCreate({ id: 'p1', name: 'Scoped', client: 'c1', active: true } as ProjectRecord)
    await pending
    expect(projects.value).toEqual([])
    expect(getFullList).not.toHaveBeenCalled()
  })

  it('keeps the committed create result and resolves successfully when its follow-up refresh fails', async () => {
    const record = { id: 'p1', client: 'c1', name: 'Created', code: '', active: true, repo_paths: [] } as ProjectRecord
    const projects = ref<ProjectRecord[]>([])
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    const create = vi.fn().mockResolvedValue(record)
    const getFullList = vi.fn().mockRejectedValue(new Error('refresh failed'))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ create, getFullList }) } }))
    vi.stubGlobal('useState', (_key: string, initial: () => unknown) => _key === 'projects:list' ? projects : ref(initial()))
    const { useProjects } = await import('../app/composables/useProjects')
    const catalog = useProjects()
    await expect(catalog.create({ name: 'Created', client: 'c1', active: true })).resolves.toEqual(record)
    expect(create).toHaveBeenCalledTimes(1)
    expect(projects.value).toEqual([record])
  })

  it('does not publish an A-to-B-to-A stale project read after an auth-store revision', async () => {
    const projects = ref<ProjectRecord[]>([])
    let changed!: () => void
    const authStore = { record: { id: 'owner-a' }, token: 'token-a', onChange: (listener: () => void) => { changed = listener } }
    let finish!: (items: ProjectRecord[]) => void
    const getFullList = vi.fn(() => new Promise<ProjectRecord[]>(resolve => { finish = resolve }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ getFullList }) } }))
    vi.stubGlobal('useState', (_key: string, initial: () => unknown) => _key === 'projects:list' ? projects : ref(initial()))
    const { useProjects } = await import('../app/composables/useProjects')
    const catalog = useProjects()
    const stale = catalog.refresh()
    authStore.record = { id: 'owner-b' }
    authStore.token = 'token-b'
    changed()
    authStore.record = { id: 'owner-a' }
    authStore.token = 'token-a'
    changed()
    finish([{ id: 'stale', client: 'c1', name: 'Stale', active: true } as ProjectRecord])
    await stale
    expect(projects.value).toEqual([])
  })

  it('keeps create successful when its post-commit read is superseded across composable instances', async () => {
    const state = new Map<string, ReturnType<typeof ref>>()
    const getState = (_key: string, initial: () => unknown) => {
      if (!state.has(_key)) state.set(_key, ref(initial()))
      return state.get(_key)!
    }
    let listenerCount = 0
    const authStore = { record: { id: 'owner-a' }, token: 'token-a', onChange: () => { listenerCount++ } }
    const reads: Array<{ resolve: (items: ProjectRecord[]) => void, reject: (error: Error) => void }> = []
    const getFullList = vi.fn(() => new Promise<ProjectRecord[]>((resolve, reject) => reads.push({ resolve, reject })))
    const record = { id: 'p1', client: 'c1', name: 'Committed', active: true } as ProjectRecord
    const create = vi.fn().mockResolvedValue(record)
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ create, getFullList }) } }))
    vi.stubGlobal('useState', getState)
    const { useProjects } = await import('../app/composables/useProjects')
    const first = useProjects()
    const second = useProjects()
    const stale = first.refresh()
    const pendingCreate = second.create({ name: 'Committed', client: 'c1', active: true })
    expect(listenerCount).toBe(1)
    await vi.waitFor(() => expect(reads).toHaveLength(2))
    const newer = first.refresh()
    expect(reads).toHaveLength(3)
    reads[2]!.resolve([{ ...record, name: 'Latest catalog' }])
    await newer
    reads[1]!.reject(new Error('superseded read failed'))
    await expect(pendingCreate).resolves.toEqual(record)
    reads[0]!.resolve([{ ...record, name: 'Old read' }])
    await stale
    expect(getState('projects:list', () => []).value).toEqual([{ ...record, name: 'Latest catalog' }])
    expect(create).toHaveBeenCalledOnce()
  })

  it('does not publish a post-commit read after auth changes A-to-B-to-A', async () => {
    const projects = ref<ProjectRecord[]>([])
    let changed!: () => void
    const authStore = { record: { id: 'owner-a' }, token: 'token-a', onChange: (listener: () => void) => { changed = listener } }
    let finishRead!: (items: ProjectRecord[]) => void
    const record = { id: 'p1', client: 'c1', name: 'Committed', active: true } as ProjectRecord
    const create = vi.fn().mockResolvedValue(record)
    const getFullList = vi.fn(() => new Promise<ProjectRecord[]>(resolve => { finishRead = resolve }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ create, getFullList }) } }))
    vi.stubGlobal('useState', (_key: string, initial: () => unknown) => _key === 'projects:list' ? projects : ref(initial()))
    const { useProjects } = await import('../app/composables/useProjects')
    const catalog = useProjects()
    const pending = catalog.create({ name: 'Committed', client: 'c1', active: true })
    await vi.waitFor(() => expect(finishRead).toBeTypeOf('function'))
    authStore.record = { id: 'owner-b' }; authStore.token = 'token-b'; changed()
    authStore.record = { id: 'owner-a' }; authStore.token = 'token-a'; changed()
    finishRead([])
    await expect(pending).resolves.toEqual(record)
    expect(projects.value).toEqual([record])
  })

  it('does not start a reconciliation read after an actual project create failure', async () => {
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    const create = vi.fn().mockRejectedValue(new Error('write failed'))
    const getFullList = vi.fn()
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ create, getFullList }) } }))
    vi.stubGlobal('useState', (_key: string, initial: () => unknown) => ref(initial()))
    const { useProjects } = await import('../app/composables/useProjects')
    await expect(useProjects().create({ name: 'Failure', client: 'c1', active: true })).rejects.toThrow('write failed')
    expect(getFullList).not.toHaveBeenCalled()
  })

  it('patches the server response only while the captured owner and token remain current', async () => {
    const projects = ref<ProjectRecord[]>([{ id: 'p1', client: 'c1', name: 'Old', code: '', active: true, repo_paths: [] } as ProjectRecord])
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    const update = vi.fn().mockResolvedValue({ id: 'p1', client: 'c1', name: 'New', code: '', active: true, repo_paths: [] })
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ update }) } }))
    vi.stubGlobal('useState', (_key: string, initial: () => unknown) => _key === 'projects:list' ? projects : ref(initial()))
    const { useProjects } = await import('../app/composables/useProjects')
    const catalog = useProjects()
    await catalog.updateCommitted('p1', { name: 'New' })
    expect(projects.value[0]?.name).toBe('New')

    let release!: (record: ProjectRecord) => void
    update.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    const stale = catalog.updateCommitted('p1', { name: 'Stale' })
    authStore.token = 'token-b'
    release({ id: 'p1', client: 'c1', name: 'Stale', code: '', active: true, repo_paths: [] } as ProjectRecord)
    await stale
    expect(projects.value[0]?.name).toBe('New')
  })
})
