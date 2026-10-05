import { existsSync, readFileSync } from 'node:fs'
import { computed, reactive, ref } from 'vue'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : ''
const nested = 'app/pages/organizacion/clientes/[id]/proyectos/[projectId]/tareas/[taskId].vue'
function setupPage(legacy = false) {
  const route = reactive({ params: { id: legacy ? 't1' : 'c1', projectId: 'p1', taskId: 't1' }, query: { q: ['one', 'two'] }, hash: '#context' })
  const projects = reactive<Record<string, any>>({ p1: { id: 'p1', client: 'c1', name: 'Project' } })
  const clients = reactive<Record<string, any>>({ c1: { id: 'c1' } })
  const tasks = ref<any[]>([{ id: 't1', project: 'p1', title: 'Task' }])
  const ensureProjects = vi.fn().mockResolvedValue(undefined)
  const ensureClients = vi.fn().mockResolvedValue(undefined)
  const getOne = vi.fn().mockResolvedValue(tasks.value[0])
  const task = ref<any>(null)
  const navigateTo = vi.fn()
  let context: any
  let unmount = () => {}
  const load = vi.fn(async (id, ctx) => {
    task.value = null
    context = ctx
    const record = await getOne(id)
    if (await ctx.validate(record) && ctx.isCurrent()) task.value = record
  })
  const dispose = vi.fn(() => { task.value = null })
  const bindings = {
    ref, computed, reactive, watch: () => {}, onMounted: () => {}, onBeforeUnmount: (fn: () => void) => { unmount = fn },
    useRoute: () => route, useI18n: () => ({ t: (key: string) => key }), useAuth: () => ({ canWrite: ref(true) }),
    useProjects: () => ({ projects: computed(() => Object.values(projects)), byId: (id: string) => projects[id], ensureLoaded: ensureProjects }),
    useClients: () => ({ byId: (id: string) => clients[id], ensureLoaded: ensureClients }),
    useTasks: () => ({ tasks }), useToast: () => ({ error: vi.fn() }), useHead: () => {}, definePageMeta: () => {}, navigateTo,
    useNuxtApp: () => ({ $pb: { collection: () => ({ getOne }) } }),
    useTaskDetail: () => ({ task, loading: ref(false), error: ref(false), sessions: ref([]), sessionsLoading: ref(false), sessionsError: ref(false), sessionEntries: ref({}), load, expandSession: vi.fn(), changeStatus: vi.fn(), dispose }),
  }
  const source = read(legacy ? 'app/pages/organizacion/tareas/[id].vue' : nested)
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1] ?? ''
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const page = new Function(...Object.keys(bindings), `${code}; return ${legacy ? '{ load: resolveTask, loading, error }' : '{ load: loadPage, openEdit, editOpen, backToProject }'}`)(...Object.values(bindings))
  return { page, route, projects, clients, tasks, task, load, getOne, ensureProjects, ensureClients, navigateTo, dispose, unmount: () => unmount(), current: () => context.isCurrent() }
}

describe('nested task route setup', () => {
  it('uses distinct task parameters and returns to its project', async () => {
    const h = setupPage()
    await h.page.load()
    expect(h.load).toHaveBeenCalledWith('t1', expect.anything())
    expect(h.task.value?.id).toBe('t1')
    h.page.backToProject()
    expect(h.navigateTo).toHaveBeenCalledWith('/organizacion/clientes/c1/proyectos/p1')
  })
  it.each(['task mismatch', 'project mismatch', 'missing project', 'missing client'])('rejects %s before controller authorization', async state => {
    const h = setupPage()
    if (state === 'task mismatch') h.getOne.mockResolvedValue({ id: 't1', project: 'p2' })
    if (state === 'project mismatch') h.projects.p1.client = 'c2'
    if (state === 'missing project') delete h.projects.p1
    if (state === 'missing client') delete h.clients.c1
    await h.page.load()
    expect(h.task.value).toBeNull()
  })
  it('does not swallow denied parent reads', async () => {
    const h = setupPage()
    h.ensureClients.mockRejectedValue(new Error('Denied'))
    await expect(h.page.load()).rejects.toThrow('Denied')
    expect(h.task.value).toBeNull()
  })
  it('accepts real protected unassigned IDs', async () => {
    const h = setupPage()
    h.route.params.id = 'protected'
    h.clients.protected = { id: 'protected', unassigned: true }
    h.projects.p1.client = 'protected'
    await h.page.load()
    expect(h.task.value?.id).toBe('t1')
  })
  it('invalidates task actions after relation or route changes and unmount', async () => {
    const h = setupPage()
    await h.page.load()
    h.projects.p1.client = 'c2'
    expect(h.current()).toBe(false)
    h.page.openEdit()
    expect(h.page.editOpen.value).toBe(false)
    h.projects.p1.client = 'c1'
    h.tasks.value[0].project = 'p2'
    expect(h.current()).toBe(false)
    h.tasks.value[0].project = 'p1'
    h.route.params.taskId = 't2'
    expect(h.current()).toBe(false)
    h.unmount()
    expect(h.dispose).toHaveBeenCalled()
  })
})

