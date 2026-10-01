import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

// Execute the page's actual functions with deterministic deferred API responses.
const source = readFileSync('app/pages/entries/index.vue', 'utf8')
function harness() {
  const filters: { session_id?: string } = {}
  const ref = <T>(value: T) => ({ value })
  const state = {
    filters, sort: ref('-started_at'), page: ref(1), groupBySession: ref(true),
    primaryGrouped: ref(true), groupingFallback: ref(false), loading: ref(false),
    sessionRows: ref<{ sessionId: string }[]>([]), sessionTotalGroups: ref(0), sessionTotalPages: ref(1),
    items: ref<unknown[]>([]), totalItems: ref(0), totalPages: ref(1),
    sessionRowEntries: new Map(), entriesFiltersSplit: ref({ groupable: {} }), perPage: 25,
    reactive: <T>(value: T) => value,
    list: vi.fn().mockResolvedValue({ items: ['entry'], totalItems: 1, totalPages: 1 }),
    fetchSessionTotalsForEntries: vi.fn(), entriesDateRangeToTotalsRange: () => ({}),
    loadEngramNarratives: vi.fn(), TotalsRouteUnavailableError: class extends Error {},
  }
  const section = (start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end))
  const code = section('const expandedSessions =', 'function taskName(')
    + section('function filterToSession(', '/** Label for the active session-filter chip:')
    + section('async function loadFlat(', '/**\n * Single entry point')
    + section('async function refresh()', 'function agentLabel(')
    + '\nreturn { filterToSession, clearSessionFilter, toggleSession, refresh, expandedSessions };'
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const actions = new Function(...Object.keys(state), compiled)(...Object.values(state))
  return { ...state, ...actions }
}
function bulkHarness() {
  const ref = <T>(value: T) => ({ value })
  const state = {
    ref, reactive: <T>(value: T) => value, computed: (getter: () => unknown) => ({ get value() { return getter() } }),
    watch: vi.fn(), canWrite: ref(true), filters: { session_id: 'a' }, loading: ref(false),
    primaryGrouped: ref(false), items: ref([{ id: 'a1', session_id: 'a' }]),
    sessionRowEntries: new Map(), expandedSessions: new Set(),
    collectEntryIds: vi.fn().mockResolvedValue(['a1', 'a2']),
    bulkAssignTask: vi.fn().mockResolvedValue({ succeeded: ['a1'], failed: ['a2'] }),
    createTask: vi.fn().mockResolvedValue({ id: 'new-task' }),
    toast: { error: vi.fn(), success: vi.fn() }, t: (key: string, values: unknown) => ({ key, values }),
    refresh: vi.fn(), refreshTasks: vi.fn(),
  }
  const code = source.slice(source.indexOf('// Session-scoped bulk selection.'), source.indexOf('// Detail drawer'))
    + '\nreturn { selectedIds, bulkTask, bulkProject, bulkTitle, bulkDialog, selectVisible, selectAllInSession, assignSelected, invalidate: () => { selectionGeneration++; selectedIds.clear() } };'
  const compiled = ts.transpileModule('let pendingSessionExpansion;\n' + code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return { ...state, ...new Function(...Object.keys(state), compiled)(...Object.values(state)) }
}

function tasksHarness() {
  const collection = { create: vi.fn().mockResolvedValue({ id: 'new-task', title: 'Task' }), getFullList: vi.fn().mockRejectedValue(new Error('catalog unavailable')) }
  const states = new Map<string, { value: unknown }>()
  const useState = (key: string, init: () => unknown) => {
    if (!states.has(key)) states.set(key, { value: init() })
    return states.get(key)
  }
  const code = readFileSync('app/composables/useTasks.ts', 'utf8').replace(/^import .*\n/, '').replace('export function useTasks', 'function useTasks')
    + '\nreturn useTasks();'
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  const tasks = new Function('useNuxtApp', 'useState', compiled)(() => ({ $pb: { collection: () => collection } }), useState)
  return { ...tasks, collection }
}

function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
const rows = (sessionId: string) => ({ sessions: [{ sessionId }], totalGroups: 1, totalPages: 1 })

describe('Entries session selection', () => {
  it('keeps assignment fields out of the toolbar and inside focused dialogs', () => {
    const toolbar = source.slice(source.indexOf('<div v-if="bulkEnabled"'), source.indexOf('<Dialog :open="bulkEnabled', source.indexOf('<div v-if="bulkEnabled"')))
    expect(toolbar).not.toContain('<Select')
    expect(toolbar).not.toContain('<Input')
    expect(source).toContain("'bulk-assign-dialog'")
    expect(source).toContain("'bulk-create-dialog'")
    expect(source).toContain("t('entries.bulk.assignCount', { count: selectedIds.size })")
    expect(source).toContain("t('entries.bulk.createAssignCount', { count: selectedIds.size })")
  })

  it('gates bulk controls and provides stopped checkboxes in both entry render paths', () => {
    expect(source).toContain('canWrite.value && !!filters.session_id')
    expect(source).toContain('v-if="bulkEnabled"')
    expect(source).toContain('@change="toggleEntry(entry.id)"')
    expect(source).toContain('@change="toggleEntry(dr.entry.id)"')
    expect(source.match(/@click\.stop/g)?.length).toBeGreaterThanOrEqual(3)
    expect(source).toContain('collectEntryIds({ ...filters })')
    expect(source).toContain('createTask({ title: bulkTitle.value.trim(), project: bulkProject.value, status: \'open\' })')
  })

  it('creates one task, retains failed selections, and retries against the created task', async () => {
    const h = bulkHarness()
    await h.selectAllInSession()
    h.bulkTitle.value = ' Task '
    h.bulkProject.value = 'project'
    await h.assignSelected(true)
    expect(h.createTask).toHaveBeenCalledWith({ title: 'Task', project: 'project', status: 'open' })
    expect([...h.selectedIds]).toEqual(['a2'])
    expect(h.bulkDialog.value).toBe('assign')
    expect(h.toast.error).toHaveBeenCalledWith({ key: 'entries.bulk.result', values: { succeeded: 1, failed: 1 } })
    h.bulkAssignTask.mockResolvedValue({ succeeded: ['a2'], failed: [] })
    await h.assignSelected()
    expect(h.createTask).toHaveBeenCalledTimes(1)
    expect(h.bulkAssignTask).toHaveBeenLastCalledWith(['a2'], 'new-task')
    expect(h.selectedIds.size).toBe(0)
    expect(h.bulkDialog.value).toBeNull()
  })

  it('retains the created task through catalog refresh failure and retries only failed assignments', async () => {
    const tasks = tasksHarness()
    const h = bulkHarness()
    h.createTask.mockImplementation(tasks.create)
    await h.selectAllInSession()
    h.bulkTitle.value = 'Task'
    h.bulkProject.value = 'project'
    await h.assignSelected(true)
    expect(h.bulkAssignTask).toHaveBeenCalledWith(['a1', 'a2'], 'new-task')
    expect(h.bulkTask.value).toBe('new-task')
    expect(h.bulkTitle.value).toBe('')
    expect(tasks.byId('new-task')).toEqual({ id: 'new-task', title: 'Task' })
    expect(tasks.loading.value).toBe(false)
    h.bulkAssignTask.mockResolvedValue({ succeeded: ['a2'], failed: [] })
    await h.assignSelected()
    expect(tasks.collection.create).toHaveBeenCalledTimes(1)
    expect(h.bulkAssignTask).toHaveBeenLastCalledWith(['a2'], 'new-task')
    expect(h.selectedIds.size).toBe(0)
  })

  it('still propagates task creation failures without refreshing or assigning', async () => {
    const tasks = tasksHarness()
    tasks.collection.create.mockRejectedValue(new Error('create failed'))
    await expect(tasks.create({ title: 'Task', project: 'project', status: 'open' })).rejects.toThrow('create failed')
    expect(tasks.collection.getFullList).not.toHaveBeenCalled()
    expect(tasks.tasks.value).toEqual([])
  })

  it('ignores stale full-session selection and gates viewer writes', async () => {
    const h = bulkHarness()
    const pending = deferred()
    h.collectEntryIds.mockReturnValueOnce(pending.promise)
    const selecting = h.selectAllInSession()
    h.invalidate()
    pending.resolve(['old'])
    await selecting
    expect(h.selectedIds.size).toBe(0)
    h.canWrite.value = false
    h.selectedIds.add('a1')
    h.bulkTask.value = 'task'
    await h.assignSelected()
    expect(h.bulkAssignTask).not.toHaveBeenCalled()
  })

  it('loads nested entries, ensures open on repeated markers, and retains explicit collapse', async () => {
    const h = harness()
    h.fetchSessionTotalsForEntries.mockResolvedValue(rows('a'))
    h.filterToSession('a')
    await h.refresh()
    expect(h.expandedSessions.has('a')).toBe(true)
    expect(h.sessionRowEntries.get('a').items).toEqual(['entry'])
    h.filterToSession('a')
    expect(h.expandedSessions.has('a')).toBe(true)
    expect(h.list).toHaveBeenCalledTimes(1)
    h.toggleSession('a')
    expect(h.expandedSessions.has('a')).toBe(false)
    h.filterToSession('a')
    expect(h.expandedSessions.has('a')).toBe(true)
  })

  it('ignores obsolete totals and does not end the current loading state', async () => {
    const h = harness()
    const old = deferred()
    const current = deferred()
    h.fetchSessionTotalsForEntries.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    h.filterToSession('a')
    const first = h.refresh()
    h.filterToSession('b')
    const second = h.refresh()
    old.resolve(rows('a'))
    await first
    expect(h.sessionRows.value).toEqual([])
    expect(h.loading.value).toBe(true)
    current.resolve(rows('b'))
    await second
    expect(h.sessionRows.value).toEqual([{ sessionId: 'b' }])
    expect([...h.expandedSessions]).toEqual(['b'])
  })

  it('cancels pending expansion immediately when cleared, before the watcher refresh', async () => {
    const h = harness()
    const pending = deferred()
    h.fetchSessionTotalsForEntries.mockReturnValue(pending.promise)
    h.filterToSession('a')
    const refresh = h.refresh()
    h.clearSessionFilter()
    pending.resolve(rows('a'))
    await refresh
    expect(h.sessionRows.value).toEqual([])
    expect(h.expandedSessions.size).toBe(0)
  })

  it('does not let an obsolete lazy entry request overwrite a refreshed cache', async () => {
    const h = harness()
    const oldEntries = deferred()
    h.list.mockReturnValueOnce(oldEntries.promise)
    h.fetchSessionTotalsForEntries.mockResolvedValue(rows('a'))
    h.filterToSession('a')
    await h.refresh()
    h.filterToSession('b')
    h.fetchSessionTotalsForEntries.mockResolvedValue(rows('b'))
    await h.refresh()
    oldEntries.resolve({ items: ['obsolete'] })
    await Promise.resolve()
    expect(h.sessionRowEntries.has('a')).toBe(false)
    expect(h.sessionRowEntries.get('b').items).toEqual(['entry'])
  })

  it('keeps flat and totals-unavailable fallback filter-only', async () => {
    const h = harness()
    h.groupBySession.value = false
    h.primaryGrouped.value = false
    h.filterToSession('a')
    await h.refresh()
    expect(h.filters.session_id).toBe('a')
    expect(h.expandedSessions.size).toBe(0)
    h.groupBySession.value = true
    h.primaryGrouped.value = true
    h.fetchSessionTotalsForEntries.mockRejectedValue(new h.TotalsRouteUnavailableError())
    h.filterToSession('b')
    await h.refresh()
    expect(h.groupingFallback.value).toBe(true)
    expect(h.expandedSessions.size).toBe(0)
  })
})
