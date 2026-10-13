import type { TeamMemberRecord, DepartmentRecord, TaskEntryRecord } from '~/lib/pocketbase-types'

export interface ClientAttributionPreview {
  client_id: string
  project_id?: string
  member: string
  count: number
  snapshot: string
}

const MAX_SELECTION = 200
const PAGE_SIZE = 25
const quoted = (value: string) => JSON.stringify(value)

export function useClientWorkAttribution(scope: { clientId: { value: string }, projectId?: { value: string | undefined }, open: { value: boolean } }) {
  const { $pb } = useNuxtApp()
  const route = useRoute()
  const { isOwner, user } = useAuth()
  const rows = ref<TaskEntryRecord[]>([])
  const page = ref(1)
  const totalPages = ref(1)
  const selectedIds = ref<string[]>([])
  const memberId = ref('')
  const members = ref<TeamMemberRecord[]>([])
  const departments = ref<DepartmentRecord[]>([])
  const previewResult = ref<ClientAttributionPreview | null>(null)
  const busy = ref(false)
  const error = ref('')
  let generation = 0
  let opId = 0
  let catalogLoaded = false

  const currentRouteClient = () => String(route.params.id ?? '')
  const currentRouteProject = () => String(route.params.projectId ?? '')
  const projectId = () => scope.projectId?.value
  const inClientDetailRoute = () => route.path === `/organizacion/clientes/${encodeURIComponent(scope.clientId.value)}`
  const inProjectDetailRoute = () => !!projectId() && currentRouteProject() === projectId() && route.path === `/organizacion/clientes/${encodeURIComponent(scope.clientId.value)}/proyectos/${encodeURIComponent(projectId()!)}`
  const eligible = computed(() => isOwner.value && !!scope.clientId.value && scope.open.value && currentRouteClient() === scope.clientId.value && (projectId() ? inProjectDetailRoute() : inClientDetailRoute()))
  const authScope = () => ({ id: user.value?.id ?? null, token: $pb.authStore.token })
  const authVersion = ref(0)
  const unsubscribeAuth = $pb.authStore.onChange(() => { authVersion.value++ })
  onBeforeUnmount(() => unsubscribeAuth())

  function invalidate() {
    generation++
    opId++
    rows.value = []
    selectedIds.value = []
    memberId.value = ''
    members.value = []
    departments.value = []
    previewResult.value = null
    busy.value = false
    error.value = ''
    catalogLoaded = false
  }
  watch(() => [scope.clientId.value, projectId(), scope.open.value, currentRouteClient(), currentRouteProject(), route.path, isOwner.value, user.value?.id, authVersion.value, $pb.authStore.token], (current, previous) => {
    const scopeChanged = !!previous && (current[0] !== previous[0] || current[1] !== previous[1] || current[3] !== previous[3] || current[4] !== previous[4] || current[5] !== previous[5] || current[6] !== previous[6] || current[7] !== previous[7] || current[8] !== previous[8] || current[9] !== previous[9])
    invalidate()
    if (scopeChanged && scope.open.value) scope.open.value = false
  }, { flush: 'sync' })
  watch(selectedIds, () => { previewResult.value = null; error.value = '' }, { deep: true, flush: 'sync' })
  watch(memberId, () => { previewResult.value = null; error.value = '' }, { flush: 'sync' })

  async function loadCatalog(expectedGeneration = generation) {
    const auth = authScope()
    const valid = () => expectedGeneration === generation && eligible.value && auth.id === user.value?.id && auth.token === $pb.authStore.token
    const [memberRows, departmentRows] = await Promise.all([
      $pb.collection('team_members').getFullList<TeamMemberRecord>({ sort: 'name' }),
      $pb.collection('departments').getFullList<DepartmentRecord>({ sort: 'name' }),
    ])
    if (valid()) { members.value = memberRows; departments.value = departmentRows }
  }

  async function loadPage(nextPage = 1) {
    if (!eligible.value || busy.value) return
    const request = ++opId
    const g = generation
    const clientId = scope.clientId.value
    const auth = authScope()
    busy.value = true
    error.value = ''
    try {
      if (!catalogLoaded) { await loadCatalog(g); if (g === generation) catalogLoaded = true }
      if (request !== opId || g !== generation) return
      const filter = `client = ${quoted(clientId)}${projectId() ? ` && project = ${quoted(projectId()!)}` : ''} && member = ""`
      const result = await $pb.collection('task_entries').getList<TaskEntryRecord>(nextPage, PAGE_SIZE, {
        filter, sort: '-started_at,-id', expand: 'project,task',
      })
      if (request !== opId || g !== generation || clientId !== scope.clientId.value || auth.id !== user.value?.id || auth.token !== $pb.authStore.token) return
      rows.value = result.items
      page.value = result.page
      totalPages.value = result.totalPages
    }
    catch {
      if (request === opId && g === generation) error.value = 'load'
    }
    finally { if (request === opId && g === generation) busy.value = false }
  }

  function toggle(id: string, checked: boolean) {
    if (busy.value || !eligible.value || !rows.value.some(row => row.id === id)) return
    if (checked && selectedIds.value.includes(id)) return
    if (checked && selectedIds.value.length >= MAX_SELECTION) { error.value = 'limit'; return }
    selectedIds.value = checked ? [...selectedIds.value, id] : selectedIds.value.filter(value => value !== id)
  }

  async function preview() {
    if (busy.value || !eligible.value || !memberId.value || !selectedIds.value.length) return
    if (selectedIds.value.length > MAX_SELECTION) { error.value = 'limit'; return }
    const request = ++opId
    const g = generation
    const clientId = scope.clientId.value
    const scopedProjectId = projectId()
    const selected = [...selectedIds.value]
    const member = memberId.value
    const auth = authScope()
    busy.value = true
    error.value = ''
    previewResult.value = null
    try {
      const result = await $pb.send<ClientAttributionPreview>('/api/kankaku/client-attribution/preview', { method: 'POST', body: { client_id: clientId, ...(scopedProjectId ? { project_id: scopedProjectId } : {}), member, entry_ids: selected } })
      if (request === opId && g === generation && eligible.value && clientId === scope.clientId.value && scopedProjectId === projectId() && selected.join('\0') === selectedIds.value.join('\0') && member === memberId.value && auth.id === user.value?.id && auth.token === $pb.authStore.token) {
        if (result.client_id === clientId && result.project_id === scopedProjectId && result.member === member && result.count === selected.length && result.snapshot) previewResult.value = result
        else error.value = 'invalid'
      }
    }
    catch (cause: any) { if (request === opId && g === generation) error.value = cause?.status === 409 ? 'stale' : cause?.status === 400 ? 'invalid' : 'preview' }
    finally { if (request === opId && g === generation) busy.value = false }
  }

  async function apply() {
    const preview = previewResult.value
    if (busy.value || !eligible.value || !preview || !memberId.value || preview.member !== memberId.value || preview.client_id !== scope.clientId.value || preview.project_id !== projectId() || preview.count !== selectedIds.value.length) return
    const request = ++opId
    const g = generation
    const clientId = scope.clientId.value
    const scopedProjectId = projectId()
    const selected = [...selectedIds.value]
    const member = memberId.value
    const auth = authScope()
    busy.value = true
    error.value = ''
    try {
      const result = await $pb.send<{ client_id: string, project_id?: string, member: string, updated_count: number }>('/api/kankaku/client-attribution/apply', { method: 'POST', body: { client_id: clientId, ...(scopedProjectId ? { project_id: scopedProjectId } : {}), member, entry_ids: selected, snapshot: preview.snapshot } })
      if (request !== opId || g !== generation || !eligible.value || clientId !== scope.clientId.value || scopedProjectId !== projectId() || selected.join('\0') !== selectedIds.value.join('\0') || member !== memberId.value || auth.id !== user.value?.id || auth.token !== $pb.authStore.token) return
      if (result.client_id !== clientId || result.project_id !== scopedProjectId || result.member !== member) { error.value = 'invalid'; return }
      selectedIds.value = []
      previewResult.value = null
      scope.open.value = false
      return true
    }
    catch (cause: any) {
      if (request === opId && g === generation) {
        previewResult.value = null
        selectedIds.value = []
        error.value = cause?.status === 409 ? 'stale' : cause?.status === 400 ? 'invalid' : 'apply'
      }
    }
    finally { if (request === opId && g === generation) busy.value = false }
    return false
  }

  function close() { if (busy.value) return; scope.open.value = false; invalidate() }
  return { rows, page, totalPages, selectedIds, memberId, members, departments, previewResult, busy, error, eligible, loadPage, toggle, preview, apply, close, invalidate }
}
