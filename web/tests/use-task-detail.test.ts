import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import { buildResumeCommand } from '../app/lib/session-resume'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const task = { id: 'task-a', title: 'Task A', project: 'p', status: 'open', external_ref: '', description: 'Description' }

async function setup() {
  const tasks = ref<any[]>([])
  const getOne = vi.fn().mockResolvedValue(task)
  const fetchSessionTotals = vi.fn().mockResolvedValue({ sessions: [] })
  const fetchSessionsForTask = vi.fn().mockResolvedValue([])
  const list = vi.fn().mockResolvedValue({ items: [], totalItems: 0 })
  vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection: () => ({ getOne }) } }))
  const canWrite = ref(true)
  const moveStatus = vi.fn()
  vi.stubGlobal('useAuth', () => ({ canWrite }))
  vi.stubGlobal('useTasks', () => ({ tasks, moveStatus }))
  vi.stubGlobal('useSessions', () => ({ fetchSessionTotals, fetchSessionsForTask }))
  vi.stubGlobal('useEntriesExplorer', () => ({ list }))
  const { useTaskDetail } = await import('../app/composables/useTaskDetail')
  return { detail: useTaskDetail(), tasks, getOne, fetchSessionTotals, fetchSessionsForTask, list, canWrite, moveStatus }
}

// Use the actual nested page's reactive task/project/client ownership context.
async function setupOwnedRoute() {
  const h = await setup()
  const project = reactive({ id: 'p', client: 'c', name: 'Project' })
  const clients = reactive<Record<string, { id: string }>>({ c: { id: 'c' } })
  const route = reactive({ params: { id: 'c', projectId: 'p', taskId: 'task-a' } })
  const bindings = {
    computed, ref, useRoute: () => route, useI18n: () => ({ t: (key: string) => key }), useHead: () => {},
    useAuth: () => ({ canWrite: h.canWrite }), useTasks: () => ({ tasks: h.tasks }),
    useProjects: () => ({ projects: ref([project]), byId: (id: string) => id === project.id ? project : undefined, ensureLoaded: async () => {} }),
    useClients: () => ({ byId: (id: string) => clients[id], ensureLoaded: async () => {} }),
    useTaskDetail: () => h.detail, useToast: () => ({ error: vi.fn() }),
    onMounted: () => {}, onBeforeUnmount: () => {}, watch: () => {},
  }
  const source = readFileSync('app/pages/organizacion/clientes/[id]/proyectos/[projectId]/tareas/[taskId].vue', 'utf8')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const page = new Function(...Object.keys(bindings), `${code}; return { loadPage }`)(...Object.values(bindings))
  await page.loadPage()
  function setOwnership(valid: boolean, relation: string) {
    if (relation === 'task.project') h.tasks.value[0].project = valid ? 'p' : 'anotherproject'
    else project.client = valid ? 'c' : 'anotherclient'
  }
  return { ...h, route, project, setOwnership }
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('reactive', reactive)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('watch', watch)
})
afterEach(() => vi.unstubAllGlobals())

