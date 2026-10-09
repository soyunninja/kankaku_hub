import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

it('replaces the project placeholder with the historical project page and preserves date-aware return navigation', () => {
  const page = readFileSync('app/pages/team/member-projects/[memberId]/[projectId].vue', 'utf8')
  expect(page).toContain('<MemberProjectHistory')
  expect(page).toContain('memberWorkReturnDestination(memberId.value, range.value.start, range.value.end)')
  expect(page).not.toContain('MemberWorkDetailShell')
})

it('prefers a usable browser history entry and falls back to the date-aware member destination', () => {
  const component = readFileSync('app/components/team/MemberProjectHistory.vue', 'utf8')
  expect(component).toContain('function goBack()')
  expect(component).toMatch(/window\.history\.state/)
  expect(component).toMatch(/state\?\.back/)
  expect(component).toMatch(/state\.position/)
  expect(component).toContain('router.back()')
  expect(component).toContain('navigateTo(props.backTo)')
  expect(component).toContain('@click="goBack"')
  expect(component).not.toContain('<NuxtLink :to="backTo"')
})

it('keeps history requests all-time and scoped, and renders cost quality and incomplete states', () => {
  const component = readFileSync('app/components/team/MemberProjectHistory.vue', 'utf8')
  expect(component).toContain('loadMemberProjectHistory(fetchTotals, memberId, projectId')
  expect(component).toContain('loadMemberProjectSessionTasks(fetchTotals, memberId, projectId')
  expect(component).toContain('costUnknownEntries')
  expect(component).toContain('costKnownSum')
  expect(component).toContain('history.complete')
  expect(component).toContain('StackedBarChart')
  expect(component).toContain('visibleSessions')
  expect(component).toContain("getOne<TeamMemberRecord>(memberId)")
  expect(component).toContain("getOne<ProjectRecord>(projectId)")
  expect(component).toContain('IgnoredSessionsTotalsUnavailableError')
  expect(component).toContain('sessionTaskGenerations')
  expect(component).toContain('isTaskCurrent')
  expect(component).toMatch(/<KpiCard :title="t\('team\.workSessions'\)" :value="String\(history\.total\.distinctSessions\)"\s*\/>/)
  expect(component).not.toContain('<KpiCard :title="t(\'team.historyTokens\')"')
  expect(component).not.toContain('historyTokensBreakdown')
})
