import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { readFileSync } from 'node:fs'
import { mapPocketBaseFieldErrors } from '../app/lib/client-contact'
import { useTeamCatalog } from '../app/composables/useTeamCatalog'

const owner = ref(true)
const send = vi.fn()
const create = vi.fn()
const update = vi.fn()
const getFullList = vi.fn()
const collection = vi.fn(() => ({ create, update, getFullList }))

beforeEach(() => {
  vi.clearAllMocks()
  owner.value = true
  const state = new Map()
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('useAuth', () => ({ isOwner: owner }))
  vi.stubGlobal('useNuxtApp', () => ({ $pb: { collection, send } }))
  vi.stubGlobal('useState', (key: string, init: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(init()))
    return state.get(key)
  })
  getFullList.mockResolvedValue([])
  create.mockResolvedValue({})
  update.mockResolvedValue({})
})
afterEach(() => vi.unstubAllGlobals())

describe('team catalog error display', () => {
  const source = readFileSync('app/pages/team/index.vue', 'utf8')
  // Execute the page's handler with controlled dependencies, without Nuxt mounting.
  const handler = source.match(/async function perform\(action: \(\) => Promise<unknown>\) \{([\s\S]*?)\nonMounted/)![1]
  const perform = new Function('isOwner', 'busy', 'error', 't', 'mapPocketBaseFieldErrors',
    `return async function perform(action) {${handler}`)

  it.each([
    [{ data: { data: { key: { message: 'Value must be unique.' } } } }, 'key: Value must be unique.'],
    [{ data: { data: { member: { message: 'Invalid relation.' } } } }, 'member: Invalid relation.'],
    [{ data: { data: { key: { message: 'Duplicate.' }, member: { message: 'Invalid.' } } } }, 'key: Duplicate. · member: Invalid.'],
    [{ message: 'private request', stack: 'private stack', data: { data: { key: { code: 'invalid' } } } }, 'team.requestFailed'],
    [null, 'team.requestFailed'],
  ])('renders only field messages or a generic fallback for %j', async (failure, expected) => {
    const busy = ref(false)
    const error = ref('previous error')
    await perform(owner, busy, error, (key: string) => key, mapPocketBaseFieldErrors)(async () => { throw failure })
    expect(error.value).toBe(expected)
    expect(busy.value).toBe(false)
    expect(source).toContain('role="alert"')
    expect(source).toContain('<span>{{ error }}</span>')
  })
})

describe('historical machine backfill', () => {
  const preview = { machine_id: 'pc', machine_key: ' Exact ', member: 'member', count: 3, snapshot: 'opaque' }

  it('previews without applying and whitelists the confirmed payload', async () => {
    send.mockResolvedValueOnce(preview).mockResolvedValueOnce({ ...preview, updated_count: 2 })
    const catalog = useTeamCatalog()
    expect(await catalog.previewBackfill('pc')).toEqual(preview)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenLastCalledWith('/api/kankaku/team-backfill/preview', { method: 'POST', body: { machine_id: 'pc' } })
    const result = await catalog.applyBackfill({ ...preview, extra: 'discard' } as never)
    expect(send).toHaveBeenLastCalledWith('/api/kankaku/team-backfill/apply', { method: 'POST', body: preview })
    expect(result.updated_count).toBe(2)
  })

  it('keeps catalog assignment separate from explicit confirmation and reports only applied counts', () => {
    const source = readFileSync('app/pages/team/index.vue', 'utf8')
    const submit = source.match(/async function submit\(\) \{([\s\S]*?)\n\}/)![1]
    expect(submit).not.toContain('Backfill')
    expect(source).toContain('@click="confirmBackfill"')
    expect(source).toContain('busy || !backfillPreview.member || backfillPreview.count <= 0')
    expect(source).toContain('count: backfillResult.updated_count')
    expect(source).toContain("? 'team.backfillStale' : 'team.backfillFailed'")
    for (const locale of ['en', 'es', 'ja']) {
      const messages = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8'))
      expect(messages.team.backfillSuccess).toContain('{count}')
      expect(messages.team.backfillStale).toBeTruthy()
    }
  })

  it('denies both routes to non-owners without a request', async () => {
    owner.value = false
    const catalog = useTeamCatalog()
    await expect(catalog.previewBackfill('pc')).rejects.toThrow('Owner access required')
    await expect(catalog.applyBackfill(preview)).rejects.toThrow('Owner access required')
    expect(send).not.toHaveBeenCalled()
  })

  it('rejects empty/unassigned confirmations and propagates stale failures', async () => {
    const catalog = useTeamCatalog()
    await expect(catalog.applyBackfill({ ...preview, count: 0 })).rejects.toThrow()
    await expect(catalog.applyBackfill({ ...preview, member: '' })).rejects.toThrow()
    expect(send).not.toHaveBeenCalled()
    send.mockRejectedValueOnce({ status: 409 })
    await expect(catalog.applyBackfill(preview)).rejects.toEqual({ status: 409 })
  })
})

describe('owner-managed team catalog', () => {
  it('creates only with a freshly verified active free machine using one atomic API write', async () => {
    const catalog = useTeamCatalog()
    catalog.machines.value = [
      { id: 'free', active: true, member: '' },
      { id: 'assigned', active: true, member: 'other' },
      { id: 'inactive', active: false, member: '' },
    ] as never
    expect(catalog.eligibleMachines.value.map(row => row.id)).toEqual(['free'])
    await expect(catalog.createMemberWithMachine({ name: 'Ada', department: 'dept', machineId: 'free' }))
      .rejects.toThrow('Machine is no longer available')
    expect(send).not.toHaveBeenCalled()
    getFullList.mockImplementation(async () => [])
    await expect(catalog.createMemberWithMachine({ name: 'Ada', department: 'dept', machineId: 'free' }))
      .rejects.toThrow('Machine is no longer available')
    expect(send).not.toHaveBeenCalled()
  })

  it('uses one atomic write after refreshing and checks free-machine eligibility', async () => {
    const catalog = useTeamCatalog()
    const rows = [
      { id: 'free', active: true, member: '' },
      { id: 'assigned', active: true, member: 'other' },
      { id: 'inactive', active: false, member: '' },
    ]
    getFullList.mockImplementation(async (options: { sort: string }) => options.sort === 'key' ? rows : [])
    send.mockResolvedValue({ id: 'member-1' })
    const result = await catalog.createMemberWithMachine({ name: ' Ada ', department: '', machineId: 'free' })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('/api/kankaku/team-members/create-with-machine', {
      method: 'POST', body: { name: ' Ada ', department: '', machine_id: 'free' },
    })
    expect(create).not.toHaveBeenCalled()
    expect(catalog.eligibleMachines.value.map(row => row.id)).toEqual(['free'])
    expect(result).toEqual({ result: { id: 'member-1' }, refreshed: true })
  })

  it('does not treat a successful write plus failed catalog refresh as a retryable create failure', async () => {
    const catalog = useTeamCatalog()
    let calls = 0
    getFullList.mockImplementation(async () => {
      calls++
      if (calls > 3) throw new Error('offline after create')
      return calls === 3 ? [{ id: 'free', active: true, member: '' }] : []
    })
    send.mockResolvedValueOnce({ member: { id: 'created' } })
    const response = await catalog.createMemberWithMachine({ name: 'Ada', department: '', machineId: 'free' })
    expect(response).toEqual({ result: { member: { id: 'created' } }, refreshed: false })
    expect(send).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
  })

  it('preserves server stale-claim conflicts and does not fall back to REST writes', async () => {
    const catalog = useTeamCatalog()
    getFullList.mockImplementation(async (options: { sort: string }) => options.sort === 'key' ? [{ id: 'free', active: true, member: '' }] : [])
    send.mockRejectedValueOnce({ status: 409, message: 'conflict' })
    await expect(catalog.createMemberWithMachine({ name: 'Ada', department: '', machineId: 'free' })).rejects.toMatchObject({ status: 409 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })

  it('denies reads and mutations for non-owners before contacting PocketBase', async () => {
    owner.value = false
    const catalog = useTeamCatalog()
    await expect(catalog.refresh()).rejects.toThrow('Owner access required')
    await expect(catalog.save('departments', '', { name: 'Design', active: true })).rejects.toThrow()
    await expect(catalog.setActive('machines', 'pc', false)).rejects.toThrow()
    expect(collection).not.toHaveBeenCalled()
  })

  it('creates managed members with optional department and explicit active, never auth or history fields', async () => {
    await useTeamCatalog().save('team_members', '', {
      name: 'Member', department: '', active: true,
      department_history: [{ at: 'forged', value: 'forged' }], password: 'not-an-account',
    } as never)
    expect(create).toHaveBeenCalledWith({ name: 'Member', department: '', active: true })
    expect(collection).not.toHaveBeenCalledWith('users')
  })

  it('preserves exact machine keys on create but never updates the key on reassignment', async () => {
    const catalog = useTeamCatalog()
    const fields = { name: 'Laptop', key: ' Laptop-A ', member: 'member-1', active: true }
    await catalog.save('machines', '', fields)
    expect(create).toHaveBeenCalledWith(fields)
    await catalog.save('machines', 'pc', { ...fields, key: 'changed', member: '' })
    expect(update).toHaveBeenCalledWith('pc', { name: 'Laptop', member: '', active: true })
  })

  it('soft-deactivates without clearing assignments and retains inactive unassigned machines', async () => {
    const catalog = useTeamCatalog()
    await catalog.setActive('machines', 'pc', false)
    expect(update).toHaveBeenCalledWith('pc', { active: false })
    catalog.machines.value = [
      { id: 'one', member: '', active: false },
      { id: 'two', member: 'member', active: true },
    ] as never
    expect(catalog.unassignedMachines.value.map(row => row.id)).toEqual(['one'])
  })

  it('surfaces fetch failures and clears loading without replacing the cached catalog', async () => {
    const catalog = useTeamCatalog()
    catalog.departments.value = [{ id: 'existing' }] as never
    getFullList.mockRejectedValueOnce(new Error('offline'))
    await expect(catalog.refresh()).rejects.toThrow('offline')
    expect(catalog.loading.value).toBe(false)
    expect(catalog.departments.value[0]?.id).toBe('existing')
  })
})
