import type { ProjectRecord } from '~/lib/pocketbase-types'

// See the matching comment in `useClients.ts` — same race, same fix.
let inFlight: Promise<void> | null = null
let refreshGeneration = 0

export function useProjects() {
  const { $pb } = useNuxtApp()
  const projects = useState<ProjectRecord[]>('projects:list', () => [])
  const loading = useState<boolean>('projects:loading', () => false)
  const loaded = useState<boolean>('projects:loaded', () => false)

  async function refresh() {
    const generation = ++refreshGeneration
    const ownerId = $pb.authStore.record?.id ?? null
    const token = $pb.authStore.token
    const isCurrentAuthScope = () => ($pb.authStore.record?.id ?? null) === ownerId && $pb.authStore.token === token
    loading.value = true
    try {
      const items = await $pb.collection('projects').getFullList<ProjectRecord>({ sort: 'name', perPage: 200 })
      if (generation !== refreshGeneration || !isCurrentAuthScope()) return
      projects.value = items
      loaded.value = true
    }
    finally {
      if (generation === refreshGeneration) loading.value = false
    }
  }

  /** FIX (independent review, 2026-09-21): await a shared in-flight
   * `refresh()` instead of racing past it — see `useClients.ts`. */
  async function ensureLoaded() {
    if (loaded.value) return
    if (!inFlight) inFlight = refresh().finally(() => { inFlight = null })
    await inFlight
  }

  async function create(data: { name: string, client: string, code?: string, repo_paths?: string[], active: boolean, notes?: string }) {
    const scope = authScope()
    const record = await $pb.collection('projects').create<ProjectRecord>(data)
    if (isCurrentAuthScope(scope)) {
      invalidateReads()
      projects.value = [record, ...projects.value.filter(project => project.id !== record.id)]
      // The write is committed even if reconciliation fails; never report it as
      // failed and invite a duplicate create retry.
      try {
        await refresh()
      }
      catch {
        // Keep the authoritative create response in the cache.
      }
    }
    return record
  }

  function authScope() {
    return { ownerId: $pb.authStore.record?.id ?? null, token: $pb.authStore.token }
  }

  function isCurrentAuthScope(scope: ReturnType<typeof authScope>) {
    return ($pb.authStore.record?.id ?? null) === scope.ownerId && $pb.authStore.token === scope.token
  }

  function patch(record: ProjectRecord) {
    const index = projects.value.findIndex(project => project.id === record.id)
    if (index !== -1) projects.value.splice(index, 1, record)
  }

  /** Prevent reads started before a committed write from replacing its response. */
  function invalidateReads() {
    refreshGeneration++
    loading.value = false
  }

  /** Commit one project write and reconcile its response before dependent reads. */
  async function updateCommitted(id: string, data: Partial<Pick<ProjectRecord, 'name' | 'client' | 'code' | 'repo_paths' | 'active' | 'notes'>>) {
    const scope = authScope()
    const record = await $pb.collection('projects').update<ProjectRecord>(id, data)
    if (isCurrentAuthScope(scope)) {
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

  function setActiveCommitted(id: string, active: boolean) {
    return updateCommitted(id, { active })
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

  return { projects, loading, loaded, refresh, ensureLoaded, create, update, updateCommitted, setActive, setActiveCommitted, byId, byClient }
}
