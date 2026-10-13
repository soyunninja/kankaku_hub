import { readFileSync } from 'node:fs'
import { expect, it, vi, afterEach } from 'vitest'
import { computed, ref } from 'vue'
import { useTeamCatalog } from '../app/composables/useTeamCatalog'

const page = readFileSync('app/pages/team/[id].vue', 'utf8')
const catalog = readFileSync('app/composables/useTeamCatalog.ts', 'utf8')

afterEach(() => vi.unstubAllGlobals())

function setupCatalog(rows: Array<{ id: string, active: boolean, member: string }>) {
  const owner = ref(true)
  const update = vi.fn(async () => ({}))
  const create = vi.fn(async () => ({}))
  const getFullList = vi.fn(async ({ sort }: { sort: string }) => sort === 'key' ? rows : [])
  const collection = vi.fn(() => ({ update, create, getFullList }))
  const states = new Map<string, ReturnType<typeof ref>>()
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useAuth', () => ({ isOwner: owner }))
  vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection } }))
  vi.stubGlobal('useState', (key: string, initialize: () => unknown) => {
    if (!states.has(key)) states.set(key, ref(initialize()))
    return states.get(key)
  })
  return { owner, update, create, getFullList, collection, catalog: useTeamCatalog() }
}

function machineHandler(dependencies: Record<string, unknown>) {
  const body = page.match(/async function manageMemberMachine\([^)]*\) \{([\s\S]*?)\n\}/)?.[1]
  expect(body, 'manageMemberMachine implementation').toBeTruthy()
  return new Function(...Object.keys(dependencies), `return async function manageMemberMachine(action, machineId) {${body}\n}`)(...Object.values(dependencies)) as (action: string, machineId?: string) => Promise<void>
}

function machineHarness(registerMachine = vi.fn(async () => true)) {
  const state = {
    isOwner: { value: true }, member: { value: { id: 'member-a' } }, memberId: { value: 'member-a' }, generation: { value: 1 },
    saving: { value: false }, editing: { value: false }, machineSaving: { value: false }, machineError: { value: '' }, machineErrorLocation: { value: '' }, machineNotice: { value: '' },
    selectedMachine: { value: 'machine-a' }, machineDraft: { key: 'host-key', name: 'Host' }, machineDialog: { value: true }, unlinkTarget: { value: '' },
    assignMachine: vi.fn(async () => true), unlinkMachine: vi.fn(async () => true),
    useTeamCatalog: () => ({ registerMachine, assignMachine: state.assignMachine, unlinkMachine: state.unlinkMachine }), t: (key: string) => key,
  }
  return { ...state, registerMachine, handler: machineHandler(state) }
}

it('assigns only a freshly verified active unassigned machine through PocketBase', async () => {
  const rows = [
    { id: 'free', active: true, member: '' },
    { id: 'assigned', active: true, member: 'someone-else' },
    { id: 'inactive', active: false, member: '' },
  ]
  const { catalog, update } = setupCatalog(rows)
  await catalog.assignMachine('free', 'member-a')
  expect(update).toHaveBeenCalledWith('free', { member: 'member-a' })
  await expect(catalog.assignMachine('assigned', 'member-a')).rejects.toThrow('Machine is no longer available')
  await expect(catalog.assignMachine('inactive', 'member-a')).rejects.toThrow('Machine is no longer available')
  expect(update).toHaveBeenCalledTimes(1)
})

it('unlinks only a machine still assigned to the requested member', async () => {
  const { catalog, update } = setupCatalog([{ id: 'owned', active: false, member: 'member-a' }])
  await catalog.unlinkMachine('owned', 'member-a')
  expect(update).toHaveBeenCalledWith('owned', { member: '' })
  await expect(catalog.unlinkMachine('owned', 'member-b')).rejects.toThrow('Machine is no longer assigned to this member')
  expect(update).toHaveBeenCalledTimes(1)
})

