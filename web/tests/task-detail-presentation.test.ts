import { readFileSync } from 'node:fs'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { defineComponent } from 'vue'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { toSessionEntryRow } from '../app/lib/session-entries'

// Execute the real SFC template, with read-only view models and UI primitives.
function template(path: string) {
  const { descriptor } = parse(readFileSync(path, 'utf8'))
  const compiled = compileTemplate({ source: descriptor.template!.content, filename: path, id: path })
  expect(compiled.errors).toEqual([])
  const exports: any = {}
  const code = ts.transpile(compiled.code, { module: ts.ModuleKind.CommonJS })
  new Function('require', 'exports', code)(() => Vue, exports)
  return exports.render
}
const primitive = defineComponent({ template: '<div><slot /></div>' })
const button = defineComponent({ template: '<button><slot /></button>' })
const kpi = defineComponent({ props: ['title', 'value'], template: '<div data-testid="kpi-card"><span>{{ title }}</span><strong>{{ value }}</strong><slot /></div>' })
const link = defineComponent({ props: ['to'], template: '<a :href="to"><slot /></a>' })
const globals = { components: { KpiCard: kpi, NuxtLink: link, Card: primitive, CardHeader: primitive, CardContent: primitive, Button: button, Tabs: primitive, TabsList: primitive, TabsTrigger: button, Badge: primitive, Pencil: primitive, ChevronDown: primitive, ArrowLeft: primitive, Info: primitive, AgentBadge: primitive, CopyButton: button, Skeleton: primitive, EmptyState: primitive } }
function detail(pageMode: boolean, overrides: Record<string, any> = {}) {
  const session = { sessionId: 'session-one', sessionName: 'A session', lastActivity: '', firstActivity: '', entryCount: 1, workMs: 1, elapsedMs: 1, waitingMs: 0, cost: 0, machine: 'machine', agent: 'pi' }
  const props = Vue.reactive({ pageMode, task: { id: 't', title: 'Long task title', status: 'open', description: 'Description', external_ref: 'issue/123' }, projectName: 'Owning project', canWrite: true, sessionsLoading: false, sessions: [session], sessionEntries: {}, summary: { workMs: 9000, cost: 12, entries: 80, sessionCount: 61, workMsMayOverlap: true }, summaryLoading: false, summaryUnavailable: false, summaryError: false, sessionCountUnavailable: false, context: { client: { name: 'Client', to: '/organizacion/clientes/c' }, project: { name: 'Owning project', to: '/organizacion/clientes/c/proyectos/p' } }, ...overrides })
  const emit = vi.fn()
  let nextToastId = 100
  const toast = { info: vi.fn().mockImplementation(() => ++nextToastId), dismiss: vi.fn() }
  const bindings = { useToast: () => toast, ref: Vue.ref, computed: Vue.computed, defineProps: () => props, withDefaults: (p: any) => p, defineEmits: () => emit, defineExpose: () => {}, defineOptions: () => {}, useI18n: () => ({ t: (key: string) => key }), useFormatters: () => ({ formatDateTime: () => 'date', formatDuration: (v: number) => `time:${v}`, formatCost: (v: number) => `cost:${v}` }), MIXED: '__mixed__', buildResumeCommand: () => ({ ok: true, command: 'pi --session one' }), toSessionEntryRow, Card: primitive, CardHeader: primitive, CardContent: primitive }
  const script = readFileSync('app/components/tasks/TaskDetailSheet.vue', 'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
  const code = ts.transpile(script.replace(/^(import|export type) .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const state = new Function(...Object.keys(bindings), `${code}; return { t, formatDateTime, formatDuration, formatCost, titleEl, focusTitle, sessionRows, sessionName, STATUSES, isSessionExpanded, sessionEntryRows, openSessionEntry, onStatusTabChange, toggleSessionEntries, emit, MIXED, showCostInfo: typeof showCostInfo === 'undefined' ? undefined : showCostInfo, showWorkTimeInfo: typeof showWorkTimeInfo === 'undefined' ? undefined : showWorkTimeInfo, summaryMetrics: typeof summaryMetrics === 'undefined' ? [] : summaryMetrics }`)(...Object.values(bindings))
  const wrapper = mount(defineComponent({ render: template('app/components/tasks/TaskDetailSheet.vue'), setup: () => ({ ...Vue.toRefs(props), ...state, Card: primitive, CardHeader: primitive, CardContent: primitive }) }), { global: globals, slots: { back: '<button aria-label="Back to project">Back</button>' } })
  return Object.assign(wrapper, { events: emit, detailProps: props, toast })
}
describe('actual task detail presentation templates', () => {
  it.each([true, false])('opens underlying records only in page mode %s', async pageMode => {
    const records = ['t', 'other', ''].map((task, i) => ({ id: `entry-${i}`, task, prompt: '', started_at: '', work_ms: 1, cost: 0 }))
    const wrapper = detail(pageMode, { sessionEntries: { 'session-one': { loading: false, items: records, totalItems: 3 } } })
    await wrapper.get('[data-testid="task-detail-disclosure"]').trigger('click')
    expect(wrapper.findAll('[data-testid="session-entry-row"]')).toHaveLength(3)
    expect(wrapper.text()).toContain('tasks.detail.sessions.entryOtherTask')
    expect(wrapper.text()).toContain('tasks.detail.sessions.entryNoTask')
    expect(wrapper.text()).toContain('tasks.detail.sessions.entryPromptHidden')
    const triggers = wrapper.findAll('[data-testid="task-detail-entry-trigger"]')
    expect(triggers).toHaveLength(pageMode ? 3 : 0)
    if (pageMode) {
      expect(triggers[1]!.element.tagName).toBe('BUTTON')
      expect(triggers[1]!.attributes('aria-label')).toContain('entries.detail.viewEntry')
      await triggers[1]!.trigger('click')
      const event = wrapper.events.mock.calls.find(call => call[0] === 'openEntry')!
      expect(event[1]).toBe(wrapper.detailProps.sessionEntries['session-one'].items[1])
      expect(event[2]).toBe(triggers[1]!.element)
      expect(event[1].prompt).toBe('')
    }
    wrapper.unmount()
  })
  it('keeps surviving disclosures expanded when assignment refresh removes a session', async () => {
    const wrapper = detail(true)
    const first = wrapper.detailProps.sessions[0]
    wrapper.detailProps.sessions = [first, { ...first, sessionId: 'session-two' }]
    wrapper.detailProps.sessionEntries = {
      'session-one': { loading: false, items: [], totalItems: 0 },
      'session-two': { loading: false, items: [{ id: 'moved', task: 't', prompt: '', started_at: '', work_ms: 1, cost: 0 }], totalItems: 1 },
    }
    await Vue.nextTick()
    for (const disclosure of wrapper.findAll('[data-testid="task-detail-disclosure"]')) await disclosure.trigger('click')
    wrapper.detailProps.sessions = [{ ...first, sessionId: 'session-two', entryCount: 0 }]
    wrapper.detailProps.sessionEntries['session-two'].items[0].task = 'other'
    await Vue.nextTick()
    expect(wrapper.findAll('[data-testid="task-detail-disclosure"]')).toHaveLength(1)
    expect(wrapper.get('[data-testid="task-detail-disclosure"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.text()).toContain('tasks.detail.sessions.entryOtherTask')
    wrapper.unmount()
  })
  it('uses a full-width page heading with inline back and project context', () => {
    const wrapper = detail(true)
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['w-full', 'min-w-0', 'gap-6']))
    const title = wrapper.get('h1')
    expect(title.classes()).toEqual(expect.arrayContaining(['text-xl', 'font-semibold', 'tracking-tight']))
    const header = wrapper.get('[data-testid="task-detail-header"]')
    expect(header.find('h1').exists()).toBe(true)
    expect(header.get('button[aria-label="Back to project"]').text()).toBe('Back')
    expect(header.text()).toContain('Owning project')
    wrapper.unmount()
  })
  it.each([true, false])('uses exactly two desktop session columns only in pageMode=%s', pageMode => {
    const wrapper = detail(pageMode)
    const list = wrapper.get('[data-testid="task-detail-sessions-list"]')
    if (pageMode) {
      expect(list.classes()).toEqual(expect.arrayContaining(['grid', 'min-w-0', 'grid-cols-1', 'gap-3', 'lg:grid-cols-2']))
      expect(list.classes()).not.toContain('space-y-3')
      expect(list.classes().filter(value => value.includes('grid-cols'))).toEqual(['grid-cols-1', 'lg:grid-cols-2'])
    }
    else {
      expect(list.classes()).toContain('space-y-3')
      expect(list.classes()).not.toContain('grid')
    }
    wrapper.unmount()
  })
  it('uses page-only section hierarchy and project-language session cards', () => {
    const wrapper = detail(true)
    expect(wrapper.get('[data-testid="task-detail-sessions"] h2').classes()).toContain('font-bold')
    expect(wrapper.get('[data-testid="task-detail-session-card"]').classes()).toEqual(expect.arrayContaining(['min-w-0', 'gap-4', 'py-5']))
    expect(wrapper.html()).not.toContain('rounded-3xl')
    expect(wrapper.findAll('dl > div')).toHaveLength(8)
    expect(wrapper.get('button[aria-expanded]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('pre').text()).toBe('pi --session one')
    wrapper.unmount()
  })
  it('orders the shared KPIs before description/reference and sessions', () => {
    const wrapper = detail(true)
    const summary = wrapper.get('[data-testid="task-detail-summary"]')
    expect(summary.classes()).toEqual(expect.arrayContaining(['grid-cols-2', 'lg:grid-cols-4', 'gap-3']))
    expect(summary.classes()).not.toContain('md:grid-cols-4')
    expect(summary.findAll('[data-testid="kpi-card"] strong').map(node => node.text())).toEqual(['≈time:9000', 'cost:12', '61', '80'])
    expect(summary.text()).not.toContain('tasks.detail.sessions.workApproxTitle')
    expect(summary.get('[data-testid="task-detail-work-time-info"]').attributes('aria-label')).toBe('dashboard.kpi.workTimeInfo')
    const html = wrapper.html()
    expect(html.indexOf('task-detail-summary')).toBeLessThan(html.indexOf('task-detail-description'))
    expect(html.indexOf('task-detail-description')).toBeLessThan(html.indexOf('task-detail-session-card'))
    expect(wrapper.get('[data-testid="task-detail-reference"]').classes()).toContain('[overflow-wrap:anywhere]')
    expect(wrapper.findAll('a').map(node => node.attributes('href'))).toEqual(['/organizacion/clientes/c', '/organizacion/clientes/c/proyectos/p'])
    wrapper.unmount()
  })
  it('renders loading skeletons and unavailable metrics without false zeros', () => {
    const loading = detail(true, { summary: null, summaryLoading: true })
    expect(loading.findAll('[data-testid="task-summary-skeleton"]')).toHaveLength(4)
    loading.unmount()
    const missing = detail(true, { summary: null, summaryUnavailable: true })
    expect(missing.findAll('[data-testid="kpi-card"] strong').map(node => node.text())).toEqual(['—', '—', '—', '—'])
    missing.unmount()
    const count = detail(true, { summary: { workMs: 9, cost: 2, entries: 80, sessionCount: null }, sessionCountUnavailable: true })
    expect(count.findAll('[data-testid="kpi-card"] strong').map(node => node.text())).toEqual(['time:9', 'cost:2', '—', '80'])
    count.unmount()
  })
  it('preserves upper-bound and cost quality disclosures without treating unknown cost as zero', () => {
    const upper = detail(true, { summary: { workMs: 9, cost: 2, entries: 1, sessionCount: 1, waitingUnavailableEntries: 1, costUnknownEntries: 1 } })
    expect(upper.findAll('[data-testid="kpi-card"] strong').map(node => node.text())).toEqual(['≈time:9', '—', '1', '1'])
    expect(upper.text()).not.toContain('entries.detail.quality.upperBoundHint')
    expect(upper.text()).not.toContain('entries.detail.quality.costUnknown')
    expect(upper.get('[data-testid="task-detail-cost-info"]').attributes('aria-label')).toBe('tasks.detail.costInfo')
    upper.unmount()
    const estimated = detail(true, { summary: { workMs: 9, cost: 2, entries: 1, sessionCount: 1, costEstimatedEntries: 1 } })
    expect(estimated.findAll('[data-testid="kpi-card"] strong')[1]!.text()).toBe('≈cost:2')
    expect(estimated.text()).not.toContain('entries.detail.quality.costEstimatedHint')
    expect(estimated.find('[data-testid="task-detail-cost-info"]').exists()).toBe(true)
    estimated.unmount()
  })
  it('snapshots cost explanations in persistent independently replaceable toasts', async () => {
    const wrapper = detail(true, { summary: { workMs: 9, cost: 2, entries: 80, sessionCount: null, workMsMayOverlap: true, costUnknownEntries: 1 }, sessionCountUnavailable: true })
    expect(wrapper.findAll('[data-testid="kpi-card"] strong').map(node => node.text())).toEqual(['≈time:9', '—', '—', '80'])
    const cost = wrapper.get('[data-testid="task-detail-cost-info"]')
    expect(cost.attributes()).toMatchObject({ type: 'button', 'aria-label': 'tasks.detail.costInfo', title: 'tasks.detail.costInfo' })
    expect(cost.classes()).toEqual(expect.arrayContaining(['absolute', 'top-4', 'right-4']))
    expect(cost.get('[aria-hidden="true"]').classes()).toContain('size-4')
    expect(wrapper.findAll('[data-testid="kpi-card"]')[1]!.classes()).toEqual(expect.arrayContaining(['relative', '[&_[data-slot=card-title]]:pr-3', '[&_[data-slot=card-title]]:min-w-0', '[&_[data-slot=card-title]]:[overflow-wrap:anywhere]', '[&_[data-slot=card-title]]:line-clamp-none']))
    await wrapper.get('[data-testid="task-detail-work-time-info"]').trigger('click')
    await cost.trigger('click')
    expect(wrapper.toast.info).toHaveBeenLastCalledWith('dashboard.kpi.cost', 'entries.detail.quality.costUnknown. tasks.detail.costUnknownHint', { duration: 0 })
    expect(wrapper.toast.dismiss).not.toHaveBeenCalled()
    wrapper.detailProps.summary = { ...wrapper.detailProps.summary, costUnknownEntries: 0, costEstimatedEntries: 1 }
    await Vue.nextTick()
    expect(wrapper.toast.info.mock.calls[1]![1]).toContain('tasks.detail.costUnknownHint')
    expect(wrapper.toast.info.mock.calls[1]![1]).not.toContain('entries.detail.quality.costUnknownHint')
    expect(wrapper.findAll('[data-testid="kpi-card"] strong')[1]!.text()).toBe('≈cost:2')
    await cost.trigger('click')
    expect(wrapper.toast.dismiss).toHaveBeenCalledExactlyOnceWith(102)
    expect(wrapper.toast.info).toHaveBeenLastCalledWith('dashboard.kpi.cost', 'entries.detail.quality.costEstimatedHint', { duration: 0 })
    await wrapper.get('[data-testid="task-detail-work-time-info"]').trigger('click')
    expect(wrapper.toast.dismiss.mock.calls.map(call => call[0])).toEqual([102, 101])
    wrapper.detailProps.summary = null
    await Vue.nextTick()
    ;(wrapper.vm as any).showCostInfo?.()
    expect(wrapper.toast.info).toHaveBeenCalledTimes(4)
    expect(wrapper.toast.dismiss).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
  it.each([{ summary: null, summaryLoading: true }, { summary: null, summaryUnavailable: true }, { summaryUnavailable: true }, { summary: { workMs: 1, cost: 1, entries: 1, sessionCount: 1 } }, { pageMode: false, summary: { costUnknownEntries: 1 } }])('hides and guards cost Info without an available page quality notice %j', overrides => {
    const wrapper = detail(true, overrides)
    expect(wrapper.find('[data-testid="task-detail-cost-info"]').exists()).toBe(false)
    ;(wrapper.vm as any).showCostInfo?.()
    expect(wrapper.toast.info).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('localizes the cost information control in all three languages', () => {
    for (const [locale, expected] of [['en', 'Cost information'], ['es', 'Información del coste'], ['ja', 'コスト情報']]) {
      const dictionary = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8'))
      expect(dictionary.tasks.detail.costInfo).toBe(expected)
      const summaryHints: Record<string, string> = {
        en: 'Some task entries have unknown costs, so the total task cost is unavailable.',
        es: 'Algunos registros de la tarea tienen un coste desconocido, por lo que no se puede determinar el coste total.',
        ja: '一部のタスク記録のコストが不明なため、タスクの合計コストを算出できません。',
      }
      const entryHints: Record<string, string> = {
        en: "Cost could not be determined, so it's shown as 0 and excluded from cost averages.",
        es: 'El coste no se pudo determinar, por eso se muestra como 0 y se excluye de los promedios de coste.',
        ja: 'コストを特定できなかったため0として表示され、コストの平均計算からは除外されます。',
      }
      expect(dictionary.tasks.detail.costUnknownHint).toBe(summaryHints[locale!])
      expect(dictionary.entries.detail.quality.costUnknownHint).toBe(entryHints[locale!])
    }
  })
  it.each([true, false])('keeps title focus exposure and cached disclosures in pageMode=%s', async pageMode => {
    const wrapper = detail(pageMode, { sessionEntries: { 'session-one': { items: [], totalItems: 0 } } })
    const focus = vi.spyOn(wrapper.get('[data-testid="task-detail-title"]').element as HTMLElement, 'focus')
    ;(wrapper.vm as any).focusTitle()
    expect(focus).toHaveBeenCalled()
    await wrapper.get('[data-testid="task-detail-disclosure"]').trigger('click')
    expect(wrapper.events).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="task-detail-disclosure"]').attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })
  it.each([true, false])('places icon-only copy inside the padded command box in pageMode=%s', pageMode => {
    const wrapper = detail(pageMode)
    const command = wrapper.get('[data-testid="task-detail-resume-command"]')
    expect(command.classes()).toEqual(expect.arrayContaining(['relative', 'min-h-10', 'bg-muted', 'rounded-md']))
    expect(command.get('pre').classes()).toContain('pr-12')
    const copy = command.get('[data-testid="task-detail-copy"]')
    expect(copy.classes()).toEqual(expect.arrayContaining(['absolute', 'top-1', 'right-1']))
    expect(copy.attributes('icon-only')).toBeDefined()
    expect(copy.attributes('text')).toBe('pi --session one')
    wrapper.unmount()
  })
  it('positions only the quality work Info at the card top-right outside value flow', () => {
    const wrapper = detail(true)
    const cards = wrapper.findAll('[data-testid="kpi-card"]')
    expect(cards[0]!.classes()).toEqual(expect.arrayContaining(['relative', '[&_[data-slot=card-title]]:pr-3', '[&_[data-slot=card-title]]:line-clamp-none', '[&_[data-slot=card-title]]:min-w-0', '[&_[data-slot=card-title]]:[overflow-wrap:anywhere]']))
    const info = cards[0]!.get('[data-testid="task-detail-work-time-info"]')
    expect(info.classes()).toEqual(expect.arrayContaining(['absolute', 'top-4', 'right-4']))
    expect(info.classes()).not.toContain('mt-1')
    expect(info.get('[aria-hidden="true"]').classes()).toContain('size-4')
    for (const card of cards.slice(1)) expect(card.classes()).not.toContain('relative')
    wrapper.unmount()
    const plain = detail(true, { summary: { workMs: 1, cost: 1, entries: 1, sessionCount: 1 } })
    expect(plain.findAll('[data-testid="kpi-card"]')[0]!.classes()).not.toContain('relative')
    expect(plain.findAll('[data-testid="kpi-card"]')[0]!.classes()).not.toContain('[&_[data-slot=card-title]]:pr-3')
    expect(plain.findAll('[data-testid="kpi-card"]')[0]!.classes()).not.toContain('[&_[data-slot=card-title]]:line-clamp-none')
    expect(plain.findAll('[data-testid="kpi-card"]')[0]!.classes()).not.toContain('[&_[data-slot=card-title]]:min-w-0')
    expect(plain.findAll('[data-testid="kpi-card"]')[0]!.classes()).not.toContain('[&_[data-slot=card-title]]:[overflow-wrap:anywhere]')
    plain.unmount()
  })
  it('shows a persistent snapshot toast and replaces only its own previous notification', async () => {
    const wrapper = detail(true)
    const info = wrapper.get('[data-testid="task-detail-work-time-info"]')
    expect(info.attributes()).toMatchObject({ type: 'button', 'aria-label': 'dashboard.kpi.workTimeInfo', title: 'dashboard.kpi.workTimeInfo' })
    expect(info.get('[aria-hidden="true"]').exists()).toBe(true)
    await info.trigger('click')
    expect(wrapper.toast.info).toHaveBeenLastCalledWith('dashboard.kpi.workTime', 'tasks.detail.sessions.workApproxTitle', { duration: 0 })
    expect(wrapper.toast.dismiss).not.toHaveBeenCalled()
    wrapper.detailProps.summary = { ...wrapper.detailProps.summary, waitingUnavailableEntries: 1 }
    await Vue.nextTick()
    expect(wrapper.toast.info.mock.calls[0]![1]).toBe('tasks.detail.sessions.workApproxTitle')
    await info.trigger('click')
    expect(wrapper.toast.dismiss).toHaveBeenCalledExactlyOnceWith(101)
    expect(wrapper.toast.info).toHaveBeenLastCalledWith('dashboard.kpi.workTime', 'entries.detail.quality.upperBoundHint', { duration: 0 })
    wrapper.detailProps.summary = null
    await Vue.nextTick()
    ;(wrapper.vm as any).showWorkTimeInfo()
    expect(wrapper.toast.info).toHaveBeenCalledTimes(2)
    expect(wrapper.toast.dismiss).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('tolerates optional toast methods without dismissing unrelated notifications', async () => {
    const wrapper = detail(true)
    ;(wrapper.toast as any).dismiss = undefined
    await wrapper.get('[data-testid="task-detail-work-time-info"]').trigger('click')
    await wrapper.get('[data-testid="task-detail-work-time-info"]').trigger('click')
    expect(wrapper.toast.info).toHaveBeenCalledTimes(2)
    ;(wrapper.toast as any).info = undefined
    expect(() => (wrapper.vm as any).showWorkTimeInfo()).not.toThrow()
    wrapper.unmount()
  })
  it.each([{ summary: null, summaryLoading: true }, { summary: null, summaryUnavailable: true }, { summaryUnavailable: true }, { summary: { workMs: 1, cost: 1, entries: 1, sessionCount: 1 } }, { pageMode: false }])('hides and guards work Info for unavailable/no-quality/compact state %j', overrides => {
    const wrapper = detail(true, overrides)
    expect(wrapper.find('[data-testid="task-detail-work-time-info"]').exists()).toBe(false)
    ;(wrapper.vm as any).showWorkTimeInfo?.()
    expect(wrapper.toast.info).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('does not fabricate context links and keeps absent description/reference absent', () => {
    const wrapper = detail(true, { context: undefined, task: { title: 'Task', status: 'open' } })
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.find('[data-testid="task-detail-description"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-detail-reference"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('keeps status/edit and lazy disclosure event guards', async () => {
    const wrapper = detail(true)
    // Invoke the actual script handler; keyboard navigation belongs to Tabs.
    ;(wrapper.vm as any).onStatusTabChange('doing')
    ;(wrapper.vm as any).onStatusTabChange('invalid')
    expect(wrapper.events).toHaveBeenCalledWith('statusChange', 'doing')
    expect(wrapper.events).toHaveBeenCalledTimes(1)
    await wrapper.get('button[data-testid="write-action"]').trigger('click')
    expect(wrapper.events).toHaveBeenCalledWith('edit')
    await wrapper.get('[data-testid="task-detail-disclosure"]').trigger('click')
    expect(wrapper.events).toHaveBeenCalledWith('expandSession', 'session-one')
    wrapper.detailProps.canWrite = false
    await Vue.nextTick()
    ;(wrapper.vm as any).onStatusTabChange('done')
    expect(wrapper.findAll('[data-testid="write-action"]')).toHaveLength(0)
    expect(wrapper.events).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })
  it('preserves drawer padding, compact h2, session row styling and controls', () => {
    const wrapper = detail(false)
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['overflow-y-auto', 'px-6', 'pt-8', 'pb-6']))
    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.find('[data-testid="task-detail-summary"]').exists()).toBe(false)
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.get('h2').classes()).toContain('text-base')
    expect(wrapper.find('button[aria-label="Back to project"]').exists()).toBe(false)
    expect(wrapper.get('section h3').classes()).toContain('font-medium')
    const card = wrapper.get('section > ul > li')
    expect(card.classes()).toEqual(expect.arrayContaining(['space-y-3', 'overflow-x-auto', 'rounded-md', 'border-border', 'p-3', 'text-sm']))
    expect(card.classes()).not.toContain('bg-card')
    expect(wrapper.findAll('[data-testid="write-action"]')).toHaveLength(2)
    wrapper.unmount()
  })
  it.each([true, false])('keeps an accessible project back in loaded=%s page states', loaded => {
    const wrapper = mount(defineComponent({
      render: template('app/pages/organizacion/clientes/[id]/proyectos/[projectId]/tareas/[taskId].vue'),
      data: () => ({ loading: !loaded, error: false, task: loaded ? { title: 'Task' } : null, sessionsError: false, projectName: 'Project', sessions: [], sessionsLoading: false, sessionEntries: {}, canWrite: false, editOpen: false, t: () => 'Back', backToProject: () => {}, openEdit: () => {}, changeStatus: () => {}, expandSession: () => {}, taskAuthorized: () => true }),
    }), { global: { components: { ...globals.components, TaskDetailSheet: defineComponent({ template: '<div><slot name="back" /></div>' }), TaskEditDialog: primitive } } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['w-full', 'min-w-0', 'gap-6']))
    expect(wrapper.classes()).not.toContain('max-w-4xl')
    expect(wrapper.findAll('button')).toHaveLength(1)
    expect(wrapper.get('button').attributes('aria-label')).toBe('Back')
    wrapper.unmount()
  })
})
