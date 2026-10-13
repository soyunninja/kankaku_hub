import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { ClientRecord } from '../app/lib/pocketbase-types'

afterEach(() => vi.unstubAllGlobals())

describe('clients catalog archive write', () => {
  it('writes status and immediately patches the shared catalog with the committed record', async () => {
    const stale = { id: 'client-a', active: true, name: 'A' } as ClientRecord
    const committed = { ...stale, active: false }
    const clients = ref([stale])
    const update = vi.fn().mockResolvedValue(committed)
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ update }) } }))
    vi.stubGlobal('useState', (key: string, init: () => unknown) => key === 'clients:list' ? clients : ref(init()))
    const { useClients } = await import('../app/composables/useClients')
    const result = await useClients().setActiveCommitted(stale.id, false)
    expect(update).toHaveBeenCalledWith(stale.id, { active: false })
    expect(result).toBe(committed)
    expect(clients.value).toEqual([committed])
  })

  it('does not let a client refresh from a previous auth scope overwrite the shared cache', async () => {
    const oldRecord = { id: 'old-client', active: true } as ClientRecord
    const currentRecord = { id: 'new-owner-client', active: true } as ClientRecord
    const clients = ref([currentRecord])
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    let resolve!: (items: ClientRecord[]) => void
    const getFullList = vi.fn(() => new Promise<ClientRecord[]>(done => { resolve = done }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ getFullList }) } }))
    vi.stubGlobal('useState', (key: string, init: () => unknown) => key === 'clients:list' ? clients : ref(init()))
    const { useClients } = await import('../app/composables/useClients')
    const pending = useClients().refresh()
    authStore.record = { id: 'owner-b' }
    authStore.token = 'token-b'
    resolve([oldRecord])
    await pending
    expect(clients.value).toEqual([currentRecord])
  })

  it('does not patch a committed client into another auth scope', async () => {
    const currentRecord = { id: 'shared-client', active: true, name: 'New owner value' } as ClientRecord
    const clients = ref([currentRecord])
    const committed = { id: 'shared-client', active: false, name: 'Old owner value' } as ClientRecord
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    let resolve!: (record: ClientRecord) => void
    const update = vi.fn(() => new Promise<ClientRecord>(done => { resolve = done }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ update }) } }))
    vi.stubGlobal('useState', (key: string, init: () => unknown) => key === 'clients:list' ? clients : ref(init()))
    const { useClients } = await import('../app/composables/useClients')
    const pending = useClients().setActiveCommitted('old-owner-client', false)
    authStore.record = { id: 'owner-b' }
    authStore.token = 'token-b'
    resolve(committed)
    await pending
    expect(clients.value).toEqual([currentRecord])
    expect(clients.value[0]).toMatchObject({ active: true, name: 'New owner value' })
  })

  it('does not let a project refresh from a previous auth scope overwrite the shared cache', async () => {
    const projects = ref([{ id: 'new-owner-project' }])
    const authStore = { record: { id: 'owner-a' }, token: 'token-a' }
    let resolve!: (items: Array<{ id: string }>) => void
    const getFullList = vi.fn(() => new Promise<Array<{ id: string }>>(done => { resolve = done }))
    vi.stubGlobal('useNuxtApp', () => ({ $pb: { authStore, collection: () => ({ getFullList }) } }))
    vi.stubGlobal('useState', (key: string, init: () => unknown) => key === 'projects:list' ? projects : ref(init()))
    const { useProjects } = await import('../app/composables/useProjects')
    const pending = useProjects().refresh()
    authStore.record = { id: 'owner-b' }
    authStore.token = 'token-b'
    resolve([{ id: 'old-owner-project' }])
    await pending
    expect(projects.value).toEqual([{ id: 'new-owner-project' }])
  })
})
