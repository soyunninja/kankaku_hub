import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import * as Vue from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { compileScript, compileTemplate, parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { useTaskCreate, type TaskCreateContext } from '../app/composables/useTaskCreate'

const validContext = (): TaskCreateContext => ({
  canWrite: true, isAuthenticated: true, clientId: 'c1', clientName: 'Client', clientActive: true,
  projectId: 'p1', projectName: 'Project', projectClientId: 'c1', projectActive: true,
  userId: 'owner-1', role: 'owner', token: 'token-1',
})

function compiledTaskDialog(create = vi.fn().mockResolvedValue({ id: 'created' })) {
  const source = readFileSync('app/components/tasks/TaskCreateDialog.vue', 'utf8')
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, { id: 'task-create-dialog', inlineTemplate: true })
  const exports: { default?: Vue.Component } = {}
  const primitives = primitiveStubs()
  new Function('require', 'exports', 'useI18n', 'useTasks', ts.transpile(compiled.content, { module: ts.ModuleKind.CommonJS }))(
    (id: string) => {
      if (id === 'vue') return Vue
      if (id === '@lucide/vue') return { Plus: Vue.defineComponent({ setup: () => () => Vue.h('span') }) }
      if (id.includes('useTaskCreate')) return { useTaskCreate }
      if (id.endsWith('/button')) return { Button: primitives.button }
      if (id.endsWith('/dialog')) return { Dialog: primitives.dialog, DialogContent: primitives['dialog-content'], DialogFooter: primitives['dialog-footer'], DialogHeader: primitives['dialog-header'], DialogTitle: primitives['dialog-title'] }
      if (id.endsWith('/input')) return { Input: primitives.input }
      if (id.endsWith('/label')) return { Label: primitives.label }
      if (id.endsWith('/textarea')) return { Textarea: primitives.textarea }
      return {}
    },
    exports, () => ({ t: (key: string) => key }), () => ({ create }),
  )
  return { component: exports.default!, create, primitives }
}

function primitiveStubs() {
  const passthrough = (name: string) => Vue.defineComponent({ name, inheritAttrs: false, setup: (_, { attrs, slots }) => () => Vue.h('div', attrs, slots.default?.()) })
  const Button = Vue.defineComponent({
    name: 'Button', props: { type: { type: String, default: 'button' }, disabled: Boolean }, inheritAttrs: false,
    setup: (props, { attrs, slots }) => () => Vue.h('button', { ...attrs, type: props.type, disabled: props.disabled || undefined }, slots.default?.()),
  })
  const Dialog = Vue.defineComponent({
    name: 'Dialog', props: { open: Boolean }, emits: ['update:open'],
    setup: (props, { attrs, slots }) => () => props.open ? Vue.h('div', { ...attrs, 'data-testid': 'dialog' }, slots.default?.()) : null,
  })
  const DialogContent = Vue.defineComponent({
    name: 'DialogContent', props: { showCloseButton: { type: Boolean, default: true } },
    emits: ['escape-key-down', 'pointer-down-outside', 'interact-outside'],
    setup: (props, { attrs, emit, slots }) => () => Vue.h('div', { ...attrs, 'data-close-visible': String(props.showCloseButton) }, [
      ...(props.showCloseButton ? [Vue.h('button', { type: 'button', 'data-testid': 'dialog-x', onClick: () => emit('escape-key-down', { preventDefault: vi.fn() }) }, 'X')] : []),
      ...slots.default?.() ?? [],
    ]),
  })
  const Input = Vue.defineComponent({
    name: 'Input', props: { modelValue: String }, emits: ['update:modelValue'], inheritAttrs: false,
    setup: (props, { attrs, emit }) => () => Vue.h('input', { ...attrs, value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value) }),
  })
  const Textarea = Vue.defineComponent({
    name: 'Textarea', props: { modelValue: String }, emits: ['update:modelValue'], inheritAttrs: false,
    setup: (props, { attrs, emit }) => () => Vue.h('textarea', { ...attrs, value: props.modelValue, onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value) }),
  })
  return {
    button: Button, dialog: Dialog, 'dialog-content': DialogContent,
    'dialog-footer': passthrough('DialogFooter'), 'dialog-header': passthrough('DialogHeader'),
    'dialog-title': passthrough('DialogTitle'), input: Input, label: passthrough('Label'), textarea: Textarea,
  }
}