describe('task detail controller', () => {
  it('loads a task directly by ID and merges it for shared status updates', async () => {
    const { detail, tasks, getOne, fetchSessionTotals } = await setup()
    await detail.load('task-a')
    expect(getOne).toHaveBeenCalledWith('task-a')
    expect(fetchSessionTotals).toHaveBeenCalledWith('task-a', { perPage: 50 })
    expect(detail.task.value?.title).toBe('Task A')
    tasks.value = [{ ...task, status: 'doing' }]
    expect(detail.task.value?.status).toBe('doing')
    expect(detail.loading.value).toBe(false)
  })

  it('distinguishes missing from denied and clears the previous detail', async () => {
    const { detail, getOne } = await setup()
    await detail.load('task-a')
    getOne.mockRejectedValueOnce({ status: 404 })
    await detail.load('missing')
    expect(detail.task.value).toBeNull()
    expect(detail.error.value).toBe(false)
    getOne.mockRejectedValueOnce({ status: 403 })
    await detail.load('denied')
    expect(detail.error.value).toBe(true)
    expect(detail.loading.value).toBe(false)
  })

  it('bounds expansion and caches results across task changes including empty results', async () => {
    const { detail, list } = await setup()
    await detail.expandSession('session-a')
    await detail.load('task-a')
    await detail.expandSession('session-a')
    expect(list).toHaveBeenCalledTimes(1)
    expect(list).toHaveBeenCalledWith({ page: 1, perPage: 50, sort: '-started_at', filters: { session_id: 'session-a' } })
    expect(detail.sessionEntries.value['session-a']).toEqual({ loading: false, items: [], totalItems: 0 })
  })

  it('guards status mutations for viewers, invalid statuses and missing tasks', async () => {
    const { detail, canWrite, moveStatus } = await setup()
    await detail.changeStatus('doing')
    expect(moveStatus).not.toHaveBeenCalled()
    await detail.load('task-a')
    canWrite.value = false
    await detail.changeStatus('doing')
    expect(moveStatus).not.toHaveBeenCalled()
    canWrite.value = true
    await detail.changeStatus('invalid' as any)
    expect(moveStatus).not.toHaveBeenCalled()
    await detail.changeStatus('doing')
    expect(moveStatus).toHaveBeenCalledWith('task-a', 'doing')
    moveStatus.mockRejectedValueOnce(new Error('denied'))
    await expect(detail.changeStatus('done')).rejects.toThrow('denied')
  })

  it('preserves eager bounded resume data and totals row mapping', async () => {
    const { detail, fetchSessionTotals, list } = await setup()
    fetchSessionTotals.mockResolvedValueOnce({ sessions: [{ sessionId: 's', sessionName: 'Session', entries: 2, workMs: 9, waitingMs: 1, cost: 0.2, elapsedMs: 10, distinctAgent: 1, sampleAgent: 'pi' }] })
    list.mockResolvedValueOnce({ items: [{ repo_project: '/repo', session_dir: '/sessions' }], totalItems: 1 })
    await detail.load('task-a')
    expect(list).toHaveBeenCalledWith({ page: 1, perPage: 1, sort: '-started_at', filters: { session_id: 's' } })
    const row = detail.sessions.value[0]!
    expect(row).toMatchObject({ workMs: 9, workMsMayOverlap: true, repoProject: '/repo', sessionDir: '/sessions' })
    expect(buildResumeCommand(row)).toMatchObject({ ok: true })
    expect(detail.sessionEntries.value).toEqual({})
  })

  it('falls back only for unavailable totals and keeps resume metadata', async () => {
    const { detail, fetchSessionTotals, fetchSessionsForTask } = await setup()
    const { TotalsRouteUnavailableError: Unavailable } = await import('../app/composables/useTotals')
    fetchSessionTotals.mockRejectedValueOnce(new Unavailable())
    fetchSessionsForTask.mockResolvedValueOnce([{ sessionId: 'fallback', entryCount: 1, workMs: 42, agent: 'pi', repoProject: '/fallback', sessionDir: '/sessions' }])
    await detail.load('task-a')
    expect(fetchSessionsForTask).toHaveBeenCalledWith('task-a')
    expect(detail.sessions.value[0]).toMatchObject({ sessionId: 'fallback', workMs: 42, repoProject: '/fallback', sessionDir: '/sessions' })
    fetchSessionTotals.mockRejectedValueOnce(new Error('network'))
    await detail.load('task-a')
    expect(fetchSessionsForTask).toHaveBeenCalledTimes(1)
    expect(detail.sessionsError.value).toBe(true)
    expect(detail.task.value?.id).toBe('task-a')
  })

  it('keeps sessions when resume fails and resolves failed disclosures silently', async () => {
    const { detail, fetchSessionTotals, list } = await setup()
    fetchSessionTotals.mockResolvedValueOnce({ sessions: [{ sessionId: 's', entries: 1, distinctAgent: 1, sampleAgent: 'unsupported' }] })
    list.mockRejectedValue(new Error('denied'))
    await detail.load('task-a')
    expect(detail.sessions.value).toHaveLength(1)
    expect(detail.sessionsError.value).toBe(false)
    expect(buildResumeCommand(detail.sessions.value[0]!)).toMatchObject({ ok: false })
    await detail.expandSession('s')
    expect(detail.sessionEntries.value.s).toEqual({ loading: false, items: [], totalItems: 0 })
  })

  it('validates ownership before publishing or reading sessions', async () => {
    const { detail, fetchSessionTotals, list } = await setup()
    const validate = vi.fn().mockResolvedValue(false)
    await detail.load('task-a', { validate, isCurrent: () => true })
    expect(validate).toHaveBeenCalledWith(task)
    expect(detail.task.value).toBeNull()
    expect(fetchSessionTotals).not.toHaveBeenCalled()
    await detail.expandSession('s')
    expect(list).not.toHaveBeenCalled()
  })

  it('exposes denied ownership without issuing detail reads', async () => {
    const { detail, fetchSessionTotals } = await setup()
    await detail.load('task-a', { validate: async () => { throw { status: 403 } }, isCurrent: () => true })
    expect(detail.error.value).toBe(true)
    expect(detail.task.value).toBeNull()
    expect(fetchSessionTotals).not.toHaveBeenCalled()
  })

  it('revokes visible data and actions when validated ownership changes', async () => {
    const { detail, tasks, list, moveStatus } = await setup()
    const context = { validate: async () => true, isCurrent: () => tasks.value.every(row => row.project === 'p') }
    await detail.load('task-a', context)
    tasks.value = [{ ...task, project: 'different' }]
    expect(detail.task.value).toBeNull()
    await detail.changeStatus('doing')
    await detail.expandSession('s')
    expect(moveStatus).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })

  it('stops eager resume reads after route invalidation', async () => {
    const { detail, fetchSessionTotals, list } = await setup()
    let resolve!: (value: unknown) => void
    let current = true
    fetchSessionTotals.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = detail.load('task-a', { validate: async () => true, isCurrent: () => current })
    await vi.waitFor(() => expect(fetchSessionTotals).toHaveBeenCalled())
    current = false
    resolve({ sessions: [{ sessionId: 's' }] })
    await pending
    expect(list).not.toHaveBeenCalled()
    expect(detail.task.value).toBeNull()
    expect(detail.sessions.value).toEqual([])
  })

  it('retries a fenced disclosure on the next owned route without stale cache publication', async () => {
    const { detail, list, getOne } = await setup()
    const context = { validate: async () => true, isCurrent: () => true }
    await detail.load('task-a', context)
    let resolve!: (value: unknown) => void
    list.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const old = detail.expandSession('s')
    getOne.mockResolvedValueOnce({ ...task, id: 'task-b' })
    await detail.load('task-b', context)
    list.mockResolvedValueOnce({ items: [{ id: 'current' }], totalItems: 1 })
    await detail.expandSession('s')
    resolve({ items: [{ id: 'stale' }], totalItems: 1 })
    await old
    expect(list).toHaveBeenCalledTimes(2)
    expect(detail.sessionEntries.value.s).toEqual({ loading: false, items: [{ id: 'current' }], totalItems: 1 })
  })

  it.each(['task.project', 'project.client'])('retries a pending disclosure after same-route %s loss/restoration while retaining completed caches', async relation => {
    const h = await setupOwnedRoute()
    const { detail, list } = h
    list.mockResolvedValueOnce({ items: [{ id: 'cached' }], totalItems: 1 })
    await detail.expandSession('ready')
    await detail.expandSession('empty')
    const ready = detail.sessionEntries.value.ready
    const empty = detail.sessionEntries.value.empty
    let resolve!: (value: unknown) => void
    list.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const old = detail.expandSession('s')
    h.setOwnership(false, relation)
    expect(detail.task.value).toBeNull()
    await detail.expandSession('blocked')
    resolve({ items: [{ id: 'unauthorized' }], totalItems: 1 })
    await old
    h.setOwnership(true, relation)
    expect(detail.task.value?.id).toBe('task-a')
    list.mockResolvedValueOnce({ items: [{ id: 'replacement' }], totalItems: 1 })
    await detail.expandSession('s')
    expect(list).toHaveBeenCalledTimes(4)
    expect(detail.sessionEntries.value.s).toEqual({ loading: false, items: [{ id: 'replacement' }], totalItems: 1 })
    expect(detail.sessionEntries.value.ready).toBe(ready)
    expect(detail.sessionEntries.value.empty).toBe(empty)
    expect(h.getOne).toHaveBeenCalledTimes(1)
    expect(h.fetchSessionTotals).toHaveBeenCalledTimes(1)
    expect(h.route.params).toEqual({ id: 'c', projectId: 'p', taskId: 'task-a' })
  })

  it.each(['task.project', 'project.client'].flatMap(relation => ['resolve', 'reject'].flatMap(completion => ['before', 'after'].map(order => ({ relation, completion, order })))))('fences old $completion $order replacement completion after same-route $relation restoration', async ({ relation, completion, order }) => {
    const h = await setupOwnedRoute()
    const { detail, list } = h
    let resolveOld!: (value: unknown) => void
    let rejectOld!: (reason: unknown) => void
    list.mockImplementationOnce(() => new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject }))
    const old = detail.expandSession('s')
    h.setOwnership(false, relation)
    expect(detail.task.value).toBeNull()
    h.setOwnership(true, relation)
    let resolveNew!: (value: unknown) => void
    list.mockImplementationOnce(() => new Promise(resolve => { resolveNew = resolve }))
    const replacement = detail.expandSession('s')
    expect(list).toHaveBeenCalledTimes(2)
    const pending = detail.sessionEntries.value.s
    const finishOld = async () => {
      if (completion === 'resolve') resolveOld({ items: [{ id: 'stale' }], totalItems: 1 })
      else rejectOld(new Error('Stale denied disclosure'))
      await old
    }
    if (order === 'before') {
      await finishOld()
      expect(detail.sessionEntries.value.s).toBe(pending)
      expect(detail.sessionEntries.value.s?.loading).toBe(true)
    }
    resolveNew({ items: [{ id: 'replacement' }], totalItems: 1 })
    await replacement
    if (order === 'after') await finishOld()
    expect(detail.sessionEntries.value.s).toEqual({ loading: false, items: [{ id: 'replacement' }], totalItems: 1 })
    expect(h.getOne).toHaveBeenCalledTimes(1)
    expect(h.fetchSessionTotals).toHaveBeenCalledTimes(1)
  })

  it('revokes a reassigned task even with an unchanged parent context', async () => {
    const { detail, tasks, list, moveStatus } = await setup()
    await detail.load('task-a', { validate: async () => true, isCurrent: () => true })
    tasks.value = [{ ...task, project: 'reassigned' }]
    expect(detail.task.value).toBeNull()
    await detail.changeStatus('done')
    await detail.expandSession('s')
    expect(moveStatus).not.toHaveBeenCalled()
    expect(list).not.toHaveBeenCalled()
  })

  it('does not publish or read sessions after a stale ownership lookup', async () => {
    const { detail, fetchSessionTotals } = await setup()
    let resolve!: (value: boolean) => void
    const pending = detail.load('task-a', { validate: () => new Promise(r => { resolve = r }), isCurrent: () => true })
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    detail.dispose()
    resolve(true)
    await pending
    expect(detail.task.value).toBeNull()
    expect(fetchSessionTotals).not.toHaveBeenCalled()
  })

  it('cancels publication on disposal', async () => {
    const { detail, getOne, fetchSessionTotals } = await setup()
    let resolve!: (value: unknown) => void
    getOne.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = detail.load('task-a')
    detail.dispose()
    resolve(task)
    await pending
    expect(detail.task.value).toBeNull()
    expect(fetchSessionTotals).not.toHaveBeenCalled()
  })

  it('does not publish stale route responses', async () => {
    const { detail, getOne } = await setup()
    let resolve!: (value: unknown) => void
    getOne.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const old = detail.load('old')
    await detail.load('task-a')
    resolve({ ...task, id: 'old' })
    await old
    expect(detail.task.value?.id).toBe('task-a')
  })
})