it('opens an in-app confirmation for the selected machine without issuing an API request', () => {
  const state = machineHarness()
  const body = page.match(/function openUnlinkConfirmation\([^)]*\) \{([\s\S]*?)\n\}/)?.[1]
  expect(body).toBeTruthy()
  const open = new Function('isOwner', 'member', 'machineSaving', 'unlinkTarget', `return function openUnlinkConfirmation(machineId) {${body}}`)(state.isOwner, state.member, state.machineSaving, state.unlinkTarget) as (machineId: string) => void
  open('machine-a')
  expect(state.unlinkTarget.value).toBe('machine-a')
  expect(state.unlinkMachine).not.toHaveBeenCalled()
  const confirmation = page.slice(page.indexOf(':open="Boolean(unlinkTarget)"'), page.indexOf('</Dialog>', page.indexOf(':open="Boolean(unlinkTarget)"')))
  expect(confirmation).toContain("t('team.unlinkMachineConfirm', { machine: `${unlinkMachine.name || unlinkMachine.key} · ${unlinkMachine.key}`, member: member.name })")
  expect(confirmation).toContain("@click=\"confirmUnlinkMachine\"")
  expect(confirmation).toContain("@click=\"closeUnlinkConfirmation\"")
  expect(confirmation).toContain("t('common.cancel')")
  expect(confirmation).toContain("t('team.unlinkMachine')")
  expect(page).not.toContain('window.confirm')
})

it('keeps the Machines card focused on linked machines and opens both management paths in one dialog', () => {
  const cardStart = page.indexOf('<Card>')
  const cardEnd = page.indexOf('</Card>', cardStart)
  const card = page.slice(cardStart, cardEnd)
  const dialogStart = page.indexOf('<Dialog v-if="isOwner && member" :open="machineDialog"')
  const dialogEnd = page.indexOf('</Dialog>', dialogStart)
  const dialog = page.slice(dialogStart, dialogEnd)
  expect(page).toContain("t('team.machines')")
  expect(card).toMatch(/<CardHeader class="grid-cols-\[1fr_auto\] grid-rows-\[auto\] items-center gap-3">\s*<CardTitle[^>]*>\{\{ t\('team\.machines'\) \}\}<\/CardTitle>\s*<Button[^>]*:aria-label="t\('team\.addMachine'\)"[^>]*><Plus aria-hidden="true" class="size-4" \/><\/Button>\s*<\/CardHeader>/)
  expect(card).not.toContain('<CardAction')
  expect(page).not.toContain('absolute right-6 top-3')
  expect(card).not.toContain('member-machine-actions')
  expect(card).not.toContain('selectFreeMachine')
  expect(card).toContain('openUnlinkConfirmation(machine.id)')
  expect(card).toContain('v-if="machineError && machineErrorLocation === \'card\'"')
  expect(dialog).toContain('v-if="machineError && machineErrorLocation === \'dialog\'"')
  expect(dialog).toContain("t('team.addMachine')")
  expect(dialog).toContain('member-machine-actions')
  expect(dialog).toContain("t('team.assignMachine')")
  expect(dialog).toContain("t('team.registerMachine')")
  expect(dialog).toContain('<Label>{{ t(\'team.selectFreeMachine\') }}</Label>')
  expect(dialog).toContain(':aria-label="t(\'team.selectFreeMachine\')"')
  expect(dialog).toContain('for="machine-key"')
  expect(dialog).toContain('for="machine-name"')
  expect(page).toContain('size="icon" :aria-label="t(\'team.addMachine\')"')
})

it('assigns only active free machines and registers a machine directly to the member', () => {
  expect(catalog).toContain('assignMachine(machineId: string, memberId: string)')
  expect(catalog).toContain('registerMachine(input: { key: string, name: string, memberId: string })')
  expect(catalog).toContain("$pb.collection('machines').update(machineId, { member: memberId })")
  expect(catalog).toContain("$pb.collection('machines').create({ key: input.key, name: input.name, member: input.memberId, active: true })")
  expect(catalog).toContain('!machine || !machine.active || machine.member')
})

it('shows unlink failures in the card and keeps assignment and registration failures in the dialog', async () => {
  const unlink = machineHarness()
  unlink.unlinkMachine.mockRejectedValue(new Error('private failure'))
  await unlink.handler('unlink', 'machine-a')
  expect(unlink.machineError.value).toBe('team.machineRequestFailed')
  expect(unlink.machineErrorLocation.value).toBe('card')

  const assign = machineHarness()
  assign.assignMachine.mockRejectedValue(new Error('private failure'))
  await assign.handler('assign', 'machine-a')
  expect(assign.machineError.value).toBe('team.machineRequestFailed')
  expect(assign.machineErrorLocation.value).toBe('dialog')
})

