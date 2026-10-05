import { rankProjects, projectRemainder, PROJECT_OTHERS_KEY } from '../app/lib/project-chart'
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import ts from 'typescript'
import { sumTaskEntries } from '../app/lib/aggregate'
import { buildLocalDayBoundaries, utcInstantToLocalDay } from '../app/lib/local-day'
import { computeAverageCost } from '../app/lib/measurement-quality'
import { resolvePreset } from '../app/lib/period'
import { computeAverageCostFromTotal, ZERO_TOTALS_ROW } from '../app/lib/totals-map'

const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : ''
class Unavailable extends Error {}
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

// Execute the real route setup against read-only ports, including async fencing.
function setupPage(legacy = false) {
  const route = reactive({ params: { id: legacy ? 'p1' : 'c1', projectId: 'p1' }, query: { compare: ['one', 'two'] }, hash: '#context', fullPath: '/original' })
  const projects = reactive<Record<string, { id: string, client: string, name: string }>>({
    p1: { id: 'p1', client: 'c1', name: 'First' }, p2: { id: 'p2', client: 'c2', name: 'Second' },
    unassigned: { id: 'unassigned', client: 'protectedclient', name: 'Unassigned' },
  })
  const clients = reactive<Record<string, { id: string }>>({ c1: { id: 'c1' }, c2: { id: 'c2' }, protectedclient: { id: 'protectedclient' } })
  const ensureProjects = vi.fn().mockResolvedValue(undefined)
  const ensureClients = vi.fn().mockResolvedValue(undefined)
  const response = { total: { ...ZERO_TOTALS_ROW, workMs: 12 }, groups: [], totalPages: 1, totalGroups: 0 }
  const fetchRangeTotals = vi.fn().mockResolvedValue(response)
  const fetchTotals = vi.fn().mockResolvedValue(response)
  const fetchRange = vi.fn().mockResolvedValue({ entries: [], truncated: false })
  const tasks = reactive([{ id: 't1', title: 'First task', status: 'open', project: 'p1' }, { id: 't2', title: '', status: 'done', project: 'p1' }])
  const getList = vi.fn().mockResolvedValue({ items: [] })
  const navigateTo = vi.fn().mockResolvedValue(undefined)
  let unmount = () => {}
  const bindings = {
    computed, reactive, ref, watch: () => {}, onMounted: () => {}, onBeforeUnmount: (fn: () => void) => { unmount = fn },
    useRoute: () => route, useI18n: () => ({ t: (key: string) => key }), useHead: () => {}, useFormatters: () => ({}),
    useNuxtApp: () => ({ $pb: { collection: () => ({ getList }) } }),
    useProjects: () => ({ byId: (id: string) => projects[id], ensureLoaded: ensureProjects }),
    useClients: () => ({ byId: (id: string) => clients[id], ensureLoaded: ensureClients }),
    useTasks: () => ({ byProject: () => tasks, ensureLoaded: vi.fn().mockResolvedValue(undefined) }),
    useTaskEntries: () => ({ fetchRange }), useTotals: () => ({ fetchRangeTotals, fetchTotals }),
    definePageMeta: () => {}, navigateTo,
    rankTasks: rankProjects, taskRemainder: projectRemainder, TASK_OTHERS_KEY: PROJECT_OTHERS_KEY,
    sumTaskEntries, buildLocalDayBoundaries, utcInstantToLocalDay,
    computeAverageCost, resolvePreset, computeAverageCostFromTotal, TotalsRouteUnavailableError: Unavailable,
  }
  const source = read(legacy ? 'app/pages/projects/[id].vue' : 'app/pages/organizacion/clientes/[id]/proyectos/[projectId]/index.vue')
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const result = legacy ? '{ load: resolveProject, loading, error }' : '{ load, loading, error, validOwner, totals, trendPoints, metric, loadChart, chartError, chartPartial, chartCostUnknown, seriesKeys, seriesLabels, taskTotals, cardsReady }'
  const page = new Function(...Object.keys(bindings), `${code}; return ${result}`)(...Object.values(bindings))
  return { page, route, projects, clients, ensureProjects, ensureClients, fetchRangeTotals, fetchTotals, fetchRange, getList, navigateTo, unmount: () => unmount() }
}

