import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ORGANIZATION_TABS, resolveOrganizationTab, organizationTabQuery } from '../app/components/organization/tabs'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import ja from '../i18n/locales/ja.json'

const sourcePath = `${process.cwd()}/app/components/organization/OrganizationCatalogTabs.vue`
const source = readFileSync(sourcePath, 'utf8')

describe('canonical Organization tabs', () => {
  it('composes the existing catalogs with lazy visited views and selected-panel visibility', () => {
    for (const [name, route] of [['Clients', 'clients'], ['Projects', 'projects'], ['Tasks', 'tasks']]) {
      expect(source).toContain(`import ${name}Page from '@/pages/${route}/index.vue'`)
    }
    expect(source).toContain('new Set<OrganizationTab>([activeTab.value])')
    expect(source).toContain('watch(activeTab, tab => visited.add(tab)')
    expect(source).toContain('v-if="visited.has(tab)" embedded')
    expect(source).toContain('v-show="activeTab === tab"')
    expect(source).toContain('force-mount')
    expect(source).toContain('organizationTabQuery(route.query, value)')
    expect(source).toContain('resolveOrganizationTab(route.query.tab)')
    expect(source.match(/<h1\b/g)).toHaveLength(1)
    expect(source).toContain("useHead({ title: computed(() => t('nav.organization')) })")
    expect(source).toContain("{{ t('nav.organization') }}</h1>")
    expect(source).not.toMatch(/organizationPrototype|organizationOverview|nav\.prototype|experiment/)
  })

  it('supports exactly the existing catalogs and validates deep links', () => {
    expect(ORGANIZATION_TABS).toEqual(['clients', 'projects', 'tasks'])
    for (const tab of ORGANIZATION_TABS) expect(resolveOrganizationTab(tab)).toBe(tab)
    for (const value of [undefined, null, '', 'unknown', ['tasks'], ['clients', 'tasks']]) {
      expect(resolveOrganizationTab(value)).toBe('clients')
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