it('unlinks current machine ownership without changing machine keys or historical records', () => {
  expect(catalog).toContain('unlinkMachine(machineId: string, memberId: string)')
  expect(catalog).toContain("$pb.collection('machines').update(machineId, { member: '' })")
  expect(catalog).not.toMatch(/collection\(['"](?:task_entries|work_records)['"]\)/)
  expect(page).toContain("await manageMemberMachine('unlink', machineId)")
  expect(page).not.toContain('window.confirm')
})

it('registers once for the captured member and does not report stale route completion', async () => {
  let resolve!: (value: boolean) => void
  const pending = new Promise<boolean>((done) => { resolve = done })
  const state = machineHarness(vi.fn(() => pending))
  const operation = state.handler('register')
  await state.handler('register')
  expect(state.registerMachine).toHaveBeenCalledOnce()
  expect(state.registerMachine).toHaveBeenCalledWith({ key: 'host-key', name: 'Host', memberId: 'member-a' })
  expect(state.machineSaving.value).toBe(true)
  state.memberId.value = 'member-b'
  state.member.value = { id: 'member-b' }
  state.generation.value++
  state.machineNotice.value = 'next route notice'
  resolve(true)
  await operation
  expect(state.machineNotice.value).toBe('next route notice')
  expect(state.machineError.value).toBe('')
  expect(state.machineSaving.value).toBe(false)
})

it('closes and resets either modal action after success even when catalog refresh fails', async () => {
  const state = machineHarness()
  state.selectedMachine.value = 'machine-to-assign'
  state.assignMachine.mockResolvedValue(false)
  await state.handler('assign', state.selectedMachine.value)
  expect(state.assignMachine).toHaveBeenCalledWith('machine-to-assign', 'member-a')
  expect(state.machineDialog.value).toBe(false)
  expect(state.selectedMachine.value).toBe('')
  expect(state.machineDraft).toEqual({ key: '', name: '' })
  expect(state.machineNotice.value).toBe('team.machineSavedRefreshFailed')
})

it('closes unlink confirmation after success even when catalog refresh fails', async () => {
  const state = machineHarness()
  state.unlinkTarget.value = 'machine-a'
  state.unlinkMachine.mockResolvedValue(false)
  await state.handler('unlink', state.unlinkTarget.value)
  expect(state.unlinkMachine).toHaveBeenCalledWith('machine-a', 'member-a')
  expect(state.unlinkTarget.value).toBe('')
  expect(state.machineNotice.value).toBe('team.machineSavedRefreshFailed')
})

it('keeps unlink confirmation available for retry after a real failure', async () => {
  const state = machineHarness()
  state.unlinkTarget.value = 'machine-a'
  state.unlinkMachine.mockRejectedValueOnce(new Error('private failure'))
  await state.handler('unlink', state.unlinkTarget.value)
  expect(state.machineError.value).toBe('team.machineRequestFailed')
  expect(state.machineErrorLocation.value).toBe('card')
  expect(state.unlinkTarget.value).toBe('machine-a')
  expect(state.machineSaving.value).toBe(false)
  state.unlinkMachine.mockResolvedValue(true)
  await state.handler('unlink', state.unlinkTarget.value)
  expect(state.unlinkMachine).toHaveBeenCalledTimes(2)
  expect(state.unlinkTarget.value).toBe('')
})

it('closes and resets registration after create succeeds even when catalog refresh fails', async () => {
  const state = machineHarness(vi.fn(async () => false))
  await state.handler('register')
  expect(state.machineDialog.value).toBe(false)
  expect(state.machineDraft).toEqual({ key: '', name: '' })
  expect(state.machineError.value).toBe('')
  expect(state.machineNotice.value).toBe('team.machineSavedRefreshFailed')
})

it('retains the open registration form and draft after a failed create', async () => {
  const state = machineHarness(vi.fn(async () => { throw new Error('private failure') }))
  await state.handler('register')
  expect(state.machineError.value).toBe('team.machineRequestFailed')
  expect(state.machineNotice.value).toBe('')
  expect(state.machineDialog.value).toBe(true)
  expect(state.machineDraft).toEqual({ key: 'host-key', name: 'Host' })
  expect(state.machineSaving.value).toBe(false)
})

it('guards duplicate and stale-route completions and localizes the controls', () => {
  expect(page).toContain('machineSaving')
  expect(page).toContain('onMachineDialogOpenChange')
  expect(page).toContain('preventMachineDismiss')
  expect(page).toContain('request === generation.value && memberId.value === targetId')
  for (const locale of ['en', 'es', 'ja']) {
    const messages = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8'))
    for (const key of ['machines', 'addMachine', 'assignMachine', 'registerMachine', 'unlinkMachine', 'unlinkMachineConfirm', 'machineRequestFailed']) {
      expect(messages.team[key]).toBeTruthy()
    }
  }
})
