import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ORGANIZATION_TABS, resolveOrganizationTab, organizationTabQuery } from '../app/components/organization/tabs'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import ja from '../i18n/locales/ja.json'

const sourcePath = `${process.cwd()}/app/components/organization/OrganizationCatalogTabs.vue`
const source = readFileSync(sourcePath, 'utf8')

describe('canonical Organization tabs', () => {
  it('keeps only the three embedded catalogs in the Organization tabs row', () => {
    for (const [name, route] of [['Clients', 'clients'], ['Projects', 'projects'], ['Tasks', 'tasks']]) {
      expect(source).toContain(`import ${name}Page from '@/pages/${route}/index.vue'`)
    }
    expect(source).toContain('new Set<OrganizationTab>([activeTab.value])')
    expect(source).toContain('v-if="visited.has(tab)" embedded')
    expect(source).toContain('v-show="activeTab === tab"')
    expect(source).not.toContain('CatalogNavigation')
    expect(source).not.toMatch(/<a\b[^>]*>\s*Team\s*<\/a>/i)
    expect(ORGANIZATION_TABS).toHaveLength(3)
    expect(source).toContain('organizationTabQuery(route.query, value)')
    expect(source).toContain("useHead({ title: computed(() => t('nav.organization')) })")
    expect(source).toContain("{{ t('nav.organization') }}</h1>")
    expect(source).not.toMatch(/organizationPrototype|organizationOverview|nav\.prototype|experiment/)
  })

  it('supports only the three embedded catalogs and validates deep links', () => {
    expect(ORGANIZATION_TABS).toEqual(['clients', 'projects', 'tasks'])
    for (const tab of ORGANIZATION_TABS) expect(resolveOrganizationTab(tab)).toBe(tab)
    for (const value of [undefined, null, '', 'unknown', ['tasks'], ['clients', 'tasks']]) {
      expect(resolveOrganizationTab(value)).toBe('clients')
    }
  })

  it('keeps Team route-based and retains localized nav labels', () => {
    expect(source).not.toContain('TeamPage')
    expect(source).not.toContain('team: TeamPage')
    for (const locale of [en, es, ja]) {
      expect(locale.nav.team).toBeTruthy()
      expect(Object.keys(locale.team).sort()).toEqual(Object.keys(en.team).sort())
      for (const text of Object.values(locale.team)) expect(text.trim()).not.toBe('')
    }
  })

  it('retains unrelated queries without mutating the route', () => {
    const query = { tab: 'clients', highlight: 'abc', extra: ['one', 'two'] }
    expect(organizationTabQuery(query, 'tasks')).toEqual({ ...query, tab: 'tasks' })
    expect(query.tab).toBe('clients')
    expect(organizationTabQuery(query, 'invalid')).toEqual(query)
  })

  it('uses localized canonical copy without obsolete experiment or overview groups', () => {
    for (const locale of [en, es, ja]) {
      expect(locale.nav.organization.trim().length).toBeGreaterThan(0)
      expect(locale.nav).not.toHaveProperty('prototype')
      expect(locale).not.toHaveProperty('organizationPrototype')
      expect(locale).not.toHaveProperty('organizationOverview')
    }
    expect(es.nav.organization).toBe('Organización')
  })

  it('removes prototype sidebar and palette special cases', () => {
    for (const name of ['SidebarNav', 'CommandPalette']) {
      const shell = readFileSync(`${process.cwd()}/app/components/app-shell/${name}.vue`, 'utf8')
      expect(shell).not.toMatch(/prueba|nav\.prototype/)
      expect(shell).toContain('NAV_ITEMS')
    }
  })
})
