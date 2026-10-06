import { readFileSync } from 'node:fs'
import { computed, reactive, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import ts from 'typescript'
import { taskDetailRoute } from '../app/lib/task-detail-route'

const task = { id: 'actualtask', project: 'actualproject', title: 'Unique task', status: 'open' }
const project = { id: 'actualproject', client: 'actualclient', name: 'Project' }
function setup(path: string, result: string) {
  const tasks = ref([task])
  const projects = ref([project])
  const navigateTo = vi.fn()
  const router = { push: vi.fn() }
  const source = readFileSync(path, 'utf8')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
  const bindings = {
    computed, reactive, ref, taskDetailRoute, navigateTo, useRouter: () => router,
    defineProps: () => ({}), defineModel: () => ref(false), watch: () => {}, onMounted: () => {}, onBeforeUnmount: () => {}, useHead: () => {},
    useI18n: () => ({ t: (key: string) => key }), useFormatters: () => ({}), useAuth: () => ({ canWrite: ref(false) }),
    useClients: () => ({ clients: ref([]), ensureLoaded: vi.fn() }), useProjects: () => ({ projects, ensureLoaded: vi.fn() }),
    useTasks: () => ({ tasks, loading: ref(false), ensureLoaded: vi.fn() }), useTaskEntries: () => ({}), useTotals: () => ({}), useToast: () => ({}), useNuxtApp: () => ({ $pb: {} }),
    useSessionsQueueCount: () => ({ count: ref(0), ensureLoaded: vi.fn() }), useUnassignedQueueCount: () => ({ count: ref(0), ensureLoaded: vi.fn() }),
    NAV_ITEMS: [], Boxes: '', Gauge: '', Inbox: '', Link2Off: '', ListTodo: '', Search: '', Settings: '', Users: '',
  }
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const page = new Function(...Object.keys(bindings), `${code}; return ${result}`)(...Object.values(bindings))
  return { page, source, projects, navigateTo, router }
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
