import { readFileSync } from 'node:fs'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

function setup(iconOnly?: boolean, supported = true) {
  const path = 'app/components/commands/CopyButton.vue'
  const { descriptor } = parse(readFileSync(path, 'utf8'))
  const compiled = compileTemplate({ source: descriptor.template!.content, filename: path, id: path })
  expect(compiled.errors).toEqual([])
  const exports: any = {}
  new Function('require', 'exports', ts.transpile(compiled.code, { module: ts.ModuleKind.CommonJS }))(() => Vue, exports)
  const props = Vue.reactive({ text: 'pi --session /long/path', iconOnly })
  const copied = Vue.ref(false)
  const clipboard = vi.fn()
  const useClipboard = vi.fn(({ source }) => ({ copied, isSupported: Vue.ref(supported), copy: () => { clipboard(source.value); copied.value = true } }))
  const bindings = { defineProps: () => props, withDefaults: (p: any, defaults: any) => { if (p.iconOnly === undefined) p.iconOnly = defaults.iconOnly; return p }, computed: Vue.computed, useClipboard, useI18n: () => ({ t: (key: string, values?: any) => values ? `${key}: ${values.syntax}` : key }) }
  const code = ts.transpile(descriptor.scriptSetup!.content.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const state = new Function(...Object.keys(bindings), `${code}; return { t, copy, copied, isSupported }`)(...Object.values(bindings))
  const wrapper = mount(Vue.defineComponent({ render: exports.render, setup: () => ({ props, ...Vue.toRefs(props), ...state }) }), { attrs: { 'data-testid': 'task-detail-copy', class: 'absolute top-1 right-1' }, global: { components: { Button: Vue.defineComponent({ template: '<button><slot /></button>' }), Check: Vue.defineComponent({ template: '<svg data-testid="copy-success" />' }), Copy: Vue.defineComponent({ template: '<svg data-testid="copy-icon" />' }) } } })
  return { wrapper, clipboard, useClipboard }
}

describe('CopyButton', () => {
  it('keeps the default visible label and outline/small styling', () => {
    const { wrapper } = setup()
    expect(wrapper.get('button').attributes()).toMatchObject({ variant: 'outline', size: 'sm' })
    expect(wrapper.get('[aria-live="polite"]').text()).toBe('commands.copy')
    expect(wrapper.get('[aria-live="polite"]').classes()).not.toContain('sr-only')
    wrapper.unmount()
  })
  it('copies the full text with icon-only accessible live success feedback', async () => {
    const { wrapper, clipboard, useClipboard } = setup(true)
    expect(wrapper.get('button').attributes()).toMatchObject({ variant: 'ghost', size: 'icon-sm', 'aria-label': 'commands.copyAria: pi --session /long/path' })
    expect(wrapper.get('button').attributes('data-testid')).toBe('task-detail-copy')
    expect(wrapper.get('button').classes()).toEqual(expect.arrayContaining(['absolute', 'top-1', 'right-1']))
    expect(wrapper.get('[aria-live="polite"]').classes()).toContain('sr-only')
    expect(wrapper.findAll('span:not(.sr-only)')).toHaveLength(0)
    expect(wrapper.get('[data-testid="copy-icon"]').attributes('aria-hidden')).toBe('true')
    await wrapper.get('button').trigger('click')
    expect(clipboard).toHaveBeenCalledWith('pi --session /long/path')
    expect(wrapper.get('[data-testid="copy-success"]').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('[aria-live="polite"]').text()).toBe('commands.copied')
    expect(useClipboard).toHaveBeenCalledWith(expect.objectContaining({ copiedDuring: 1500 }))
    wrapper.unmount()
  })
  it.each([true, false])('disables unsupported clipboard in iconOnly=%s', async iconOnly => {
    const { wrapper, clipboard } = setup(iconOnly, false)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(clipboard).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
