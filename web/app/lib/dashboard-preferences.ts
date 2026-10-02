export const DASHBOARD_PREFERENCES_KEY = 'kankaku-dashboard-chart:v1'

export interface DashboardPreferences {
  metric: 'work' | 'cost'
  stackBy: 'none' | 'client' | 'project'
}

/** Storage is untrusted: accept only the complete, version-scoped shape. */
export function parseDashboardPreferences(raw: string | null): DashboardPreferences {
  const defaults: DashboardPreferences = { metric: 'work', stackBy: 'project' }
  if (!raw) return defaults
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults
    const prefs = value as Record<string, unknown>
    if (Object.keys(prefs).length !== 2
      || (prefs.metric !== 'work' && prefs.metric !== 'cost')
      || (prefs.stackBy !== 'none' && prefs.stackBy !== 'client' && prefs.stackBy !== 'project')) return defaults
    return { metric: prefs.metric, stackBy: prefs.stackBy }
  }
  catch {
    return defaults
  }
}