describe('project route controllers', () => {
  it.each(['missing project', 'missing client', 'wrong owner'])('does not read analytics for %s', async state => {
    const h = setupPage()
    if (state === 'missing project') h.route.params.projectId = 'missing'
    if (state === 'missing client') h.route.params.id = 'missing'
    if (state === 'wrong owner') h.route.params.id = 'c2'
    await h.page.load()
    expect(h.page.validOwner.value).toBe(false)
    expect(h.page.loading.value).toBe(false)
    expect(h.fetchRangeTotals).not.toHaveBeenCalled()
    expect(h.getList).not.toHaveBeenCalled()
  })
  it('holds loading until catalogs settle and exposes denied catalogs', async () => {
    const h = setupPage()
    const pending = deferred<void>()
    h.ensureProjects.mockReturnValue(pending.promise)
    const load = h.page.load()
    expect(h.page.loading.value).toBe(true)
    expect(h.fetchRangeTotals).not.toHaveBeenCalled()
    pending.reject(new Error('Denied'))
    await load
    expect(h.page.error.value).toBe(true)
    expect(h.page.loading.value).toBe(false)
  })
  it('supports the real protected unassigned client ID', async () => {
    const h = setupPage()
    h.route.params.id = 'protectedclient'
    h.route.params.projectId = 'unassigned'
    await h.page.load()
    expect(h.page.validOwner.value).toBe(true)
    expect(h.fetchRangeTotals).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ filters: { project: 'unassigned', client: 'protectedclient' } }))
  })
  it('does not let a late old project overwrite the new project metrics', async () => {
    const h = setupPage()
    const pending = deferred<any>()
    h.fetchRangeTotals.mockImplementation((_range, options) => options.filters.project === 'p1' ? pending.promise : Promise.resolve({ total: { ...ZERO_TOTALS_ROW, workMs: 99 }, groups: [], totalPages: 1, totalGroups: 0 }))
    const old = h.page.load()
    await vi.waitFor(() => expect(h.fetchRangeTotals).toHaveBeenCalled())
    h.route.params.id = 'c2'
    h.route.params.projectId = 'p2'
    await h.page.load()
    pending.resolve({ total: { ...ZERO_TOTALS_ROW, workMs: 1 }, groups: [], totalPages: 1, totalGroups: 0 })
    await old
    expect(h.page.totals.value.workMs).toBe(99)
    expect(h.page.error.value).toBe(false)
  })
  it('clears old metrics and prevents publication after unmount', async () => {
    const h = setupPage()
    await h.page.load()
    const pending = deferred<any>()
    h.fetchRangeTotals.mockReturnValue(pending.promise)
    const load = h.page.load()
    expect(h.page.totals.value.workMs).toBe(0)
    await vi.waitFor(() => expect(h.fetchRangeTotals).toHaveBeenCalledTimes(3))
    h.unmount()
    pending.resolve({ total: { ...ZERO_TOTALS_ROW, workMs: 999 }, groups: [], totalPages: 1, totalGroups: 0 })
    await load
    expect(h.page.totals.value.workMs).toBe(0)
  })
  it('does not hide a denied read behind a simultaneous unavailable totals route', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockRejectedValue(new Unavailable())
    h.fetchTotals.mockRejectedValue(new Error('Denied'))
    await h.page.load()
    expect(h.page.error.value).toBe(true)
    expect(h.fetchRange).not.toHaveBeenCalled()
  })
  it('retains the bounded consolidated-entry fallback for an unavailable route', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockRejectedValue(new Unavailable())
    await h.page.load()
    expect(h.fetchRange).toHaveBeenCalledWith(expect.anything(), { project: 'p1', client: 'c1' })
    expect(h.page.error.value).toBe(false)
  })
  it('redirects to the actual owner with repeated query and hash intact', async () => {
    const h = setupPage(true)
    await h.page.load()
    expect(h.navigateTo).toHaveBeenCalledWith({ path: '/organizacion/clientes/c1/proyectos/p1', query: { compare: ['one', 'two'] }, hash: '#context' }, { replace: true })
    h.route.params.id = 'unassigned'
    await h.page.load()
    expect(h.navigateTo).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/organizacion/clientes/protectedclient/proyectos/unassigned' }), { replace: true })
  })
  it.each(['missing', 'owner missing', 'denied'])('never redirects a %s legacy relation', async state => {
    const h = setupPage(true)
    if (state === 'missing') h.route.params.id = 'missing'
    if (state === 'owner missing') delete h.clients.c1
    if (state === 'denied') h.ensureProjects.mockRejectedValue(new Error('Denied'))
    await h.page.load()
    expect(h.navigateTo).not.toHaveBeenCalled()
    expect(h.page.loading.value).toBe(false)
    expect(h.page.error.value).toBe(state === 'denied')
  })
  it('fences a stale legacy lookup and unmounted redirect', async () => {
    const h = setupPage(true)
    const pending = deferred<void>()
    h.ensureProjects.mockReturnValueOnce(pending.promise)
    const old = h.page.load()
    h.route.params.id = 'p2'
    await h.page.load()
    pending.resolve()
    await old
    expect(h.navigateTo).toHaveBeenCalledTimes(1)
    expect(h.navigateTo).toHaveBeenCalledWith(expect.objectContaining({ path: '/organizacion/clientes/c2/proyectos/p2' }), { replace: true })
    h.ensureProjects.mockReturnValue(pending.promise)
    const next = h.page.load()
    h.unmount()
    await next
    expect(h.navigateTo).toHaveBeenCalledTimes(1)
  })
})

