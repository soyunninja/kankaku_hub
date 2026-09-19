import type { TaskRecord, TaskStatus } from '~/lib/pocketbase-types'

export function useTasks() {
  const { $pb } = useNuxtApp()
  const tasks = useState<TaskRecord[]>('tasks:list', () => [])
  const loading = useState<boolean>('tasks:loading', () => false)
  const loaded = useState<boolean>('tasks:loaded', () => false)

  async function refresh() {
    loading.value = true
    try {
      const items = await $pb.collection('tasks').getFullList<TaskRecord>({ sort: '-updated', perPage: 500 })
      tasks.value = items
      loaded.value = true
    }
    finally {
      loading.value = false
    }
  }

  async function ensureLoaded() {
    if (!loaded.value && !loading.value) await refresh()
  }

  async function create(data: { title: string, project: string, status: TaskStatus, external_ref?: string, description?: string }) {
    const record = await $pb.collection('tasks').create<TaskRecord>(data)
    await refresh()
    return record
  }

  async function update(id: string, data: Partial<Pick<TaskRecord, 'title' | 'project' | 'status' | 'external_ref' | 'description'>>) {
    const record = await $pb.collection('tasks').update<TaskRecord>(id, data)
    await refresh()
    return record
  }

  async function remove(id: string) {
    await $pb.collection('tasks').delete(id)
    await refresh()
  }

  async function setStatus(id: string, status: TaskStatus) {
    return update(id, { status })
  }

  function byId(id: string) {
    return tasks.value.find(t => t.id === id)
  }

  function byProject(projectId: string) {
    return tasks.value.filter(t => t.project === projectId)
  }

  return { tasks, loading, loaded, refresh, ensureLoaded, create, update, remove, setStatus, byId, byProject }
}
