import { existsSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'
import ts from 'typescript'
import { groupByProject, sumTaskEntries } from '../app/lib/aggregate'
import { buildLocalDayBoundaries, utcInstantToLocalDay } from '../app/lib/local-day'
import { computeAverageCost } from '../app/lib/measurement-quality'
import { resolvePreset } from '../app/lib/period'
import { PROJECT_OTHERS_KEY, projectRemainder, rankProjects } from '../app/lib/project-chart'
import { computeAverageCostFromTotal, totalsByGroupKey, ZERO_TOTALS_ROW } from '../app/lib/totals-map'
import { resolveBreadcrumbLabels } from '../app/lib/nav-items'

const read = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : ''
class Unavailable extends Error {}

// Execute the actual SFC setup with mocked read ports and real shared helpers.
function setup(timeZone?: string) {
  const route = reactive({ params: { id: 'client' } })
  const ensureLoaded = vi.fn().mockResolvedValue(undefined)
  const ensureProjects = vi.fn().mockResolvedValue(undefined)
  const fetchRangeTotals = vi.fn().mockResolvedValue({ total: { ...ZERO_TOTALS_ROW }, groups: [], totalPages: 1 })
  const fetchTotals = vi.fn().mockResolvedValue({ groups: [] })
  const fetchRange = vi.fn().mockResolvedValue({ entries: [], truncated: false })
  const bindings = {
    ref, computed, useRoute: () => route, useHead: () => {}, onMounted: () => {}, watch: () => {}, onBeforeUnmount: () => {},
    useClientEditor: () => ({ close: vi.fn(), saving: ref(false), archiving: ref(false) }),
    useI18n: () => ({ t: (key: string) => key }), useFormatters: () => ({}),
    useClients: () => ({ ensureLoaded, byId: (id: string) => id === 'missing' ? undefined : { id, name: 'Client One' }, refreshFavicon: vi.fn() }),
    useProjects: () => ({ ensureLoaded: ensureProjects, byClient: () => [{ id: 'p1', name: 'Project One' }] }),
    useTaskEntries: () => ({ fetchRange }), useTotals: () => ({ fetchRangeTotals, fetchTotals }),
    useAuth: () => ({ isOwner: false }), useToast: () => ({}),
    resolvePreset, sumTaskEntries, groupByProject, totalsByGroupKey, PROJECT_OTHERS_KEY, projectRemainder, rankProjects,
    buildLocalDayBoundaries: (range: { start: string, end: string }) => buildLocalDayBoundaries(range, timeZone),
    utcInstantToLocalDay: (instant: string) => utcInstantToLocalDay(instant, timeZone),
    computeAverageCost, computeAverageCostFromTotal, TotalsRouteUnavailableError: Unavailable,
  }
  const script = read('app/pages/organizacion/clientes/[id]/index.vue').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const page = new Function(...Object.keys(bindings), `${code}; return { load, loading, error, totals, averageCost, trendPoints, truncated, truncatedEntryCount, totalsByProject, projectsTruncated, projectsTruncatedEntryCount, metric, seriesKeys, seriesLabels, chartPartial, chartError, chartLoading, chartCostUnknown, projectCostShare, costShareLabel, cardClientCost, cardProjectCosts, cardCostsReady, reloadChart: () => reloadChart?.() }`)(...Object.values(bindings))
  return { page, route, ensureLoaded, ensureProjects, fetchRangeTotals, fetchTotals, fetchRange }
}
afterEach(() => vi.useRealTimers())

describe('client analytics', () => {
  it('ranks at most five chart-window projects deterministically and adds only the remainder', async () => {
    const h = setup()
    const rows = ['f', 'e', 'd', 'c', 'b', 'a'].map(groupKey => ({ groupKey, workMs: 10, cost: 1 }))
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total: { ...ZERO_TOTALS_ROW, count: 6 }, groups: opts.groupBy === 'project' ? rows : [], totalPages: 1 }))
    h.fetchTotals.mockImplementation(async req => ({ groups: [{ groupKey: '0', workMs: req.filters.project ? 10 : 60, cost: req.filters.project ? 1 : 6 }] }))
    await h.page.load()
    expect(Object.keys(h.page.trendPoints.value[0].values)).toEqual(['a', 'b', 'c', 'd', 'e', PROJECT_OTHERS_KEY])
    expect(h.page.trendPoints.value[0].values).toEqual({ a: 10, b: 10, c: 10, d: 10, e: 10, [PROJECT_OTHERS_KEY]: 10 })
    const selected = h.fetchTotals.mock.calls.filter(([req]) => req.filters.project)
    expect(selected).toHaveLength(5)
    expect(selected.every(([req]) => req.filters.client === 'client')).toBe(true)
  })
  it('defaults to work by project and labels catalog projects in ranked color order', async () => {
    const h = setup()
    expect(h.page.metric.value).toBe('work')
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total: { ...ZERO_TOTALS_ROW, count: 1 }, groups: opts.groupBy === 'project' ? [{ groupKey: 'p1', workMs: 10, cost: 2 }] : [], totalPages: 1 }))
    h.fetchTotals.mockResolvedValue({ groups: [{ groupKey: '0', workMs: 10, cost: 2 }] })
    await h.page.load()
    expect(h.page.seriesKeys.value).toEqual(['p1'])
    expect(h.page.seriesLabels.value).toEqual({ p1: 'Project One' })
    expect(h.fetchRangeTotals).toHaveBeenCalledWith({ start: resolvePreset('30d').start, end: resolvePreset('today').end }, { groupBy: 'project', filters: { client: 'client' }, perPage: 200 })
    const requests = h.fetchTotals.mock.calls.map(([req]) => req)
    expect(requests.every(req => req.dayBoundaries === requests[0].dayBoundaries)).toBe(true)
    expect(h.page.trendPoints.value.slice(1).every((point: any) => point.values.p1 === 0)).toBe(true)
  })

  it('changes metric ranking while retaining project series without new card reads', async () => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total: { ...ZERO_TOTALS_ROW, count: 2 }, totalPages: 1, groups: opts.groupBy === 'project' ? [{ groupKey: 'p1', workMs: 20, cost: 1 }, { groupKey: 'p2', workMs: 10, cost: 4 }] : [] }))
    h.fetchTotals.mockImplementation(async req => ({ groups: [{ groupKey: '0', workMs: req.filters.project === 'p1' ? 20 : req.filters.project === 'p2' ? 10 : 30, cost: req.filters.project === 'p1' ? 1 : req.filters.project === 'p2' ? 4 : 5, costUnknownEntries: 1 }] }))
    await h.page.load()
    expect(h.page.seriesKeys.value).toEqual(['p1', 'p2'])
    h.page.metric.value = 'cost'
    await h.page.reloadChart()
    expect(h.page.seriesKeys.value).toEqual(['p2', 'p1'])
    expect(h.page.trendPoints.value[0].values).toEqual({ p2: 4, p1: 1 })
    expect(h.page.chartCostUnknown.value).toBe(true)
    const count = h.fetchRange.mock.calls.length
    h.page.metric.value = 'work'
    await h.page.reloadChart()
    expect(h.page.seriesKeys.value).toEqual(['p1', 'p2'])
    expect(h.page.trendPoints.value[0].values).toEqual({ p1: 20, p2: 10 })
    expect(h.fetchRange).toHaveBeenCalledTimes(count)
  })

  it.each([[2, false], [2, true], [undefined, false], [undefined, true]])('uses a chart-range filtered bounded fallback for incomplete ranking (pages=%s, capped=%s)', async (pages, capped) => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total: { ...ZERO_TOTALS_ROW, count: 1 }, groups: [], totalPages: opts.groupBy === 'project' ? pages : 1 }))
    h.fetchRange.mockResolvedValue({ entries: [{ project: 'p1', started_at: `${resolvePreset('today').start}T12:00:00Z`, work_ms: 40, cost: 2 }], truncated: capped })
    await h.page.load()
    expect(h.fetchRange).toHaveBeenCalledWith({ start: resolvePreset('30d').start, end: resolvePreset('today').end }, { client: 'client' })
    expect(h.fetchTotals).toHaveBeenCalledOnce()
    expect(h.page.chartPartial.value).toBe(capped)
    expect(h.page.trendPoints.value.length > 0).toBe(!capped)
    expect(h.page.chartError.value).toBe(false)
  })

  it.each(['ranking', 'selected', 'fallback'])('does not disguise a denied %s chart read as empty or fallback success', async denied => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => {
      if (opts.groupBy === 'project' && denied === 'ranking') throw new Error('403')
      return { total: { ...ZERO_TOTALS_ROW, count: 1 }, groups: [{ groupKey: 'p1', workMs: 10, cost: 1 }], totalPages: denied === 'fallback' ? 2 : 1 }
    })
    h.fetchTotals.mockImplementation(async req => {
      if (req.filters.project) throw new Error('403')
      return { groups: [{ groupKey: '0', workMs: 10, cost: 1 }] }
    })
    h.fetchRange.mockRejectedValue(new Error('403'))
    await h.page.load()
    expect(h.page.chartError.value).toBe(true)
    expect(h.page.trendPoints.value).toEqual([])
    if (denied === 'selected') expect(h.fetchRange).toHaveBeenCalledWith({ start: resolvePreset('lastMonth').start, end: resolvePreset('today').end }, { client: 'client' })
    if (denied === 'ranking') expect(h.fetchRange).not.toHaveBeenCalled()
  })

  it.each([false, true])('rejects stale control ranking success/error (rejected=%s)', async rejected => {
    const h = setup()
    await h.page.load()
    let finish!: (value: any) => void
    let fail!: (err: Error) => void
    h.fetchRangeTotals.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject }))
    const old = h.page.reloadChart()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    h.page.metric.value = 'cost'
    h.fetchRangeTotals.mockResolvedValue({ total: { ...ZERO_TOTALS_ROW }, groups: [{ ...ZERO_TOTALS_ROW, groupKey: 'current', cost: 1 }], totalPages: 1 })
    await h.page.reloadChart()
    if (rejected) fail(new Error('403'))
    else finish({ groups: [{ groupKey: 'stale', workMs: 100, cost: 2 }], totalPages: 1 })
    await old
    expect(h.page.seriesKeys.value).toEqual(['current'])
    expect(h.page.chartError.value).toBe(false)
    expect(h.page.chartLoading.value).toBe(false)
  })

  it('reuses the bounded fallback cache across controls, with project-local DST days and quality warnings', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00Z'))
    const h = setup('America/New_York')
    h.fetchRangeTotals.mockRejectedValue(new Unavailable())
    h.fetchRange.mockResolvedValue({ entries: [
      { client: 'client', project: 'p1', started_at: '2026-03-09T03:30:00Z', work_ms: 100, cost: 4, cost_quality: 'unknown' },
      { client: 'client', project: '', started_at: '2026-03-09T03:30:00Z', work_ms: 40, cost: 2, cost_quality: 'measured' },
    ], truncated: false })
    await h.page.load()
    const count = h.fetchRange.mock.calls.length
    expect(h.page.seriesKeys.value).toEqual(['p1', PROJECT_OTHERS_KEY])
    expect(h.page.trendPoints.value.find((p: any) => p.day === '2026-03-08').values).toEqual({ p1: 100, [PROJECT_OTHERS_KEY]: 40 })
    expect(h.page.trendPoints.value.find((p: any) => p.day === '2026-03-09').values.p1).toBe(0)
    h.page.metric.value = 'cost'
    await h.page.reloadChart()
    expect(h.page.chartCostUnknown.value).toBe(true)
    expect(h.page.trendPoints.value.find((p: any) => p.day === '2026-03-08').values.p1).toBe(4)
    expect(h.fetchRange).toHaveBeenCalledTimes(count)
  })

  it('rejects inconsistent project totals instead of double-counting or clamping a material negative remainder', async () => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total: { ...ZERO_TOTALS_ROW, count: 1 }, groups: opts.groupBy === 'project' ? [{ groupKey: 'p1', workMs: 100, cost: 1 }] : [], totalPages: 1 }))
    h.fetchTotals.mockImplementation(async req => ({ groups: [{ groupKey: '0', workMs: req.filters.project ? 100 : 10, cost: 1 }] }))
    await h.page.load()
    expect(h.page.chartError.value).toBe(true)
    expect(h.page.trendPoints.value).toEqual([])
    expect(h.fetchRange).toHaveBeenCalledOnce()
  })

  it('does not hide selected-project denial behind a simultaneous unavailable response', async () => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total: { ...ZERO_TOTALS_ROW, count: 2 }, groups: opts.groupBy === 'project' ? ['p1', 'p2'].map(groupKey => ({ groupKey, workMs: 10, cost: 1 })) : [], totalPages: 1 }))
    h.fetchTotals.mockImplementation(async req => {
      if (req.filters.project === 'p1') throw new Unavailable()
      if (req.filters.project === 'p2') throw new Error('403')
      return { groups: [{ groupKey: '0', workMs: 20, cost: 2 }] }
    })
    await h.page.load()
    expect(h.page.chartError.value).toBe(true)
    expect(h.fetchRange).toHaveBeenCalledOnce()
  })

  it('ignores an old route selected-project response after the new chart settles', async () => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total: { ...ZERO_TOTALS_ROW, count: 1 }, groups: opts.groupBy === 'project' && opts.filters.client === 'client' ? [{ groupKey: 'p1', workMs: 10, cost: 1 }] : [], totalPages: 1 }))
    let finish!: (value: any) => void
    h.fetchTotals.mockImplementation(async req => req.filters.project ? new Promise(resolve => { finish = resolve }) : { groups: [{ groupKey: '0', workMs: 10, cost: 1 }] })
    const old = h.page.load()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    h.route.params.id = 'next'
    await h.page.load()
    const points = h.page.trendPoints.value
    finish({ groups: [{ groupKey: '0', workMs: 99, cost: 2 }] })
    await old
    expect(h.page.trendPoints.value).toBe(points)
    expect(h.page.chartError.value).toBe(false)
    expect(h.page.loading.value).toBe(false)
  })

  it('uses four KPIs and the local work/project panel without a Trend heading', () => {
    const page = read('app/pages/organizacion/clientes/[id]/index.vue')
    expect(page.match(/<KpiCard\b/g)).toHaveLength(4)
    expect(page).toContain('<StackedBarChart')
    expect(page).toContain('v-model="metric"')
    expect(page).not.toContain('v-model="stackBy"')
    expect(page).toContain("const metric = ref<'work' | 'cost'>('work')")
    expect(page).not.toContain('const stackBy')
    expect(page).toContain('data-testid="client-time-series"')
    expect(page).toContain("t('dashboard.noData')")
    expect(page).not.toContain("t('projects.detail.trend')")
    expect(page).toContain('grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6')
    expect(page).not.toContain('work_records')
  })

  it('filters overall and local-day reads by client and zero-fills the 30d-through-today window', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'))
    const h = setup()
    const total = { ...ZERO_TOTALS_ROW, workMs: 7_200_000, cost: 9, count: 3, entries: 3, costKnownEntries: 2, costKnownSum: 9, costUnknownEntries: 1 }
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total, groups: opts.groupBy === 'project' ? [{ groupKey: 'p1', workMs: 7_200_000, cost: 9 }] : [], totalPages: 1 }))
    h.fetchTotals.mockResolvedValue({ groups: [{ ...ZERO_TOTALS_ROW, groupKey: '1', workMs: 7_200_000, cost: 9 }] })
    await h.page.load()
    const range = { start: resolvePreset('30d').start, end: resolvePreset('today').end }
    const { boundaries, labels } = buildLocalDayBoundaries(range)
    expect(h.fetchRangeTotals).toHaveBeenCalledWith(range, { groupBy: 'none', filters: { client: 'client' } })
    expect(h.fetchTotals).toHaveBeenCalledWith({ groupBy: 'day', dayBoundaries: boundaries, filters: { client: 'client' }, perPage: boundaries.length })
    expect(h.page.totals.value).toMatchObject({ workMs: 7_200_000, cost: 9, count: 3 })
    expect(h.page.averageCost.value).toEqual({ average: 4.5, excludedCount: 1, includedCount: 2 })
    expect(h.page.trendPoints.value).toEqual(labels.map((day, i) => ({ day, values: { p1: i === 1 ? 7_200_000 : 0 } })))
  })

  it('scopes capped fallback, sums consolidated entries and uses local zero-filled days and quality', async () => {
    const h = setup()
    const range = { start: resolvePreset('30d').start, end: resolvePreset('today').end }
    const { boundaries, labels } = buildLocalDayBoundaries(range)
    const entries = [
      { client: 'client', started_at: boundaries[1], work_ms: 200, cost: 4, cost_quality: 'measured' },
      { client: 'client', started_at: boundaries[1], work_ms: 300, cost: 0, cost_quality: 'unknown' },
    ]
    h.fetchRangeTotals.mockRejectedValue(new Unavailable())
    h.fetchRange.mockResolvedValue({ entries, truncated: true })
    await h.page.load()
    expect(h.fetchRange).toHaveBeenCalledWith(range, { client: 'client' })
    expect(h.page.totals.value).toMatchObject({ workMs: 500, cost: 4, count: 2 })
    expect(h.page.averageCost.value).toEqual({ average: 4, excludedCount: 1, includedCount: 1 })
    expect(h.page.trendPoints.value).toEqual([])
    expect(h.page.chartPartial.value).toBe(true)
    expect(h.page.truncated.value).toBe(true)
    expect(h.page.truncatedEntryCount.value).toBe(2)
  })

  it.each(['day denied', 'fallback denied', 'general failure'])('does not disguise %s as successful empty analytics', async scenario => {
    const h = setup()
    if (scenario === 'day denied') h.fetchTotals.mockRejectedValue(new Error('403'))
    else if (scenario === 'fallback denied') {
      h.fetchRangeTotals.mockRejectedValue(new Unavailable())
      h.fetchRange.mockRejectedValue(new Error('403'))
    }
    else h.fetchRangeTotals.mockRejectedValue(new Error('500'))
    await h.page.load()
    expect(h.page.error.value).toBe(true)
    expect(h.page.loading.value).toBe(false)
    expect(h.page.totals.value.count).toBe(0)
  })

  it('does not hide denied daily reads behind an unavailable overall route', async () => {
    const h = setup()
    h.fetchRangeTotals.mockRejectedValue(new Unavailable())
    h.fetchTotals.mockRejectedValue(new Error('403'))
    await h.page.load()
    expect(h.page.error.value).toBe(true)
    expect(h.fetchRange).not.toHaveBeenCalled()
  })

  it('uses DST-aware local boundaries and assigns UTC-near-midnight rows to the local day', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00Z'))
    const h = setup('America/New_York')
    h.fetchRangeTotals.mockRejectedValue(new Unavailable())
    h.fetchRange.mockResolvedValue({ entries: [{ client: 'client', project: 'p1', started_at: '2026-03-09T03:30:00Z', work_ms: 100 }], truncated: false })
    await h.page.load()
    const boundaries = h.fetchTotals.mock.calls[0]![0].dayBoundaries as string[]
    const spans = boundaries.slice(1).map((b, i) => new Date(b).getTime() - new Date(boundaries[i]!).getTime())
    expect(spans).toContain(23 * 3_600_000)
    expect(h.page.trendPoints.value.find((p: any) => p.day === '2026-03-08').values.p1).toBe(100)
    expect(h.page.trendPoints.value.find((p: any) => p.day === '2026-03-09').values.p1).toBe(0)
  })

  it('clears capped fallback warnings when a subsequent route is empty or missing', async () => {
    const h = setup()
    h.fetchTotals.mockRejectedValueOnce(new Unavailable())
    h.fetchRange.mockResolvedValueOnce({ entries: [{ client: 'client', started_at: new Date().toISOString(), work_ms: 100 }], truncated: true })
    await h.page.load()
    expect(h.page.truncated.value).toBe(true)
    h.route.params.id = 'next'
    await h.page.load()
    expect(h.page.truncated.value).toBe(false)
    expect(h.page.truncatedEntryCount.value).toBe(0)
    expect(h.page.totals.value.count).toBe(0)
    h.route.params.id = 'missing'
    await h.page.load()
    expect(h.page.trendPoints.value).toEqual([])
    expect(h.page.error.value).toBe(false)
  })

  it('settles empty reads with zero totals and zero-filled labels', async () => {
    const h = setup()
    await h.page.load()
    expect(h.page.error.value).toBe(false)
    expect(h.page.totals.value.count).toBe(0)
    expect(h.page.averageCost.value.average).toBeNull()
    expect(h.page.trendPoints.value.length).toBeGreaterThan(0)
    expect(h.page.trendPoints.value.every((p: any) => Object.keys(p.values).length === 0)).toBe(true)
  })

  it('ignores a stale capped fallback without settling the current pending load', async () => {
    const h = setup()
    h.fetchRangeTotals.mockRejectedValueOnce(new Unavailable())
    let finishFallback!: (value: any) => void
    h.fetchRange.mockImplementationOnce(() => new Promise(resolve => { finishFallback = resolve }))
    const old = h.page.load()
    await vi.waitFor(() => expect(h.fetchRange).toHaveBeenCalledOnce())
    h.route.params.id = 'next'
    let finishCurrent!: (value: any) => void
    h.fetchRangeTotals.mockImplementationOnce(() => new Promise(resolve => { finishCurrent = resolve }))
    const current = h.page.load()
    await vi.waitFor(() => expect(h.fetchRangeTotals).toHaveBeenCalledTimes(2))
    finishFallback({ entries: [{ client: 'client', started_at: new Date().toISOString(), work_ms: 99 }], truncated: true })
    await old
    expect(h.page.loading.value).toBe(true)
    expect(h.page.truncated.value).toBe(false)
    expect(h.page.totals.value.count).toBe(0)
    finishCurrent({ total: { ...ZERO_TOTALS_ROW }, groups: [] })
    await current
    expect(h.page.loading.value).toBe(false)
  })

  it.each([false, true])('ignores stale success/error responses after a route change (rejection=%s)', async reject => {
    const h = setup()
    await h.page.load()
    let resolve!: (value: any) => void
    let fail!: (error: Error) => void
    h.fetchRangeTotals.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; fail = no }))
    const old = h.page.load()
    await vi.waitFor(() => expect(h.fetchRangeTotals.mock.calls.filter(([, opts]) => opts.groupBy === 'none')).toHaveLength(3))
    h.route.params.id = 'next'
    h.fetchRangeTotals.mockResolvedValue({ total: { ...ZERO_TOTALS_ROW, count: 8, entries: 8 }, groups: [] })
    const current = h.page.load()
    expect(h.page.totals.value.count).toBe(0)
    await current
    if (reject) fail(new Error('403'))
    else resolve({ total: { ...ZERO_TOTALS_ROW, count: 99, entries: 99 }, groups: [] })
    await old
    expect(h.page.totals.value.count).toBe(8)
    expect(h.page.error.value).toBe(false)
    expect(h.page.loading.value).toBe(false)
  })
})