describe('task editor controller', () => {
  it('checks the live route authorization callback in actual dialog submit/delete handlers', async () => {
    const update = vi.fn()
    const remove = vi.fn()
    let authorized = true
    const props = { task, canWrite: true, isAuthorized: () => authorized }
    vi.stubGlobal('useTasks', () => ({ update, remove }))
    vi.stubGlobal('useToast', () => ({ success: vi.fn(), error: vi.fn() }))
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    const { useTaskEditor } = await import('../app/composables/useTaskEditor')
    const bindings = { ref, reactive, useTaskEditor, defineProps: () => props, defineModel: () => ref(false), defineEmits: () => vi.fn(), useI18n: () => ({ t: (key: string) => key }), useProjects: () => ({ projects: ref([]), ensureLoaded: vi.fn() }), useToast: () => ({ error: vi.fn() }), watch: () => {} }
    const script = readFileSync('app/components/tasks/TaskEditDialog.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
    const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
    const dialog = new Function(...Object.keys(bindings), `${code}; return { reset, onSubmit, onDelete }`)(...Object.values(bindings))
    dialog.reset()
    authorized = false
    await dialog.onSubmit()
    await dialog.onDelete()
    expect(update).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    authorized = true
    props.canWrite = false
    await dialog.onSubmit()
    expect(update).not.toHaveBeenCalled()
  })
  it('preserves all edit fields and blocks viewer submit/delete', async () => {
    const update = vi.fn().mockResolvedValue(task)
    const remove = vi.fn().mockResolvedValue(undefined)
    const toast = { success: vi.fn(), error: vi.fn() }
    vi.stubGlobal('useTasks', () => ({ update, remove }))
    vi.stubGlobal('useToast', () => toast)
    vi.stubGlobal('useI18n', () => ({ t: (key: string) => key }))
    let writable = false
    const deleted = vi.fn()
    const { useTaskEditor } = await import('../app/composables/useTaskEditor')
    const editor = useTaskEditor(() => task as any, () => writable, deleted)
    editor.reset()
    expect(editor.form).toEqual({ title: task.title, project: task.project, status: task.status, external_ref: '', description: task.description })
    await editor.submit()
    await editor.deleteTask()
    expect(update).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    writable = true
    editor.open.value = true
    editor.form.title = 'Edited'
    await editor.submit()
    expect(update).toHaveBeenCalledWith('task-a', { ...editor.form })
    expect(editor.open.value).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('common.saved')
    update.mockRejectedValueOnce(new Error('denied'))
    editor.open.value = true
    await editor.submit()
    expect(editor.open.value).toBe(true)
    expect(toast.error).toHaveBeenCalledWith('common.error')
    await editor.deleteTask()
    expect(remove).toHaveBeenCalledWith('task-a')
    expect(deleted).toHaveBeenCalledOnce()
  })
})
