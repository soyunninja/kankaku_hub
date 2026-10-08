import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/pages/team/index.vue', 'utf8')
const card = readFileSync('app/components/team/TeamMemberCard.vue', 'utf8')
const totals = readFileSync('app/lib/team-member-totals.ts', 'utf8')
const locales = ['en', 'es', 'ja'].map(locale => JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8')))

describe('team member catalog views', () => {
  it('uses a count-aware search, segmented view controls and one add action in a responsive toolbar', () => {
    expect(page).toContain("const view = ref<'grid' | 'list'>('grid')")
    expect(page).toContain(":placeholder=\"t(members.length === 1 ? 'team.searchWithCountOne' : 'team.searchWithCount', { count: members.length })\"")
    expect(page).toContain('class="control-group flex shrink-0 gap-1 self-start bg-muted sm:self-auto"')
    expect(page).toContain(":aria-pressed=\"view === 'list'\"")
    expect(page).toContain(":aria-pressed=\"view === 'grid'\"")
    expect(page).toContain('<TeamMemberCard v-for="member in filteredMembers"')
    expect(page).toContain('layout="grid"')
    expect(page).toContain('layout="list"')
    expect(page).toContain('<div v-else class="flex flex-col gap-2">')
    expect(page).toContain('class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:gap-6 xl:grid-cols-3"')
    expect(page.match(/@click="openMemberCreate"/g)).toHaveLength(1)
  })

  it('shares member content and management actions between grid cards and list rows under tooltip context', () => {
    expect(page).toContain('<TooltipProvider>')
    expect(page).toContain('<TeamMemberCard v-for="member in filteredMembers"')
    expect(page).toContain('layout="grid"')
    expect(page).toContain('layout="list"')
    expect(page.match(/:actions="\[\]"/g)).toHaveLength(2)
    expect(card).toContain('v-if="actions.length"')
    expect(card).toContain('<RowActions v-if="actions.length" :actions="actions" :class=')
    expect(card).toContain('to="`/team/${member.id}`"')
    expect(card).toContain('machine.name || machine.key')
    expect(card).toContain('department')
    expect(card).toContain('member.active')
    expect(card).toContain('<article :class="layout === \'grid\' ?')
    expect(card).toContain("<div v-if=\"layout === 'list'\"")
  })

  it('uses a plain grid name and a detail-arrow footer with every machine, while preserving list management', () => {
    expect(card).toContain('v-else class="min-w-0 [overflow-wrap:anywhere]">{{ member.name }}</span>')
    expect(card).toMatch(/<NuxtLink v-if="layout === 'list'/)
    expect(card).toContain('mt-auto flex flex-wrap items-center justify-between gap-1')
    expect(card).toContain('v-for="machine in machines"')
    expect(card).toContain('machine.name || machine.key')
    expect(card).toContain(':aria-label="t(\'team.openDetail\', { name: member.name })"')
    expect(card).toContain('<ArrowRight aria-hidden="true" class="size-5" />')
    expect(card).toContain('<NuxtLink :to="`/team/${member.id}`"')
    expect(card).toContain("v-if=\"layout === 'list'\"")
    expect(locales.map(locale => locale.team.activeProjects)).toEqual([
      'Active projects',
      'Proyectos',
      'アクティブなプロジェクト',
    ])
    expect(locales.map(locale => locale.team.memberTotalMinutes)).toEqual([
      'Work time',
      'Trabajo',
      '作業時間',
    ])
    expect(locales.map(locale => locale.team.memberTotalCost)).toEqual([
      'Token cost',
      'Coste',
      'トークンコスト',
    ])
    expect(locales.map(locale => locale.team.openDetail)).toEqual([
      'Open details for {name}',
      'Abrir detalles de {name}',
      '{name}の詳細を開く',
    ])
  })

  it('matches Clients grid cards while keeping machine and status management in list view', () => {
    expect(card).toContain("layout === 'grid' ? 'flex min-w-0 flex-col gap-3 rounded-3xl bg-card p-2 sm:gap-5 sm:p-5' : 'rounded-2xl border bg-card p-4'")
    expect(card).toContain('col-start-2 row-start-1')
    expect(card).toContain('text-sm font-semibold sm:text-base')
    expect(card).toContain('[overflow-wrap:anywhere]')
    expect(card).toContain('mt-1 font-medium tabular-nums')
    expect(card).toContain("v-if=\"layout === 'list'\"")
    expect(card).toContain('v-if="machines.length"')
    expect(card).toContain('v-else class="text-sm text-muted-foreground"')
    expect(card).toContain("v-if=\"layout === 'list'\"")
    expect(page).not.toContain('memberActions')
    expect(page).not.toMatch(/TeamMemberCard[^\n]*:actions="(?!\[\])/)
    expect(page).toContain('<TooltipProvider>')
  })

  it('places the name and department at the top left beside the management actions', () => {
    expect(card).toContain('grid-cols-[minmax(0,1fr)_auto]')
    expect(card).toContain('col-start-1 row-start-1 min-w-0')
    expect(card).toContain('col-start-2 row-start-1 flex-wrap')
    expect(card).not.toContain('col-span-2 row-start-2')
  })

  it('shows lifetime member metrics from grouped totals without fetching per card or using raw records', () => {
    expect(page).toContain('loadTeamMemberTotals(fetchTotals)')
    expect(page).toContain(':totals="memberTotals?.[member.id]"')
    expect(totals).toContain("groupBy: 'member', page, perPage: PAGE_SIZE")
    expect(card).toContain("t('team.activeProjects')")
    expect(card).toContain('totals.activeProjects')
    expect(card).not.toContain('totals.entries')
    expect(card).toContain('formatDuration(totals.workMs, locale)')
    expect(card).toContain('formatDuration(0, locale)')
    expect(card).not.toContain('totals.workMs / 60000')
    expect(card).toContain('formatCost(totals.cost)')
    expect(card).toContain("totalsState === 'ready' ? '0' : '—'")
    expect(page).not.toContain('work_records')
    expect(page).not.toMatch(/TeamMemberCard[^\n]*fetchTotals/)
  })

  it('keeps both presentations on the existing filtered state with no view-change fetch', () => {
    expect(page).toContain('const filteredMembers = computed(() =>')
    expect(page.match(/filteredMembers/g)?.length).toBeGreaterThanOrEqual(4)
    expect(page).not.toMatch(/watch\(view|watchEffect\([^)]*view/)
    expect(page).not.toContain('team.historyNotice')
    expect(page).not.toContain('team.memberWorkspaceHint')
    expect(page).not.toContain('team.departmentWorkspaceHint')
    expect(page).not.toContain('<TableHead>{{ t(\'team.machineKey\') }}</TableHead>')
  })
})