describe('client available-row cost shares', () => {
  it.each([false, true])('uses only valid available rows even with misleading positive server subtotals (capped=%s)', async capped => {
    const h = setup()
    h.fetchRangeTotals.mockResolvedValue({ total: { ...ZERO_TOTALS_ROW, cost: 90, costKnownSum: 90, costKnownEntries: 4 }, groups: [{ ...ZERO_TOTALS_ROW, groupKey: 'p1', cost: 15 }], totalPages: 1 })
    h.fetchRange.mockResolvedValue({ entries: [
      { project: 'p1', cost: 25, cost_quality: 'estimated' },
      { project: '', cost: 75, cost_quality: 'measured' },
      ...[-10, NaN, Infinity, undefined].map(cost => ({ project: 'p1', cost, cost_quality: 'measured' })),
      { project: 'p1', cost: 900, cost_quality: 'unknown' },
    ], truncated: capped })
    await h.page.load()
    expect(h.page.projectCostShare('p1')).toMatchObject({ state: 'known', percentage: 25, projectCost: 25, clientCost: 100 })
    expect(h.page.projectCostShare('missing').percentage).toBeNull()
    expect(h.fetchRange).toHaveBeenCalledWith({ start: resolvePreset('lastMonth').start, end: resolvePreset('today').end }, { client: 'client' })
  })

  it.each([[], [{ project: 'p1', cost: 25, cost_quality: 'unknown' }], [{ project: 'p1', cost: undefined }]])('does not invent zero from absent or unknown available rows: %j', async entries => {
    const h = setup()
    h.fetchRange.mockResolvedValue({ entries, truncated: false })
    await h.page.load()
    expect(h.page.projectCostShare('p1')).toMatchObject({ state: 'unavailable', percentage: null, clientCost: null })
  })

  it('keeps a failed row read unknown even when totals succeed', async () => {
    const h = setup()
    h.fetchRange.mockRejectedValue(new Error('403'))
    await h.page.load()
    expect(h.page.error.value).toBe(true)
    expect(h.page.projectCostShare('p1').percentage).toBeNull()
  })

  it.each([false, true])('fences stale available-row success and failure (rejected=%s)', async rejected => {
    const h = setup()
    let finish!: (value: any) => void
    let fail!: (error: Error) => void
    h.fetchRange.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject }))
    const old = h.page.load()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    h.route.params.id = 'next'
    h.fetchRange.mockResolvedValue({ entries: [{ project: 'p1', cost: 25 }, { project: '', cost: 75 }], truncated: false })
    await h.page.load()
    if (rejected) fail(new Error('403'))
    else finish({ entries: [{ project: 'p1', cost: 999 }], truncated: true })
    await old
    expect(h.page.projectCostShare('p1').percentage).toBe(25)
    expect(h.page.error.value).toBe(false)
  })

  it('places the accessible icon-only back button in the title row', () => {
    const source = read('app/pages/organizacion/clientes/[id]/index.vue')
    expect(source).toContain('data-testid="client-detail-header" class="flex items-center gap-3"')
    expect(source).toContain('data-testid="client-detail-back"')
    expect(source).toContain(':aria-label="t(\'common.back\')"')
    expect(source).toContain(':title="t(\'common.back\')"')
  })
  it('renders a horizontal accessible cost-share track and theme fill', () => {
    const source = read('app/pages/organizacion/clientes/[id]/index.vue')
    expect(source).toContain('data-testid="project-cost-share"')
    expect(source).toContain('data-testid="project-cost-share-fill"')
    expect(source).toContain('bg-primary')
    expect(source).toContain('h-2 w-full overflow-hidden rounded-full bg-background')
    expect(source).toContain('aria-valuenow')
  })

  it('uses the selected-client whole card-window denominator, not chart totals or displayed cards', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'))
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (range, opts) => ({
      total: { ...ZERO_TOTALS_ROW, cost: range.start === resolvePreset('lastMonth').start ? 100 : 999 },
      groups: opts.groupBy === 'project' ? [{ ...ZERO_TOTALS_ROW, groupKey: 'p1', cost: 25 }] : [], totalPages: 1,
    }))
    h.fetchRange.mockResolvedValue({ entries: [{ project: 'p1', cost: 25 }, { project: '', cost: 75 }], truncated: false })
    await h.page.load()
    expect(h.fetchRangeTotals).toHaveBeenCalledWith({ start: resolvePreset('lastMonth').start, end: resolvePreset('today').end }, { groupBy: 'none', filters: { client: 'client' } })
    expect(h.page.projectCostShare('p1').percentage).toBe(25)
    expect(h.page.projectCostShare('missing').percentage).toBeNull()
  })

  it.each([[0, 0, 'zero', null], [0, 25, 'known', 0], [125, 100, 'known', 100], [1, 3, 'known', 100 / 3], [25, 0, 'known', 100], [-1, 100, 'unavailable', null], [1, -100, 'known', 100], [NaN, 100, 'unavailable', null], [1, Infinity, 'known', 100]])('guards ratio project=%s/client=%s', async (projectCost, clientCost, state, percent) => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total: { ...ZERO_TOTALS_ROW, cost: clientCost }, groups: opts.groupBy === 'project' ? [{ ...ZERO_TOTALS_ROW, groupKey: 'p1', cost: projectCost }] : [], totalPages: 1 }))
    h.fetchRange.mockResolvedValue({ entries: [{ project: 'p1', cost: projectCost }, { project: '', cost: clientCost - projectCost }], truncated: false })
    await h.page.load()
    expect(h.page.projectCostShare('p1').state).toBe(state)
    if (percent === null) expect(h.page.projectCostShare('p1').percentage).toBeNull()
    else expect(h.page.projectCostShare('p1').percentage).toBeCloseTo(Number(percent))
  })

  it.each(['denominator unknown', 'denominator estimated', 'numerator unknown', 'numerator estimated', 'denominator metadata missing', 'numerator metadata missing', 'pagination unknown'])('ignores server completeness metadata when available rows are known (%s)', async scenario => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => {
      const total: any = { ...ZERO_TOTALS_ROW, cost: 100 }
      const group: any = { ...ZERO_TOTALS_ROW, groupKey: 'p1', cost: 25 }
      if (scenario === 'denominator unknown') total.costUnknownEntries = 1
      if (scenario === 'denominator estimated') total.costEstimatedEntries = 1
      if (scenario === 'numerator unknown') group.costUnknownEntries = 1
      if (scenario === 'numerator estimated') group.costEstimatedEntries = 1
      if (scenario === 'denominator metadata missing') delete total.costUnknownEntries
      if (scenario === 'numerator metadata missing') delete group.costUnknownEntries
      return { total, groups: opts.groupBy === 'project' ? [group] : [], totalPages: scenario === 'pagination unknown' ? undefined : 1 }
    })
    h.fetchRange.mockResolvedValue({ entries: [{ project: 'p1', cost: 25, cost_quality: 'estimated' }, { project: '', cost: 75 }], truncated: false })
    await h.page.load()
    expect(h.page.projectCostShare('p1')).toMatchObject({ state: 'known', percentage: 25 })
  })

  it.each(['unavailable', 'paginated', 'capped', 'unknown', 'missing cost'])('uses one card-range filtered fallback including unassigned entries (%s)', async scenario => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'))
    const h = setup()
    const cardStart = resolvePreset('lastMonth').start
    h.fetchRangeTotals.mockImplementation(async (range, opts) => {
      if (range.start === cardStart && scenario !== 'paginated') throw new Unavailable()
      return { total: { ...ZERO_TOTALS_ROW }, groups: [], totalPages: range.start === cardStart && opts.groupBy === 'project' ? 2 : 1 }
    })
    h.fetchRange.mockResolvedValue({ entries: [
      { client: 'client', project: 'p1', started_at: `${cardStart}T12:00:00Z`, work_ms: 1, cost: 25, cost_quality: 'measured' },
      { client: 'client', project: '', started_at: `${cardStart}T12:00:00Z`, work_ms: 1, cost: scenario === 'missing cost' ? undefined : 75, cost_quality: scenario === 'unknown' ? 'unknown' : 'measured' },
    ], truncated: scenario === 'capped' })
    await h.page.load()
    expect(h.fetchRange).toHaveBeenCalledOnce()
    expect(h.fetchRange).toHaveBeenCalledWith({ start: cardStart, end: resolvePreset('today').end }, { client: 'client' })
    expect(h.page.projectCostShare('p1').percentage).toBe(['unknown', 'missing cost'].includes(scenario) ? 100 : 25)
    expect(h.page.projectsTruncated.value).toBe(scenario === 'capped')
  })

  it.each(['denied', 'network', 'unavailable companion'])('never turns a failed card denominator into fallback success (%s)', async scenario => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'))
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (range, opts) => {
      if (range.start === resolvePreset('lastMonth').start) {
        if (opts.groupBy === 'none') throw new Error(scenario === 'network' ? 'network failure' : '403')
        if (scenario === 'unavailable companion') throw new Unavailable()
      }
      return { total: { ...ZERO_TOTALS_ROW }, groups: [], totalPages: 1 }
    })
    await h.page.load()
    expect(h.page.error.value).toBe(true)
    expect(h.page.projectCostShare('p1').percentage).toBeNull()
    expect(h.fetchRange).not.toHaveBeenCalled()
  })

  it.each([false, true])('rejects a stale denominator success/error and clears the previous fraction (rejected=%s)', async rejected => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'))
    const h = setup()
    let finish!: (value: any) => void
    let fail!: (error: Error) => void
    h.fetchRangeTotals.mockImplementation(async (range, opts) => {
      if (range.start === resolvePreset('lastMonth').start && opts.groupBy === 'none') return new Promise((resolve, reject) => { finish = resolve; fail = reject })
      return { total: { ...ZERO_TOTALS_ROW }, groups: [{ ...ZERO_TOTALS_ROW, groupKey: 'p1', cost: 25 }], totalPages: 1 }
    })
    const old = h.page.load()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    h.route.params.id = 'next'
    h.fetchRangeTotals.mockResolvedValue({ total: { ...ZERO_TOTALS_ROW, cost: 50 }, groups: [{ ...ZERO_TOTALS_ROW, groupKey: 'p1', cost: 25 }], totalPages: 1 })
    h.fetchRange.mockResolvedValue({ entries: [{ project: 'p1', cost: 25 }, { project: '', cost: 25 }], truncated: false })
    const next = h.page.load()
    expect(h.page.projectCostShare('p1').percentage).toBeNull()
    await next
    if (rejected) fail(new Error('403'))
    else finish({ total: { ...ZERO_TOTALS_ROW, cost: 100 }, groups: [], totalPages: 1 })
    await old
    expect(h.page.projectCostShare('p1').percentage).toBe(50)
    expect(h.page.error.value).toBe(false)
  })

  it('keeps localized share labels and all three locale parameter sets aligned', () => {
    for (const locale of ['en', 'es', 'ja']) {
      const detail = JSON.parse(read(`i18n/locales/${locale}.json`)).clients.detail
      for (const key of ['costShare', 'costShareZero', 'costShareUnavailable']) expect(detail[key]).toContain('{project}')
      for (const field of ['projectCost', 'clientCost', 'percent']) expect(detail.costShare).toContain(`{${field}}`)
      expect(detail.costShareZero).not.toContain('%')
      expect(detail.costShareUnavailable).not.toContain('%')
    }
  })
})

