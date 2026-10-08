import type { DepartmentRecord, TeamMemberRecord, MachineRecord } from '~/lib/pocketbase-types'

export type TeamCollection = 'departments' | 'team_members' | 'machines'
export interface TeamRecords {
  departments: DepartmentRecord
  team_members: TeamMemberRecord
  machines: MachineRecord
}
export interface TeamFields {
  departments: { name: string, active: boolean }
  team_members: { name: string, department: string, active: boolean }
  machines: { key: string, name: string, member: string, active: boolean }
}

export interface BackfillPreview {
  machine_id: string
  machine_key: string
  member: string
  count: number
  snapshot: string
}
export interface BackfillResult {
  machine_id: string
  machine_key: string
  member: string
  updated_count: number
}

/** Managed profiles only; history is written by the server, never by this UI. */
export function useTeamCatalog() {
  const { $pb } = useNuxtApp()
  const { isOwner } = useAuth()
  const departments = useState<DepartmentRecord[]>('team:departments', () => [])
  const members = useState<TeamMemberRecord[]>('team:members', () => [])
  const machines = useState<MachineRecord[]>('team:machines', () => [])
  const loading = ref(false)

  function requireOwner() {
    if (!isOwner.value) throw new Error('Owner access required')
  }

  async function refresh() {
    requireOwner()
    loading.value = true
    try {
      const [d, m, pc] = await Promise.all([
        $pb.collection('departments').getFullList<DepartmentRecord>({ sort: 'name' }),
        $pb.collection('team_members').getFullList<TeamMemberRecord>({ sort: 'name' }),
        $pb.collection('machines').getFullList<MachineRecord>({ sort: 'key' }),
      ])
      departments.value = d
      members.value = m
      machines.value = pc
    }
    finally { loading.value = false }
  }

  async function save<K extends TeamCollection>(collection: K, id: string, data: TeamFields[K]) {
    requireOwner()
    // Copy only editable fields: no auth fields, client history or mutable machine key.
    const payload: Record<string, string | boolean> = { name: data.name, active: data.active }
    if (collection === 'team_members') payload.department = (data as TeamFields['team_members']).department
    if (collection === 'machines') {
      payload.member = (data as TeamFields['machines']).member
      if (!id) payload.key = (data as TeamFields['machines']).key
    }
    const service = $pb.collection(collection)
    if (id) await service.update(id, payload)
    else await service.create(payload)
    await refresh()
  }

  async function setActive(collection: TeamCollection, id: string, active: boolean) {
    requireOwner()
    await $pb.collection(collection).update(id, { active })
    await refresh()
  }

  async function previewBackfill(machineId: string): Promise<BackfillPreview> {
    requireOwner()
    return $pb.send('/api/kankaku/team-backfill/preview', {
      method: 'POST', body: { machine_id: machineId },
    })
  }

  async function applyBackfill(preview: BackfillPreview): Promise<BackfillResult> {
    requireOwner()
    if (!preview.member || preview.count <= 0) throw new Error('No eligible entries')
    const { machine_id, machine_key, member, count, snapshot } = preview
    return $pb.send('/api/kankaku/team-backfill/apply', {
      method: 'POST', body: { machine_id, machine_key, member, count, snapshot },
    })
  }

  const unassignedMachines = computed(() => machines.value.filter(machine => !machine.member))
  const eligibleMachines = computed(() => machines.value.filter(machine => machine.active && !machine.member))

  async function createMemberWithMachine(input: { name: string, department: string, machineId: string }) {
    requireOwner()
    await refresh()
    const machine = machines.value.find(row => row.id === input.machineId)
    if (!machine || !machine.active || machine.member) throw new Error('Machine is no longer available')
    const result = await $pb.send('/api/kankaku/team-members/create-with-machine', {
      method: 'POST', body: { name: input.name, department: input.department, machine_id: input.machineId },
    })
    // The atomic write already succeeded. Keep that success distinct from a
    // subsequent catalog refresh failure so retrying cannot create a duplicate.
    let refreshed = true
    try { await refresh() }
    catch { refreshed = false }
    return { result, refreshed }
  }

  return { departments, members, machines, unassignedMachines, eligibleMachines, loading, refresh, save, setActive, createMemberWithMachine, previewBackfill, applyBackfill }
}
