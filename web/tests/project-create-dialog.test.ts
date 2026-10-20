import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { computed, reactive } from 'vue'
import * as Vue from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { compileScript, compileTemplate, parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { useProjectCreate, type ProjectCreateContext } from '../app/composables/useProjectCreate'

const context = (): ProjectCreateContext => ({ canWrite: true, isAuthenticated: true, routeClientId: 'c1', clientId: 'c1', clientName: 'Client', clientActive: true, userId: 'owner', role: 'owner', token: 'token' })

function uiPrimitives() {
  const pass = (name: string) => Vue.defineComponent({ name, inheritAttrs: false, setup: (_, { attrs, slots }) => () => Vue.h('div', attrs, slots.default?.()) })
  const Button = Vue.defineComponent({ name: 'Button', props: { type: { type: String, default: 'button' }, disabled: Boolean }, inheritAttrs: false, setup: (props, { attrs, slots }) => () => Vue.h('button', { ...attrs, type: props.type, disabled: props.disabled || undefined }, slots.default?.()) })
  const Dialog = Vue.defineComponent({ name: 'Dialog', props: { open: Boolean }, emits: ['update:open'], setup: (props, { slots }) => () => props.open ? Vue.h('div', { 'data-testid': 'dialog' }, slots.default?.()) : null })
  const DialogContent = Vue.defineComponent({ name: 'DialogContent', props: { showCloseButton: Boolean }, emits: ['escape-key-down', 'pointer-down-outside', 'interact-outside'], setup: (props, { emit, slots }) => () => Vue.h('div', { 'data-close-visible': String(props.showCloseButton) }, [...(props.showCloseButton ? [Vue.h('button', { 'data-testid': 'dialog-x', onClick: () => emit('escape-key-down', { preventDefault: vi.fn() }) }, 'X')] : []), ...slots.default?.() ?? []]) })
  const field = (tag: string) => Vue.defineComponent({ props: { modelValue: String }, emits: ['update:modelValue'], inheritAttrs: false, setup: (props, { attrs, emit }) => () => Vue.h(tag, { ...attrs, value: props.modelValue, onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value) }) })
  return { button: Button, dialog: Dialog, content: DialogContent, footer: pass('DialogFooter'), header: pass('DialogHeader'), title: pass('DialogTitle'), input: field('input'), textarea: field('textarea'), label: pass('Label') }
}

function compiledDialog(current: { value: ProjectCreateContext | null }, create: ReturnType<typeof vi.fn>, validateClient = vi.fn().mockResolvedValue(true)) {
  const { descriptor } = parse(readFileSync('app/components/projects/ProjectCreateDialog.vue', 'utf8'))
  const script = compileScript(descriptor, { id: 'project-create-dialog', inlineTemplate: true })
  const exports: { default?: Vue.Component } = {}
  const ui = uiPrimitives()
  const pb = { authStore: { isValid: true, record: { id: 'owner', role: 'owner' }, token: 'token' }, collection: () => ({ getOne: validateClient }) }
  new Function('require', 'exports', 'useI18n', 'useNuxtApp', 'useProjects', ts.transpile(script.content, { module: ts.ModuleKind.CommonJS }))((id: string) => {
    if (id === 'vue') return Vue
    if (id === '@lucide/vue') return { Plus: Vue.defineComponent({ setup: () => () => Vue.h('span') }) }
    if (id.includes('useProjectCreate')) return { useProjectCreate }
    if (id.endsWith('/button')) return { Button: ui.button }
    if (id.endsWith('/dialog')) return { Dialog: ui.dialog, DialogContent: ui.content, DialogFooter: ui.footer, DialogHeader: ui.header, DialogTitle: ui.title }
    if (id.endsWith('/input')) return { Input: ui.input }
    if (id.endsWith('/label')) return { Label: ui.label }
    if (id.endsWith('/textarea')) return { Textarea: ui.textarea }
    return {}
  }, exports, () => ({ t: (key: string) => key }), () => ({ $pb: pb }), () => ({ create }))
  return { component: exports.default!, ui, pb, validateClient }
}

