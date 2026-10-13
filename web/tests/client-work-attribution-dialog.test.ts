import { readFileSync } from 'node:fs'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import * as Vue from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const dialogPath = 'app/components/clients/ClientWorkAttributionDialog.vue'
const composableSource = readFileSync('app/composables/useClientWorkAttribution.ts', 'utf8')
const { descriptor } = parse(readFileSync(dialogPath, 'utf8'))
const compiled = compileTemplate({ source: descriptor.template!.content, filename: dialogPath, id: 'client-work-attribution-dialog' })
expect(compiled.errors).toEqual([])
const templateExports: any = {}
new Function('require', 'exports', ts.transpile(compiled.code, { module: ts.ModuleKind.CommonJS }))(() => Vue, templateExports)

function harness(options: { projectId?: string, routePath?: string, routeProjectId?: string } = {}) {
  const open = Vue.ref(false)
  const route = Vue.reactive({ path: options.routePath ?? (options.projectId ? `/organizacion/clientes/c1/proyectos/${options.projectId}` : '/organizacion/clientes/c1'), params: { id: 'c1', projectId: options.routeProjectId ?? options.projectId } })
  const user = Vue.ref({ id: 'owner', role: 'owner' })
  const owner = Vue.computed(() => user.value.role === 'owner')
  const sends: { path: string, options: any }[] = []
  const lists: { name: string, options: any }[] = []
  const props = Vue.reactive({ clientId: 'c1', projectId: options.projectId })
  const listResolvers: ((items: any[]) => void)[] = []
  let deferLists = false
  let deferApply = false
  const row = { id: 'entry-1', client: 'c1', project: 'p1', member: '', started_at: '2026-01-01T12:00:00Z', work_ms: 42_000, machine: '', session_name: 'Session', task: '' }
  const finishPreviews: ((value: any) => void)[] = []
  const finishApplies: ((value: any) => void)[] = []
  const pb = {
    authStore: { token: 'token-1', onChange: () => () => {} },
    collection: (name: string) => ({
      getFullList: async () => name === 'team_members' ? [{ id: 'member-1', name: 'Inactive member', department: '', active: false }, { id: 'member-2', name: 'Active member', department: '', active: true }] : [],
      getList: (_page: number, _size: number, requestOptions: any) => {
        lists.push({ name, options: requestOptions })
        return deferLists
          ? new Promise(resolve => listResolvers.push(items => resolve({ items, page: 1, totalPages: 1, totalItems: items.length, options: requestOptions })))
          : Promise.resolve({ items: [row], page: 1, totalPages: 1, totalItems: 1, options: requestOptions })
      },
    }),
    send: vi.fn((path: string, options: any) => {
      sends.push({ path, options })
      if (path.endsWith('/preview')) return new Promise(resolve => { finishPreviews.push(resolve) })
      if (deferApply) return new Promise(resolve => { finishApplies.push(resolve) })
      return Promise.resolve({ client_id: 'c1', ...(options.body.project_id ? { project_id: options.body.project_id } : {}), member: 'member-1', updated_count: 1 })
    }),
  }
  const module = { exports: {} as Record<string, any> }
  const composableCode = ts.transpile(composableSource.replace(/^import .*$/gm, ''), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 })
  const makeComposable = new Function('module', 'exports', 'ref', 'computed', 'watch', 'onBeforeUnmount', 'useNuxtApp', 'useRoute', 'useAuth', `${composableCode}; return module.exports.useClientWorkAttribution`)(
    module, module.exports, Vue.ref, Vue.computed, Vue.watch, () => {}, () => ({ $pb: pb }), () => route, () => ({ isOwner: owner, user }),
  )
  let attribution: any
  const attributed = vi.fn()
  const componentBindings = {
    defineProps: () => props, defineModel: () => open, defineEmits: () => attributed,
    useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => values ? `${key} ${JSON.stringify(values)}` : key, locale: Vue.ref('en') }),
    useFormatters: () => ({ formatDateTime: (value: string) => value, formatDuration: (value: number) => `${value}ms` }),
    useClientWorkAttribution: (scope: any) => (attribution = makeComposable(scope)),
    toRef: Vue.toRef, watch: Vue.watch, computed: Vue.computed,
  }
  const scriptCode = ts.transpile(descriptor.scriptSetup!.content.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const state = new Function(...Object.keys(componentBindings), `${scriptCode}; return { open, props, attribution, rows, page, totalPages, selectedIds, memberId, members, departments, previewResult, busy, error, eligible, memberOptions, confirm, clearAndReload, title, project, toggle, requestOpenChange, formatDateTime, formatDuration, t }`)(...Object.values(componentBindings))

  const contextKey = Symbol('dialog-test-context')
  const Dialog = Vue.defineComponent({
    props: { open: Boolean }, emits: ['update:open'],
    setup(_props, { slots, emit }) {
      Vue.provide(contextKey, () => emit('update:open', false))
      return () => Vue.h('div', { 'data-testid': 'dialog-root' }, [
        ...(_props.open ? slots.default?.() ?? [] : []),
        Vue.h('button', { type: 'button', 'data-testid': 'escape-close', onClick: () => emit('update:open', false) }, 'Escape close'),
        Vue.h('button', { type: 'button', 'data-testid': 'outside-close', onClick: () => emit('update:open', false) }, 'Outside close'),
      ])
    },
  })
  const DialogContent = Vue.defineComponent({
    props: { showCloseButton: { type: Boolean, default: true } },
    setup(props, { slots }) {
      const requestClose = Vue.inject<() => void>(contextKey)!
      return () => Vue.h('section', { 'data-testid': 'dialog-content' }, [
        ...(slots.default?.() ?? []),
        ...(props.showCloseButton ? [Vue.h('button', { type: 'button', 'aria-label': 'Close dialog', 'data-testid': 'dialog-x', onClick: requestClose }, 'Close')] : []),
      ])
    },
  })
  const passthrough = Vue.defineComponent({ setup(_props, { slots, attrs }) { return () => Vue.h('div', attrs, slots.default?.()) } })
  const Button = Vue.defineComponent({ setup(_props, { slots, attrs }) { return () => Vue.h('button', { ...attrs, type: attrs.type ?? 'button' }, slots.default?.()) } })
  const Label = Vue.defineComponent({ setup(_props, { slots, attrs }) { return () => Vue.h('label', attrs, slots.default?.()) } })
  const Select = Vue.defineComponent({
    props: { options: { type: Array, default: () => [] }, modelValue: String, disabled: Boolean, ariaLabel: String },
    emits: ['update:modelValue'],
    setup(props, { emit, attrs }) { return () => Vue.h('select', { ...attrs, 'aria-label': props.ariaLabel, disabled: props.disabled, value: props.modelValue, onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLSelectElement).value) }, (props.options as any[]).map(option => Vue.h('option', { value: option.value }, option.label))) },
  })
  const wrapper = mount(Vue.defineComponent({ render: templateExports.render, setup: () => state }), { global: { components: { Dialog, DialogContent, DialogDescription: passthrough, DialogFooter: passthrough, DialogHeader: passthrough, DialogTitle: passthrough, Button, Label, Select } } })
  return { wrapper, open, route, user, props, attribution: () => attribution, sends, lists, pb, attributed, listResolvers, deferLists: (value: boolean) => { deferLists = value }, deferApply: (value: boolean) => { deferApply = value }, finishApply: (result: any, index = 0) => finishApplies[index]!(result), finishList: (index: number, items: any[]) => listResolvers[index]!(items), finishPreview: (result: any, index = 0) => finishPreviews[index]!(result) }
}

