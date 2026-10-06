import { existsSync, readFileSync } from 'node:fs'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import * as Vue from 'vue'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : ''
const nested = 'app/pages/organizacion/clientes/[id]/proyectos/[projectId]/tareas/[taskId].vue'
function setupPage(legacy = false) {
  const route = reactive({ params: { id: legacy ? 't1' : 'c1', projectId: 'p1', taskId: 't1' }, query: { q: ['one', 'two'] }, hash: '#context' })
  const projects = reactive<Record<string, any>>({ p1: { id: 'p1', client: 'c1', name: 'Project' } })
  const clients = reactive<Record<string, any>>({ c1: { id: 'c1', name: 'Client' } })
  const tasks = ref<any[]>([{ id: 't1', project: 'p1', title: 'Task' }])
  const ensureProjects = vi.fn().mockResolvedValue(undefined)
  const ensureClients = vi.fn().mockResolvedValue(undefined)
  const getOne = vi.fn().mockResolvedValue(tasks.value[0])
  const task = ref<any>(null)
  const summary = ref({ workMs: 9, cost: 2, entries: 3, sessionCount: 1 })
  const navigateTo = vi.fn()
  const canWrite = ref(true)
  const entryGetOne = vi.fn().mockResolvedValue({ id: 'e1', client: 'c1', project: 'p1', task: 't1', session_id: 's1', prompt: 'Full stored prompt' })
  const listWorkRecords = vi.fn().mockResolvedValue([{ id: 'raw', work_ms: 999 }])
  const updateAssignment = vi.fn().mockResolvedValue(undefined)
  const refreshAfterAssignment = vi.fn().mockResolvedValue(undefined)
  const ensureTasks = vi.fn().mockResolvedValue(undefined)
  const toast = { error: vi.fn(), success: vi.fn() }
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
    ref, computed, reactive, watch, nextTick, onMounted: () => {}, onBeforeUnmount: (fn: () => void) => { unmount = fn },
    useRoute: () => route, useI18n: () => ({ t: (key: string) => key }), useAuth: () => ({ canWrite }),
    useProjects: () => ({ projects: computed(() => Object.values(projects)), byId: (id: string) => projects[id], ensureLoaded: ensureProjects }),
    useClients: () => ({ clients: computed(() => Object.values(clients)), byId: (id: string) => clients[id], ensureLoaded: ensureClients }),
    useTasks: () => ({ tasks, ensureLoaded: ensureTasks }), useToast: () => toast,
    useEntriesExplorer: () => ({ getOne: entryGetOne, listWorkRecords, updateAssignment }),
    deriveEntryTitle: () => ({ kind: 'prompt', text: 'Full stored prompt' }), useHead: () => {}, definePageMeta: () => {}, navigateTo,
    useNuxtApp: () => ({ $pb: { collection: () => ({ getOne }) } }),
    useTaskDetail: () => ({ summary, summaryLoading: ref(false), summaryUnavailable: ref(false), summaryError: ref(false), sessionCountUnavailable: ref(false), task, loading: ref(false), error: ref(false), sessions: ref([]), sessionsLoading: ref(false), sessionsError: ref(false), sessionEntries: ref({}), load, refreshAfterAssignment, expandSession: vi.fn(), changeStatus: vi.fn(), dispose }),
  }
  const source = read(legacy ? 'app/pages/organizacion/tareas/[id].vue' : nested)
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1] ?? ''
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const page = new Function(...Object.keys(bindings), `${code}; return ${legacy ? '{ load: resolveTask, loading, error }' : '{ load: loadPage, openEdit, editOpen, backToProject, detailContext: typeof detailContext === "undefined" ? undefined : detailContext, summary: typeof summary === "undefined" ? undefined : summary, drawer: typeof openDetail === "undefined" ? undefined : { openDetail, saveAssignment, detailOpen, detail, detailWorkRecords, detailLoading, detailError, detailClient, detailProject, detailTask, onDetailOpenAutoFocus, onDetailCloseAutoFocus, detailTitle, pageRoot }, view: typeof detailOpen === "undefined" ? undefined : { t, pageRoot, loading, error, task, sessionsError, summary, summaryLoading, summaryUnavailable, summaryError, sessionCountUnavailable, detailContext, projectName, sessions, sessionsLoading, sessionEntries, canWrite, openEdit, changeStatus, expandSession, openDetail, backToProject, editOpen, taskAuthorized, detailOpen, detailHeading, detailLoading, detailError, detailTarget, detailTitle, detail, detailWorkRecords, detailClient, detailProject, detailTask, entryClients, entryProjects, entryTasks, saveAssignment, onDetailOpenAutoFocus, onDetailCloseAutoFocus } }'}`)(...Object.values(bindings))
  return { page, route, projects, clients, tasks, task, load, getOne, ensureProjects, ensureClients, navigateTo, dispose, canWrite, entryGetOne, listWorkRecords, updateAssignment, refreshAfterAssignment, ensureTasks, toast, unmount: () => unmount(), current: () => context.isCurrent() }
}