describe('legacy task resolver', () => {
  it('replaces with actual ownership preserving repeated query and hash', async () => {
    const h = setupPage(true)
    await h.page.load()
    expect(h.navigateTo).toHaveBeenCalledWith({ path: '/organizacion/clientes/c1/proyectos/p1/tareas/t1', query: { q: ['one', 'two'] }, hash: '#context' }, { replace: true })
  })
  it('fences stale legacy task lookups and unmounted redirects', async () => {
    const h = setupPage(true)
    let resolve!: (value: unknown) => void
    h.getOne.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = h.page.load()
    h.route.params.id = 't2'
    h.getOne.mockResolvedValueOnce({ id: 't2', project: 'p1' })
    await h.page.load()
    resolve({ id: 't1', project: 'p1' })
    await pending
    expect(h.navigateTo).toHaveBeenCalledTimes(1)
    expect(h.navigateTo).toHaveBeenCalledWith(expect.objectContaining({ path: '/organizacion/clientes/c1/proyectos/p1/tareas/t2' }), { replace: true })
    h.getOne.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const next = h.page.load()
    h.unmount()
    resolve({ id: 't2', project: 'p1' })
    await next
    expect(h.navigateTo).toHaveBeenCalledTimes(1)
  })
  it.each(['missing project', 'missing client', 'denied'])('never redirects %s', async state => {
    const h = setupPage(true)
    if (state === 'missing project') delete h.projects.p1
    if (state === 'missing client') delete h.clients.c1
    if (state === 'denied') h.getOne.mockRejectedValue({ status: 403 })
    await h.page.load()
    expect(h.navigateTo).not.toHaveBeenCalled()
    expect(h.page.error.value).toBe(state === 'denied')
  })
})

describe('task route presentation and callers', () => {
  it('keeps the project parent outlet-only', () => {
    expect(read('app/pages/organizacion/clientes/[id]/proyectos/[projectId].vue').trim()).toBe('<template>\n  <NuxtPage />\n</template>')
  })
  it('uses canonical ownership links in project, catalog and palette', () => {
    expect(read('app/pages/organizacion/clientes/[id]/proyectos/[projectId]/index.vue')).toContain('`/organizacion/clientes/${clientId}/proyectos/${projectId}/tareas/${task.id}`')
    const catalog = read('app/pages/tasks/index.vue')
    expect(catalog).toContain('navigateTo(taskDetailRoute(task, projects.value))')
    expect(catalog).toContain(':to="taskDetailRoute(task, projects)"')
    expect(catalog).not.toContain('<TaskDetailSheet')
    expect(read('app/components/app-shell/CommandPalette.vue')).toContain('to: taskDetailRoute(t2, projects.value)')
  })
  it('preserves task presentation, role guards and editor', () => {
    const page = read(nested)
    expect(page).toContain('page-mode')
    expect(page).toContain('TaskEditDialog')
    expect(page).toContain('canWrite.value')
    expect(page).toContain('role="alert"')
    expect(read('app/components/tasks/TaskDetailSheet.vue')).toContain("pageMode ? 'h1' : 'h2'")
  })
})
