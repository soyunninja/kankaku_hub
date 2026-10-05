import { readFileSync } from 'node:fs'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import * as avatar from '../app/lib/client-avatar'
import { cn } from '../app/lib/utils'

// Compile both script and template: exercise the real reactive failure/reset path.
function renderer(getURL = vi.fn((_record: unknown, file: string) => `https://images.test/${file}`)) {
  const filename = 'app/components/clients/ClientAvatar.vue'
  const { descriptor } = parse(readFileSync(filename, 'utf8'))
  const compiled = compileScript(descriptor, { id: 'avatar-test', inlineTemplate: true })
  const exports: any = {}
  const code = ts.transpile(compiled.content, { module: ts.ModuleKind.CommonJS })
  new Function('require', 'exports', 'computed', 'ref', 'watch', 'useNuxtApp', code)(
    (id: string) => id === 'vue' ? Vue : id.endsWith('client-avatar') ? avatar : { cn },
    exports, Vue.computed, Vue.ref, Vue.watch, () => ({ $pb: { files: { getURL } } }),
  )
  return { component: exports.default, getURL }
}
const client = { id: 'client-one', name: 'Example Client', favicon: 'icon.png', updated: '2026-01-01' }
function expectInitials(wrapper: ReturnType<typeof mount>) {
  const el = wrapper.get('[data-testid="client-avatar"]')
  expect(el.attributes('data-avatar-state')).toBe('initials')
  expect(el.text()).toBe('EC')
  expect((el.element as HTMLElement).style.background).toBe(avatar.avatarColorVar(client.id))
  expect((el.element as HTMLElement).style.color).toBe(avatar.AVATAR_FOREGROUND_VAR)
  expect((el.element as HTMLElement).style.padding).toBe('')
  expect(wrapper.find('img').exists()).toBe(false)
}
describe('actual ClientAvatar renderer', () => {
  it.each(['light', 'dark'])('uses exact white and 5px inset in %s without changing image semantics', theme => {
    document.documentElement.className = theme
    const { component } = renderer()
    const wrapper = mount(component, { props: { client } })
    const el = wrapper.get('[data-testid="client-avatar"]').element as HTMLElement
    expect(el.style.background).toBe('#fff')
    expect(el.style.padding).toBe('5px')
    const img = wrapper.get('img')
    expect(img.attributes()).toMatchObject({ alt: '', loading: 'lazy', decoding: 'async', src: avatar.withCacheBust('https://images.test/icon.png', client.updated) })
    expect(img.classes()).toEqual(['size-full', 'object-cover'])
    wrapper.unmount()
    document.documentElement.className = ''
  })
  it.each([['xs', 'size-5'], ['sm', 'size-6'], ['md', 'size-10']] as const)('preserves %s outer sizing and caller override', (size, expected) => {
    const { component } = renderer()
    const wrapper = mount(component, { props: { client, size } })
    expect(wrapper.classes()).toContain(expected)
    wrapper.unmount()
    const custom = mount(component, { props: { client, size, class: 'size-7' }, attrs: { 'aria-label': 'Client' } })
    expect(custom.classes()).toContain('size-7')
    expect(custom.classes()).not.toContain(expected)
    expect(custom.attributes('aria-label')).toBe('Client')
    custom.unmount()
  })
  it.each(['', undefined])('keeps missing favicon initials untouched (%s)', favicon => {
    const { component, getURL } = renderer()
    const wrapper = mount(component, { props: { client: { ...client, favicon } } })
    expectInitials(wrapper)
    expect(getURL).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('keeps initials when PocketBase URL generation throws', () => {
    const { component } = renderer(vi.fn(() => { throw new Error('unavailable') }))
    const wrapper = mount(component, { props: { client } })
    expectInitials(wrapper)
    wrapper.unmount()
  })
  it('removes image inset on failure and recovers only when the cache URL changes', async () => {
    const { component } = renderer()
    const wrapper = mount(component, { props: { client } })
    await wrapper.get('img').trigger('error')
    expectInitials(wrapper)
    await wrapper.setProps({ client: { ...client, name: 'Example Changed' } })
    expectInitials(wrapper)
    await wrapper.setProps({ client: { ...client, updated: '2026-01-02' } })
    expect(wrapper.attributes('data-avatar-state')).toBe('image')
    expect(wrapper.get('img').attributes('src')).toContain('v=2026-01-02')
    expect((wrapper.element as HTMLElement).style.padding).toBe('5px')
    await wrapper.get('img').trigger('error')
    await wrapper.setProps({ client: { ...client, favicon: 'replacement.png' } })
    expect(wrapper.get('img').attributes('src')).toContain('replacement.png')
    wrapper.unmount()
  })
})
