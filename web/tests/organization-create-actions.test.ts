import { readFileSync } from 'node:fs'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Compile the actual pages; replace imports/composables, never contact PocketBase.
function renderer(catalog: 'clients' | 'projects', canWrite: boolean) {
  const create = vi.fn()
  const dialogOpen = Vue.ref(false)
  const openCreate = vi.fn(() => { dialogOpen.value = true })
  const editor = { openCreate, openEdit: vi.fn(), toggleArchive: vi.fn(), close: vi.fn(), dialogOpen }
  const passthrough = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h('div', slots.default?.()) })
  const button = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h('button', slots.default?.()) })
  const dialog = Vue.defineComponent({ props: ['open', 'editor'], setup: props => () => Vue.h('div', { 'data-dialog-open': String(props.open ?? props.editor?.dialogOpen?.value) }) })
  const imports = new Proxy({}, { get: (_, key) => key === 'Button' ? button : key === 'Dialog' ? dialog : passthrough })
  const { descriptor } = parse(readFileSync(`app/pages/${catalog}/index.vue`, 'utf8'))
  const compiled = compileScript(descriptor, { id: `create-${catalog}`, inlineTemplate: true })
  const exports: any = {}
  const globals = {
    ref: Vue.ref,
    reactive: Vue.reactive,
    computed: Vue.computed,
    onMounted: Vue.onMounted,
    onBeforeUnmount: Vue.onBeforeUnmount,
    useI18n: () => ({ t: (key: string) => key, locale: Vue.ref('en') }),
    useHead: vi.fn(), useFormatters: () => ({ formatCost: String, formatDuration: String }),
    useClients: () => ({ clients: Vue.ref([]), loading: Vue.ref(false), ensureLoaded: vi.fn() }),
    useProjects: () => ({ projects: Vue.ref([]), loading: Vue.ref(false), ensureLoaded: vi.fn(), create, update: vi.fn() }),
    useTaskEntries: () => ({ fetchRange: vi.fn() }),
    useTotals: () => ({ fetchRangeTotals: vi.fn().mockResolvedValue({ groups: [], totalPages: 1 }) }),
    useAuth: () => ({ canWrite: Vue.ref(canWrite) }), useClientEditor: () => editor,
    useToast: () => ({ success: vi.fn(), error: vi.fn() }), navigateTo: vi.fn(),
  }
  new Function('require', 'exports', ...Object.keys(globals), ts.transpile(compiled.content, { module: ts.ModuleKind.CommonJS }))(
    (id: string) => id === 'vue' ? Vue : id.includes('/period') ? { resolvePreset: () => ({ start: '', end: '' }) } : id.includes('/totals-map') ? { totalsByGroupKey: () => ({}) } : id.includes('/project-sort') ? { sortProjects: (rows: unknown[]) => rows } : id.includes('ClientEditDialog') ? { default: dialog } : imports,
    exports, ...Object.values(globals),
  )
  return { component: exports.default, create, openCreate }
}

describe.each(['clients', 'projects'] as const)('%s creation placement', catalog => {
  it.each([true, false])('writer has exactly one existing action (embedded=%s)', async embedded => {
    const { component, create, openCreate } = renderer(catalog, true)
    const wrapper = mount(component, { props: { embedded } })
    const actions = wrapper.findAll('button').filter(button => button.text() === `${catalog}.new`)
    expect(actions).toHaveLength(1)
    const action = actions[0]!
    const group = wrapper.get('[role="group"]')
    if (embedded) {
      expect(group.element.nextElementSibling).toBe(action.element)
      expect(group.element.parentElement!.classList.contains('flex-wrap')).toBe(true)
      expect(group.element.parentElement!.classList.contains('min-w-0')).toBe(true)
    }
    else {
      expect(action.element.compareDocumentPosition(group.element) & 4).toBe(4)
      expect(wrapper.find('h1').exists()).toBe(true)
    }
    expect(action.attributes('disabled')).toBeUndefined()
    await action.trigger('click')
    expect(wrapper.get('[data-dialog-open]').attributes('data-dialog-open')).toBe('true')
    if (catalog === 'clients') expect(openCreate).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it.each([true, false])('viewer has no creation action (embedded=%s)', embedded => {
    const { component, create, openCreate } = renderer(catalog, false)
    const wrapper = mount(component, { props: { embedded } })
    expect(wrapper.findAll('button').some(button => button.text() === `${catalog}.new`)).toBe(false)
    expect(create).not.toHaveBeenCalled()
    expect(openCreate).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
