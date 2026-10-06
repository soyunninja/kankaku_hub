import { readFileSync } from 'node:fs'
import { compileScript, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Render the real host and live regions; CSS geometry remains a browser check.
function setup() {
  const source = readFileSync('app/components/ui/toast/Toaster.vue', 'utf8')
  const { descriptor } = parse(source)
  const script = compileScript(descriptor, { id: 'toaster-host', inlineTemplate: true })
  const toasts = Vue.ref([{ id: 1, title: 'Work time', description: 'Full quality explanation', variant: 'default', action: { href: '/entries', label: 'View entries' } }, { id: 2, title: 'Error', description: 'Error explanation', variant: 'destructive' }])
  const dismiss = vi.fn((id: number) => { toasts.value = toasts.value.filter(row => row.id !== id) })
  const exports: any = {}
  const code = ts.transpile(script.content, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ESNext })
  new Function('require', 'exports', 'computed', 'useToast', 'useI18n', code)(
    (id: string) => id === 'vue' ? Vue : id.includes('utils') ? { cn: (...classes: unknown[]) => classes.filter(Boolean).join(' ') } : { X: Vue.defineComponent({ template: '<svg />' }) },
    exports, Vue.computed, () => ({ toasts, dismiss }), () => ({ t: (key: string) => key }),
  )
  const link = Vue.defineComponent({ props: ['to'], template: '<a :href="to"><slot /></a>' })
  const wrapper = mount(exports.default, { global: { stubs: { teleport: true }, components: { NuxtLink: link } } })
  return { wrapper, dismiss }
}

describe('responsive Toaster host', () => {
  it('keeps mobile 16px insets and the existing desktop right-aligned maximum width', () => {
    const { wrapper } = setup()
    const host = wrapper.get('[data-testid="toast-viewport"]')
    expect(host.classes()).toEqual(expect.arrayContaining(['fixed', 'bottom-4', 'left-4', 'right-4', 'w-auto', 'max-w-sm', 'sm:left-auto', 'sm:w-full', 'pointer-events-none', 'gap-2']))
    expect(host.classes()).not.toContain('w-full')
    wrapper.unmount()
  })
  it('preserves live announcements, action links and individually dismissible cards', async () => {
    const { wrapper, dismiss } = setup()
    expect(wrapper.get('[role="status"]').attributes()).toMatchObject({ 'aria-live': 'polite', 'aria-atomic': 'true' })
    expect(wrapper.get('[role="status"]').text()).toBe('Work time. Full quality explanation')
    expect(wrapper.get('[role="alert"]').attributes('aria-live')).toBe('assertive')
    expect(wrapper.get('[role="alert"]').text()).toBe('Error. Error explanation')
    expect(wrapper.get('a').attributes('href')).toBe('/entries')
    await wrapper.findAll('button[aria-label="common.close"]')[0]!.trigger('click')
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(1)
    expect(wrapper.get('[role="status"]').text()).toBe('')
    expect(wrapper.get('[role="alert"]').text()).toBe('Error. Error explanation')
    wrapper.unmount()
  })
})
