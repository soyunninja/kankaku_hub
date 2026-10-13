import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/team/index.vue', 'utf8')
const catalog = readFileSync('app/composables/useTeamCatalog.ts', 'utf8')

describe('team member creation form', () => {
  it('offers only active unassigned choices and preserves registration from member creation', () => {
    expect(catalog).toContain('machine.active && !machine.member')
    expect(page).toContain(':options="eligibleMachines.map')
    expect(page).toContain('v-if="!eligibleMachines.length"')
    const memberForm = page.slice(page.indexOf('v-if="memberDialog"'), page.indexOf('</form>', page.indexOf('v-if="memberDialog"')))
    expect(memberForm).toContain('v-else type="button" @click="machineDialog = true"')
    expect(page).toContain('<Dialog :open="machineDialog"')
    expect(page).toContain('<DialogTitle>{{ t(\'team.registerMachine\') }}</DialogTitle>')
  })

  it('preserves the entered name on stale claims and removes stale selection after refresh', () => {
    const handler = page.split('async function submitNewMember()')[1]?.split('async function submitMachine()')[0]
    expect(handler).toContain("t('team.machineClaimStale')")
    expect(handler).toContain('await refresh()')
    expect(handler).toContain('eligibleMachines.value[0]?.id ??')
    expect(handler).not.toContain('memberForm.name =')
  })

  it('disables creation while busy and does not close the form on request failure', () => {
    expect(page).toContain(':disabled="busy || !memberForm.machineId"')
    expect(page).toContain('memberDialog.value = false')
    const handler = page.split('async function submitNewMember()')[1]?.split('async function submitMachine()')[0]
    expect(handler).toMatch(/memberDialog\.value = false[\s\S]*?catch/)
  })
})
