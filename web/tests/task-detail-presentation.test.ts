import { readFileSync } from 'node:fs'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { defineComponent } from 'vue'
import * as Vue from 'vue'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

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
const globals = { components: { Button: button, Tabs: primitive, TabsList: primitive, TabsTrigger: button, Badge: primitive, Pencil: primitive, ChevronDown: primitive, ArrowLeft: primitive, AgentBadge: primitive, CopyButton: button, Skeleton: primitive, EmptyState: primitive } }
function detail(pageMode: boolean) {
  const session = { sessionId: 'session-one', sessionName: 'A session', lastActivity: '', firstActivity: '', entryCount: 1, workMs: 1, elapsedMs: 1, waitingMs: 0, cost: 0, machine: 'machine', agent: 'pi' }
  return mount(defineComponent({
    render: template('app/components/tasks/TaskDetailSheet.vue'),
    data: () => ({ pageMode, MIXED: '__mixed__', task: { title: 'Long task title', status: 'open' }, projectName: 'Owning project', canWrite: true, sessionsLoading: false, sessionRows: [{ session, resumeOk: true, resumeCommand: 'pi --session one' }], sessionEntries: {}, STATUSES: ['open', 'doing', 'done'], t: (key: string) => key, sessionName: () => 'A session', formatDateTime: () => 'date', formatDuration: () => 'time', formatCost: () => 'cost', isSessionExpanded: () => false, sessionEntryRows: () => [], onStatusTabChange: () => {}, toggleSessionEntries: () => {}, emit: () => {} }),
  }), { global: globals, slots: { back: '<button aria-label="Back to project">Back</button>' } })
}
describe('actual task detail presentation templates', () => {
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
  it('uses page-only section hierarchy and project-language session cards', () => {
    const wrapper = detail(true)
    expect(wrapper.get('section h2').classes()).toContain('font-bold')
    expect(wrapper.get('section > ul > li').classes()).toEqual(expect.arrayContaining(['min-w-0', 'rounded-3xl', 'bg-card', 'border', 'p-2', 'sm:p-5']))
    expect(wrapper.get('button[aria-expanded]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('pre').text()).toBe('pi --session one')
    wrapper.unmount()
  })
  it('preserves drawer padding, compact h2, session row styling and controls', () => {
    const wrapper = detail(false)
    expect(wrapper.classes()).toEqual(expect.arrayContaining(['overflow-y-auto', 'px-6', 'pt-8', 'pb-6']))
    expect(wrapper.find('h1').exists()).toBe(false)
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
