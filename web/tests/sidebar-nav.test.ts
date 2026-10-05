import { readFileSync } from 'node:fs'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import { NAV_ITEMS, SEGMENT_LABELS } from '../app/lib/nav-items'

function renderer(path = '/organizacion') {
  const { descriptor } = parse(readFileSync('app/components/app-shell/SidebarNav.vue', 'utf8'))
  const compiled = compileScript(descriptor, { id: 'sidebar-test', inlineTemplate: true })
  const exports: any = {}
  const route = Vue.reactive({ path })
  const queue = () => ({ count: Vue.ref(3), ensureLoaded: vi.fn(), refresh: vi.fn() })
  const sessions = queue()
  const unassigned = queue()
  const icon = Vue.defineComponent({ render: () => Vue.h('svg') })
  new Function('require', 'exports', 'computed', 'onMounted', 'watch', 'useI18n', 'useRoute', 'useSessionsQueueCount', 'useUnassignedQueueCount', ts.transpile(compiled.content, { module: ts.ModuleKind.CommonJS }))(
    (id: string) => id === 'vue' ? Vue : id.endsWith('nav-items') ? { NAV_ITEMS } : id.endsWith('badge') ? { Badge: Vue.defineComponent({ render() { return Vue.h('span', this.$slots.default?.()) } }) } : new Proxy({}, { get: () => icon }),
    exports, Vue.computed, Vue.onMounted, Vue.watch, () => ({ t: (key: string) => key }), () => route, () => sessions, () => unassigned,
  )
  const wrapper = mount(exports.default, { global: { components: { NuxtLink: Vue.defineComponent({ props: ['to'], render() { return Vue.h('a', { href: this.to }, this.$slots.default?.()) } }) } } })
  return { wrapper, route, sessions, unassigned }
}

describe('actual SidebarNav renderer', () => {
  it('omits only standalone catalogs while leaving the shared palette/breadcrumb registry intact', () => {
    const before = JSON.stringify(NAV_ITEMS)
    const { wrapper } = renderer()
    expect(wrapper.findAll('a').map(link => link.attributes('href'))).toEqual(NAV_ITEMS.filter(item => !['/clients', '/projects', '/tasks'].includes(item.to)).map(item => item.to))
    expect(JSON.stringify(NAV_ITEMS)).toBe(before)
    for (const catalog of ['clients', 'projects', 'tasks']) {
      expect(NAV_ITEMS.find(item => item.to === `/${catalog}`)?.labelKey).toBe(`nav.${catalog}`)
      expect(SEGMENT_LABELS[catalog]).toBe(`nav.${catalog}`)
    }
    wrapper.unmount()
  })
  it('removes the nonlinked Organization heading but retains its linked label', () => {
    const { wrapper } = renderer()
    expect(wrapper.findAll('p').filter(p => p.text() === 'nav.organization')).toHaveLength(0)
    expect(wrapper.get('a[href="/organizacion"]').text()).toBe('nav.organization')
    wrapper.unmount()
  })
  it.each(['/organizacion', '/organizacion/clientes/owner/proyectos/project/tareas/task'])('retains active Organization at %s', path => {
    const { wrapper } = renderer(path)
    expect(wrapper.get('a[href="/organizacion"]').attributes('aria-current')).toBe('page')
    expect(wrapper.get('a[href="/"]').attributes('aria-current')).toBeUndefined()
    wrapper.unmount()
  })
  it('retains badges, loading, navigation callbacks and route refresh behavior', async () => {
    const { wrapper, route, sessions, unassigned } = renderer('/')
    expect(wrapper.get('a[href="/"]').attributes('aria-current')).toBe('page')
    expect(wrapper.get('a[href="/organizacion"]').attributes('aria-current')).toBeUndefined()
    for (const queue of [sessions, unassigned]) expect(queue.ensureLoaded).toHaveBeenCalledOnce()
    expect(wrapper.get('a[href="/unassigned"]').text()).toContain('3')
    expect(wrapper.get('a[href="/sessions-without-task"]').text()).toContain('3')
    await wrapper.get('a[href="/entries"]').trigger('click')
    expect(wrapper.emitted('navigate')).toHaveLength(1)
    route.path = '/entries'
    await Vue.nextTick()
    expect(wrapper.get('a[href="/entries"]').attributes('aria-current')).toBe('page')
    for (const queue of [sessions, unassigned]) expect(queue.refresh).toHaveBeenCalledOnce()
    wrapper.unmount()
  })
})
