import { readFileSync } from 'node:fs'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { groupsToGroupTotals, ZERO_TOTALS_ROW, computeAverageCostFromTotal, summarizeWorkTimeQualityFromTotal } from '../app/lib/totals-map'
import { memberRankingFailureState, rankMemberCosts } from '../app/lib/dashboard-member-ranking'
import { groupByClient, groupByProject, sumTaskEntries } from '../app/lib/aggregate'
import { computeAverageCost, listDistinctAgents, summarizeWorkTimeQuality } from '../app/lib/measurement-quality'
import { TotalsRouteUnavailableError } from '../app/composables/useTotals'

const page = readFileSync('app/pages/index.vue', 'utf8')
const breakdown = readFileSync('app/components/dashboard/BreakdownTable.vue', 'utf8')

function renderBreakdown() {
  const passthrough = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h('div', slots.default?.()) })
  const link = Vue.defineComponent({ props: ['to'], setup: (props, { slots }) => () => Vue.h('a', { href: props.to }, slots.default?.()) })
  const { descriptor } = parse(breakdown)
  const compiled = compileScript(descriptor, { id: 'breakdown', inlineTemplate: true })
  const exports: any = {}
  const globals = {
    ref: Vue.ref, computed: Vue.computed,
    useI18n: () => ({ t: (key: string) => key }),
    useFormatters: () => ({ formatCost: String, formatDuration: String, formatPercent: String }),
  }
  new Function('require', 'exports', ...Object.keys(globals), ts.transpile(compiled.content, { module: ts.ModuleKind.CommonJS }))(
    (id: string) => id === 'vue' ? Vue : new Proxy({}, { get: () => passthrough }), exports, ...Object.values(globals),
  )
  return mount(exports.default, {
    props: {
      rows: Array.from({ length: 7 }, (_, i) => ({ key: String(i), label: `Row ${i}`, cost: i, workMs: 7 - i, count: i, costShare: i / 21 })),
      nameHeader: 'Name', maxRows: 5, resolveHref: (key: string) => key === '6' ? '/organizacion/clientes/c6' : undefined,
    },
    global: { components: { NuxtLink: link } },
  })
}

// Execute the actual page functions with isolated dependencies, not a copy
// of their logic; no network, credentials or database access is involved.
function pageFunction(name: string, end: string, globals: Record<string, unknown>) {
  const sourceStartName = name === 'fetchMemberRanking' ? 'memberRankingCurrent' : name
  const start = page.indexOf(`function ${sourceStartName}(`)
  const source = page.slice(page.slice(start - 6, start) === 'async ' ? start - 6 : start, page.indexOf(end, start))
  return new Function(...Object.keys(globals), ts.transpile(source, { target: ts.ScriptTarget.ESNext }) + `; return ${name};`)(...Object.values(globals))
}

function serverHarness(current: boolean | (() => boolean) = true, unsupported = false, memberResponse?: () => Promise<any>) {
  const isCurrent = typeof current === 'function' ? current : () => current
  const total = { ...ZERO_TOTALS_ROW, entries: 20, count: 20, cost: 100 }
  const fetchTotals = vi.fn(async (request: any) => {
    if (request.groupBy === 'member' && memberResponse) return memberResponse()
    if (request.groupBy === 'member' && unsupported) throw Object.assign(new Error('PocketBase request failed'), { status: 400, data: { data: { errors: ['invalid_group_by'] }, message: 'Invalid totals request.', status: 400 } })
    const groups = request.groupBy === 'member' ? [
      { ...ZERO_TOTALS_ROW, groupKey: 'm1', entries: 2, count: 2, cost: 60, costKnownSum: 50, costKnownEntries: 1, costUnknownEntries: 1, costEstimatedEntries: 0 },
      { ...ZERO_TOTALS_ROW, groupKey: '', entries: 1, count: 1, costUnknownEntries: 1 },
    ] : []
    return { total, totalGroups: groups.length, page: 1, totalPages: groups.length ? 1 : 0, groups }
  })
  const state = Object.fromEntries(['totals', 'previousTotals', 'workTimeQuality', 'averageCost', 'byClient', 'byProject', 'topExpensive', 'exportSnapshot', 'agentOptions', 'memberRanking', 'memberRankingState'].map(key => [key, Vue.ref(null)]))
  const memberGlobals = {
    ...state, fetchTotals, rankMemberCosts, memberRankingFailureState, TotalsRouteUnavailableError, isOwner: Vue.ref(true), isCurrent, totalsRouteUnavailable: false,
    $pb: { collection: () => ({ getList: async () => ({ page: 1, totalPages: 1, totalItems: 1, items: [{ id: 'm1', name: 'Member One' }] }) }) },
  }
  const fetchMemberRanking = pageFunction('fetchMemberRanking', 'async function fetchTopExpensive', memberGlobals)
  const load = pageFunction('loadServer', '/** Adapts', {
    ...state, fetchTotals, fetchMemberRanking, groupsToGroupTotals, computeAverageCostFromTotal, summarizeWorkTimeQualityFromTotal, rankMemberCosts, memberRankingFailureState,
    localDateRangeToUtcFilters: (range: any) => range,
    previousEquivalentPeriod: (range: any) => range,
    buildServerFilters: pageFunction('buildServerFilters', 'let loadGeneration', { LEGACY_AGENT: 'legacy' }),
    fetchTopExpensive: vi.fn(async () => [{ id: 'export-only' }]),
    isCurrent, clientName: String, projectName: String,
    t: (key: string) => key, LEGACY_AGENT: 'legacy', loadChart: vi.fn(), chartDataGeneration: 0, chartSnapshot: null,
  })
  return { load, fetchTotals, state }
}

