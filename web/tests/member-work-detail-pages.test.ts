import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('loads scoped project history while keeping the session destination minimal and owner-gated', () => {
  const project = readFileSync('app/pages/team/member-projects/[memberId]/[projectId].vue', 'utf8')
  const projectHistory = readFileSync('app/components/team/MemberProjectHistory.vue', 'utf8')
  const session = readFileSync('app/pages/team/member-sessions/[memberId].vue', 'utf8')
  const shell = readFileSync('app/components/team/MemberWorkDetailShell.vue', 'utf8')

  expect(project).toContain("const { isOwner } = useAuth()")
  expect(project).toContain('dateRangeFromQuery(route.query.dateStart, route.query.dateEnd')
  expect(project).toContain('memberWorkReturnDestination(memberId.value, range.value.start, range.value.end)')
  expect(project).toContain('<MemberProjectHistory')
  expect(project).toContain('v-if="isOwner && !valid"')
  expect(projectHistory).toContain('loadMemberProjectHistory(fetchTotals, memberId, projectId')
  expect(projectHistory).toContain('loadMemberProjectSessionTasks(fetchTotals, memberId, projectId')
  expect(projectHistory).not.toMatch(/\.save\(|\.create\(|\.update\(/)

  expect(session).toContain("const { isOwner } = useAuth()")
  expect(session).toContain("typeof route.query.session_id === 'string'")
  expect(session).toContain('memberWorkReturnDestination(memberId.value, range.value.start, range.value.end)')
  expect(session).not.toMatch(/fetchTotals|useTotals|useProjects|useClients|ensureLoaded|\.save\(|\.create\(/)
  expect(shell).toContain('v-if="!isOwner"')
  expect(shell).toContain('ArrowLeft')
  expect(shell).toContain('identifier')
  expect(shell).toContain("t('team.workDetailComingLater')")
  expect(shell).not.toMatch(/totals|workMs|cost|entries|fetch\(/i)
})
