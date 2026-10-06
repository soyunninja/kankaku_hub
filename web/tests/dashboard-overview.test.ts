import { readFileSync } from 'node:fs'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { groupsToGroupTotals, ZERO_TOTALS_ROW, computeAverageCostFromTotal, summarizeWorkTimeQualityFromTotal } from '../app/lib/totals-map'
import { groupByClient, groupByProject, sumTaskEntries } from '../app/lib/aggregate'
import { computeAverageCost, listDistinctAgents, summarizeWorkTimeQuality } from '../app/lib/measurement-quality'

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
  const start = page.indexOf(`function ${name}(`)
  const source = page.slice(page.slice(start - 6, start) === 'async ' ? start - 6 : start, page.indexOf(end, start))
  return new Function(...Object.keys(globals), ts.transpile(source, { target: ts.ScriptTarget.ESNext }) + `; return ${name};`)(...Object.values(globals))
}

function serverHarness(current = true, unsupported = false) {
  const total = { ...ZERO_TOTALS_ROW, entries: 20, count: 20, cost: 100 }
  const fetchTotals = vi.fn(async (request: any) => {
    if (request.groupBy === 'machine' && unsupported) throw new Error('invalid_group_by')
    return { total, totalGroups: 8, groups: request.groupBy === 'machine' ? [
      { ...ZERO_TOTALS_ROW, groupKey: 'Host', cost: 60 },
      { ...ZERO_TOTALS_ROW, groupKey: '', cost: 10 },
    ] : [] }
  })
  const state = Object.fromEntries(['totals', 'previousTotals', 'workTimeQuality', 'averageCost', 'byClient', 'byProject', 'topExpensive', 'exportSnapshot', 'agentOptions', 'byMachine', 'machineUnavailable'].map(key => [key, Vue.ref(null)]))
  const load = pageFunction('loadServer', '/** Adapts', {
    ...state, fetchTotals, groupsToGroupTotals, computeAverageCostFromTotal, summarizeWorkTimeQualityFromTotal,
    localDateRangeToUtcFilters: (range: any) => range,
    previousEquivalentPeriod: (range: any) => range,
    buildServerFilters: pageFunction('buildServerFilters', 'let loadGeneration', { LEGACY_AGENT: 'legacy' }),
    fetchTopExpensive: vi.fn(async () => [{ id: 'export-only' }]),
    isCurrent: () => current, clientName: String, projectName: String,
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

  it.each([false, true])('commits scoped machine groups or explicit unavailable state (unsupported=%s)', async unsupported => {
    const { load, fetchTotals, state } = serverHarness(true, unsupported)
    await load({ range: { start: 'start', end: 'end' }, agent: 'pi', unassignedClientId: 'unassigned', includeUnassigned: false }, 1)
    expect(fetchTotals).toHaveBeenCalledWith({ from: 'start', to: 'end', groupBy: 'machine', sort: '-cost', filters: { agent: 'pi', exclude_unassigned_client: 'unassigned' }, page: 1, perPage: 5 })
    expect(state.machineUnavailable!.value).toBe(unsupported)
    expect(state.byMachine!.value).toHaveLength(unsupported ? 0 : 2)
    if (!unsupported) {
      expect(state.byMachine!.value[0].costShare).toBe(0.6) // denominator is all 100, not the returned 70
      expect(state.byMachine!.value[1].label).toBe('dashboard.unknownMachine')
    }
    expect(state.totals!.value.cost).toBe(100)
    expect(state.topExpensive!.value).toEqual([{ id: 'export-only' }])
    expect(state.exportSnapshot!.value.metadata.topExpensiveLimit).toBe(10)
  })

  it.each([false, true])('ranks all fallback entries only when the scan is complete (truncated=%s)', async truncated => {
    const entries = [
      { machine: 'Host', cost: 3 }, { machine: 'Host', cost: 4 },
      { machine: 'host', cost: 2 }, { machine: '', cost: 1 }, { machine: ' \t', cost: 2 },
    ].map((row, i) => ({ ...row, id: String(i), client: 'c', project: 'p', agent: 'pi', work_ms: 1 }))
    const state = Object.fromEntries(['totals', 'previousTotals', 'workTimeQuality', 'averageCost', 'byClient', 'byProject', 'topExpensive', 'exportSnapshot', 'agentOptions', 'byMachine', 'machineUnavailable'].map(key => [key, Vue.ref(null)]))
    const toTotalsRow = pageFunction('toTotalsRow', '/** Pre-totals-route', { sumTaskEntries })
    const load = pageFunction('loadFallback', 'async function loadFallbackChart', {
      ...state, toTotalsRow, groupByClient, groupByProject, computeAverageCost, listDistinctAgents, summarizeWorkTimeQuality,
      previousEquivalentPeriod: (range: any) => range,
      fetchRange: async () => ({ entries, truncated }), isCurrent: () => true,
      visibleFallback: (rows: unknown[]) => rows, clientName: String, projectName: String,
      t: (key: string) => key, loadChart: vi.fn(), fallbackRows: null, chartSnapshot: null, chartDataGeneration: 0,
    })
    await load({ range: { start: 'start', end: 'end' } }, 1)
    expect(state.machineUnavailable!.value).toBe(truncated)
    expect(state.byMachine!.value.map((row: any) => [row.key, row.cost])).toEqual(truncated ? [] : [['Host', 7], ['', 3], ['host', 2]])
    expect(state.exportSnapshot!.value.metadata.fallbackRowsTruncated).toBe(truncated)
  })

  it('shares existing filter semantics for legacy agents and unassigned inclusion', () => {
    const filters = pageFunction('buildServerFilters', 'let loadGeneration', { LEGACY_AGENT: 'legacy' })
    expect(filters({ agent: 'legacy', includeUnassigned: false, unassignedClientId: 'u' })).toEqual({ agent: '', exclude_unassigned_client: 'u' })
    expect(filters({ agent: '', includeUnassigned: true, unassignedClientId: 'u' })).toEqual({})
  })

  it('does not commit stale machine results', async () => {
    const { load, state } = serverHarness(false)
    await load({ range: { start: 'start', end: 'end' }, agent: '' }, 1)
    expect(state.byMachine!.value).toBeNull()
    expect(state.exportSnapshot!.value).toBeNull()
  })

  it('wires canonical catalog links and caps only visible breakdown rows', () => {
    expect(page).toContain(':resolve-href="clientHref" :max-rows="5"')
    expect(page).toContain(':resolve-href="projectHref" :max-rows="5"')
    expect(page).toContain('clientById(project.client)')
    expect(page).toContain('encodeURIComponent(project.client)')
    expect(page).not.toContain('byClient.value = byClient.value.slice')
  })

  it('requests scoped top-five full machine aggregates, keeps exports and isolates unsupported grouping', () => {
    expect(page).toContain("groupBy: 'machine', sort: '-cost', filters, page: 1, perPage: 5")
    expect(page).toContain('machineResp')
    expect(page).toContain('machineUnavailable')
    expect(page).toContain('current.truncated')
    expect(page).toContain('groupsToGroupTotals(machineResp.groups, currentResp.total)')
    expect(page).toContain('topExpensive: topExpensive.value')
    expect(page).toContain('fetchTopExpensive(snapshot)')
    expect(page).not.toContain('v-for="e in topExpensive"')
    expect(page).toContain("t('dashboard.unknownMachine')")
    expect(page).toContain("t('dashboard.machineUnavailable')")
  })
})
