import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import ts from 'typescript'
import { loadProjectMemberTotals } from '../app/lib/project-member-totals'

const source = readFileSync('app/components/projects/ProjectMembers.vue', 'utf8')
function harness(owner = true) {
  const isOwner = ref(owner)
  const members = ref([{ id: 'active', name: 'Active member', department: 'd1', active: true }, { id: 'inactive', name: 'Inactive member', department: '', active: false }])
  const departments = ref([{ id: 'd1', name: 'Design' }])
  const fetchTotals = vi.fn()
  const refresh = vi.fn().mockResolvedValue(undefined)
  const props = { clientId: 'c1', projectId: 'p1' }
  let unmount = () => {}
  const bindings = {
    computed, ref, watch: () => {}, onMounted: () => {}, onBeforeUnmount: (fn: () => void) => { unmount = fn },
    defineProps: () => props, useI18n: () => ({ t: (key: string) => key, locale: ref('en') }),
    useAuth: () => ({ isOwner }), useTeamCatalog: () => ({ departments, members, refresh }), useTotals: () => ({ fetchTotals }),
    loadProjectMemberTotals, TotalsRouteUnavailableError: class extends Error {}, formatCost: (value: number) => `$${value}`, formatDuration: (value: number) => `${value}ms`,
  }
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]!
  const code = ts.transpile(script.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022 })
  const instance = new Function(...Object.keys(bindings), `${code}; return { load, state, totals, rows, cost, historyPath }`)(...Object.values(bindings))
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
  })
})
