import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { legacyTeamRedirect } from '../app/components/team/routes'

describe('standalone team routes', () => {
  it('redirects legacy index, activity, and member URLs with query and hash intact', () => {
    expect(legacyTeamRedirect('/organizacion/equipo', { range: '30d' }, '#members')).toEqual({
      path: '/team', query: { range: '30d' }, hash: '#members',
    })
    expect(legacyTeamRedirect('/organizacion/equipo/actividad', { dateStart: '2024-01-01', dateEnd: '2024-01-31' }, '#activity')).toEqual({
      path: '/team/activity', query: { dateStart: '2024-01-01', dateEnd: '2024-01-31' }, hash: '#activity',
    })
    expect(legacyTeamRedirect('/organizacion/equipo/member-1', { dateStart: '2024-02-01' }, '#work')).toEqual({
      path: '/team/member-1', query: { dateStart: '2024-02-01' }, hash: '#work',
    })
  })

  it('redirects the retired organization team bookmark without its tab query', () => {
    expect(legacyTeamRedirect('/organizacion', { tab: 'team', dateStart: '2024-01-01', q: ['a', 'b'] }, '#members')).toEqual({
      path: '/team', query: { dateStart: '2024-01-01', q: ['a', 'b'] }, hash: '#members',
    })
  })

  it('registers canonical pages and leaves organization with only three embedded catalogs', () => {
    for (const path of ['index.vue', 'activity.vue', '[id].vue']) {
      expect(() => readFileSync(`app/pages/team/${path}`, 'utf8')).not.toThrow()
    }
    const organization = readFileSync('app/components/organization/OrganizationCatalogTabs.vue', 'utf8')
    expect(organization).not.toMatch(/TeamPage|team: TeamPage|organizacion\/equipo\/index\.vue/i)
    expect(organization).toContain('v-if="visited.has(tab)" embedded')
    expect(organization).not.toMatch(/CatalogNavigation|TeamWorkspaceNavigation|team: TeamPage/i)
    const tabs = readFileSync('app/components/organization/tabs.ts', 'utf8')
    expect(tabs).toContain("['clients', 'projects', 'tasks']")
    expect(tabs).not.toContain("'team'")
  })

  it('registers Team immediately after Tasks and exposes it in both shell navigations', () => {
    const nav = readFileSync('app/lib/nav-items.ts', 'utf8')
    expect(nav.indexOf("to: '/team'")).toBeGreaterThan(nav.indexOf("to: '/tasks'"))
    expect(nav.indexOf("to: '/team'")).toBe(nav.indexOf("to: '/tasks'") + "  { to: '/tasks', labelKey: 'nav.tasks', sectionKey: 'nav.organization' },\n".length)
    for (const file of ['SidebarNav.vue', 'CommandPalette.vue']) {
      expect(readFileSync(`app/components/app-shell/${file}`, 'utf8')).toContain("'/team':")
    }
    for (const path of ['index.vue', 'activity.vue', '[id].vue']) {
      const page = readFileSync(`app/pages/team/${path}`, 'utf8')
      expect(page).not.toMatch(/TeamWorkspaceNavigation|CatalogNavigation/)
    }
  })
})
