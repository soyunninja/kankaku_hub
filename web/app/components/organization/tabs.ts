import type { LocationQuery, LocationQueryRaw } from 'vue-router'

export const ORGANIZATION_TABS = ['clients', 'projects', 'tasks'] as const
export type OrganizationTab = typeof ORGANIZATION_TABS[number]

export function resolveOrganizationTab(value: unknown): OrganizationTab {
  return ORGANIZATION_TABS.find(tab => tab === value) ?? 'clients'
}

/** Preserve other query parameters and reject non-catalog tab values. */
export function organizationTabQuery(query: LocationQuery, value: unknown): LocationQueryRaw {
  return { ...query, tab: resolveOrganizationTab(value) }
}
