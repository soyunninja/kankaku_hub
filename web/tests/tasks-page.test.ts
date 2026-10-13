import { readFileSync } from 'node:fs'
import { computed, reactive, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { taskDetailRoute } from '../app/lib/task-detail-route'
import { isOperationalProject } from '../app/lib/catalog-lifecycle'

const task = { id: 'actualtask', project: 'actualproject', title: 'Unique task', status: 'open' }
const project = { id: 'actualproject', client: 'actualclient', name: 'Project', active: true }
const actualClient = { id: 'actualclient', name: 'Client', active: true }
function setup(path: string, result: string, catalog = { projects: [project], clients: [actualClient] }) {
  const tasks = ref([task])
  const projects = ref(catalog.projects.map(p => ({ ...p })))
  const clients = ref(catalog.clients.map(c => ({ ...c })))
  const createTask = vi.fn()
  const updateTask = vi.fn()
  const moveStatus = vi.fn()
  const toast = { error: vi.fn(), success: vi.fn() }
  const navigateTo = vi.fn()
  const router = { push: vi.fn() }
  const source = readFileSync(path, 'utf8')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
  const bindings = {
    computed, reactive, ref, taskDetailRoute, isOperationalProject, navigateTo, useRouter: () => router,
    defineProps: () => ({}), defineModel: () => ref(false), watch: () => {}, onMounted: () => {}, onBeforeUnmount: () => {}, useHead: () => {},
    useI18n: () => ({ t: (key: string) => key }), useFormatters: () => ({}), useAuth: () => ({ canWrite: ref(false) }),
    useClients: () => ({ clients, ensureLoaded: vi.fn() }), useProjects: () => ({ projects, ensureLoaded: vi.fn() }),
    useTasks: () => ({ tasks, loading: ref(false), ensureLoaded: vi.fn(), create: createTask, update: updateTask, remove: vi.fn(), moveStatus }), useTaskEntries: () => ({}), useTotals: () => ({}), useToast: () => toast, useNuxtApp: () => ({ $pb: {} }),
    useSessionsQueueCount: () => ({ count: ref(0), ensureLoaded: vi.fn() }), useUnassignedQueueCount: () => ({ count: ref(0), ensureLoaded: vi.fn() }),
    NAV_ITEMS: [], Boxes: '', Gauge: '', Inbox: '', Link2Off: '', ListTodo: '', Search: '', Settings: '', Users: '',
  }
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const page = new Function(...Object.keys(bindings), `${code}; return ${result}`)(...Object.values(bindings))
  return { page, source, projects, clients, tasks, createTask, updateTask, moveStatus, toast, navigateTo, router }
}

describe('Organization task toolbar', () => {
  const source = readFileSync('app/pages/tasks/index.vue', 'utf8')

  it('hides only the embedded heading, not filters, modes, history or creation', () => {
    expect(source).toContain('<h1 v-if="!props.embedded" class="text-xl font-semibold tracking-tight">')
    expect(source).not.toContain("props.embedded ? 'h2' : 'h1'")
    const toolbar = source.slice(source.indexOf('data-testid="tasks-toolbar"'), source.indexOf('data-testid="task-status-announcer"'))
    expect(toolbar).not.toContain('v-if="!props.embedded"')
    for (const control of ['tasks-filter-client', 'tasks-filter-project', 'role="group"', 'historyControl', 'v-if="canWrite"', '@click="openCreate"']) expect(toolbar).toContain(control)
  })

  it('fills the embedded panel and lets filter fields grow without changing standalone sizing', () => {
    expect(source).toContain(':class="props.embedded ? \'w-full\' : \'w-full xl:w-auto\'"')
    expect(source.match(/:class="props.embedded \? 'min-w-0 w-full sm:flex-1' : ''"/g)).toHaveLength(2)
    expect(source.match(/:class="props.embedded \? 'w-full' : 'w-48'"/g)).toHaveLength(2)
    expect(source).toContain('class="flex min-w-0 flex-wrap items-end gap-2"')
  })

  it('excludes projects unless both project and parent client are explicitly active', () => {
    const h = setup('app/pages/tasks/index.vue', '{ availableProjects, filtered }', {
      projects: [
        { id: 'eligible', client: 'active-client', active: true },
        { id: 'actualproject', client: 'active-client', active: true },
        { id: 'inactive-client-project', client: 'inactive-client', active: true },
        { id: 'inactive-project', client: 'active-client', active: false },
        { id: 'missing-parent', client: 'loading-client', active: true },
        { id: 'missing-project-state', client: 'active-client' },
      ],
      clients: [{ id: 'active-client', name: 'Active', active: true }, { id: 'inactive-client', name: 'Inactive', active: false }],
    })
    h.tasks.value = ['actualproject', 'inactive-client-project', 'inactive-project', 'missing-parent', 'missing-project-state'].map(projectId => ({ ...task, id: projectId, project: projectId }))
    expect(h.page.availableProjects.value.map(p => p.id)).toEqual(['eligible', 'actualproject'])
    expect(h.page.filtered.value.map(t => t.project)).toEqual(['actualproject'])
  })

  it('keeps done and closed in history but excludes both terminal statuses from the live board', () => {
    const h = setup('app/pages/tasks/index.vue', '{ displayedTasks, historyResult, view, filtered }')
    const done = { ...task, id: 'historical-done', status: 'done' }
    const closed = { ...task, id: 'historical-closed', status: 'closed' }
    h.tasks.value = [task, done, closed]
    h.page.view.value = 'history'
    h.page.historyResult.value = { items: [done, closed] }
    h.clients.value[0]!.active = false
    expect(h.page.filtered.value).toEqual([])
    expect(h.page.displayedTasks.value.map(t => t.status)).toEqual(['done', 'closed'])
    expect(h.source).toContain('t2.status !== \'done\' && t2.status !== \'closed\'')
    expect(h.source).toContain('t(`tasks.status.${task.status}`)')
    expect(h.source).toContain('listCompletedTasks($pb, historyPage.value, historySearch.value, filterProject.value, filterClient.value)')
    expect(h.source).toContain('loadTaskTotalsPages(fetchTotals)')
    expect(h.source).toContain('fetchRange(range)')
  })

  it('rejects stale inactive project creation and status changes without rewriting task statuses', async () => {
    const h = setup('app/pages/tasks/index.vue', '{ form, onSubmit, changeStatus, statuses, editableStatuses }')
    h.page.form.title = 'New task'
    h.page.form.project = project.id
    h.clients.value[0]!.active = false
    await h.page.onSubmit()
    await h.page.changeStatus(task.id, 'done')
    expect(h.createTask).not.toHaveBeenCalled()
    expect(h.moveStatus).not.toHaveBeenCalled()
    expect(h.toast.error).toHaveBeenCalledWith('common.inactive')
    expect(h.page.statuses).toEqual(['open', 'doing', 'done'])
    expect(h.page.editableStatuses).toEqual(['open', 'doing', 'done', 'closed'])
  })

  it('rejects stale existing-task edits when its project or parent client becomes inactive', async () => {
    const h = setup('app/pages/tasks/index.vue', '{ editing, form, openEdit, onSubmit }')
    h.page.openEdit(task)
    h.page.form.title = 'Updated task'
    h.clients.value[0]!.active = false
    await h.page.onSubmit()
    expect(h.updateTask).not.toHaveBeenCalled()
    expect(h.toast.error).toHaveBeenCalledWith('common.inactive')
    h.clients.value[0]!.active = true
    h.projects.value[0]!.active = false
    await h.page.onSubmit()
    expect(h.updateTask).not.toHaveBeenCalled()
  })

  it('preserves real client/project filtering and dependent-selection resets', () => {
    const h = setup('app/pages/tasks/index.vue', '{ selectClient, filterClient, filterProject, availableProjects, filtered }')
    h.page.filterProject.value = project.id
    h.page.selectClient(project.client)
    expect(h.page.filterProject.value).toBe(project.id)
    expect(h.page.filtered.value).toEqual([task])
    h.page.selectClient('otherclient')
    expect(h.page.filterProject.value).toBe('')
    expect(h.page.availableProjects.value).toEqual([])
    expect(h.page.filtered.value).toEqual([])
    h.page.selectClient('')
    expect(h.page.availableProjects.value).toEqual([project])
    expect(h.page.filtered.value).toEqual([task])
  })
})

describe('actual task callers', () => {
  it('opens the actual nested route through board click and keyboard handlers', () => {
    const h = setup('app/pages/tasks/index.vue', '{ openDetail, onCardKeydown }')
    h.page.openDetail(task)
    h.page.onCardKeydown(task, 'open', { key: 'Enter', preventDefault: vi.fn() })
    h.page.onCardKeydown(task, 'open', { key: ' ', preventDefault: vi.fn() })
    expect(h.navigateTo.mock.calls).toEqual(Array(3).fill(['/organizacion/clientes/actualclient/proyectos/actualproject/tareas/actualtask']))
  })
  it('evaluates the actual list NuxtLink binding against the owning relation', () => {
    const h = setup('app/pages/tasks/index.vue', '{}')
    const expression = h.source.match(/<NuxtLink :to="([^"]+)"/)![1]!
    const href = new Function('task', 'projects', 'taskDetailRoute', `return ${expression}`)(task, h.projects.value, taskDetailRoute)
    expect(href).toBe('/organizacion/clientes/actualclient/proyectos/actualproject/tareas/actualtask')
  })
  it('builds and activates the actual palette task result', () => {
    const h = setup('app/components/app-shell/CommandPalette.vue', '{ query, items, go }')
    h.page.query.value = task.title
    const entry = h.page.items.value[0]
    expect(entry.to).toBe('/organizacion/clientes/actualclient/proyectos/actualproject/tareas/actualtask')
    h.page.go(entry)
    expect(h.router.push).toHaveBeenCalledWith(entry.to)
  })
})
