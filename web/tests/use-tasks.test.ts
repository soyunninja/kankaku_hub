import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useTasks } from '../app/composables/useTasks'

function setup() {
  const token = ref('token-1')
  const userId = ref('user-1')
  const record = { id: 'new-task', title: 'New task', project: 'p1', status: 'open' }
  const create = vi.fn().mockResolvedValue(record)
  const getFullList = vi.fn().mockResolvedValue([record])
  const listeners = new Set<() => void>()
  const pb = {
    authStore: {
      get token() { return token.value },
      get record() { return { id: userId.value, role: 'owner' } },
      onChange: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    },
    collection: vi.fn(() => ({ create, getFullList })),
  }
  function changeAuth(nextToken: string, nextUserId: string) {
    token.value = nextToken
    userId.value = nextUserId
    for (const listener of listeners) listener()
  }
  const state = new Map<string, ReturnType<typeof ref>>()
  vi.stubGlobal('useNuxtApp', () => ({ $pb: pb }))
  vi.stubGlobal('useState', (key: string, initialize: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(initialize()))
    return state.get(key)
  })
  return { token, userId, record, create, getFullList, changeAuth, state, tasks: useTasks(), anotherTasks: () => useTasks() }
}

afterEach(() => vi.unstubAllGlobals())

describe('useTasks.create cache publication', () => {
  it('publishes a committed task once and treats refresh failure as committed success', async () => {
    const h = setup()
    h.getFullList.mockRejectedValue(new Error('refresh unavailable'))
    await expect(h.tasks.create({ title: 'New task', project: 'p1', status: 'open' })).resolves.toEqual(h.record)
    expect(h.tasks.tasks.value.map(task => task.id)).toEqual(['new-task'])
    expect(h.tasks.loaded.value).toBe(false)
  })

  it('still rejects when the PocketBase create itself fails', async () => {
    const h = setup()
    h.create.mockRejectedValue(new Error('write failed'))
    await expect(h.tasks.create({ title: 'New task', project: 'p1', status: 'open' })).rejects.toThrow('write failed')
    expect(h.getFullList).not.toHaveBeenCalled()
    expect(h.tasks.tasks.value).toEqual([])
  })

  it('does not refresh or publish into a different auth account after a committed create', async () => {
    const h = setup()
    let finish!: (value: unknown) => void
    h.create.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = h.tasks.create({ title: 'New task', project: 'p1', status: 'open' })
    h.token.value = 'token-2'
    h.userId.value = 'user-2'
    finish(h.record)
    await pending
    expect(h.getFullList).not.toHaveBeenCalled()
    expect(h.tasks.tasks.value).toEqual([])
  })

  it('fences an A-to-B-to-A auth change during the create request', async () => {
    const h = setup()
    let finish!: (value: unknown) => void
    h.create.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = h.tasks.create({ title: 'New task', project: 'p1', status: 'open' })
    h.changeAuth('token-2', 'user-2')
    h.changeAuth('token-1', 'user-1')
    finish(h.record)
    await pending
    expect(h.getFullList).not.toHaveBeenCalled()
    expect(h.tasks.tasks.value).toEqual([])
  })

  it('does not let an older refresh overwrite a newer create cache', async () => {
    const h = setup()
    let finishOld!: (value: unknown[]) => void
    h.getFullList.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    const oldRefresh = h.tasks.refresh()
    h.getFullList.mockResolvedValueOnce([h.record])
    await h.tasks.create({ title: 'New task', project: 'p1', status: 'open' })
    finishOld([{ id: 'stale', title: 'Stale', project: 'p1', status: 'open' }])
    await oldRefresh
    expect(h.tasks.tasks.value.map(task => task.id)).toEqual(['new-task'])
  })

  it('fences an A-to-B-to-A auth change during the post-create refresh', async () => {
    const h = setup()
    let finish!: (value: unknown[]) => void
    h.getFullList.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = h.tasks.create({ title: 'New task', project: 'p1', status: 'open' })
    await Promise.resolve()
    h.changeAuth('token-2', 'user-2')
    h.changeAuth('token-1', 'user-1')
    finish([h.record])
    await pending
    expect(h.tasks.tasks.value).toEqual([])
    expect(h.tasks.loaded.value).toBe(false)
  })

  it('returns the committed task when its superseded refresh rejects without clobbering the newer refresh', async () => {
    const h = setup()
    const existing = { id: 'existing', title: 'Existing', project: 'p1', status: 'open' }
    h.tasks.tasks.value = [existing]
    h.tasks.loaded.value = true
    let rejectCreateRead!: (error: Error) => void
    h.getFullList.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectCreateRead = reject }))
    const creating = h.tasks.create({ title: 'New task', project: 'p1', status: 'open' })
    await vi.waitFor(() => expect(rejectCreateRead).toBeTypeOf('function'))
    let finishNewer!: (value: unknown[]) => void
    h.getFullList.mockImplementationOnce(() => new Promise(resolve => { finishNewer = resolve }))
    const newerRefresh = h.tasks.refresh()
    rejectCreateRead(new Error('superseded catalog failure'))
    finishNewer([h.record])
    await newerRefresh
    await expect(creating).resolves.toEqual(h.record)
    expect(h.tasks.tasks.value).toEqual([h.record])
    expect(h.tasks.tasks.value.map(task => task.id)).toEqual(['new-task'])
  })

  it('returns a committed task after auth changes even when its catalog read rejects', async () => {
    const h = setup()
    let rejectRead!: (error: Error) => void
    h.getFullList.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRead = reject }))
    const creating = h.tasks.create({ title: 'New task', project: 'p1', status: 'open' })
    await vi.waitFor(() => expect(rejectRead).toBeTypeOf('function'))
    h.changeAuth('token-2', 'user-2')
    rejectRead(new Error('old session catalog unavailable'))
    await expect(creating).resolves.toEqual(h.record)
    expect(h.tasks.tasks.value).toEqual([])
  })

  it('shares refresh ordering across useTasks instances using the same Nuxt state', async () => {
    const h = setup()
    let finishOld!: (value: unknown[]) => void
    h.getFullList.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    const oldInstance = h.tasks
    const oldRefresh = oldInstance.refresh()
    const newInstance = h.anotherTasks()
    h.getFullList.mockResolvedValueOnce([h.record])
    await newInstance.create({ title: 'New task', project: 'p1', status: 'open' })
    finishOld([{ id: 'stale', title: 'Stale', project: 'p1', status: 'open' }])
    await oldRefresh
    expect(oldInstance.tasks.value.map(task => task.id)).toEqual(['new-task'])
    expect(newInstance.tasks.value).toBe(oldInstance.tasks.value)
  })

  it('does not publish an in-flight refresh after auth changes', async () => {
    const h = setup()
    let finish!: (value: unknown) => void
    h.getFullList.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = h.tasks.create({ title: 'New task', project: 'p1', status: 'open' })
    await Promise.resolve()
    h.token.value = 'token-2'
    finish([h.record])
    await pending
    expect(h.tasks.tasks.value).toEqual([])
    expect(h.tasks.loaded.value).toBe(false)
  })
})
