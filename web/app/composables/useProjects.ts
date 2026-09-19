import type { ProjectRecord } from '~/lib/pocketbase-types'

export function useProjects() {
  const { $pb } = useNuxtApp()
  const projects = useState<ProjectRecord[]>('projects:list', () => [])
  const loading = useState<boolean>('projects:loading', () => false)
  const loaded = useState<boolean>('projects:loaded', () => false)

  async function refresh() {
    loading.value = true
    try {
      const items = await $pb.collection('projects').getFullList<ProjectRecord>({ sort: 'name', perPage: 200 })
      projects.value = items
      loaded.value = true
    }
    finally {
      loading.value = false
    }
  }

  async function ensureLoaded() {
    if (!loaded.value && !loading.value) await refresh()
  }

  async function create(data: { name: string, client: string, code?: string, repo_paths?: string[], active: boolean }) {
    const record = await $pb.collection('projects').create<ProjectRecord>(data)
    await refresh()
    return record
  }

  async function update(id: string, data: Partial<Pick<ProjectRecord, 'name' | 'client' | 'code' | 'repo_paths' | 'active'>>) {
    const record = await $pb.collection('projects').update<ProjectRecord>(id, data)
    await refresh()
    return record
  }

  async function setActive(id: string, active: boolean) {
    return update(id, { active })
  }

  function byId(id: string) {
    return projects.value.find(p => p.id === id)
  }

  function byClient(clientId: string) {
    return projects.value.filter(p => p.client === clientId)
  }

  return { projects, loading, loaded, refresh, ensureLoaded, create, update, setActive, byId, byClient }
}
