import { formatCost, formatDuration } from '../app/lib/format'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, defineComponent } from 'vue'
import * as Vue from 'vue'
import { compileTemplate } from 'vue/compiler-sfc'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { rankProjects, projectRemainder, PROJECT_OTHERS_KEY } from '../app/lib/project-chart'
import { sumTaskEntries } from '../app/lib/aggregate'
import { buildLocalDayBoundaries, utcInstantToLocalDay } from '../app/lib/local-day'
import { computeAverageCost } from '../app/lib/measurement-quality'
import { resolvePreset } from '../app/lib/period'
import { computeAverageCostFromTotal } from '../app/lib/totals-map'
import { ZERO_TOTALS_ROW } from '../app/lib/totals-map'

const source = readFileSync('app/pages/organizacion/clientes/[id]/proyectos/[projectId]/index.vue', 'utf8')
class Unavailable extends Error {}
// Run the actual SFC setup against read-only ports, not a copied controller.
function setupPage() {
  const route = reactive({ params: { id: 'c1', projectId: 'p1' } })
  const fetchRangeTotals = vi.fn().mockResolvedValue(response())
  const fetchTotals = vi.fn().mockResolvedValue(response())
  const fetchRange = vi.fn().mockResolvedValue({ entries: [], truncated: false })
  const getList = vi.fn()
  const countSessions = vi.fn().mockResolvedValue({ t1: 3 })
  let unmount = () => {}
  const bindings = {
    computed, reactive, ref, watch: () => {}, onMounted: () => {}, onBeforeUnmount: (fn: () => void) => { unmount = fn },
    loadTaskSessionCounts: countSessions,
    useNuxtApp: () => ({ $pb: { collection: () => ({ getList }) } }),
    useRoute: () => route, useI18n: () => ({ t: (key: string) => key }), useHead: () => {}, useFormatters: () => ({ formatCost, formatDuration }),
    useProjects: () => ({ byId: () => ({ id: 'p1', client: 'c1', name: 'Project' }), ensureLoaded: async () => {} }),
    useClients: () => ({ byId: () => ({ id: 'c1' }), ensureLoaded: async () => {} }),
    useTasks: () => ({ byProject: () => [{ id: 't1', title: 'First task', status: 'open' }, { id: 't2', title: '', status: 'done' }], ensureLoaded: async () => {} }),
    useTaskEntries: () => ({ fetchRange }), useTotals: () => ({ fetchRangeTotals, fetchTotals }),
    rankTasks: rankProjects, taskRemainder: projectRemainder, TASK_OTHERS_KEY: PROJECT_OTHERS_KEY,
    sumTaskEntries, buildLocalDayBoundaries, utcInstantToLocalDay, computeAverageCost, resolvePreset,
    computeAverageCostFromTotal, TotalsRouteUnavailableError: Unavailable,
  }
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const card = source.slice(source.indexOf('<article v-for="task'))
  const expressions = [...card.matchAll(/<dd[^>]*>\{\{ ([\s\S]*?) \}\}<\/dd>/g)].map(match => match[1]!.replace(/\bcardsReady\b/g, 'cardsReady.value').replace(/\btaskTotals\b/g, 'taskTotals.value'))
  const page = new Function(...Object.keys(bindings), `${code}; return { load, metric, loadChart, seriesKeys, seriesLabels, trendPoints, chartError, chartPartial, chartCostUnknown, taskTotals, cardsReady, error,
    cardWork: (task) => (${expressions[0]}), cardCost: (task) => (${expressions[1]}),
    sessions: typeof sessionCounts === 'undefined' ? undefined : sessionCounts,
    sessionLabel: typeof taskSessions === 'undefined' ? undefined : taskSessions }`)(...Object.values(bindings))
  return { page, route, fetchRangeTotals, fetchTotals, fetchRange, getList, countSessions, unmount: () => unmount() }
}
const row = (groupKey: string, workMs = 0, cost = 0) => ({ ...ZERO_TOTALS_ROW, groupKey, workMs, cost })
const response = (groups: ReturnType<typeof row>[] = []) => ({ total: { ...ZERO_TOTALS_ROW, count: 1 }, groups, totalPages: 1, totalGroups: groups.length })

