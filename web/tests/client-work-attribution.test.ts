import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref, watch } from 'vue'
import ts from 'typescript'

const source = readFileSync('app/composables/useClientWorkAttribution.ts', 'utf8')

function setup(projectScope?: string) {
  const clientPath = '/organizacion/clientes/c1'
  const projectPath = projectScope ? `${clientPath}/proyectos/${projectScope}` : undefined
  const route = reactive({ fullPath: projectPath ?? clientPath, path: projectPath ?? clientPath, params: { id: 'c1', projectId: projectScope } })
  const owner = ref(true)
  const user = ref({ id: 'owner1', role: 'owner' })
  const token = ref('token1')
  const calls: any[] = []
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: `e${i}`, client: 'c1', project: 'p1', member: '', started_at: `2026-01-${String(30 - i).padStart(2, '0')}`, work_ms: i * 1000, machine: '' }))
  const pb = {
    authStore: { get token() { return token.value }, get record() { return user.value }, onChange: () => () => {} },
    collection: (name: string) => ({
      getFullList: async () => name === 'team_members' ? [{ id: 'm1', name: 'Inactive member', department: 'd1', active: false }] : [{ id: 'd1', name: 'Old department' }],
      getList: async (page: number, perPage: number, options: any) => {
        calls.push({ name, page, perPage, options })
        return { items: rows.slice((page - 1) * perPage, page * perPage), page, totalPages: 2, totalItems: 30 }
      },
    }),
    send: vi.fn(async (path: string, options: any) => { calls.push({ path, options }); return path.endsWith('/preview') ? { client_id: 'c1', ...(options.body.project_id ? { project_id: options.body.project_id } : {}), member: 'm1', count: options.body.entry_ids.length, snapshot: 's1' } : { client_id: 'c1', ...(options.body.project_id ? { project_id: options.body.project_id } : {}), member: 'm1', updated_count: 1 } }),
  }
  const bindings = { ref, computed, watch, onBeforeUnmount: () => {}, useRoute: () => route, useAuth: () => ({ isOwner: owner, user }), useNuxtApp: () => ({ $pb: pb }) }
  const code = ts.transpile(source.replace(/^import .*$/gm, ''), { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS })
  const module = { exports: {} as Record<string, any> }
  const factory = new Function(...Object.keys(bindings), 'module', 'exports', `${code}; return module.exports.useClientWorkAttribution`)(...Object.values(bindings), module, module.exports)
  const dialogOpen = ref(true)
  const projectId = ref<string | undefined>(projectScope)
  const api = factory({ clientId: ref('c1'), projectId, open: dialogOpen })
  return { api, pb, calls, route, owner, token, dialogOpen, projectId }
}

