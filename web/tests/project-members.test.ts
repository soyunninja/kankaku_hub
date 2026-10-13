import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref, defineComponent, h as vueH } from 'vue'
import * as Vue from 'vue'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { mount } from '@vue/test-utils'
import ts from 'typescript'
import { loadProjectMemberTotals } from '../app/lib/project-member-totals'

const source = readFileSync('app/components/projects/ProjectMembers.vue', 'utf8')
const template = parse(source).descriptor.template!.content
const compiledTemplate = compileTemplate({ source: template, filename: 'ProjectMembers.vue', id: 'project-members-test' })
expect(compiledTemplate.errors).toEqual([])
const templateExports: any = {}
new Function('require', 'exports', ts.transpile(compiledTemplate.code, { module: ts.ModuleKind.CommonJS }))(() => Vue, templateExports)
function harness(owner = true, clientId = 'c1', projectId: string | undefined = 'p1') {
  const isOwner = ref(owner)
  const user = ref({ id: 'owner1', role: owner ? 'owner' : 'viewer' })
  const members = ref([{ id: 'active', name: 'Active member', department: 'd1', active: true }, { id: 'inactive', name: 'Inactive member', department: '', active: false }])
  const departments = ref([{ id: 'd1', name: 'Design' }])
  const fetchTotals = vi.fn()
  const refresh = vi.fn().mockResolvedValue(undefined)
  const props: { clientId: string, projectId?: string } = { clientId, projectId }
  const t = (key: string) => key
  let unmount = () => {}
  const bindings = {
    computed, ref, watch: () => {}, onMounted: () => {}, onBeforeUnmount: (fn: () => void) => { unmount = fn },
    defineProps: () => props, useI18n: () => ({ t, locale: ref('en') }),
    useAuth: () => ({ isOwner, user }), useNuxtApp: () => ({ $pb: { authStore: { token: 'token1' } } }), useTeamCatalog: () => ({ departments, members, refresh }), useTotals: () => ({ fetchTotals }),
    loadProjectMemberTotals, TotalsRouteUnavailableError: class extends Error {}, formatCost: (value: number) => `$${value}`, formatDuration: (value: number) => `${value}ms`,
  }
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const instance = new Function(...Object.keys(bindings), `${code}; return { load, state, totals, rows, cost, historyPath, refreshAfterAttribution, props, isOwner, attributionOpen, costQualityWarning, duration, departments, members, t }`)(...Object.values(bindings))
  return { instance, isOwner, fetchTotals, refresh, props, unmount: () => unmount() }
}