describe('client linked-project cards', () => {
  it('matches readonly catalog information cards with canonical accessible arrows', () => {
    const page = read('app/pages/organizacion/clientes/[id]/index.vue')
    const section = page.slice(page.indexOf('data-testid="client-projects"'), page.indexOf('</section>', page.indexOf('data-testid="client-projects"')))
    expect(section).toContain('class="space-y-4 pt-4"')
    expect(section).toContain('class="text-sm font-bold"')
    expect(section).not.toContain('border-t')
    expect(section).toContain('grid-cols-2')
    expect(section).toContain('lg:grid-cols-3')
    expect(section).toContain('rounded-3xl')
    expect(section).toContain('data-testid="project-card"')
    expect(section).toContain('{{ p.name }}')
    expect(section).toContain('{{ detailClient.name }}')
    expect(section).toContain('{{ p.code }}')
    expect(section).toContain('formatDuration(totalsByProject[p.id]?.workMs ?? 0)')
    expect(section).toContain('formatCost(totalsByProject[p.id]?.cost ?? 0)')
    expect(section).toContain("p.active ? t('common.active') : t('common.inactive')")
    expect(section).toContain(':to="`/organizacion/clientes/${p.client}/proyectos/${p.id}`"')
    expect(section).toContain(':aria-label="t(\'projects.openDetail\', { name: p.name })"')
    expect(section).toContain('<ArrowRight aria-hidden="true"')
    expect(section).toContain("t('clients.detail.noProjects')")
    for (const forbidden of ['RowActions', 'common.edit', 'common.archive', 'p.summary', 'taskCount', 'write-action']) expect(section).not.toContain(forbidden)
  })

  it('reads client-filtered project groups over the catalog-month range independently of analytics', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-15T12:00:00Z'))
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({
      total: { ...ZERO_TOTALS_ROW }, totalPages: 1,
      groups: opts.groupBy === 'project' ? [{ groupKey: 'p1', workMs: 200, cost: 4 }, { groupKey: 'p2', workMs: 300, cost: 6 }] : [],
    }))
    await h.page.load()
    expect(h.fetchRangeTotals).toHaveBeenCalledWith({ start: resolvePreset('lastMonth').start, end: resolvePreset('today').end }, { groupBy: 'project', filters: { client: 'client' }, perPage: 200 })
    expect(h.page.totalsByProject.value).toEqual({ p1: { workMs: 200, cost: 4 }, p2: { workMs: 300, cost: 6 } })
    expect(h.page.totals.value.count).toBe(0)
    expect(h.fetchRange).toHaveBeenCalledOnce()
  })

  it.each([false, true])('reuses only identical fallback ranges (same range=%s)', async sameRange => {
    vi.useFakeTimers().setSystemTime(new Date(sameRange ? '2026-03-02T12:00:00Z' : '2026-10-15T12:00:00Z'))
    const h = setup()
    h.fetchRangeTotals.mockRejectedValue(new Unavailable())
    const projectStart = resolvePreset('lastMonth').start
    h.fetchRange.mockImplementation(async range => ({ entries: [{ client: 'client', project: 'p1', started_at: `${range.start}T12:00:00Z`, work_ms: range.start === projectStart ? 900 : 100, cost: 2 }], truncated: true }))
    await h.page.load()
    expect(h.fetchRange).toHaveBeenCalledTimes(sameRange ? 1 : 2)
    expect(h.fetchRange).toHaveBeenCalledWith({ start: projectStart, end: resolvePreset('today').end }, { client: 'client' })
    expect(h.page.totalsByProject.value).toEqual({ p1: { workMs: 900, cost: 2 } })
    expect(h.page.totals.value.workMs).toBe(sameRange ? 900 : 100)
    expect(h.page.projectsTruncated.value).toBe(true)
    expect(h.page.projectsTruncatedEntryCount.value).toBe(1)
  })

  it('falls back rather than presenting missing paginated project groups as complete zeros', async () => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => ({ total: { ...ZERO_TOTALS_ROW }, groups: [], totalPages: opts.groupBy === 'project' ? 2 : 1 }))
    h.fetchRange.mockResolvedValue({ entries: [{ client: 'client', project: 'p201', started_at: new Date().toISOString(), work_ms: 20, cost: 1 }], truncated: false })
    await h.page.load()
    expect(h.page.totalsByProject.value.p201).toEqual({ workMs: 20, cost: 1 })
    expect(h.page.projectsTruncated.value).toBe(false)
  })

  it.each(['denied', 'general', 'fallback denied'])('reports project %s reads as errors rather than successful zero metrics', async scenario => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => {
      if (opts.groupBy === 'project') throw scenario === 'fallback denied' ? new Unavailable() : new Error(scenario === 'denied' ? '403' : '500')
      return { total: { ...ZERO_TOTALS_ROW }, groups: [] }
    })
    h.fetchRange.mockRejectedValue(new Error('403'))
    await h.page.load()
    expect(h.page.error.value).toBe(true)
    expect(h.page.loading.value).toBe(false)
  })

  it('clears project metrics and cap warning before empty reads on a new client', async () => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => {
      if (opts.groupBy === 'project') throw new Unavailable()
      return { total: { ...ZERO_TOTALS_ROW }, groups: [], totalPages: 1 }
    })
    h.fetchRange.mockResolvedValue({ entries: [{ client: 'client', project: 'p1', started_at: new Date().toISOString(), work_ms: 20 }], truncated: true })
    await h.page.load()
    expect(h.page.projectsTruncated.value).toBe(true)
    h.route.params.id = 'next'
    h.fetchRangeTotals.mockResolvedValue({ total: { ...ZERO_TOTALS_ROW }, groups: [], totalPages: 1 })
    h.fetchRange.mockResolvedValue({ entries: [], truncated: false })
    const load = h.page.load()
    expect(h.page.totalsByProject.value).toEqual({})
    expect(h.page.projectsTruncated.value).toBe(false)
    await load
    expect(h.page.totalsByProject.value).toEqual({})
    expect(h.page.error.value).toBe(false)
  })

  it('ignores stale capped project fallback after switching clients', async () => {
    const h = setup()
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => {
      if (opts.groupBy === 'project') throw new Unavailable()
      return { total: { ...ZERO_TOTALS_ROW }, groups: [] }
    })
    let finish!: (value: any) => void
    h.fetchRange.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const old = h.page.load()
    await vi.waitFor(() => expect(h.fetchRange).toHaveBeenCalledOnce())
    h.route.params.id = 'next'
    h.fetchRangeTotals.mockResolvedValue({ total: { ...ZERO_TOTALS_ROW }, groups: [] })
    await h.page.load()
    finish({ entries: [{ client: 'client', project: 'old', started_at: new Date().toISOString(), work_ms: 99 }], truncated: true })
    await old
    expect(h.page.totalsByProject.value).toEqual({})
    expect(h.page.projectsTruncated.value).toBe(false)
    expect(h.page.projectsTruncatedEntryCount.value).toBe(0)
    expect(h.page.error.value).toBe(false)
  })

  it.each([false, true])('ignores stale project success/error (rejection=%s)', async reject => {
    const h = setup()
    let finish!: (value: any) => void
    let fail!: (error: Error) => void
    h.fetchRangeTotals.mockImplementation(async (_range, opts) => opts.groupBy === 'project' ? new Promise((yes, no) => { finish = yes; fail = no }) : { total: { ...ZERO_TOTALS_ROW }, groups: [] })
    const old = h.page.load()
    await vi.waitFor(() => expect(h.fetchRangeTotals.mock.calls.some(([, opts]) => opts.groupBy === 'project')).toBe(true))
    h.route.params.id = 'next'
    h.fetchRangeTotals.mockResolvedValue({ total: { ...ZERO_TOTALS_ROW }, groups: [{ groupKey: 'next-project', workMs: 42, cost: 1 }] })
    await h.page.load()
    if (reject) fail(new Error('403'))
    else finish({ total: { ...ZERO_TOTALS_ROW }, groups: [{ groupKey: 'old-project', workMs: 99, cost: 9 }] })
    await old
    expect(h.page.totalsByProject.value).toEqual({ 'next-project': { workMs: 42, cost: 1 } })
    expect(h.page.error.value).toBe(false)
  })
})

