import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/team/index.vue', 'utf8')
const card = readFileSync('app/components/team/TeamMemberCard.vue', 'utf8')
const detail = readFileSync('app/pages/team/[id].vue', 'utf8')

describe('cohesive team workspace', () => {
  it('submits exact member and machine payloads without leaking the draft id', async () => {
    const submitSource = page.match(/async function submit\(\) \{[\s\S]*?\n\}/)?.[0]
    expect(submitSource, 'submit handler must be present').toBeTruthy()
    const submissions: unknown[][] = []
    const makeSubmit = new Function(
      'editing', 'draft', 'perform', 'save', 'saveMachine', 'machineSavedRefreshFailed',
      `return (${submitSource!.replace('action: () => Promise<unknown>', 'action')})`,
    ) as (...args: unknown[]) => () => Promise<void>
    const run = async (collection: string, draft: Record<string, unknown>) => {
      const editing = { value: collection }
      const machineSavedRefreshFailed = { value: false }
      const submit = makeSubmit(
        editing,
        draft,
        (action: () => Promise<unknown>) => action(),
        async (...args: unknown[]) => { submissions.push(args) },
        async (...args: unknown[]) => { submissions.push(args); return true },
        machineSavedRefreshFailed,
      )
      await submit()
      expect(editing.value).toBeNull()
    }

    await run('team_members', { id: 'member-id', name: '  Ada  ', department: 'dept-id', member: '', key: '', active: true })
    await run('machines', { id: 'machine-id', name: '  Laptop  ', key: 'host-key', member: 'member-id', department: '', active: false })

    expect(submissions).toEqual([
      ['team_members', 'member-id', { name: 'Ada', department: 'dept-id', active: true }],
      ['machine-id', { name: 'Laptop', key: 'host-key', member: 'member-id', active: false }],
    ])
    for (const [, payload] of submissions) {
      expect(payload).not.toHaveProperty('id')
      expect(payload).not.toHaveProperty('project')
      expect(payload).not.toHaveProperty('project_id')
    }
    expect(submitSource).not.toMatch(/attribution|project_id|project\b/)
  })

  it('provides tooltip context to shared member actions in both presentations', () => {
    expect(page).toContain("import { TooltipProvider } from '@/components/ui/tooltip'")
    const providerStart = page.indexOf('<TooltipProvider>')
    const providerEnd = page.indexOf('</TooltipProvider>', providerStart)
    const memberCards = page.slice(providerStart, providerEnd)
    expect(providerStart).toBeGreaterThan(-1)
    expect(memberCards.match(/<TeamMemberCard/g)).toHaveLength(2)
    expect(memberCards.match(/:actions="\[\]"/g)).toHaveLength(2)
    expect(memberCards).not.toContain('memberActions')
    expect(card).toContain('v-if="actions.length"')
    expect(card).toContain('<RowActions v-if="actions.length" :actions="actions" :class=')
  })

  it('keeps machine totals in consistently padded summary cards without double vertical padding', () => {
    expect(page).toContain('<div class="grid grid-cols-2 gap-6 mb-2 sm:grid-cols-4">')
    expect(page).toContain("{{ t('team.machines') }}")
    expect(page).toContain("{{ t('team.freeMachines') }}")
    expect(page).toMatch(/<Card>\s*<CardContent>/)
    expect(page.match(/<CardContent>\s*<p class="text-sm text-muted-foreground">\{\{ t\('team\./g)?.length).toBe(4)
    expect(page).not.toContain('rounded-3xl bg-card p-4')
    expect(page).not.toContain('CardContent class="p-4"')
    expect(page).not.toContain('CardContent class="space-y-3 p-5"')
    expect(page).not.toContain('CardContent class="py-')
    expect(page).not.toContain('id="machines-title"')
    expect(page).not.toContain('<TableHead>{{ t(\'team.machineKey\') }}</TableHead>')
    expect(page).not.toContain('<SkeletonRows v-if="loading && !machines.length"')
  })

  it('rolls department lifetime work and cost from all members only after complete totals load', () => {
    expect(page).toContain('sumDepartmentMemberTotals(departments.value, members.value, memberTotals.value)')
    expect(page).toContain('sumTeamMemberCost(members.value, memberTotals.value)')
    expect(page).not.toContain('sumDepartmentMemberTotals(departments.value, filteredMembers.value')
    expect(page).not.toContain('sumTeamMemberCost(filteredMembers.value')
    expect(page).toContain("memberTotalsState.value === 'ready' && memberTotals.value")
    expect(page).toContain("t('team.memberTotalMinutes')")
    expect(page).toContain("t('team.memberTotalCost')")
    expect(page).toContain("formatDuration(departmentMemberTotals[department.id]?.workMs ?? 0, locale)")
    expect(page).toContain("formatCost(departmentMemberTotals[department.id]?.cost ?? 0)")
    expect(page).toContain(": '—'")
    expect(page).not.toMatch(/fetchTotals\(\{[^}]*groupBy:\s*'department'/)
  })

  it('places the all-assigned member count first in a three-column metrics row without repeating it in the header', () => {
    const start = page.indexOf('<article v-for="department in departments"')
    const end = page.indexOf('</article>', start)
    const departmentCard = page.slice(start, end)
    const header = departmentCard.slice(0, departmentCard.indexOf('</header>'))
    const membersMetric = departmentCard.indexOf("<dt class=\"text-xs text-muted-foreground\">{{ t('team.team_members') }}</dt>")
    const workMetric = departmentCard.indexOf("t('team.memberTotalMinutes')")
    const costMetric = departmentCard.indexOf("t('team.memberTotalCost')")
    expect(header).not.toContain('members.filter(row => row.department === department.id).length')
    expect(departmentCard).toContain('{{ members.filter(row => row.department === department.id).length }}')
    expect(departmentCard).toContain('class="grid min-w-0 grid-cols-3 gap-3 text-sm [overflow-wrap:anywhere]"')
    expect(membersMetric).toBeGreaterThan(-1)
    expect(membersMetric).toBeLessThan(workMetric)
    expect(workMetric).toBeLessThan(costMetric)
  })

  it('shows three-column desktop department cards and an accessible display-only cost share bar', () => {
    expect(page).toContain('class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6"')
    expect(page).toContain('data-testid="department-cost-share"')
    expect(page).toContain(':role="departmentCostShareFor(department).state === \'known\' ? \'meter\' : \'img\'"')
    expect(page).toContain(':aria-label="departmentCostShareLabel(department)"')
    expect(page).toContain(':aria-valuenow="departmentCostShareFor(department).percentage ?? undefined"')
    expect(page).toContain('data-testid="department-cost-share-fill"')
    expect(page).toContain('departmentCostShareUnavailable')
  })

  it('keeps only the accessible shared edit action on department cards and moves status into the modal', () => {
    expect(page).toContain("function departmentActions(department: DepartmentRecord): RowAction[]")
    expect(page).toContain("{ icon: Pencil, label: t('common.edit'), onClick: () => departmentEditor.openEdit(department) }")
    const departmentCardStart = page.indexOf('<article v-for="department in departments"')
    const departmentCardEnd = page.indexOf('</article>', departmentCardStart)
    const departmentCard = page.slice(departmentCardStart, departmentCardEnd)
    expect(departmentCard).toContain('<TooltipProvider>')
    expect(departmentCard).toContain('<RowActions :actions="departmentActions(department)" />')
    expect(departmentCard).not.toMatch(/deactivate|reactivate|active|Badge/i)
    expect(page).toContain('<DepartmentEditDialog :editor="departmentEditor" />')
    expect(page).toContain("team.deactivate")
    expect(page).toContain("team.reactivate")
    expect(page).not.toContain("setActive('departments'")
  })

  it('keeps a 32px summary-to-toolbar gap and the existing responsive member-card gaps', () => {
    expect(page).toContain('class="grid grid-cols-2 gap-6 mb-2 sm:grid-cols-4"')
    expect(page).toContain('class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3"')
    expect(24 + 8).toBe(32)
  })

  it('keeps the member detail header plain while preserving the department card styling', () => {
    expect(page).toContain('rounded-3xl bg-card p-6')
    expect(detail).toContain('<header class="flex min-w-0 flex-wrap items-center gap-3">')
    expect(detail).not.toContain('<header class="flex min-w-0 flex-wrap items-center gap-3 rounded-3xl bg-card p-4 sm:p-6">')
    expect(detail).not.toContain('bg-card p-5 sm:p-7')
  })

  it('links member machine chips to a reachable editor dialog and keeps registration reachable', () => {
    expect(card).toContain("emit('edit-machine', machine.id)")
    expect(page).toContain("@edit-machine=\"edit('machines', $event)\"")
    expect(page).not.toContain('`#machine-${machine.id}`')
    expect(page).toContain(':open="editing === \'machines\'"')
    expect(page).toContain('@click="previewHistory(draft.id)"')
    expect(page).toContain("{{ t('team.registerMachine') }}")
    expect(page).toContain('@click="machineDialog = true"')
  })

  it('removes the global history notice from the team workspace', () => {
    expect(page).not.toContain("t('team.historyNotice')")
  })

  it('orders unassigned inventory first without mutating source order, regardless of active status', () => {
    const declaration = page.match(/function orderInventoryMachines\(source: MachineRecord\[\]\) \{([\s\S]*?)\n\}/)?.[1]
    expect(declaration, 'inventory ordering helper must be present').toBeTruthy()
    const orderInventoryMachines = new Function('source', declaration!) as (source: Array<{ member: string; active: boolean; key: string }>) => Array<{ member: string; active: boolean; key: string }>
    const source = [
      { key: 'assigned-inactive', member: 'member-a', active: false },
      { key: 'free-inactive', member: '', active: false },
      { key: 'assigned-active', member: 'member-b', active: true },
      { key: 'free-active', member: '', active: true },
    ]
    const ordered = orderInventoryMachines(source)
    expect(ordered.map(machine => machine.key)).toEqual(['free-inactive', 'free-active', 'assigned-inactive', 'assigned-active'])
    expect(source.map(machine => machine.key)).toEqual(['assigned-inactive', 'free-inactive', 'assigned-active', 'free-active'])
  })

  it('uses white assigned cards and preserves orange free-machine themes only in the inventory', () => {
    const inventoryStart = page.indexOf('<section data-testid="machine-inventory"')
    const inventoryEnd = page.indexOf('</section>', inventoryStart)
    const inventory = page.slice(inventoryStart, inventoryEnd)
    expect(inventory).toContain('v-for="machine in orderedInventoryMachines"')
    expect(inventory).toContain("machine.member ? 'bg-white text-foreground dark:bg-green-950 dark:text-green-100' : 'bg-orange-100 text-orange-950 dark:bg-orange-950 dark:text-orange-100'")
    expect(inventory).toContain('rounded-3xl p-5 sm:p-6')
    const memberCardsStart = page.indexOf('<TooltipProvider>')
    const memberCardsEnd = page.indexOf('</TooltipProvider>', memberCardsStart)
    expect(page.slice(memberCardsStart, memberCardsEnd)).not.toContain('bg-green-100')
    expect(page.slice(memberCardsStart, memberCardsEnd)).not.toContain('bg-orange-100')
  })

  it('places an owner-only machine inventory last with identity, ownership, status, edit and registration actions', () => {
    const inventoryStart = page.indexOf('<section data-testid="machine-inventory"')
    const inventoryEnd = page.indexOf('</section>', inventoryStart)
    const registrationForm = page.indexOf(':open="machineDialog"')
    const departments = page.indexOf('<h2 class="text-lg font-semibold">{{ t(\'team.departments\') }}')
    const inventory = page.slice(inventoryStart, inventoryEnd)
    expect(inventoryStart).toBeGreaterThan(departments)
    expect(inventoryStart).toBeGreaterThan(registrationForm)
    expect(inventory).toContain("{{ t('team.machines') }}")
    expect(inventory).toContain('v-for="machine in orderedInventoryMachines"')
    expect(inventory).toContain('machine.key')
    expect(inventory).toContain('machine.name')
    expect(inventory).toContain('members.find(member => member.id === machine.member)?.name || t(\'team.unassigned\')')
    expect(inventory).toContain("t(machine.active ? 'common.active' : 'common.inactive')")
    expect(inventory).toContain("edit('machines', machine.id)")
    expect(inventory).toContain('@click="edit(\'machines\', machine.id)"')
    expect(inventory).toContain('@click="machineDialog = true"')
    expect(page.slice(inventoryEnd + '</section>'.length)).toMatch(/^\s*<\/template>/)
  })

  it('uses the machine name as inventory title, falls back to key, and shows key only as secondary identity', () => {
    const inventoryStart = page.indexOf('<section data-testid="machine-inventory"')
    const inventoryEnd = page.indexOf('</section>', inventoryStart)
    const inventory = page.slice(inventoryStart, inventoryEnd)
    const cardStart = inventory.indexOf('<article v-for="machine in orderedInventoryMachines"')
    const cardEnd = inventory.indexOf('</article>', cardStart)
    const card = inventory.slice(cardStart, cardEnd)
    expect(card).toContain('<article v-for="machine in orderedInventoryMachines" :key="machine.id" class="flex min-w-0 flex-col gap-3 rounded-3xl p-5 sm:p-6"')
    expect(card).toContain('<div class="flex min-w-0 items-center gap-2">')
    expect(card).toContain('<h3 class="text-base font-medium [overflow-wrap:anywhere]">{{ machine.name || machine.key }}</h3>')
    expect(card).toContain('<p v-if="machine.name" class="text-sm text-muted-foreground [overflow-wrap:anywhere]">{{ machine.key }}</p>')
    expect(card).toContain('<Button size="icon" variant="outline" class="shrink-0" :aria-label="t(\'common.edit\')" :title="t(\'common.edit\')" :disabled="busy" @click="edit(\'machines\', machine.id)"><Pencil aria-hidden="true" class="size-4" /></Button>')
    expect(card).toContain('<span :aria-label="t(machine.active ? \'common.active\' : \'common.inactive\')" :class="machine.active ? \'bg-green-600 dark:bg-green-400\' : \'bg-red-600 dark:bg-red-400\'" class="size-2.5 shrink-0 rounded-full" />')
    expect(card).not.toContain("{{ t('team.machineKey') }}")
    expect(card.indexOf('<h3')).toBeLessThan(card.indexOf('<dl'))
    expect(card).not.toContain("{{ t('team.name') }}")
    expect(card).toContain("{{ t('team.member') }}")
    expect(card).toContain("{{ t('common.status') }}")
  })

  it('places inventory edit and registration forms in accessible dialogs', () => {
    expect(page).toContain("import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'")
    expect(page).toContain('<Dialog :open="editing === \'machines\'"')
    expect(page).toContain('<DialogTitle>{{ t(\'common.edit\') }}')
    expect(page).toContain('<Dialog :open="machineDialog"')
    expect(page).toContain('<DialogTitle>{{ t(\'team.registerMachine\') }}</DialogTitle>')
    expect(page).toContain('<DialogFooter class=')
    expect(page).toContain('v-model="machineForm.key"')
  })

  it('keeps machine action errors in their dialogs and prevents dismissal while saving', () => {
    expect(page).toContain('machineDialogError')
    expect(page).toContain('editMachineError')
    expect(page).toContain('role="alert" class="text-sm text-destructive"')
    expect(page).toContain('@update:open="open => { if (!open && !busy) machineDialog = false }"')
    expect(page).toContain('@update:open="open => { if (!open && !busy) editing = null }"')
  })

  it('treats a registered machine as saved even when the follow-up catalog refresh fails', () => {
    const submitMachine = page.match(/async function submitMachine\(\) \{([\s\S]*?)\n\}/)?.[1] || ''
    expect(submitMachine).toContain('registerMachine(')
    expect(submitMachine).toContain('machineSavedRefreshFailed')
    expect(submitMachine).not.toContain("save('machines', ''")
    expect(submitMachine).toContain('machineDialog.value = false')
  })

  it('closes machine editing only after a successful history preview', () => {
    const previewHistory = page.match(/async function previewHistory\(machineId: string\) \{([\s\S]*?)\n\}/)?.[1] || ''
    const success = previewHistory.slice(previewHistory.indexOf('try {'), previewHistory.indexOf('catch'))
    const failure = previewHistory.slice(previewHistory.indexOf('catch'))
    expect(success).toContain('backfillPreview.value = await previewBackfill(machineId)')
    expect(success).toContain('editing.value = null')
    expect(failure).toContain("backfillError.value = t('team.backfillFailed')")
    expect(failure).not.toContain('editing.value = null')
    const editDialogStart = page.indexOf('<Dialog :open="editing === \'machines\'"')
    const editDialogEnd = page.indexOf('</Dialog>', editDialogStart)
    expect(page.slice(editDialogStart, editDialogEnd)).toContain('<p v-if="backfillError" role="alert"')
    expect(page).toContain('@update:open="open => { if (!open && !busy) editing = null }"')
  })

  it('keeps machine reassignment, department editing and activity/backfill available', () => {
    expect(page).toContain('v-model="draft.member"')
    expect(page).toContain('v-model="draft.department"')
    expect(page).toContain('@click="confirmBackfill"')
    expect(page).toContain('backfillResult.updated_count')
    expect(detail).toContain('<MemberWorkViews :key="member.id" :member-id="member.id" />')
    expect(detail).toContain('<NuxtLink to="/team" class="min-w-0 flex-1 break-words hover:underline">')
    expect(detail).toContain('openUnlinkConfirmation(machine.id)')
    expect(detail).toContain('to="/team"')
    expect(detail).not.toContain('/team#machine-')
  })
})
