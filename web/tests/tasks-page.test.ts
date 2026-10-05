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