describe('ClientWorkAttributionDialog compiled production template', () => {
  it('uses visible row and member controls to preview and apply the exact selection, then closes once', async () => {
    const h = harness()
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    const previewButton = h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!
    await previewButton.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.finishPreview({ client_id: 'c1', member: 'member-1', count: 1, snapshot: 'snapshot-1' })
    await flushPromises()
    expect(h.sends[0]).toEqual({ path: '/api/kankaku/client-attribution/preview', options: { method: 'POST', body: { client_id: 'c1', member: 'member-1', entry_ids: ['entry-1'] } } })
    const confirmButton = h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionConfirm'))!
    await confirmButton.trigger('click')
    await flushPromises()
    expect(h.sends[1]).toEqual({ path: '/api/kankaku/client-attribution/apply', options: { method: 'POST', body: { client_id: 'c1', member: 'member-1', entry_ids: ['entry-1'], snapshot: 'snapshot-1' } } })
    expect(h.open.value).toBe(false)
    expect(h.attribution().selectedIds.value).toEqual([])
    expect(h.attributed).toHaveBeenCalledOnce()
    h.wrapper.unmount()
  })

  it('binds project scope through visible selection, exact filter, preview and confirmed API requests', async () => {
    const h = harness({ projectId: 'p1' })
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    expect(h.lists.find(call => call.name === 'task_entries')?.options.filter).toBe('client = "c1" && project = "p1" && member = ""')
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    await h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.finishPreview({ client_id: 'c1', project_id: 'p1', member: 'member-1', count: 1, snapshot: 'project-snapshot' })
    await flushPromises()
    expect(h.sends[0].options.body).toEqual({ client_id: 'c1', project_id: 'p1', member: 'member-1', entry_ids: ['entry-1'] })
    await h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionConfirm'))!.trigger('click')
    await flushPromises()
    expect(h.sends[1].options.body).toEqual({ client_id: 'c1', project_id: 'p1', member: 'member-1', entry_ids: ['entry-1'], snapshot: 'project-snapshot' })
    expect(h.open.value).toBe(false)
    expect(h.attributed).toHaveBeenCalledOnce()
    h.wrapper.unmount()
  })

  it('closes and fences stale work when the project route or prop changes, never a task route', async () => {
    for (const mode of ['prop', 'route', 'task']) {
      const h = harness({ projectId: 'p1' })
      h.open.value = true
      await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
      await h.wrapper.get('input[type="checkbox"]').setValue(true)
      await h.wrapper.get('select').setValue('member-1')
      await h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!.trigger('click')
      await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
      if (mode === 'prop') h.props.projectId = 'p2'
      else h.route.path = mode === 'task' ? '/organizacion/clientes/c1/proyectos/p1/tareas/t1' : '/organizacion/clientes/c1/proyectos/p2'
      expect(h.open.value).toBe(false)
      h.finishPreview({ client_id: 'c1', project_id: 'p1', member: 'member-1', count: 1, snapshot: 'stale' })
      await flushPromises()
      expect(h.attribution().previewResult.value).toBeNull()
      expect(h.attributed).not.toHaveBeenCalled()
      h.wrapper.unmount()
    }
  })

  it('keeps the busy project apply fenced from X dismissal until it consumes the commit', async () => {
    const h = harness({ projectId: 'p1' })
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    await h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.finishPreview({ client_id: 'c1', project_id: 'p1', member: 'member-1', count: 1, snapshot: 'project-snapshot' })
    await flushPromises()
    h.deferApply(true)
    await h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionConfirm'))!.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    expect(h.wrapper.find('[data-testid="dialog-x"]').exists()).toBe(false)
    await h.wrapper.get('[data-testid="escape-close"]').trigger('click')
    expect(h.open.value).toBe(true)
    h.finishApply({ client_id: 'c1', project_id: 'p1', member: 'member-1', updated_count: 1 })
    await flushPromises()
    expect(h.open.value).toBe(false)
    expect(h.attributed).toHaveBeenCalledOnce()
    h.wrapper.unmount()
  })

  it('clears a project preview if its scope changes before confirmation', async () => {
    const h = harness({ projectId: 'p1' })
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    await h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.finishPreview({ client_id: 'c1', project_id: 'p1', member: 'member-1', count: 1, snapshot: 'scope-snapshot' })
    await flushPromises()
    expect(h.attribution().previewResult.value?.snapshot).toBe('scope-snapshot')
    h.props.projectId = 'p2'
    expect(h.open.value).toBe(false)
    expect(h.attribution().previewResult.value).toBeNull()
    expect(h.sends.filter(call => call.path.endsWith('/apply'))).toHaveLength(0)
    h.wrapper.unmount()
  })

  it('fences a deferred project list when its project scope changes', async () => {
    const h = harness({ projectId: 'p1' })
    h.deferLists(true)
    h.open.value = true
    await vi.waitFor(() => expect(h.listResolvers).toHaveLength(1))
    h.props.projectId = 'p2'
    expect(h.open.value).toBe(false)
    h.finishList(0, [{ id: 'stale', client: 'c1', project: 'p1', member: '', started_at: '', work_ms: 1, machine: '' }])
    await flushPromises()
    expect(h.attribution().rows.value).toEqual([])
    h.wrapper.unmount()
  })

  it('fences a deferred project apply after project invalidation', async () => {
    const h = harness({ projectId: 'p1' })
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    await h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.finishPreview({ client_id: 'c1', project_id: 'p1', member: 'member-1', count: 1, snapshot: 'apply-snapshot' })
    await flushPromises()
    h.deferApply(true)
    await h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionConfirm'))!.trigger('click')
    await vi.waitFor(() => expect(h.sends.filter(call => call.path.endsWith('/apply'))).toHaveLength(1))
    h.props.projectId = 'p2'
    expect(h.open.value).toBe(false)
    h.finishApply({ client_id: 'c1', project_id: 'p1', member: 'member-1', updated_count: 1 })
    await flushPromises()
    expect(h.attributed).not.toHaveBeenCalled()
    expect(h.attribution().previewResult.value).toBeNull()
    h.wrapper.unmount()
  })

  it('invalidates preview when the visible member selection changes', async () => {
    const h = harness()
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    const previewButton = h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!
    await previewButton.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.finishPreview({ client_id: 'c1', member: 'member-1', count: 1, snapshot: 'snapshot-1' })
    await flushPromises()
    await h.wrapper.get('select').setValue('member-2')
    expect(h.attribution().previewResult.value).toBeNull()
    expect(h.attribution().selectedIds.value).toEqual(['entry-1'])
    h.wrapper.unmount()
  })

  it('ignores a closed session preview without unlocking a reopened dialog operation', async () => {
    const h = harness()
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    const firstButton = h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!
    await firstButton.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.open.value = false
    await Vue.nextTick()
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    const secondButton = h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!
    await secondButton.trigger('click')
    await vi.waitFor(() => expect(h.sends.filter(call => call.path.endsWith('/preview'))).toHaveLength(2))
    h.finishPreview({ client_id: 'c1', member: 'member-1', count: 1, snapshot: 'old' }, 0)
    await flushPromises()
    expect(h.attribution().busy.value).toBe(true)
    expect(h.attribution().previewResult.value).toBeNull()
    h.finishPreview({ client_id: 'c1', member: 'member-1', count: 1, snapshot: 'new' }, 1)
    await flushPromises()
    expect(h.attribution().busy.value).toBe(false)
    expect(h.attribution().previewResult.value?.snapshot).toBe('new')
    h.wrapper.unmount()
  })

  it('ignores an old paginated-list response and its cleanup after reopening into a new preview', async () => {
    const h = harness()
    h.deferLists(true)
    h.open.value = true
    await vi.waitFor(() => expect(h.listResolvers).toHaveLength(1))
    h.open.value = false
    await Vue.nextTick()
    h.open.value = true
    await vi.waitFor(() => expect(h.listResolvers).toHaveLength(2))
    const newest = { id: 'entry-2', client: 'c1', member: '', started_at: '2026-02-01T12:00:00Z', work_ms: 99, machine: '' }
    h.finishList(1, [newest])
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    const previewButton = h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!
    await previewButton.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.finishList(0, [{ ...newest, id: 'old-entry' }])
    await flushPromises()
    expect(h.attribution().rows.value.map((entry: any) => entry.id)).toEqual(['entry-2'])
    expect(h.attribution().busy.value).toBe(true)
    h.finishPreview({ client_id: 'c1', member: 'member-1', count: 1, snapshot: 'new-snapshot' })
    await flushPromises()
    expect(h.attribution().previewResult.value?.snapshot).toBe('new-snapshot')
    h.wrapper.unmount()
  })

  it('closes on owner-session invalidation and ignores the pending preview result', async () => {
    const h = harness()
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    const previewButton = h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!
    await previewButton.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.user.value.role = 'viewer'
    expect(h.open.value).toBe(false)
    expect(h.attribution().busy.value).toBe(false)
    h.finishPreview({ client_id: 'c1', member: 'member-1', count: 1, snapshot: 'stale' })
    await flushPromises()
    expect(h.attribution().previewResult.value).toBeNull()
    expect(h.attributed).not.toHaveBeenCalled()
    h.wrapper.unmount()
  })

  it('closes on client-route invalidation and ignores the pending preview result', async () => {
    const h = harness()
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    const previewButton = h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))!
    await previewButton.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    h.route.path = '/organizacion/clientes/c2'
    h.route.params.id = 'c2'
    expect(h.open.value).toBe(false)
    expect(h.attribution().busy.value).toBe(false)
    h.finishPreview({ client_id: 'c1', member: 'member-1', count: 1, snapshot: 'stale' })
    await flushPromises()
    expect(h.attribution().previewResult.value).toBeNull()
    expect(h.attributed).not.toHaveBeenCalled()
    h.wrapper.unmount()
  })

  it('rejects an X close request before model mutation while preview is pending', async () => {
    const h = harness()
    h.open.value = true
    await vi.waitFor(() => expect(h.wrapper.find('input[type="checkbox"]').exists()).toBe(true))
    await h.wrapper.get('input[type="checkbox"]').setValue(true)
    await h.wrapper.get('select').setValue('member-1')
    expect(h.attribution().selectedIds.value).toEqual(['entry-1'])
    const previewButton = h.wrapper.findAll('button').find(button => button.text().includes('clients.detail.attributionPreview'))
    expect(previewButton).toBeDefined()
    await previewButton!.trigger('click')
    await vi.waitFor(() => expect(h.attribution().busy.value).toBe(true))
    expect(h.wrapper.find('[data-testid="dialog-x"]').exists()).toBe(false)
    expect(h.wrapper.get('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    expect(h.wrapper.get('select').attributes('disabled')).toBeDefined()
    expect(h.wrapper.findAll('button').find(button => button.text().includes('common.cancel'))?.attributes('disabled')).toBeDefined()
    expect(h.wrapper.findAll('button').find(button => button.text().includes('common.previous'))?.attributes('disabled')).toBeDefined()
    for (const close of ['escape-close', 'outside-close']) {
      await h.wrapper.get(`[data-testid="${close}"]`).trigger('click')
      expect(h.open.value).toBe(true)
      expect(h.attribution().busy.value).toBe(true)
    }
    h.finishPreview({ client_id: 'c1', member: 'member-1', count: 1, snapshot: 'snapshot-1' })
    await flushPromises()
    expect(h.attribution().busy.value).toBe(false)
    expect(h.attribution().previewResult.value?.snapshot).toBe('snapshot-1')
    expect(h.wrapper.get('[data-testid="dialog-x"]').exists()).toBe(true)
    h.wrapper.unmount()
  })
})