function compiledProjectTaskSection(TaskCreateDialog: Vue.Component, context: TaskCreateContext) {
  const source = readFileSync('app/pages/organizacion/clientes/[id]/proyectos/[projectId]/index.vue', 'utf8')
  const start = source.indexOf('<section class="space-y-4 pt-4">')
  const end = source.indexOf('</section>', start) + '</section>'.length
  const compiled = compileTemplate({ source: source.slice(start, end), filename: 'project-tasks-section.vue', id: 'project-tasks-section' })
  expect(compiled.errors).toEqual([])
  const exports: { render?: Vue.RenderFunction } = {}
  new Function('require', 'exports', ts.transpile(compiled.code, { module: ts.ModuleKind.CommonJS }))((id: string) => id === 'vue' ? Vue : {}, exports)
  const pageFragment = Vue.defineComponent({
    setup: () => ({ tasks: [], t: (key: string) => key, taskCreateContext: context }),
    render: exports.render,
  })
  const pass = (name: string) => Vue.defineComponent({ name, setup: (_, { slots }) => () => Vue.h('span', slots.default?.()) })
  return mount(pageFragment, { global: { components: { TaskCreateDialog, Badge: pass('Badge'), ArrowRight: pass('ArrowRight'), NuxtLink: pass('NuxtLink') } } })
}