describe('compact dashboard summaries', () => {
  it('caps actual sorted rows without changing source rows or shares; links only resolved identities', async () => {
    const wrapper = renderBreakdown()
    expect(wrapper.text()).toContain('Row 6')
    expect(wrapper.text()).not.toContain('Row 0')
    expect(wrapper.text()).not.toContain('Row 1')
    expect(wrapper.get('a').attributes('href')).toBe('/organizacion/clientes/c6')
    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.props('rows')).toHaveLength(7)
    expect(wrapper.text()).toContain(String(6 / 21))
    await wrapper.findAll('.cursor-pointer')[0]!.trigger('click')
    expect(wrapper.text()).toContain('Row 0')
    expect(wrapper.text()).not.toContain('Row 6')
    await wrapper.setProps({ maxRows: undefined })
    expect(wrapper.text()).toContain('Row 6') // defaults preserve other consumers
    wrapper.unmount()
  })

  it('resolves only real catalog identities and real project parents', () => {
    const clientById = (id: string) => id === 'real client' ? { id } : undefined
    const clientHref = pageFunction('clientHref', 'function projectHref', { clientById })
    const projectHref = pageFunction('projectHref', 'function agentLabel', {
      clientById, projects: Vue.ref([{ id: 'real project', client: 'real client' }, { id: 'orphan', client: 'missing' }]),
    })
    expect(clientHref('real client')).toBe('/organizacion/clientes/real%20client')
    expect(clientHref('missing')).toBeUndefined()
    expect(projectHref('real project')).toBe('/organizacion/clientes/real%20client/proyectos/real%20project')
    expect(projectHref('orphan')).toBeUndefined()
    expect(projectHref('missing')).toBeUndefined()
  })

  it.each([false, true])('requests date/filter-scoped member groups or explicit unavailable state (unsupported=%s)', async unsupported => {
    const { load, fetchTotals, state } = serverHarness(true, unsupported)
    await load({ range: { start: 'start', end: 'end' }, agent: 'pi', unassignedClientId: 'unassigned', includeUnassigned: false }, 1)
    expect(fetchTotals).toHaveBeenCalledWith({ from: 'start', to: 'end', groupBy: 'member', sort: '-cost', filters: { agent: 'pi', exclude_unassigned_client: 'unassigned' }, page: 1, perPage: 200 })
    expect(state.memberRankingState!.value).toBe(unsupported ? 'unavailable' : 'ready')
    expect(state.memberRanking!.value).toHaveLength(unsupported ? 0 : 2)
    if (!unsupported) expect(state.memberRanking!.value[0]).toMatchObject({ id: 'm1', label: 'Member One', costState: 'incomplete', costKnownSum: 50 })
    expect(state.totals!.value.cost).toBe(100)
    expect(state.topExpensive!.value).toEqual([{ id: 'export-only' }])
    expect(state.exportSnapshot!.value.metadata.topExpensiveLimit).toBe(10)
  })

  it('pages all member groups before ranking by displayed known subtotal', async () => {
    const groups = Array.from({ length: 201 }, (_, i) => ({
      groupKey: `m${String(i).padStart(3, '0')}`, entries: 1, workMs: 1,
      cost: i < 5 ? 100 : i === 200 ? 90 : 0,
      costKnownSum: i === 200 ? 90 : 0,
      costKnownEntries: i === 200 ? 1 : 0,
      costUnknownEntries: i === 200 ? 0 : 1,
      costEstimatedEntries: 0,
    }))
    const requests: any[] = []
    const fetchTotals = vi.fn(async (request: any) => {
      requests.push(request)
      const pageSize = request.perPage
      const offset = (request.page - 1) * pageSize
      return { page: request.page, totalPages: Math.ceil(groups.length / pageSize), totalGroups: groups.length, groups: groups.slice(offset, offset + pageSize) }
    })
    const memberRanking = Vue.ref<any[]>([])
    const memberRankingState = Vue.ref('loading')
    const fetchRanking = pageFunction('fetchMemberRanking', 'async function fetchTopExpensive', {
      memberRanking, memberRankingState, fetchTotals, rankMemberCosts, memberRankingFailureState, TotalsRouteUnavailableError,
      isOwner: Vue.ref(true), totalsRouteUnavailable: false, isCurrent: () => true,
      $pb: { collection: () => ({ getList: async () => ({ page: 1, totalPages: 0, totalItems: 0, items: [] }) }) },
    })
    await fetchRanking({ range: {}, agent: '' }, 1, 'from', 'to', {})
    expect(requests.map(request => request.page)).toEqual([1, 2])
    expect(requests[0]).toMatchObject({ groupBy: 'member', sort: '-cost', perPage: 200 })
    expect(memberRanking.value[0]).toMatchObject({ id: 'm200', costKnownSum: 90 })
    expect(memberRanking.value).toHaveLength(5)
  })

  it('does not request the next catalog page after owner access is revoked mid-page', async () => {
    let releasePage!: (value: any) => void
    const owner = Vue.ref(true)
    const catalogRequests: number[] = []
    const fetchTotals = vi.fn(async () => ({ page: 1, totalPages: 0, totalGroups: 0, groups: [] }))
    const pageOne = new Promise(resolve => { releasePage = resolve })
    const memberRanking = Vue.ref<any[]>([])
    const memberRankingState = Vue.ref('loading')
    const fetchRanking = pageFunction('fetchMemberRanking', 'async function fetchTopExpensive', {
      memberRanking, memberRankingState, fetchTotals, rankMemberCosts, memberRankingFailureState, TotalsRouteUnavailableError,
      isOwner: owner, totalsRouteUnavailable: false, isCurrent: () => true,
      $pb: { collection: () => ({ getList: async (page: number) => {
        catalogRequests.push(page)
        if (page === 1) return pageOne
        return { page: 2, totalPages: 2, totalItems: 201, items: [{ id: 'late', name: 'Late' }] }
      } }) },
    })
    const pending = fetchRanking({ range: {}, agent: '' }, 1, 'from', 'to', {})
    await vi.waitFor(() => expect(catalogRequests).toEqual([1]))
    owner.value = false
    releasePage({ page: 1, totalPages: 2, totalItems: 201, items: Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, name: `Member ${i}` })) })
    await pending
    expect(catalogRequests).toEqual([1])
    expect(memberRanking.value).toEqual([])
    expect(memberRankingState.value).toBe('loading')
  })

  it.each([
    [{ status: 400, data: { data: { errors: ['invalid_group_by'] }, message: 'Invalid totals request.', status: 400 } }, 'unavailable'],
    [{ status: 500, data: { data: {}, message: 'Failed to compute totals.', status: 500 } }, 'unavailable'],
  ])('classifies backend member-group envelopes without relying on raw SQL text', async (apiError, expectedState) => {
    const error = Object.assign(new Error('PocketBase request failed'), apiError)
    const memberRanking = Vue.ref<any[]>([])
    const memberRankingState = Vue.ref('loading')
    const fetchRanking = pageFunction('fetchMemberRanking', 'async function fetchTopExpensive', {
      memberRanking, memberRankingState, fetchTotals: async () => { throw error }, rankMemberCosts, memberRankingFailureState, TotalsRouteUnavailableError,
      isOwner: Vue.ref(true), totalsRouteUnavailable: false, isCurrent: () => true,
      $pb: { collection: () => ({ getList: async () => ({ page: 1, totalPages: 0, totalItems: 0, items: [] }) }) },
    })
    await fetchRanking({ range: {}, agent: '' }, 1, 'from', 'to', {})
    expect(memberRankingState.value).toBe(expectedState)
    expect(memberRanking.value).toEqual([])
  })

  it('does not commit export, agent, or chart state after a superseded ranking await', async () => {
    let active = true
    let releaseMember!: (value: any) => void
    const memberResponse = new Promise(resolve => { releaseMember = resolve })
    const { load, state, fetchTotals } = serverHarness(() => active, false, () => memberResponse)
    const pending = load({ range: { start: 'start', end: 'end' }, agent: '' }, 1)
    await vi.waitFor(() => expect(fetchTotals).toHaveBeenCalledWith(expect.objectContaining({ groupBy: 'member' })))
    active = false
    releaseMember({ page: 1, totalPages: 1, totalGroups: 1, groups: [{ groupKey: 'm1', entries: 1, costKnownSum: 1, costKnownEntries: 1, costUnknownEntries: 0, costEstimatedEntries: 0, workMs: 1 }] })
    await pending
    expect(state.exportSnapshot!.value).toBeNull()
    expect(state.agentOptions!.value).toBeNull()
  })

  it('withholds the whole ranking when the member catalog page fails', async () => {
    const memberRanking = Vue.ref<any[]>([])
    const memberRankingState = Vue.ref('loading')
    const fetchTotals = vi.fn(async () => ({ page: 1, totalPages: 1, totalGroups: 1, groups: [{ groupKey: 'member-id', entries: 1, cost: 5, costKnownSum: 5, costKnownEntries: 1, costUnknownEntries: 0, costEstimatedEntries: 0, workMs: 1 }] }))
    const fetchRanking = pageFunction('fetchMemberRanking', 'async function fetchTopExpensive', {
      memberRanking, memberRankingState, fetchTotals, rankMemberCosts, memberRankingFailureState, TotalsRouteUnavailableError,
      isOwner: Vue.ref(true), totalsRouteUnavailable: false, isCurrent: () => true,
      $pb: { collection: () => ({ getList: async () => { throw new Error('catalog failed') } }) },
    })
    await fetchRanking({ range: {}, agent: '' }, 1, 'from', 'to', {})
    expect(memberRanking.value).toEqual([])
    expect(memberRankingState.value).toBe('error')
  })

  it.each([false, true])('ranks all fallback entries only when the scan is complete (truncated=%s)', async truncated => {
    const entries = [
      { machine: 'Host', cost: 3 }, { machine: 'Host', cost: 4 },
      { machine: 'host', cost: 2 }, { machine: '', cost: 1 }, { machine: ' \t', cost: 2 },
    ].map((row, i) => ({ ...row, id: String(i), client: 'c', project: 'p', agent: 'pi', work_ms: 1 }))
    const state = Object.fromEntries(['totals', 'previousTotals', 'workTimeQuality', 'averageCost', 'byClient', 'byProject', 'topExpensive', 'exportSnapshot', 'agentOptions', 'memberRanking', 'memberRankingState'].map(key => [key, Vue.ref(null)]))
    const toTotalsRow = pageFunction('toTotalsRow', '/** Pre-totals-route', { sumTaskEntries })
    const load = pageFunction('loadFallback', 'async function loadFallbackChart', {
      ...state, toTotalsRow, groupByClient, groupByProject, computeAverageCost, listDistinctAgents, summarizeWorkTimeQuality,
      previousEquivalentPeriod: (range: any) => range,
      fetchRange: async () => ({ entries, truncated }), isCurrent: () => true,
      visibleFallback: (rows: unknown[]) => rows, clientName: String, projectName: String,
      t: (key: string) => key, loadChart: vi.fn(), fallbackRows: null, chartSnapshot: null, chartDataGeneration: 0,
    })
    await load({ range: { start: 'start', end: 'end' } }, 1)
    expect(state.memberRanking!.value).toEqual([])
    expect(state.memberRankingState!.value).toBe('unavailable')
    expect(state.exportSnapshot!.value.metadata.fallbackRowsTruncated).toBe(truncated)
  })

  it('shares existing filter semantics for legacy agents and unassigned inclusion', () => {
    const filters = pageFunction('buildServerFilters', 'let loadGeneration', { LEGACY_AGENT: 'legacy' })
    expect(filters({ agent: 'legacy', includeUnassigned: false, unassignedClientId: 'u' })).toEqual({ agent: '', exclude_unassigned_client: 'u' })
    expect(filters({ agent: '', includeUnassigned: true, unassignedClientId: 'u' })).toEqual({})
  })

  it('does not commit stale member results', async () => {
    const { load, state } = serverHarness(false)
    await load({ range: { start: 'start', end: 'end' }, agent: '' }, 1)
    expect(state.memberRanking!.value).toBeNull()
    expect(state.exportSnapshot!.value).toBeNull()
  })

  it('wires canonical catalog links and caps only visible breakdown rows', () => {
    expect(page).toContain(':resolve-href="clientHref" :max-rows="5"')
    expect(page).toContain(':resolve-href="projectHref" :max-rows="5"')
    expect(page).toContain('clientById(project.client)')
    expect(page).toContain('encodeURIComponent(project.client)')
    expect(page).not.toContain('byClient.value = byClient.value.slice')
  })

  it('owner-gates the complete member panel and does not request machine grouping', () => {
    expect(page).toContain('<Card v-if="isOwner" data-testid="breakdown-by-member"')
    expect(page).toContain("groupBy: 'member', sort: '-cost', filters, page, perPage: pageSize")
    expect(page).toContain("collection('team_members').getList")
    expect(page).not.toContain("groupBy: 'machine'")
    expect(page).toContain('topExpensive: topExpensive.value')
    expect(page).toContain('fetchTopExpensive(snapshot)')
    expect(page).not.toContain('v-for="e in topExpensive"')
  })
})