function compiledProjectsHeading(child: Vue.Component, context: ProjectCreateContext) {
  const page = readFileSync('app/pages/organizacion/clientes/[id]/index.vue', 'utf8')
  const start = page.lastIndexOf('<section', page.indexOf('data-testid="client-projects"'))
  const end = page.indexOf('</section>', start) + '</section>'.length
  const compiled = compileTemplate({ source: page.slice(start, end), filename: 'client-project-heading.vue', id: 'client-project-heading' })
  expect(compiled.errors).toEqual([])
  const exports: { render?: Vue.RenderFunction } = {}
  new Function('require', 'exports', ts.transpile(compiled.code, { module: ts.ModuleKind.CommonJS }))((id: string) => id === 'vue' ? Vue : {}, exports)
  const Parent = Vue.defineComponent({ setup: () => ({ t: (key: string) => key, detailProjects: [], projectsTruncated: false, projectsTruncatedEntryCount: 0, projectCreateContext: computed(() => context) }), render: exports.render })
  const pass = (name: string) => Vue.defineComponent({ name, setup: (_, { slots }) => () => Vue.h('span', slots.default?.()) })
  return mount(Parent, { global: { components: { ProjectCreateDialog: child, ClientAvatar: pass('ClientAvatar'), Badge: pass('Badge'), ArrowRight: pass('ArrowRight'), NuxtLink: pass('NuxtLink') } } })
}

