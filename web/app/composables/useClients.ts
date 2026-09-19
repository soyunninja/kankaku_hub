import type { ClientRecord } from '~/lib/pocketbase-types'

/** Clients catalog: small collection, fetched in full and cached in a
 * shared useState (refresh() re-fetches; components call it after
 * create/update/archive). */
export function useClients() {
  const { $pb } = useNuxtApp()
  const clients = useState<ClientRecord[]>('clients:list', () => [])
  const loading = useState<boolean>('clients:loading', () => false)
  const loaded = useState<boolean>('clients:loaded', () => false)

  async function refresh() {
    loading.value = true
    try {
      const items = await $pb.collection('clients').getFullList<ClientRecord>({ sort: 'name', perPage: 200 })
      clients.value = items
      loaded.value = true
    }
    finally {
      loading.value = false
    }
  }

  async function ensureLoaded() {
    if (!loaded.value && !loading.value) await refresh()
  }

  async function create(data: { name: string, code: string, active: boolean, unassigned: boolean }) {
    const record = await $pb.collection('clients').create<ClientRecord>(data)
    await refresh()
    return record
  }

  async function update(id: string, data: Partial<Pick<ClientRecord, 'name' | 'code' | 'active'>>) {
    const record = await $pb.collection('clients').update<ClientRecord>(id, data)
    await refresh()
    return record
  }

  async function setActive(id: string, active: boolean) {
    return update(id, { active })
  }

  function byId(id: string) {
    return clients.value.find(c => c.id === id)
  }

  return { clients, loading, loaded, refresh, ensureLoaded, create, update, setActive, byId }
}
