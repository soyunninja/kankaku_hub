import { reactive, ref, watch } from 'vue'
import type { TaskStatus } from '~/lib/pocketbase-types'

export type TaskCreateContext = {
  canWrite: boolean
  isAuthenticated: boolean
  clientId: string
  clientName: string
  clientActive: unknown
  projectId: string
  projectName: string
  projectClientId: string
  projectActive: unknown
  userId: string
  role: string
  token: string
}

type CreateTask = (data: { title: string, project: string, status: TaskStatus, external_ref?: string, description?: string }) => Promise<unknown>

function scopeKey(context: TaskCreateContext | null) {
  return context ? [context.canWrite, context.isAuthenticated, context.clientId, context.clientName, context.clientActive, context.projectId, context.projectName, context.projectClientId, context.projectActive, context.userId, context.role, context.token].join('\u0000') : ''
}

function allowed(context: TaskCreateContext | null): context is TaskCreateContext {
  return !!context && context.canWrite && context.isAuthenticated && context.role === 'owner' && !!context.userId && !!context.token
    && !!context.clientId && context.clientActive === true && !!context.projectId
    && context.projectClientId === context.clientId && context.projectActive === true
}

export function useTaskCreate(getContext: () => TaskCreateContext | null, create: CreateTask) {
  const open = ref(false)
  const busy = ref(false)
  const error = ref(false)
  const form = reactive({ title: '', external_ref: '', description: '' })
  let generation = 0

  function reset() {
    form.title = ''
    form.external_ref = ''
    form.description = ''
    error.value = false
  }

  function invalidate() {
    generation++
    open.value = false
    busy.value = false
    reset()
  }

  watch(() => scopeKey(getContext()), invalidate, { flush: 'sync' })

  function current(context: TaskCreateContext, version: number) {
    return generation === version && allowed(getContext()) && scopeKey(getContext()) === scopeKey(context)
  }

  function openDialog() {
    if (busy.value) return
    const context = getContext()
    if (!allowed(context)) return
    generation++
    reset()
    open.value = true
  }

  function requestOpenChange(value: boolean) {
    if (!value && busy.value) return
    if (value) openDialog()
    else invalidate()
  }

  async function submit() {
    const context = getContext()
    if (busy.value || !open.value || !allowed(context)) return
    const title = form.title.trim()
    if (!title) { error.value = true; return }
    const version = generation
    busy.value = true
    error.value = false
    const data = {
      title,
      project: context.projectId,
      status: 'open' as const,
      ...(form.external_ref.trim() ? { external_ref: form.external_ref.trim() } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
    }
    try {
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

  return { open, busy, error, form, openDialog, requestOpenChange, submit }
}