describe('Organization project child routing', () => {
  it('separates the parent outlet, index tabs and detail page', () => {
    const parent = read('app/pages/organizacion.vue')
    expect(parent).toContain('<NuxtPage />')
    expect(parent).not.toContain('ClientsPage')
    expect(read('app/pages/organizacion/index.vue')).toContain('<OrganizationCatalogTabs />')
    expect(read('app/pages/organizacion/clientes/[id].vue')).toContain('<NuxtPage />')
    expect(read('app/pages/organizacion/clientes/[id]/index.vue')).toContain('detailClient')
    const detail = read('app/pages/organizacion/clientes/[id]/proyectos/[projectId]/index.vue')
    expect(detail).toContain('route.params.projectId')
    expect(detail).toContain('project.value.client === clientId.value')
    expect(detail).toContain('navigateTo(`/organizacion/clientes/${clientId}`)')
    expect(detail).toContain('await Promise.all([ensureProjects(), ensureClients(), ensureTasks()])')
    expect(detail).toContain('onMounted(load)')
    expect(detail).toContain('fetchRangeTotals(range, { groupBy: \'none\', filters })')
    expect(detail).toContain(':to="`/organizacion/clientes/${clientId}/proyectos/${projectId}/tareas/${task.id}`"')
  })

  it('redirects legacy details without losing query or hash', () => {
    const legacy = read('app/pages/projects/[id].vue')
    expect(legacy).toContain('definePageMeta')
    expect(legacy).toContain('ensureProjects()')
    expect(legacy).toContain('path: `/organizacion/clientes/${project.client}/proyectos/${project.id}`')
    expect(legacy).toContain('query: route.query')
    expect(legacy).toContain('hash: route.hash')
    expect(read('app/pages/organizacion/proyectos/[id].vue')).toBe(legacy)
    expect(legacy).toContain('replace: true')
    expect(legacy).not.toContain('fetchRangeTotals')
  })

  it('localizes missing projects in every supported locale', () => {
    for (const locale of ['en', 'es', 'ja']) {
      expect(JSON.parse(read(`i18n/locales/${locale}.json`)).projects.detail.notFound).toBeTruthy()
    }
  })

  it('uses canonical project results while leaving other catalog results intact', () => {
    const palette = read('app/components/app-shell/CommandPalette.vue')
    expect(palette).toContain('to: `/organizacion/clientes/${p.client}/proyectos/${p.id}`')
    expect(palette).toContain('to: `/organizacion/clientes/${c.id}`')
    expect(palette).toContain('to: taskDetailRoute(t2, projects.value)')
    const projects = read('app/pages/projects/index.vue')
    expect(projects).toContain('navigateTo(`/organizacion/clientes/${p.client}/proyectos/${p.id}`)')
    expect(projects).toContain(':to="`/organizacion/clientes/${p.client}/proyectos/${p.id}`"')
    expect(read('app/components/entries/EntryDetailSheet.vue')).toContain('`/organizacion/clientes/${entry.expand.project.client}/proyectos/${projectRelation.id}`')
  })
})
