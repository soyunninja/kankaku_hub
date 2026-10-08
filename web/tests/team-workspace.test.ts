import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/team/index.vue', 'utf8')
const card = readFileSync('app/components/team/TeamMemberCard.vue', 'utf8')
const detail = readFileSync('app/pages/team/[id].vue', 'utf8')

describe('cohesive team workspace', () => {
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

  it('links member machine chips to the compact editor and keeps registration reachable', () => {
    expect(card).toContain("emit('edit-machine', machine.id)")
    expect(page).toContain("@edit-machine=\"edit('machines', $event)\"")
    expect(page).not.toContain('`#machine-${machine.id}`')
    expect(page).toContain('v-if="editing === \'machines\'"')
    expect(page).toContain('@click="previewHistory(draft.id)"')
    expect(page).toContain("{{ t('team.registerMachine') }}")
    expect(page).toContain('@click="machineDialog = true"')
  })

  it('removes the global history notice from the team workspace', () => {
    expect(page).not.toContain("t('team.historyNotice')")
  })

  it('keeps machine reassignment, department editing and activity/backfill available', () => {
    expect(page).toContain('v-model="draft.member"')
    expect(page).toContain('v-model="draft.department"')
    expect(page).toContain('@click="confirmBackfill"')
    expect(page).toContain('backfillResult.updated_count')
    expect(detail).toContain('<MemberWorkViews :key="member.id" :member-id="member.id" />')
    expect(detail).toContain('to="/team"')
    expect(detail).not.toContain('/team#machine-')
  })
})
