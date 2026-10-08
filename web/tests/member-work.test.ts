import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { activityFilters, dateRangeFromQuery, entryDestination } from '../app/components/team/activity'

it('restores only a valid scalar bookmarked date pair, otherwise keeping the bounded default', () => {
  const fallback = { start: '2024-03-02', end: '2024-03-31' }
  expect(dateRangeFromQuery('2024-01-01', '2024-01-31', fallback)).toEqual({ start: '2024-01-01', end: '2024-01-31' })
  expect(dateRangeFromQuery('2024-02-29', '2024-02-29', fallback)).toEqual({ start: '2024-02-29', end: '2024-02-29' })
  for (const [start, end] of [
    [undefined, undefined], ['2024-01-01', undefined], [undefined, '2024-01-31'],
    [['2024-01-01'], '2024-01-31'], ['2024-02-30', '2024-03-01'],
    ['2024-01-02', '2024-01-01'], ['not-a-date', '2024-01-31'],
  ]) {
    expect(dateRangeFromQuery(start, end, fallback)).toEqual(fallback)
  }
})

it('initializes and watches bookmark dates without syncing unrelated query changes', () => {
  const source = readFileSync('app/components/team/TeamActivity.vue', 'utf8')
  expect(source).toContain('dateRangeFromQuery(route.query.dateStart, route.query.dateEnd, initialRange)')
  expect(source).toContain('watch(() => [route.query.dateStart, route.query.dateEnd]')
})

it('defaults member history to 30 days while retaining today globally', () => {
  const source = readFileSync('app/components/team/TeamActivity.vue', 'utf8')
  expect(source).toContain("resolvePreset(props.memberId === undefined ? 'today' : '30d')")
  expect(source).toContain('ref(bookmarkedRange.start)')
  expect(source).toContain('ref(bookmarkedRange.end)')
})

it('shows expanded work context with safe absent-relation fallbacks', () => {
  const source = readFileSync('app/components/team/TeamActivity.vue', 'utf8')
  for (const field of ['client?.name', 'project?.name', 'task?.title']) {
    expect(source).toContain(`entry.expand?.${field} || t('team.unassigned')`)
  }
})

it('fixes historical attribution to the route member without current assignments', () => {
  expect(activityFilters('member-old', 'member-other', 'dept-current')).toEqual({ member: 'member-old' })
  expect(activityFilters(undefined, '', 'dept-old')).toEqual({ member: '', department: 'dept-old' })
  expect(activityFilters(undefined, '*', '*')).toEqual({})
})
it.each([
  ['historical member range', '2024-01-01', '2024-01-31'],
  ['global single-day range', '2024-02-15', '2024-02-15'],
])('preserves the %s in session drill-down', (_label, dateStart, dateEnd) => {
  expect(entryDestination({ session_id: 'session-id' }, dateStart, dateEnd)).toEqual({
    path: '/entries', query: { session_id: 'session-id', dateStart, dateEnd },
  })
})
it('passes the selected dates from the shared activity link', () => {
  const source = readFileSync('app/components/team/TeamActivity.vue', 'utf8')
  expect(source).toContain(':to="entryDestination(entry, dateStart, dateEnd)"')
})
it('removes the redundant detail breadcrumb while preserving the header back control and member editing', () => {
  const source = readFileSync('app/pages/team/[id].vue', 'utf8')
  expect(source).not.toContain('<NuxtLink to="/team" class="self-start text-sm text-muted-foreground hover:underline">{{ t(\'nav.team\') }}</NuxtLink>')
  expect(source).toContain('@click="navigateTo(\'/team\')"')
  expect(source).toContain(':aria-label="t(\'common.back\')"')
  expect(source).toContain('<p class="text-sm text-muted-foreground">{{ currentDepartment }}</p>')
  expect(source).toContain('@click="editMember"')
  expect(source).toContain('<header class="flex min-w-0 flex-wrap items-center gap-3">')
  const headerStart = source.indexOf('<header class="flex min-w-0 flex-wrap items-center gap-3">')
  const headerEnd = source.indexOf('</header>', headerStart)
  const header = source.slice(headerStart, headerEnd)
  expect(header).not.toMatch(/rounded-|bg-card|(?:^|\s)p-[0-9]|sm:p-[0-9]/)
  expect(source).toContain('<CardHeader><CardTitle class="text-sm">{{ t(\'team.currentMachines\') }}</CardTitle></CardHeader>')
  expect(source).toContain('<Dialog v-if="isOwner && member" :open="editing" @update:open="onEditOpenChange">')
})
it('shows identity and gates missing members before loading work', () => {
  const source = readFileSync('app/pages/team/[id].vue', 'utf8')
  expect(source).toContain('team.memberNotFound')
  expect(source).toContain('{{ currentDepartment }}')
  expect(source).toContain('team.currentMachines')
  expect(source).toContain('v-else-if="member"')
  expect(source).toContain('<MemberWorkViews :key="member.id" :member-id="member.id" />')
  expect(source).toContain('if (!isOwner.value)')
  expect(source).toContain(':key="member.id"')
  const memberCard = readFileSync('app/components/team/TeamMemberCard.vue', 'utf8')
  expect(memberCard).toContain('`/team/${member.id}`')
})
it('keeps global activity unchanged and uses grouped task-entry totals only on member detail', () => {
  const component = readFileSync('app/components/team/TeamActivity.vue', 'utf8')
  expect(component).toContain('activityFilters(props.memberId, member.value, department.value)')
  expect(component).toContain('v-if="props.memberId === undefined"')
  const global = readFileSync('app/pages/team/activity.vue', 'utf8')
  expect(global).toContain('<TeamActivity />')
  const memberViews = readFileSync('app/components/team/MemberWorkViews.vue', 'utf8')
  expect(memberViews).toContain("selectedView === 'projects' ? 'project' : 'session'")
  expect(memberViews).toContain('workSessionWorkNote')
  expect(memberViews).not.toContain('work_records')
  expect(memberViews).toContain('view === \'sessions\'')
  expect(memberViews).toContain("ref<MemberWorkView>('projects')")
  expect(memberViews).toContain('dateRangeFromQuery(route.query.dateStart, route.query.dateEnd, initialRange)')
  for (const locale of ['en', 'es', 'ja']) {
    const messages = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8'))
    for (const key of ['workProjects', 'workSessions', 'workUnknownProject', 'workSessionWorkNote', 'workUnavailable']) {
      expect(messages.team[key]).toBeTruthy()
    }
  }
  for (const locale of ['en', 'es', 'ja']) {
    const messages = JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8'))
    for (const key of ['memberWork', 'currentDepartment', 'currentMachines', 'noMachines', 'memberNotFound', 'memberHistory', 'viewSession']) {
      expect(messages.team[key]).toBeTruthy()
    }
  }
})