describe('client work attribution', () => {
  it('pages only blank-member rows for the exact client and keeps explicit selection across pages', async () => {
    const h = setup()
    await h.api.loadPage(1)
    await h.api.toggle('e0', true)
    await h.api.loadPage(2)
    await h.api.toggle('e29', true)
    expect(h.calls.filter(call => call.name === 'task_entries').map(call => call.options.filter)).toEqual([
      'client = "c1" && member = ""', 'client = "c1" && member = ""',
    ])
    expect(h.api.selectedIds.value).toEqual(['e0', 'e29'])
    expect(h.api.rows.value).toHaveLength(5)
    expect(h.api.page.value).toBe(2)
  })

  it('lists, previews, and applies only the selected project scope while preserving the client-only API shape', async () => {
    const h = setup('p1')
    await h.api.loadPage(1)
    expect(h.calls.find(call => call.name === 'task_entries').options.filter).toBe('client = "c1" && project = "p1" && member = ""')
    h.api.selectedIds.value = ['e0']
    h.api.memberId.value = 'm1'
    await h.api.preview()
    expect(h.pb.send).toHaveBeenLastCalledWith('/api/kankaku/client-attribution/preview', { method: 'POST', body: { client_id: 'c1', project_id: 'p1', member: 'm1', entry_ids: ['e0'] } })
    await h.api.apply()
    expect(h.pb.send).toHaveBeenLastCalledWith('/api/kankaku/client-attribution/apply', { method: 'POST', body: { client_id: 'c1', project_id: 'p1', member: 'm1', entry_ids: ['e0'], snapshot: 's1' } })
    const client = setup()
    await client.api.loadPage(1)
    expect(client.calls.filter(call => call.name === 'task_entries').at(-1).options.filter).toBe('client = "c1" && member = ""')
    client.api.selectedIds.value = ['e0']
    client.api.memberId.value = 'm1'
    await client.api.preview()
    expect(client.pb.send).toHaveBeenLastCalledWith('/api/kankaku/client-attribution/preview', { method: 'POST', body: { client_id: 'c1', member: 'm1', entry_ids: ['e0'] } })
  })

  it.each([
    ['/organizacion/clientes/c1/proyectos/p2', 'p1'],
    ['/organizacion/clientes/c1/proyectos/p1/tareas/t1', 'p1'],
    ['/organizacion/clientes/c2/proyectos/p1', 'p1'],
  ])('rejects mismatched client/project and task routes (%s)', (path, routeProject) => {
    const h = setup('p1')
    h.route.path = path
    h.route.params.projectId = routeProject
    h.route.params.id = path.includes('/c2/') ? 'c2' : 'c1'
    expect(h.api.eligible.value).toBe(false)
  })

  it('caps explicit cross-page selection at 200 and never selects unshown rows', async () => {
    const h = setup()
    h.api.rows.value = Array.from({ length: 201 }, (_, index) => ({ id: `e${index}`, client: 'c1', member: '', started_at: '', work_ms: 0, machine: '' }))
    for (let index = 0; index < 200; index++) h.api.toggle(`e${index}`, true)
    h.api.toggle('e200', true)
    expect(h.api.selectedIds.value).toHaveLength(200)
    expect(h.api.selectedIds.value).not.toContain('e200')
    expect(h.api.error.value).toBe('limit')
  })

  it('previews and applies the identical explicit batch, then consumes it before refresh', async () => {
    const h = setup()
    h.api.selectedIds.value = ['e0', 'e2']
    h.api.memberId.value = 'm1'
    await h.api.preview()
    expect(h.pb.send).toHaveBeenLastCalledWith('/api/kankaku/client-attribution/preview', { method: 'POST', body: { client_id: 'c1', member: 'm1', entry_ids: ['e0', 'e2'] } })
    expect(await h.api.apply()).toBe(true)
    expect(h.pb.send).toHaveBeenLastCalledWith('/api/kankaku/client-attribution/apply', { method: 'POST', body: { client_id: 'c1', member: 'm1', entry_ids: ['e0', 'e2'], snapshot: 's1' } })
    expect(h.api.selectedIds.value).toEqual([])
    expect(h.api.previewResult.value).toBeNull()
  })

  it('blocks a second apply while the first request is in flight', async () => {
    const h = setup()
    h.api.selectedIds.value = ['e0', 'e2']
    h.api.memberId.value = 'm1'
    await h.api.preview()
    let finish!: (value: any) => void
    h.pb.send.mockReturnValueOnce(new Promise(resolve => { finish = resolve }) as any)
    const first = h.api.apply()
    await Promise.resolve()
    expect(await h.api.apply()).toBeUndefined()
    expect(h.pb.send).toHaveBeenCalledTimes(2)
    finish({ client_id: 'c1', member: 'm1', updated_count: 2 })
    expect(await first).toBe(true)
  })

  it('invalidates stale work and does not clear a newer busy operation after auth or route changes', async () => {
    const h = setup()
    let finish!: (value: any) => void
    h.pb.send.mockReturnValueOnce(new Promise(resolve => { finish = resolve }) as any)
    h.api.selectedIds.value = ['e0']
    h.api.memberId.value = 'm1'
    const pending = h.api.preview()
    await Promise.resolve()
    h.token.value = 'token2'
    await Promise.resolve()
    h.api.busy.value = true
    finish({ client_id: 'c1', member: 'm1', count: 1, snapshot: 'stale' })
    await pending
    expect(h.api.previewResult.value).toBeNull()
    expect(h.api.busy.value).toBe(true)
  })
})
