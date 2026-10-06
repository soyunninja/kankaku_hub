import { readFileSync } from 'node:fs'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToast } from '../app/composables/useToast'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import ja from '../i18n/locales/ja.json'

const page = readFileSync('app/pages/index.vue', 'utf8')
const toaster = readFileSync('app/components/ui/toast/Toaster.vue', 'utf8')
let stack: Vue.Ref<any[]>

function compile(source: string, globals: Record<string, unknown>) {
  const { descriptor } = parse(source)
  const script = compileScript(descriptor, { id: 'quality-toast', inlineTemplate: true })
  const exports: any = {}
  const icon = Vue.defineComponent({ setup: () => () => Vue.h('svg') })
  new Function('require', 'exports', ...Object.keys(globals), ts.transpile(script.content, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext }))(
    (id: string) => id === 'vue' ? Vue : id.includes('utils') ? { cn: (...args: unknown[]) => args.filter(Boolean).join(' ') } : { Info: icon, X: icon },
    exports, ...Object.values(globals),
  )
  return exports.default
}

beforeEach(() => {
  vi.useFakeTimers()
  stack = Vue.ref([])
  vi.stubGlobal('useState', () => stack)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('dashboard quality information toast', () => {
  it('keeps existing default lifetimes and variants while supporting persistent action links', () => {
    const toast = useToast()
    toast.success('saved'); toast.error('failed'); toast.info('info', 'detail')
    expect(stack.value.map(row => row.variant)).toEqual(['success', 'destructive', 'default'])
    vi.advanceTimersByTime(4999)
    expect(stack.value).toHaveLength(3)
    vi.advanceTimersByTime(1)
    expect(stack.value).toHaveLength(0)
    const brief = toast.info('brief', undefined, { duration: 1000 })
    vi.advanceTimersByTime(1000)
    expect(stack.value.some(row => row.id === brief)).toBe(false)
    const id = toast.info('quality', 'full explanation', { duration: 0, action: { href: '/entries?quality=waitingUnavailable', label: 'View them' } })
    vi.advanceTimersByTime(60000)
    expect(stack.value[0].action.label).toBe('View them')
    toast.dismiss(id)
    expect(stack.value).toHaveLength(0)
  })

  it('localizes the full count explanation, compact label and separate link in every language', () => {
    for (const locale of [en, es, ja]) {
      const copy = locale.dashboard.kpi
      expect(copy.workTimeUpperBoundNotice).toContain('{count}')
      expect(copy.workTimeInfo.trim()).not.toBe('')
      expect(copy.workTimeViewEntries.trim()).not.toBe('')
      expect(copy.workTimeUpperBoundNotice).not.toContain(copy.workTimeViewEntries)
    }
  })

  it('renders an actual escaped action anchor, full live announcement and manual close control', async () => {
    const toast = useToast()
    toast.info('Work time', 'Includes 2 entries <script>unsafe</script>', { duration: 0, action: { href: '/entries?agent=pi', label: 'View them' } })
    const component = compile(toaster, { computed: Vue.computed, useToast: () => toast, useI18n: () => ({ t: (key: string) => key }) })
    const link = Vue.defineComponent({ props: ['to'], setup: (props, { slots }) => () => Vue.h('a', { href: props.to }, slots.default?.()) })
    const wrapper = mount(component, { global: { stubs: { teleport: true }, components: { NuxtLink: link } } })
    expect(wrapper.get('a').attributes('href')).toBe('/entries?agent=pi')
    expect(wrapper.get('a').text()).toBe('View them')
    expect(wrapper.get('[role="status"]').text()).toContain('Includes 2 entries')
    expect(wrapper.find('script').exists()).toBe(false)
    await wrapper.get('button[aria-label="common.close"]').trigger('click')
    expect(stack.value).toHaveLength(0)
    wrapper.unmount()
  })

  it('positions only positive-quality work Info inside its card with reserved title space', async () => {
    const quality = Vue.ref({ upperBoundCount: 0 })
    const grid = page.match(/<div class="grid grid-cols-2 gap-6 [^"]+">/)![0]
    const work = page.match(/<KpiCard :title="t\('dashboard.kpi.workTime'\)"[^>]*>[\s\S]*?<\/KpiCard>/)![0]
    const wall = page.match(/<KpiCard :title="t\('dashboard.kpi.wallTime'\)"[^>]*\/>/)![0]
    const component = compile(`<script setup lang="ts">import { Info } from '@lucide/vue'; const { workTimeQuality } = qualityGlobals; const totals = { workMs: 1, wallMs: 1 }; const previousTotals = totals; const t = (key: string) => key; const formatDuration = String; const showWorkTimeInfo = () => {};</script><template>${grid}${work}${wall}</div></template>`, { qualityGlobals: { workTimeQuality: quality } })
    const card = Vue.defineComponent({ props: ['title', 'value'], template: '<div data-testid="kpi-card"><h3 data-slot="card-title">{{ title }}</h3><p>{{ value }}</p><slot /></div>' })
    const wrapper = mount(component, { global: { components: { KpiCard: card } } })
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['grid-cols-2', 'lg:grid-cols-4']))
    expect(wrapper.classes()).not.toContain('md:grid-cols-4')
    expect(wrapper.findAll('[data-testid="kpi-card"]')[0]!.classes()).not.toContain('relative')
    expect(wrapper.find('button').exists()).toBe(false)
    quality.value.upperBoundCount = 2
    await Vue.nextTick()
    const cards = wrapper.findAll('[data-testid="kpi-card"]')
    expect(cards[0]!.classes()).toEqual(expect.arrayContaining(['relative', '[&_[data-slot=card-title]]:pr-3', '[&_[data-slot=card-title]]:line-clamp-none', '[&_[data-slot=card-title]]:min-w-0', '[&_[data-slot=card-title]]:[overflow-wrap:anywhere]']))
    const info = cards[0]!.get('[data-testid="dashboard-work-time-info"]')
    expect(info.classes()).toEqual(expect.arrayContaining(['absolute', 'top-4', 'right-4']))
    expect(info.classes()).not.toContain('mt-1')
    expect(info.get('[aria-hidden="true"]').classes()).toContain('size-4')
    expect(cards[1]!.classes()).not.toContain('relative')
    quality.value.upperBoundCount = 0
    await Vue.nextTick()
    expect(cards[0]!.classes()).not.toContain('[&_[data-slot=card-title]]:pr-3')
    expect(cards[0]!.classes()).not.toContain('[&_[data-slot=card-title]]:line-clamp-none')
    expect(cards[0]!.classes()).not.toContain('[&_[data-slot=card-title]]:min-w-0')
    expect(cards[0]!.classes()).not.toContain('[&_[data-slot=card-title]]:[overflow-wrap:anywhere]')
    wrapper.unmount()
  })

  it('shows only a positive-count icon and snapshots count and drilldown on each click', async () => {
    const quality = Vue.ref({ upperBoundCount: 0 })
    const drilldown = Vue.ref({ path: '/entries', query: { quality: 'waitingUnavailable', dateStart: '2026-01-01', dateEnd: '2026-01-31', agent: 'pi' } })
    const toast = useToast()
    const start = page.indexOf('let qualityToastId')
    const functionSource = start < 0 ? '' : page.slice(start, page.indexOf('const committedProjectKeys', start))
    const slot = page.match(/<KpiCard :title="t\('dashboard.kpi.workTime'\)"[^>]*>([\s\S]*?)<\/KpiCard>/)![1]
    const component = compile(`<script setup lang="ts">import { Info } from '@lucide/vue'; const { workTimeQuality, workTimeUpperBoundDrilldown, toast, t } = qualityGlobals; ${functionSource}</script><template><div>${slot}</div></template>`, {
      qualityGlobals: { workTimeQuality: quality, workTimeUpperBoundDrilldown: drilldown, toast, t: (key: string, args?: any) => `${key}${args ? ` ${args.count}` : ''}` },
    })
    const wrapper = mount(component)
    expect(wrapper.find('button').exists()).toBe(false)
    quality.value.upperBoundCount = 2
    await Vue.nextTick()
    expect(wrapper.find('p').exists()).toBe(false)
    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.attributes('aria-label')).toContain('workTimeInfo')
    await button.trigger('click')
    expect(stack.value).toHaveLength(1)
    expect(stack.value[0].description).toContain(' 2')
    const href = stack.value[0].action.href
    const query = new URL(href, 'https://example.test').searchParams
    expect(query.get('dateStart')).toBe('2026-01-01')
    expect(query.get('dateEnd')).toBe('2026-01-31')
    expect(query.get('quality')).toBe('waitingUnavailable')
    quality.value.upperBoundCount = 5
    drilldown.value.query.agent = 'opencode'
    drilldown.value.query.dateStart = '2026-02-01'
    expect(stack.value[0].description).toContain(' 2')
    expect(new URL(href, 'https://example.test').searchParams.get('agent')).toBe('pi')
    await button.trigger('click')
    expect(stack.value).toHaveLength(1) // replace only this page's previous information toast
    expect(stack.value[0].description).toContain(' 5')
    expect(new URL(stack.value[0].action.href, 'https://example.test').searchParams.get('agent')).toBe('opencode')
    vi.advanceTimersByTime(60000)
    expect(stack.value).toHaveLength(1)
    quality.value.upperBoundCount = 0
    await Vue.nextTick()
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })
})