describe('project task-card status presentation', () => {
  it.each([['doing', 'success'], ['open', 'outline'], ['done', 'outline']])('renders %s with %s without changing its label or wrapping', (status, expected) => {
    // Execute the actual card Badge template, not a copied status conditional.
    const card = source.slice(source.indexOf('<article v-for="task'), source.indexOf('</article>'))
    const badge = card.match(/<Badge\b[\s\S]*?<\/Badge>/)![0]
    const compiled = compileTemplate({ source: badge, filename: 'project-card-status', id: 'status' })
    expect(compiled.errors).toEqual([])
    const exports: any = {}
    new Function('require', 'exports', ts.transpile(compiled.code, { module: ts.ModuleKind.CommonJS }))(() => Vue, exports)
    const wrapper = mount(defineComponent({ render: exports.render, data: () => ({ task: { status }, t: (key: string) => key }) }), {
      global: { components: { Badge: defineComponent({ props: ['variant'], template: '<span :data-variant="variant"><slot /></span>' }) } },
    })
    expect(wrapper.attributes('data-variant')).toBe(expected)
    expect(wrapper.text()).toBe(`tasks.status.${status}`)
    expect(wrapper.classes()).toContain('whitespace-normal')
    wrapper.unmount()
  })
})

describe('project task analytics and read-only cards', () => {
  it('shows independently loaded total sessions, not period entries', async () => {
    const h = setupPage()
    await h.page.load()
    expect(source).toContain("t('projects.detail.totalSessions')")
    expect(h.countSessions).toHaveBeenCalledWith({ client: 'c1', project: 'p1' }, expect.anything())
    await vi.waitFor(() => expect(h.page.sessions?.value).toEqual({ t1: 3 }))
    expect(h.page.sessionLabel('t1')).toBe('3')
    expect(h.page.sessionLabel('t2')).toBe('0')
    expect(h.page.cardCost({ id: 't2' })).toBe('$0.00')
    h.page.metric.value = 'cost'
    await h.page.loadChart()
    expect(h.countSessions).toHaveBeenCalledTimes(1)
  })
  it('does not read session counts before client/project ownership is validated', async () => {
    const h = setupPage()
    h.route.params.id = 'another-client'
    await h.page.load()
    expect(h.countSessions).not.toHaveBeenCalled()
    expect(h.page.sessions.value).toBeNull()
  })
  it('keeps failed session reads unavailable without losing valid work cards', async () => {
    const h = setupPage()
    h.countSessions.mockRejectedValue(new Error('Denied'))
    await h.page.load()
    expect(h.page.sessionLabel?.('t1')).toBe('projects.detail.metricsUnavailable')
    expect(h.page.error.value).toBe(false)
    expect(h.page.cardsReady.value).toBe(true)
  })
  it.each(['route change', 'unmount'])('fences delayed counts after %s', async state => {
    const h = setupPage()
    let release!: (value: unknown) => void
    h.countSessions.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    await h.page.load()
    expect(h.page.sessionLabel?.('t1')).toBe('common.loading')
    if (state === 'unmount') h.unmount()
    else {
      h.route.params.projectId = 'p2'
      h.countSessions.mockResolvedValue({ t1: 8 })
      await h.page.load()
    }
    release({ t1: 99 })
    await Promise.resolve()
    await Promise.resolve()
    expect(h.page.sessions?.value?.t1).not.toBe(99)
  })
  it('places all-time member cards after Tasks without changing the 30-day task metrics', () => {
    expect(source.indexOf('</section>\n      <ProjectMembers')).toBeGreaterThan(source.indexOf("t('projects.detail.tasksTitle')"))
    expect(source).toContain('<ProjectMembers :client-id="clientId" :project-id="projectId" />')
    expect(source).toContain('lg:grid-cols-3')
    expect(source).toContain("t('projects.detail.totalSessions')")
    expect(source).toContain("import ProjectMembers from '@/components/projects/ProjectMembers.vue'")
  })
  it('removes obsolete panels and reads, replacing the table with cards and a metric control', () => {
    for (const old of ['topPrompts', 'byModel', "groupBy: 'model'", '<Table', "t('projects.detail.trend')"]) expect(source).not.toContain(old)
    expect(source).toContain('data-testid="task-card"')
    expect(source).toContain('v-model="metric"')
    expect(source).toContain('range.start')
    expect(source).toContain('range.end')
    expect(source).not.toContain('useTaskEditor')
    const card = source.slice(source.indexOf('<article v-for="task'), source.indexOf('</article>'))
    expect(card).not.toContain('project.name')
    expect(card).toContain('taskName(task.id)')
    expect(source).toContain('{{ project.name }}</h1>')
  })
  it('defaults to work, ranks at most five with stable ties, and scopes every request', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockImplementation((_range, options) => Promise.resolve(response(options.groupBy === 'task' ? ['f', 'e', 'd', 'c', 'b', 'a'].map(id => row(id, 10, 1)) : [])))
    h.fetchTotals.mockResolvedValue(response([row('0', 60, 6)]))
    // Selected tasks each contribute ten, leaving ten for Others.
    h.fetchTotals.mockImplementation(options => Promise.resolve(response([row('0', options.filters.task ? 10 : 60, options.filters.task ? 1 : 6)])))
    await h.page.load()
    expect(h.page.metric.value).toBe('work')
    expect(h.page.seriesKeys.value.slice(0, 5)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(h.page.trendPoints.value).toHaveLength(30)
    expect(Object.values(h.page.trendPoints.value[1].values)).toEqual([0, 0, 0, 0, 0, 0])
    expect(h.fetchTotals.mock.calls.filter(([o]) => o.filters.task)).toHaveLength(5)
    for (const [, options] of h.fetchRangeTotals.mock.calls) expect(options.filters).toEqual({ client: 'c1', project: 'p1' })
    expect(h.getList).not.toHaveBeenCalled()
    expect(h.page.seriesLabels.value.a).not.toBe('a')
  })
  it('does not present incomplete ranking as complete cards or top five', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockImplementation((_range, options) => Promise.resolve({ ...response(), totalPages: options.groupBy === 'task' ? 2 : 1 }))
    h.fetchRange.mockResolvedValue({ entries: [], truncated: true })
    await h.page.load()
    expect(h.page.chartPartial.value).toBe(true)
    expect(h.page.cardsReady.value).toBe(false)
    expect(h.page.trendPoints.value).toEqual([])
  })
  it('distinguishes complete empty activity from missing metrics', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockResolvedValue(response())
    await h.page.load()
    expect(h.page.cardsReady.value).toBe(true)
    expect(h.page.taskTotals.value).toEqual({})
  })
  it('exposes chart denied/network errors without discarding the catalog or inventing zero cards', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockImplementation((_range, o) => o.groupBy === 'task' ? Promise.reject(new Error('Denied')) : Promise.resolve(response()))
    await h.page.load()
    expect(h.page.chartError.value).toBe(true)
    expect(h.page.cardsReady.value).toBe(false)
    expect(h.page.error.value).toBe(false)
    expect(h.fetchRange).not.toHaveBeenCalled()
  })
  it('fences old metric requests', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockResolvedValue(response([row('t1', 10, 2)]))
    h.fetchTotals.mockResolvedValue(response([row('0', 10, 2)]))
    await h.page.load()
    let release!: (value: unknown) => void
    h.fetchRangeTotals.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    const old = h.page.loadChart()
    h.page.metric.value = 'cost'
    await h.page.loadChart()
    release(response([row('old', 99)]))
    await old
    expect(h.page.seriesKeys.value).not.toContain('old')
  })
  it('reuses one complete consolidated fallback and zero-fills local days', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockRejectedValue(new Unavailable())
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    h.fetchRange.mockResolvedValue({ truncated: false, entries: [
      { task: 't1', project: 'p1', client: 'c1', started_at: today.toISOString(), work_ms: 20, cost: 3, cost_quality: 'estimated' },
      { task: '', project: 'p1', client: 'c1', started_at: today.toISOString(), work_ms: 10, cost: 0, cost_quality: 'unknown' },
    ] })
    await h.page.load()
    expect(h.page.trendPoints.value).toHaveLength(30)
    expect(h.page.taskTotals.value.t1.workMs).toBe(20)
    expect(Object.values(h.page.trendPoints.value.at(-1).values)).toEqual([20, 10])
    h.page.metric.value = 'cost'
    await h.page.loadChart()
    expect(h.fetchRange).toHaveBeenCalledTimes(1)
    expect(h.page.chartCostUnknown.value).toBe(true)
    expect(h.page.cardsReady.value).toBe(true)
  })
  it('does not hide denied per-task days behind another task route 404', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockResolvedValue(response([row('t1', 10), row('t2', 10)]))
    h.fetchTotals.mockImplementation(o => o.filters.task === 't1' ? Promise.reject(new Unavailable())
      : o.filters.task === 't2' ? Promise.reject(new Error('Network')) : Promise.resolve(response([row('0', 20)])))
    await h.page.load()
    expect(h.page.chartError.value).toBe(true)
    expect(h.fetchRange).not.toHaveBeenCalled()
    expect(h.page.cardsReady.value).toBe(false)
  })
  it('reports a failed capped-ranking fallback rather than inventing totals', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockResolvedValue({ ...response(), totalPages: 2 })
    h.fetchRange.mockRejectedValue(new Error('Network'))
    await h.page.load()
    expect(h.page.chartError.value).toBe(true)
    expect(h.page.cardsReady.value).toBe(false)
  })
  it.each([NaN, Infinity, -Infinity, undefined, null, -1])('renders API task cost %s unavailable while retaining valid work', async cost => {
    const h = setupPage()
    h.fetchRangeTotals.mockResolvedValue(response([{ ...row('t1', 10), cost: cost as number }, row('t2', 0, 0)]))
    h.fetchTotals.mockImplementation(o => Promise.resolve(response([row('0', o.filters.task === 't2' ? 0 : 10, 0)])))
    await h.page.load()
    expect(h.page.cardCost({ id: 't1' })).toBe('projects.detail.metricsUnavailable')
    expect(h.page.cardCost({ id: 't2' })).toBe('$0.00')
    expect(h.page.cardWork({ id: 't1' })).toBe(formatDuration(10))
    expect(h.page.chartError.value).toBe(false)
    expect(h.page.trendPoints.value).toHaveLength(30)
    h.page.metric.value = 'cost'
    await h.page.loadChart()
    expect(h.page.chartPartial.value).toBe(true)
    expect(h.page.trendPoints.value).toEqual([])
    expect(h.page.cardWork({ id: 't1' })).toBe(formatDuration(10))
  })
  it.each([
    { costs: [NaN] }, { costs: [Infinity] }, { costs: [undefined] }, { costs: [-1] },
    { costs: [Number.MAX_VALUE, Number.MAX_VALUE] }, { costs: [-1, 1] },
  ])('rejects malformed or overflowing fallback costs $costs without blocking work', async ({ costs }) => {
    const h = setupPage()
    h.fetchRangeTotals.mockRejectedValue(new Unavailable())
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    h.fetchRange.mockResolvedValue({ truncated: false, entries: [
      ...costs.map(cost => ({ task: 't1', started_at: today.toISOString(), work_ms: 10, cost, cost_quality: 'estimated' })),
      { task: 't2', started_at: today.toISOString(), work_ms: 5, cost: 0, cost_quality: 'measured' },
    ] })
    await h.page.load()
    expect(h.page.cardCost({ id: 't1' })).toBe('projects.detail.metricsUnavailable')
    expect(h.page.cardCost({ id: 't2' })).toBe('$0.00')
    expect(h.page.cardWork({ id: 't1' })).toBe(formatDuration(costs.length * 10))
    expect(h.page.trendPoints.value).toHaveLength(30)
    h.page.metric.value = 'cost'
    await h.page.loadChart()
    expect(h.page.chartPartial.value).toBe(true)
    expect(h.page.trendPoints.value).toEqual([])
    expect(h.page.cardWork({ id: 't1' })).toBe(formatDuration(costs.length * 10))
    expect(h.fetchRange).toHaveBeenCalledTimes(1)
  })
  it.each(['invalid daily', 'daily overflow'])('retains work and suppresses unusable cost chart for %s with valid ranking', async state => {
    const h = setupPage()
    h.fetchRangeTotals.mockResolvedValue(response([row('t1', 10, 1), row('t2', 10, 1)]))
    h.fetchTotals.mockImplementation(o => Promise.resolve(response([
      row('0', o.filters.task ? 10 : 20, state === 'invalid daily' ? NaN : Number.MAX_VALUE),
    ])))
    await h.page.load()
    expect(h.page.chartError.value).toBe(false)
    expect(h.page.trendPoints.value).toHaveLength(30)
    expect(h.page.cardWork({ id: 't1' })).toBe(formatDuration(10))
    expect(h.page.cardCost({ id: 't1' })).toBe('$1.00')
    h.page.metric.value = 'cost'
    await h.page.loadChart()
    expect(h.page.chartPartial.value).toBe(true)
    expect(h.page.trendPoints.value).toEqual([])
    expect(h.page.cardWork({ id: 't1' })).toBe(formatDuration(10))
    expect(h.page.cardCost({ id: 't1' })).toBe('$1.00')
    h.page.metric.value = 'work'
    await h.page.loadChart()
    expect(h.page.trendPoints.value).toHaveLength(30)
    expect(h.page.chartPartial.value).toBe(false)
    for (const [options] of h.fetchTotals.mock.calls) {
      expect(options.filters.client).toBe('c1')
      expect(options.filters.project).toBe('p1')
    }
  })
  it('retains true zero and numeric estimates without changing quality semantics', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockResolvedValue(response([row('t1', 10, 0), { ...row('t2', 5, 2), costEstimatedEntries: 1 }]))
    h.fetchTotals.mockImplementation(o => Promise.resolve(response([row('0', o.filters.task === 't1' ? 10 : o.filters.task === 't2' ? 5 : 15, o.filters.task === 't1' ? 0 : 2)])))
    await h.page.load()
    expect(h.page.cardCost({ id: 't1' })).toBe('$0.00')
    expect(h.page.cardCost({ id: 't2' })).toBe('$2.00')
    h.page.metric.value = 'cost'
    await h.page.loadChart()
    expect(h.page.chartPartial.value).toBe(false)
    expect(h.page.chartError.value).toBe(false)
    expect(h.page.trendPoints.value).toHaveLength(30)
  })
  it('keeps work usable with unknown and estimated costs and warns on cost', async () => {
    const h = setupPage()
    h.fetchRangeTotals.mockResolvedValue(response([row('t1', 10, 2)]))
    h.fetchTotals.mockResolvedValue(response([{ ...row('0', 10, 2), costUnknownEntries: 1 }]))
    await h.page.load()
    expect(h.page.chartCostUnknown.value).toBe(false)
    h.page.metric.value = 'cost'
    await h.page.loadChart()
    expect(h.page.chartCostUnknown.value).toBe(true)
  })
})