describe('project member cards', () => {
  it('loads all-time project-only aggregates and resolves an inactive identity', async () => {
    const h = harness()
    const total = { workMs: 42, cost: 0, entries: 1, costUnknownEntries: 1, costEstimatedEntries: 0 }
    h.fetchTotals.mockResolvedValue({ page: 1, totalPages: 1, totalGroups: 1, groups: [{ groupKey: 'inactive', ...total }] })
    await h.instance.load()
    expect(h.refresh).toHaveBeenCalledOnce()
    expect(h.fetchTotals).toHaveBeenCalledWith({ groupBy: 'member', filters: { client: 'c1', project: 'p1' }, page: 1, perPage: 200 })
    expect(h.instance.totals.value.members.inactive).toEqual(total)
    expect(h.instance.rows.value[0].member.active).toBe(false)
    expect(h.instance.cost(total)).toBe('—')
    expect(h.instance.cost({ ...total, entries: 2, cost: 1 })).toBe('$1')
    expect(h.instance.cost({ ...total, entries: 1, cost: 0, costUnknownEntries: 0 })).toBe('$0')
    expect(h.instance.historyPath('inactive')).toBe('/team/member-projects/inactive/p1')
  })

  it('loads client-wide history without a project route and fences stale client responses', async () => {
    const h = harness()
    h.props.projectId = undefined
    let release!: (response: unknown) => void
    h.fetchTotals.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    const oldRequest = h.instance.load()
    await Promise.resolve()
    await Promise.resolve()
    h.props.clientId = 'c2'
    h.fetchTotals.mockResolvedValueOnce({ page: 1, totalPages: 1, totalGroups: 1, groups: [{ groupKey: 'active', workMs: 8, cost: 1, entries: 1, costUnknownEntries: 0, costEstimatedEntries: 0 }] })
    await h.instance.load()
    release({ page: 1, totalPages: 1, totalGroups: 1, groups: [{ groupKey: 'inactive', workMs: 99, cost: 1, entries: 1, costUnknownEntries: 0, costEstimatedEntries: 0 }] })
    await oldRequest
    expect(h.fetchTotals).toHaveBeenCalledWith({ groupBy: 'member', filters: { client: 'c2' }, page: 1, perPage: 200 })
    expect(h.instance.totals.value.members.active.workMs).toBe(8)
    expect(h.instance.totals.value.members.inactive).toBeUndefined()
    expect(h.instance.historyPath('active')).toBe('/team/active')
    h.unmount()
  })

  it('fences an old project response after the project scope changes', async () => {
    const h = harness()
    let release!: (response: unknown) => void
    h.fetchTotals.mockReturnValueOnce(new Promise(resolve => { release = resolve }))
    const oldRequest = h.instance.load()
    await Promise.resolve()
    await Promise.resolve()
    h.props.projectId = 'p2'
    h.fetchTotals.mockResolvedValueOnce({ page: 1, totalPages: 1, totalGroups: 1, groups: [{ groupKey: 'active', workMs: 8, cost: 1, entries: 1, costUnknownEntries: 0, costEstimatedEntries: 0 }] })
    await h.instance.load()
    release({ page: 1, totalPages: 1, totalGroups: 1, groups: [{ groupKey: 'inactive', workMs: 99, cost: 1, entries: 1, costUnknownEntries: 0, costEstimatedEntries: 0 }] })
    await oldRequest
    expect(h.instance.totals.value.members.active.workMs).toBe(8)
    expect(h.instance.totals.value.members.inactive).toBeUndefined()
    h.unmount()
  })

  it('offers attribution for owner client and project scopes and binds the existing dialog to that project', () => {
    expect(source).toContain('data-testid="attribute-client-work"')
    expect(source).toContain('v-if="totals.unattributed"')
    expect(source).toContain('<ClientWorkAttributionDialog v-model:open="attributionOpen" :client-id="props.clientId" :project-id="props.projectId"')
  })

  it('renders the production project attribution action and forwards the canonical project binding', async () => {
    const h = harness(true, 'c1', 'p1')
    h.fetchTotals.mockResolvedValue({ page: 1, totalPages: 1, totalGroups: 1, groups: [{ groupKey: '', workMs: 9, cost: 0, entries: 1, costUnknownEntries: 1, costEstimatedEntries: 0 }] })
    await h.instance.load()
    const dialogProps = vi.fn()
    const wrapper = mount(defineComponent({ render: templateExports.render, setup: () => h.instance }), { global: { components: {
      Button: defineComponent({ setup(_props, { slots, attrs }) { return () => vueH('button', attrs, slots.default?.()) } }),
      ClientWorkAttributionDialog: defineComponent({ props: ['open', 'clientId', 'projectId'], emits: ['update:open'], setup(props, { expose }) { dialogProps(props); expose({}); return () => null } }),
      NuxtLink: defineComponent({ props: ['to'], setup(_props, { slots }) { return () => vueH('a', slots.default?.()) } }),
      ArrowRight: defineComponent({ setup: () => () => vueH('span') }),
    } } })
    const action = wrapper.find('[data-testid="attribute-client-work"]')
    expect(action.exists()).toBe(true)
    await action.trigger('click')
    await Vue.nextTick()
    expect(dialogProps).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'c1', projectId: 'p1' }))
    expect(h.fetchTotals).toHaveBeenCalledWith({ groupBy: 'member', filters: { client: 'c1', project: 'p1' }, page: 1, perPage: 200 })
    wrapper.unmount()
  })

  it('keeps a committed attribution successful when its scoped totals refresh fails', async () => {
    const h = harness()
    h.props.projectId = undefined
    h.fetchTotals.mockRejectedValue(new Error('refresh failed'))
    await expect(h.instance.refreshAfterAttribution()).resolves.toBeUndefined()
    expect(h.fetchTotals).toHaveBeenCalledOnce()
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('does not load or expose catalog names to viewers and renders only scoped fields', async () => {
    const h = harness(false)
    await h.instance.load()
    expect(h.instance.state.value).toBe('error')
    expect(h.refresh).not.toHaveBeenCalled()
    expect(h.fetchTotals).not.toHaveBeenCalled()
    expect(source).toContain('onBeforeUnmount(() => { requestVersion++ })')
    expect(source).toContain('v-if="member" :to="historyPath(member.id)"')
    expect(source).not.toContain('machine')
    expect(source).not.toContain('activeProjects')
    expect(source).toContain('data-testid="project-member-unattributed"')
    expect(source).toContain('<section v-if="isOwner"')
    expect(source).toContain('const current = () => version === requestVersion && client === props.clientId && project === props.projectId && isOwner.value && ownerId === user.value?.id && token === $pb.authStore.token')
  })
})
