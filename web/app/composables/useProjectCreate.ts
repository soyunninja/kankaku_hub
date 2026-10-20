import { reactive, ref, watch } from 'vue'

export type ProjectCreateContext = {
  canWrite: boolean
  isAuthenticated: boolean
  routeClientId: string
  clientId: string
  clientName: string
  clientActive: unknown
  userId: string
  role: string
  token: string
}

type ProjectPayload = { name: string, client: string, code: string, notes: string, active: true, repo_paths: string[] }
type CreateProject = (data: ProjectPayload) => Promise<unknown>
type ValidateClient = (id: string) => Promise<boolean>

function scopeKey(context: ProjectCreateContext | null) {
  return context ? [context.canWrite, context.isAuthenticated, context.routeClientId, context.clientId, context.clientName, context.clientActive, context.userId, context.role, context.token].join('\u0000') : ''
}

function allowed(context: ProjectCreateContext | null): context is ProjectCreateContext {
  return !!context && context.canWrite && context.isAuthenticated && context.role === 'owner'
    && !!context.userId && !!context.token && !!context.routeClientId
    && context.routeClientId === context.clientId && context.clientActive === true
}

export function useProjectCreate(getContext: () => ProjectCreateContext | null, create: CreateProject, validateClient: ValidateClient) {
  const open = ref(false)
  const busy = ref(false)
  const error = ref(false)
  const form = reactive({ name: '', code: '', notes: '', repoPaths: [] as string[] })
  let generation = 0
  function reset() {
    form.name = ''; form.code = ''; form.notes = ''; form.repoPaths = []; error.value = false
  }
  function invalidate() {
    generation++
    open.value = false
    busy.value = false
    reset()
  }
  watch(() => scopeKey(getContext()), invalidate, { flush: 'sync' })
  function current(context: ProjectCreateContext, version: number) {
    return generation === version && allowed(getContext()) && scopeKey(getContext()) === scopeKey(context)
  }
  function openDialog() {
    if (busy.value) return
    if (!allowed(getContext())) return
    generation++
    reset()
    open.value = true
  }
  function requestOpenChange(value: boolean) {
    if (busy.value) return
    if (value) openDialog()
    else invalidate()
  }
  async function submit() {
    const context = getContext()
    if (busy.value || !open.value || !allowed(context)) return
    const name = form.name.trim()
    if (!name) { error.value = true; return }
    const version = generation
    busy.value = true
    error.value = false
    const data: ProjectPayload = {
      name, client: context.clientId, code: form.code.trim(), notes: form.notes.slice(0, 5000), active: true,
      repo_paths: form.repoPaths.map(path => path.trim()).filter(Boolean),
    }
    try {
      if (!await validateClient(context.clientId) || !current(context, version)) throw new Error('Client scope changed')
      await create(data)
      if (current(context, version)) invalidate()
    }
    catch {
      if (current(context, version)) error.value = true
    }
    finally {
      if (current(context, version)) busy.value = false
    }
  }
  function addPath() { form.repoPaths.push('') }
  function removePath(index: number) { form.repoPaths.splice(index, 1) }
  return { open, busy, error, form, openDialog, requestOpenChange, submit, addPath, removePath }
}