describe('canonical client detail', () => {
  it('navigates from both catalog views without a lateral sheet', () => {
    const catalog = read('app/pages/clients/index.vue')
    expect(catalog).toContain('navigateTo(`/organizacion/clientes/${client.id}`)')
    expect(catalog).not.toContain('<Sheet')
    expect(catalog.match(/@click="openDetail\(c\)"/g)?.length).toBeGreaterThanOrEqual(2)
    expect(catalog).toContain('<ClientEditDialog :editor="editor"')
  })

  it('loads independently and exposes localized loading, missing and failure states', () => {
    const page = read('app/pages/organizacion/clientes/[id]/index.vue')
    expect(page).toContain('await ensureLoaded()')
    expect(page).toContain('await ensureProjects()')
    expect(page).toContain("navigateTo('/organizacion?tab=clients')")
    expect(page).toContain('v-if="loading"')
    expect(page).toContain('v-else-if="error"')
    expect(page).toContain('v-else-if="!detailClient"')
    expect(page).toContain("t('clients.title')")
    expect(page).toContain('finally')
  })

  it.each(['missing', 'denied', 'totals-denied', 'success'])('settles independent loading for %s reads', async (scenario) => {
    const h = setup()
    if (scenario === 'missing') h.route.params.id = 'missing'
    if (scenario === 'denied') h.ensureLoaded.mockRejectedValue(new Error('403'))
    if (scenario === 'totals-denied') h.fetchRangeTotals.mockRejectedValue(new Error('403'))
    await h.page.load()
    expect(h.page.loading.value).toBe(false)
    expect(h.page.error.value).toBe(['denied', 'totals-denied'].includes(scenario))
    expect(h.ensureProjects).toHaveBeenCalledTimes(['totals-denied', 'success'].includes(scenario) ? 1 : 0)
    expect(h.fetchRange).toHaveBeenCalledTimes(scenario === 'success' ? 1 : 0)
  })

  it('preserves sections, safe links, consolidated totals and owner-only favicon refresh', () => {
    const page = read('app/pages/organizacion/clientes/[id]/index.vue')
    for (const key of ['contactTitle', 'projectsTitle', 'noNotes']) expect(page).toContain(`clients.detail.${key}`)
    expect(page).toContain('isSafeLinkUrl(detailClient.website')
    expect(page).toContain('sumTaskEntries(entries)')
    expect(page).toContain('TotalsRouteUnavailableError')
    expect(page).toContain('`/organizacion/clientes/${p.client}/proyectos/${p.id}`')
    expect(page).toContain('v-if="isOwner && !detailClient.unassigned"')
    expect(page).toContain('!isOwner.value || detailClient.value.unassigned')
    expect(page).toContain('editor.openEdit(detailClient)')
    expect(page).toContain('v-if="canWrite"')
    expect(page).toContain(':disabled="detailClient.unassigned || saving || archiving"')
    expect(page).toContain("watch(() => route.params.id, editor.close, { flush: 'sync' })")
  })

  it('maps palette clients and child breadcrumbs alongside canonical task results', () => {
    const palette = read('app/components/app-shell/CommandPalette.vue')
    expect(palette).toContain('to: `/organizacion/clientes/${c.id}`')
    expect(palette).toContain('to: taskDetailRoute(t2, projects.value)')
    expect(resolveBreadcrumbLabels('/organizacion/clientes/example', key => key)).toEqual(['nav.organization', 'nav.clients'])
  })
})