function mountPage(h: ReturnType<typeof setupPage>) {
  const { descriptor } = parse(read(nested))
  const compiled = compileTemplate({ source: descriptor.template!.content, filename: nested, id: nested })
  expect(compiled.errors).toEqual([])
  const exports: any = {}
  new Function('require', 'exports', ts.transpile(compiled.code, { module: ts.ModuleKind.CommonJS }))(() => Vue, exports)
  const plain = Vue.defineComponent({ template: '<div><slot /></div>' })
  const sheet = Vue.defineComponent({
    props: ['open'], emits: ['update:open'],
    setup(props, { emit, slots }) {
      Vue.provide('close', () => emit('update:open', false))
      return () => props.open ? slots.default?.() : null
    },
  })
  const content = Vue.defineComponent({
    emits: ['openAutoFocus', 'closeAutoFocus'],
    setup(_, { emit }) {
      const close = Vue.inject<() => void>('close')!
      Vue.onMounted(() => emit('openAutoFocus', new Event('focus', { cancelable: true })))
      Vue.onBeforeUnmount(() => emit('closeAutoFocus', new Event('focus', { cancelable: true })))
      return { close }
    },
    template: '<aside role="dialog" @keydown.esc="close"><button aria-label="Close" @click="close">Close</button><slot /></aside>',
  })
  const taskBody = Vue.defineComponent({ template: '<h1 tabindex="-1">Task heading</h1>' })
  const entryBody = Vue.defineComponent({ props: ['entry', 'workRecords', 'canWrite'], template: '<section data-testid="shared-entry-body">{{ entry.prompt }}<span>{{ workRecords.length }}</span></section>' })
  return mount(Vue.defineComponent({ render: exports.render, setup: () => h.page.view }), {
    attachTo: document.body,
    global: { components: { Button: Vue.defineComponent({ template: '<button><slot /></button>' }), ArrowLeft: plain, TaskDetailSheet: taskBody, TaskEditDialog: plain, Sheet: sheet, SheetContent: content, SheetTitle: plain, SheetDescription: plain, EntryDetailSheet: entryBody } },
  })
}