describe('client-scoped project creation', () => {
  it('provides a create dialog bound to the client detail Projects heading', () => {
    const page = readFileSync('app/pages/organizacion/clientes/[id]/index.vue', 'utf8')
    const dialog = readFileSync('app/components/projects/ProjectCreateDialog.vue', 'utf8')
    expect(page).toContain('<ProjectCreateDialog :context="projectCreateContext" />')
    expect(readFileSync('app/composables/useProjectCreate.ts', 'utf8')).toContain('client: context.clientId')
    expect(dialog).toContain('context?.clientName')
  })

  it('mounts the production client Projects section and dialog, creates only for its current client, and blocks dismissal while busy', async () => {
    const current = reactive(context())
    let finishValidation!: (value: { active: boolean }) => void
    const validate = vi.fn(() => new Promise<{ active: boolean }>(resolve => { finishValidation = resolve }))
    let finishCreate!: () => void
    const create = vi.fn(() => new Promise<void>(resolve => { finishCreate = resolve }))
    const child = compiledDialog({ value: current }, create, validate)
    const wrapper = compiledProjectsHeading(child.component, current)
    expect(wrapper.findAll('[data-testid="project-card"]')).toHaveLength(0)
    expect(wrapper.getComponent(child.component).props('context')).toMatchObject({ routeClientId: 'c1', clientId: 'c1', clientName: 'Client' })
    const action = wrapper.get('[data-testid="client-project-create"]')
    expect(action.text()).toContain('projects.new')
    await action.trigger('click')
    expect(wrapper.get('[data-testid="dialog"]').text()).toContain('common.client: Client')
    await wrapper.get('#client-project-name').setValue('  New project  ')
    await wrapper.get('#client-project-code').setValue('  NP ')
    await wrapper.get('#client-project-notes').setValue(' Details ')
    await wrapper.findAll('button').find(button => button.text() === 'common.add')!.trigger('click')
    await wrapper.get('[aria-label="projects.repoPaths"]').setValue(' /repo ')
    await wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(validate).toHaveBeenCalledWith('c1'))
    const content = wrapper.getComponent(child.ui.content)
    expect(content.attributes('data-close-visible')).toBe('false')
    expect(wrapper.find('[data-testid="dialog-x"]').exists()).toBe(false)
    for (const eventName of ['escape-key-down', 'pointer-down-outside', 'interact-outside']) {
      const event = { preventDefault: vi.fn() }
      content.vm.$emit(eventName, event)
      expect(event.preventDefault).toHaveBeenCalledOnce()
    }
    wrapper.getComponent(child.ui.dialog).vm.$emit('update:open', false)
    expect(wrapper.get('#client-project-name').element.value).toBe('  New project  ')
    finishValidation({ active: true })
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'New project', client: 'c1', code: 'NP', notes: ' Details ', active: true, repo_paths: ['/repo'] })
    finishCreate()
    await flushPromises()
    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not create when the route client or auth scope changes during the server validation await', async () => {
    const current = reactive(context())
    let finishValidation!: (value: { active: boolean }) => void
    const validate = vi.fn(() => new Promise<{ active: boolean }>(resolve => { finishValidation = resolve }))
    const create = vi.fn().mockResolvedValue({ id: 'unused' })
    const child = compiledDialog({ value: current }, create, validate)
    const wrapper = compiledProjectsHeading(child.component, current)
    await wrapper.get('[data-testid="client-project-create"]').trigger('click')
    await wrapper.get('#client-project-name').setValue('Should not write')
    const pending = wrapper.get('form').trigger('submit')
    await vi.waitFor(() => expect(validate).toHaveBeenCalledOnce())
    current.token = 'token-2'
    current.routeClientId = 'c2'
    current.clientId = 'c2'
    finishValidation({ active: true })
    await pending
    await flushPromises()
    expect(create).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides the actual production action for an inactive client and an unknown role', () => {
    for (const patch of [{ clientActive: false }, { role: 'unknown' }]) {
      const current = reactive({ ...context(), ...patch }) as ProjectCreateContext
      const child = compiledDialog({ value: current }, vi.fn())
      const wrapper = compiledProjectsHeading(child.component, current)
      expect(wrapper.find('[data-testid="client-project-create"]').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('normalizes a trimmed project payload to the current client and explicitly active', async () => {
    const current = reactive(context())
    const create = vi.fn().mockResolvedValue({ id: 'p1' })
    const state = useProjectCreate(() => current, create, vi.fn().mockResolvedValue(true))
    state.openDialog()
    state.form.name = '  Project  '
    state.form.code = '  PRJ '
    state.form.notes = ' Notes '
    state.form.repoPaths = [' /repo ', '', '/other']
    await state.submit()
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'Project', client: 'c1', code: 'PRJ', notes: ' Notes ', active: true, repo_paths: ['/repo', '/other'] })
    expect(state.open.value).toBe(false)
  })

  it.each([
    ['inactive parent', { clientActive: false }], ['missing route client', { routeClientId: 'c2' }],
    ['viewer', { role: 'viewer' }], ['missing token', { token: '' }],
  ])('does not open for %s', (_label, patch) => {
    const current = reactive({ ...context(), ...patch }) as ProjectCreateContext
    const state = useProjectCreate(() => current, vi.fn(), vi.fn())
    state.openDialog()
    expect(state.open.value).toBe(false)
  })

  it('closes and resets on route scope changes and fences a pending create', async () => {
    const current = reactive(context())
    let finish!: () => void
    const create = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    const state = useProjectCreate(() => current, create, vi.fn().mockResolvedValue(true))
    state.openDialog()
    state.form.name = 'Old'
    const pending = state.submit()
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    current.routeClientId = 'c2'
    expect(state.open.value).toBe(false)
    state.openDialog()
    expect(state.open.value).toBe(false)
    finish()
    await pending
    expect(create).toHaveBeenCalledTimes(1)
    expect(state.form.name).toBe('')
  })

  it('keeps failed writes open and blocks duplicate submits while busy', async () => {
    const current = reactive(context())
    let fail!: (error: Error) => void
    const create = vi.fn(() => new Promise((_, reject) => { fail = reject }))
    const state = useProjectCreate(() => current, create, vi.fn().mockResolvedValue(true))
    state.openDialog()
    state.form.name = 'Project'
    const pending = state.submit()
    state.openDialog()
    state.requestOpenChange(false)
    await state.submit()
    expect(create).toHaveBeenCalledOnce()
    fail(new Error('write failed'))
    await pending
    expect(state.open.value).toBe(true)
    expect(state.form.name).toBe('Project')
    expect(state.error.value).toBe(true)
  })
})