describe('project task creation', () => {
  it('offers a project-scoped create action beside Tasks even when there are no cards', () => {
    const source = readFileSync('app/pages/organizacion/clientes/[id]/proyectos/[projectId]/index.vue', 'utf8')
    expect(source).toContain('<TaskCreateDialog :context="taskCreateContext" />')
    const tasksHeading = source.slice(source.indexOf('t(\'projects.detail.tasksTitle\')'), source.indexOf('</section>', source.indexOf('t(\'projects.detail.tasksTitle\')')))
    expect(tasksHeading).toContain('<TaskCreateDialog')
    expect(source).toContain('projectId: projectId.value')
  })

  it('renders the production heading action with an empty task list and displays its readonly parent context', async () => {
    const context = reactive(validContext())
    const child = compiledTaskDialog()
    const wrapper = compiledProjectTaskSection(child.component, context)
    expect(wrapper.get('h2').text()).toBe('projects.detail.tasksTitle')
    const action = wrapper.get('[data-testid="project-task-create"]')
    expect(action.text()).toContain('tasks.new')
    await action.trigger('click')
    expect(wrapper.get('[data-testid="dialog"]').text()).toContain('common.client: Client')
    expect(wrapper.get('[data-testid="dialog"]').text()).toContain('common.project: Project')
    expect(wrapper.findAll('[data-testid="task-card"]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('submits the production form payload once and closes after committed success', async () => {
    const context = reactive(validContext())
    const create = vi.fn().mockResolvedValue({ id: 'created-task' })
    const child = compiledTaskDialog(create)
    const wrapper = compiledProjectTaskSection(child.component, context)
    await wrapper.get('[data-testid="project-task-create"]').trigger('click')
    await wrapper.get('#project-task-title').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(create).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alert"]').text()).toBe('common.error')
    await wrapper.get('#project-task-title').setValue('  Ship it  ')
    await wrapper.get('#project-task-ref').setValue(' #12 ')
    await wrapper.get('#project-task-description').setValue(' Notes ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(create).toHaveBeenCalledExactlyOnceWith({ title: 'Ship it', project: 'p1', status: 'open', external_ref: '#12', description: 'Notes' })
    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('guards busy close/open events and duplicate submissions in the production template', async () => {
    const context = reactive(validContext())
    let finish!: (value: unknown) => void
    const create = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const child = compiledTaskDialog(create)
    const wrapper = compiledProjectTaskSection(child.component, context)
    await wrapper.get('[data-testid="project-task-create"]').trigger('click')
    await wrapper.get('#project-task-title').setValue('Pending')
    const form = wrapper.get('form')
    await form.trigger('submit')
    await form.trigger('submit')
    expect(create).toHaveBeenCalledTimes(1)
    const dialog = wrapper.getComponent(child.primitives.dialog)
    dialog.vm.$emit('update:open', true)
    dialog.vm.$emit('update:open', false)
    expect(wrapper.get('#project-task-title').element.value).toBe('Pending')
    const content = wrapper.getComponent(child.primitives['dialog-content'])
    expect(content.attributes('data-close-visible')).toBe('false')
    expect(wrapper.find('[data-testid="dialog-x"]').exists()).toBe(false)
    for (const eventName of ['escape-key-down', 'pointer-down-outside', 'interact-outside']) {
      const event = { preventDefault: vi.fn() }
      content.vm.$emit(eventName, event)
      expect(event.preventDefault).toHaveBeenCalledOnce()
    }
    expect(wrapper.get('[data-testid="project-task-create"]').attributes('disabled')).toBeDefined()
    finish({ id: 'pending' })
    await flushPromises()
    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('fences old route/auth completions from a newly opened production dialog', async () => {
    for (const change of ['project', 'client', 'token', 'role', 'authentication'] as const) {
      const context = reactive(validContext())
      const finishes: Array<(value: unknown) => void> = []
      const create = vi.fn(() => new Promise(resolve => { finishes.push(resolve) }))
      const child = compiledTaskDialog(create)
      const wrapper = compiledProjectTaskSection(child.component, context)
      await wrapper.get('[data-testid="project-task-create"]').trigger('click')
      await wrapper.get('#project-task-title').setValue('Old scope')
      const oldSubmit = wrapper.get('form').trigger('submit')
      if (change === 'project') context.projectId = 'p2'
      if (change === 'client') { context.clientId = 'c2'; context.projectClientId = 'c2'; context.clientName = 'Client 2' }
      if (change === 'token') { context.token = 'token-2'; context.token = 'token-1' }
      if (change === 'role') { context.role = 'member'; context.role = 'owner' }
      if (change === 'authentication') { context.isAuthenticated = false; context.isAuthenticated = true }
      await wrapper.get('[data-testid="project-task-create"]').trigger('click')
      await wrapper.get('#project-task-title').setValue('New scope')
      const newSubmit = wrapper.get('form').trigger('submit')
      expect(create).toHaveBeenCalledTimes(2)
      finishes[0]!({ id: 'old' })
      await oldSubmit
      await flushPromises()
      expect(wrapper.get('#project-task-title').element.value).toBe('New scope')
      expect(wrapper.get('form button[type="submit"]').attributes('disabled')).toBeDefined()
      expect(wrapper.getComponent(child.primitives['dialog-content']).attributes('data-close-visible')).toBe('false')
      finishes[1]!({ id: 'new' })
      await newSubmit
      await flushPromises()
      expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('hides the production action for non-owners and inactive or mismatched parents', () => {
    for (const patch of [{ role: 'member' }, { clientActive: false }, { projectActive: false }, { projectClientId: 'other' }]) {
      const context = reactive({ ...validContext(), ...patch }) as TaskCreateContext
      const child = compiledTaskDialog()
      const wrapper = compiledProjectTaskSection(child.component, context)
      expect(wrapper.find('[data-testid="project-task-create"]').exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('requires a nonblank title before attempting a write', async () => {
    const context = reactive(validContext())
    const create = vi.fn()
    const dialog = useTaskCreate(() => context, create)
    dialog.openDialog()
    dialog.form.title = '   '
    await dialog.submit()
    expect(create).not.toHaveBeenCalled()
    expect(dialog.open.value).toBe(true)
    expect(dialog.error.value).toBe(true)
  })

  it('resets fields on each open and writes a trimmed open task only to the current project', async () => {
    const context = reactive(validContext())
    const create = vi.fn().mockResolvedValue({ id: 't1' })
    const dialog = useTaskCreate(() => context, create)
    dialog.openDialog()
    dialog.form.title = '  Ship it  '
    dialog.form.external_ref = '  #12 '
    dialog.form.description = ' Notes '
    await dialog.submit()
    expect(create).toHaveBeenCalledExactlyOnceWith({ title: 'Ship it', project: 'p1', status: 'open', external_ref: '#12', description: 'Notes' })
    expect(dialog.open.value).toBe(false)
    dialog.openDialog()
    expect(dialog.form).toMatchObject({ title: '', external_ref: '', description: '' })
  })

  it.each([
    ['wrong parent', { projectClientId: 'c2' }],
    ['inactive client', { clientActive: false }],
    ['inactive project', { projectActive: false }],
    ['non-owner', { role: 'member' }],
    ['unauthenticated owner', { isAuthenticated: false }],
    ['missing token', { token: '' }],
  ])('rejects opening and submission for %s', async (_label, patch) => {
    const context = reactive({ ...validContext(), ...patch }) as TaskCreateContext
    const create = vi.fn()
    const dialog = useTaskCreate(() => context, create)
    dialog.openDialog()
    expect(dialog.open.value).toBe(false)
    await dialog.submit()
    expect(create).not.toHaveBeenCalled()
  })

  it('does not reopen or reset the generation while a submit is pending', async () => {
    const context = reactive(validContext())
    let finish!: (value: unknown) => void
    const create = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const dialog = useTaskCreate(() => context, create)
    dialog.openDialog()
    dialog.form.title = 'Pending task'
    const pending = dialog.submit()
    dialog.openDialog()
    expect(dialog.open.value).toBe(true)
    expect(dialog.form.title).toBe('Pending task')
    expect(dialog.busy.value).toBe(true)
    finish({ id: 'pending' })
    await pending
    expect(dialog.open.value).toBe(false)
    expect(dialog.busy.value).toBe(false)
  })

  it('blocks duplicate submits and dismissals while busy, preserving fields after a failed write', async () => {
    const context = reactive(validContext())
    let finish!: (value: unknown) => void
    const create = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const dialog = useTaskCreate(() => context, create)
    dialog.openDialog()
    dialog.form.title = 'Task'
    const pending = dialog.submit()
    await dialog.submit()
    dialog.requestOpenChange(false)
    expect(create).toHaveBeenCalledTimes(1)
    expect(dialog.open.value).toBe(true)
    expect(dialog.busy.value).toBe(true)
    // A rejected create is retryable and does not discard the user's input.
    finish(Promise.reject(new Error('write failed')))
    await pending
    expect(dialog.open.value).toBe(true)
    expect(dialog.form.title).toBe('Task')
    expect(dialog.error.value).toBe(true)
    expect(dialog.busy.value).toBe(false)
  })

  it('fences a pending completion after route or auth scope changes', async () => {
    const context = reactive(validContext())
    let finish!: (value: unknown) => void
    const create = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const dialog = useTaskCreate(() => context, create)
    dialog.openDialog()
    dialog.form.title = 'Task'
    const pending = dialog.submit()
    context.token = 'token-2'
    expect(dialog.open.value).toBe(false)
    dialog.openDialog()
    dialog.form.title = 'New session task'
    finish({ id: 'old-task' })
    await pending
    expect(dialog.open.value).toBe(true)
    expect(dialog.form.title).toBe('New session task')
    expect(dialog.busy.value).toBe(false)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('treats a resolved committed create as success without replaying it', async () => {
    const context = reactive(validContext())
    const create = vi.fn().mockResolvedValue({ id: 'created' })
    const dialog = useTaskCreate(() => context, create)
    dialog.openDialog()
    dialog.form.title = 'Committed'
    await dialog.submit()
    expect(create).toHaveBeenCalledTimes(1)
    expect(dialog.open.value).toBe(false)
    expect(dialog.error.value).toBe(false)
  })
})