describe('task record drawer lifecycle', () => {
  it.each(['Escape', 'click'])('focuses the drawer title and restores the trigger after %s closing', async action => {
    const h = setupPage()
    await h.page.load()
    const wrapper = mountPage(h)
    const origin = document.createElement('button')
    document.body.append(origin)
    vi.spyOn(origin, 'getClientRects').mockReturnValue([{}] as any)
    await h.page.drawer.openDetail({ id: 'e1' }, origin)
    await nextTick()
    expect(document.activeElement).toBe(wrapper.get('h2').element)
    expect(wrapper.get('[data-testid="shared-entry-body"]').text()).toContain('Full stored prompt')
    if (action === 'Escape') await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    else await wrapper.get('button[aria-label="Close"]').trigger('click')
    expect(h.page.drawer.detailOpen.value).toBe(false)
    expect(h.page.drawer.detail.value).toBeNull()
    expect(document.activeElement).toBe(origin)
    await h.page.drawer.openDetail({ id: 'e1' }, origin)
    origin.remove()
    await nextTick()
    await wrapper.get('button[aria-label="Close"]').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('h1').element)
    wrapper.unmount()
  })
  it('lazily reads full record and raw detail for viewers, without assignment writes', async () => {
    const h = setupPage()
    await h.page.load()
    expect(h.ensureTasks).not.toHaveBeenCalled()
    h.canWrite.value = false
    await h.page.drawer.openDetail({ id: 'e1', task: 'other', prompt: 'excerpt' })
    expect(h.entryGetOne).toHaveBeenCalledWith('e1')
    expect(h.listWorkRecords).toHaveBeenCalledWith('e1')
    expect(h.page.drawer.detail.value.prompt).toBe('Full stored prompt')
    expect(h.page.drawer.detailWorkRecords.value).toEqual([{ id: 'raw', work_ms: 999 }])
    await h.page.drawer.saveAssignment()
    expect(h.updateAssignment).not.toHaveBeenCalled()
  })
  it.each(['close', 'route', 'owner', 'dispose', 'newer'])('retires pending entry publication on %s', async reason => {
    const h = setupPage()
    await h.page.load()
    let resolve!: (value: any) => void
    h.entryGetOne.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = h.page.drawer.openDetail({ id: 'e1' })
    expect(h.page.drawer.detailLoading.value).toBe(true)
    if (reason === 'close') h.page.drawer.detailOpen.value = false
    if (reason === 'route') h.route.params.taskId = 't2'
    if (reason === 'owner') h.projects.p1.client = 'other'
    if (reason === 'dispose') h.unmount()
    if (reason === 'newer') {
      h.entryGetOne.mockResolvedValueOnce({ id: 'e2', client: '', project: '', task: '', prompt: '' })
      await h.page.drawer.openDetail({ id: 'e2' })
    }
    resolve({ id: 'e1', prompt: 'stale secret' })
    await pending
    expect(h.page.drawer.detail.value?.prompt).not.toBe('stale secret')
    if (reason !== 'newer') expect(h.page.drawer.detail.value).toBeNull()
    else expect(h.page.drawer.detail.value).toMatchObject({ id: 'e2', prompt: '' })
  })
  it('fences catalog reads and wipes all sensitive state immediately on ownership loss', async () => {
    const h = setupPage()
    await h.page.load()
    let resolve!: () => void
    h.ensureTasks.mockImplementationOnce(() => new Promise<void>(r => { resolve = r }))
    const pending = h.page.drawer.openDetail({ id: 'e1' })
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    h.projects.p1.client = 'other'
    expect(h.page.drawer.detailOpen.value).toBe(false)
    resolve()
    await pending
    expect(h.page.view.entryTasks.value).toEqual([])
    expect(h.page.drawer.detailWorkRecords.value).toEqual([])
    expect(h.page.drawer.detailClient.value).toBe('')
    h.projects.p1.client = 'c1'
    await h.page.drawer.openDetail({ id: 'e1' })
    h.page.openEdit()
    expect(h.page.editOpen.value).toBe(false)
    h.projects.p1.client = 'other'
    expect(h.page.drawer.detail.value).toBeNull()
    expect(h.page.view.entryTasks.value).toEqual([])
  })
  it.each(['close', 'owner', 'route', 'permission', 'dispose', 'newer'])('retires a pending save after %s without publishing success or rereading', async reason => {
    const h = setupPage()
    await h.page.load()
    await h.page.drawer.openDetail({ id: 'e1' })
    let resolve!: () => void
    h.updateAssignment.mockImplementationOnce(() => new Promise<void>(r => { resolve = r }))
    const pending = h.page.drawer.saveAssignment()
    if (reason === 'close') h.page.drawer.detailOpen.value = false
    if (reason === 'owner') h.projects.p1.client = 'other'
    if (reason === 'route') h.route.params.taskId = 't2'
    if (reason === 'permission') { h.canWrite.value = false; h.canWrite.value = true }
    if (reason === 'dispose') h.unmount()
    if (reason === 'newer') await h.page.drawer.openDetail({ id: 'e2' })
    const readsBefore = h.entryGetOne.mock.calls.length
    resolve()
    await pending
    expect(h.entryGetOne).toHaveBeenCalledTimes(readsBefore)
    expect(h.refreshAfterAssignment).not.toHaveBeenCalled()
    expect(h.toast.success).not.toHaveBeenCalled()
  })
  it('retries catalog failures and fences pending raw-detail reads on close', async () => {
    const h = setupPage()
    await h.page.load()
    h.ensureTasks.mockRejectedValueOnce(new Error('catalog denied'))
    await h.page.drawer.openDetail({ id: 'e1' })
    expect(h.page.drawer.detailError.value).toBe(true)
    expect(h.page.drawer.detail.value).toBeNull()
    await h.page.drawer.openDetail({ id: 'e1' })
    expect(h.page.drawer.detail.value.id).toBe('e1')
    let resolve!: (records: any[]) => void
    h.listWorkRecords.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = h.page.drawer.openDetail({ id: 'e1' })
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    h.page.drawer.detailOpen.value = false
    resolve([{ id: 'secret raw' }])
    await pending
    expect(h.page.drawer.detailWorkRecords.value).toEqual([])
    expect(h.page.view.entryTasks.value).toEqual([])
  })
  it('fences a post-save reread and prevents overlapping task edits', async () => {
    const h = setupPage()
    await h.page.load()
    await h.page.drawer.openDetail({ id: 'e1' })
    let resolve!: (record: any) => void
    h.entryGetOne.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    const pending = h.page.drawer.saveAssignment()
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    h.page.drawer.detailOpen.value = false
    resolve({ id: 'e1', prompt: 'stale secret' })
    await pending
    expect(h.page.drawer.detail.value).toBeNull()
    expect(h.refreshAfterAssignment).not.toHaveBeenCalled()
    h.page.openEdit()
    expect(h.page.editOpen.value).toBe(true)
    const reads = h.entryGetOne.mock.calls.length
    await h.page.drawer.openDetail({ id: 'e1' })
    expect(h.entryGetOne).toHaveBeenCalledTimes(reads)
  })
  it('retries failed detail reads and saves, rereads and narrowly refreshes sessions', async () => {
    const h = setupPage()
    await h.page.load()
    h.entryGetOne.mockRejectedValueOnce(new Error('denied'))
    await h.page.drawer.openDetail({ id: 'e1' })
    expect(h.page.drawer.detailError.value).toBe(true)
    await h.page.drawer.openDetail({ id: 'e1' })
    h.page.drawer.detailTask.value = ''
    h.updateAssignment.mockRejectedValueOnce(new Error('denied'))
    await h.page.drawer.saveAssignment()
    expect(h.toast.error).toHaveBeenCalled()
    h.entryGetOne.mockResolvedValueOnce({ id: 'e1', client: 'c1', project: 'p1', task: '', session_id: 's1' })
    await h.page.drawer.saveAssignment()
    expect(h.updateAssignment).toHaveBeenLastCalledWith('e1', { client: 'c1', project: 'p1', task: '' })
    expect(h.page.drawer.detail.value.task).toBe('')
    expect(h.refreshAfterAssignment).toHaveBeenCalledWith(['s1'], expect.any(Function))
    expect(h.load).toHaveBeenCalledTimes(1)
    h.canWrite.value = false
    await h.page.drawer.saveAssignment()
    expect(h.updateAssignment).toHaveBeenCalledTimes(2)
  })
})

