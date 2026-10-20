import type { ProjectRecord } from '~/lib/pocketbase-types'

// Auth-store revisions fence A→B→A session changes across composable instances.
const authRevisions = new WeakMap<object, { value: number }>()
let inFlight: { scope: string, promise: Promise<void> } | null = null
type ObservableAuthStore = { token: string, record?: { id?: string, role?: string }, onChange?: (listener: () => void, initial?: boolean) => unknown }
function authRevision(store: ObservableAuthStore) {
  let revision = authRevisions.get(store)
  if (!revision) {
    revision = { value: 0 }
    authRevisions.set(store, revision)
    store.onChange?.(() => { revision!.value++ }, false)
  }
  return revision.value
}

export function useProjects() {
  const { $pb } = useNuxtApp()
  const projects = useState<ProjectRecord[]>('projects:list', () => [])
  const loading = useState<boolean>('projects:loading', () => false)
  const loaded = useState<boolean>('projects:loaded', () => false)
  const refreshSequence = useState<number>('projects:refresh-sequence', () => 0)

  function authScope() {
    const store = $pb.authStore as ObservableAuthStore
    return `${authRevision(store)}\u0000${store.token}\u0000${store.record?.id ?? ''}\u0000${store.record?.role ?? ''}`
  }

  async function refresh() {
    const request = ++refreshSequence.value
    const scope = authScope()
    loading.value = true
    try {
      const items = await $pb.collection('projects').getFullList<ProjectRecord>({ sort: 'name', perPage: 200 })
      if (request !== refreshSequence.value || authScope() !== scope) return
      projects.value = items
      loaded.value = true
    }
    finally {
      if (request === refreshSequence.value) loading.value = false
    }
  }

  async function ensureLoaded() {
    if (loaded.value) return
    const scope = authScope()
    if (!inFlight || inFlight.scope !== scope) {
      const promise = refresh().finally(() => { if (inFlight?.promise === promise) inFlight = null })
      inFlight = { scope, promise }
    }
    await inFlight.promise
  }

  async function create(data: { name: string, client: string, code?: string, repo_paths?: string[], active: boolean, notes?: string }) {
    const scope = authScope()
    const record = await $pb.collection('projects').create<ProjectRecord>(data)
    if (authScope() === scope) {
      invalidateReads()
      projects.value = [record, ...projects.value.filter(project => project.id !== record.id)]
      // A committed write is successful even when catalog reconciliation fails.
      try { await refresh() }
      catch { /* The create response remains authoritative in the cache. */ }
    }
    return record
  }

  function patch(record: ProjectRecord) {
    const index = projects.value.findIndex(project => project.id === record.id)
    if (index !== -1) projects.value.splice(index, 1, record)
  }

  /** Prevent reads started before a committed write from replacing its response. */
  function invalidateReads() {
    refreshSequence.value++
    loading.value = false
  }

  async function updateCommitted(id: string, data: Partial<Pick<ProjectRecord, 'name' | 'client' | 'code' | 'repo_paths' | 'active' | 'notes'>>) {
    const scope = authScope()
    const record = await $pb.collection('projects').update<ProjectRecord>(id, data)
    if (authScope() === scope) {
      invalidateReads()
      patch(record)
    }
    return record
  }

  async function update(id: string, data: Partial<Pick<ProjectRecord, 'name' | 'client' | 'code' | 'repo_paths' | 'active' | 'notes'>>) {
    const record = await updateCommitted(id, data)
    await refresh()
    return record
  }

  function setActiveCommitted(id: string, active: boolean) { return updateCommitted(id, { active }) }
  async function setActive(id: string, active: boolean) { return update(id, { active }) }
  function byId(id: string) { return projects.value.find(project => project.id === id) }
  function byClient(clientId: string) { return projects.value.filter(project => project.client === clientId) }

  return { projects, loading, loaded, refresh, ensureLoaded, create, update, updateCommitted, setActive, setActiveCommitted, byId, byClient }
}