describe('nested task route setup', () => {
  it('wires the independent summary and only exposes validated canonical context', async () => {
    const h = setupPage()
    expect(h.page.detailContext?.value).toBeUndefined()
    await h.page.load()
    expect(h.page.summary?.value).toMatchObject({ workMs: 9, entries: 3 })
    expect(h.page.detailContext?.value).toEqual({ client: { name: 'Client', to: '/organizacion/clientes/c1' }, project: { name: 'Project', to: '/organizacion/clientes/c1/proyectos/p1' } })
    h.projects.p1.client = 'other'
    expect(h.page.detailContext?.value).toBeUndefined()
  })
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
    expect(h.page.detailContext.value).toBeUndefined()
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
    // Route watching starts the next load synchronously, clearing the old task.
    h.route.params.taskId = 't2'
    expect(h.task.value).toBeNull()
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
    for (const binding of ['summary', 'summaryLoading', 'summaryUnavailable', 'summaryError', 'sessionCountUnavailable', 'detailContext']) {
      expect(page).toContain(`="${binding}"`)
    }
    expect(page).toContain('TaskEditDialog')
    expect(page).toContain('canWrite.value')
    expect(page).toContain('role="alert"')
    expect(read('app/components/tasks/TaskDetailSheet.vue')).toContain("pageMode ? 'h1' : 'h2'")
  })
})
