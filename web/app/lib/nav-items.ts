/**
 * Single source of truth for the app's top-level routes: `to` + the i18n
 * key for its nav label. `SidebarNav.vue` and `CommandPalette.vue` build
 * their nav arrays from this list (each still adds its own icon/badge on
 * top — those are presentation concerns and stay local to each
 * component), and `Header.vue`'s breadcrumb derives its segment→label map
 * from it too (see `resolveBreadcrumbLabels`), so a route added here can
 * never again be missing from the header breadcrumb.
 */

export interface NavItem {
  to: string
  labelKey: string
  sectionKey?: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', labelKey: 'nav.dashboard' },
  { to: '/organizacion', labelKey: 'nav.organization', sectionKey: 'nav.organization' },
  { to: '/clients', labelKey: 'nav.clients', sectionKey: 'nav.organization' },
  { to: '/projects', labelKey: 'nav.projects', sectionKey: 'nav.organization' },
  { to: '/tasks', labelKey: 'nav.tasks', sectionKey: 'nav.organization' },
  { to: '/team', labelKey: 'nav.team', sectionKey: 'nav.organization' },
  { to: '/unassigned', labelKey: 'nav.unassigned' },
  { to: '/sessions-without-task', labelKey: 'nav.sessionsQueue' },
  { to: '/entries', labelKey: 'nav.entries' },
  { to: '/settings', labelKey: 'nav.settings' },
]

/**
 * Breadcrumb-only label overrides, keyed by path segment (the route's
 * `to` minus its leading slash). The header has more room than the
 * compact sidebar/palette label, so `/sessions-without-task` shows the
 * page's own full title (`sessionsQueue.title`, "Sesiones sin tarea")
 * instead of the short `nav.sessionsQueue` label used everywhere else —
 * the one route where breadcrumb and nav label deliberately diverge.
 */
const BREADCRUMB_LABEL_OVERRIDES: Record<string, string> = {
  'sessions-without-task': 'sessionsQueue.title',
}

/** Path segment (no leading slash) -> i18n label key, derived from `NAV_ITEMS` plus the breadcrumb-only overrides above. */
export const SEGMENT_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    NAV_ITEMS
      .filter(item => item.to !== '/')
      .map(item => [item.to.slice(1), BREADCRUMB_LABEL_OVERRIDES[item.to.slice(1)] ?? item.labelKey]),
  ),
  proyectos: 'nav.projects',
  clientes: 'nav.clients',
  tareas: 'nav.tasks',
}

/**
 * Resolves a route path into its breadcrumb label strings. Pure and
 * translator-agnostic (`t` is injected) so it is testable without
 * mounting `Header.vue`.
 *
 * Every segment must resolve to a translated label — an unmapped segment
 * (a route missing from `NAV_ITEMS`, or a dynamic segment like a record
 * id) is NEVER rendered as its raw slug: it is dropped from the
 * breadcrumb (with a dev-mode console warning so the gap gets noticed
 * and fixed), which has the effect of falling back to the nearest known
 * parent crumb rather than showing untranslated/raw text.
 */
export function resolveBreadcrumbLabels(path: string, t: (key: string) => string): string[] {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return [t('nav.dashboard')]

  const labels: string[] = []
  for (const [index, part] of parts.entries()) {
    // Record IDs occupy fixed positions in canonical Organization routes.
    // An ID matching a catalog slug must not become an extra breadcrumb.
    if (parts[0] === 'organizacion'
      && ((index === 2 && ['clientes', 'proyectos', 'tareas'].includes(parts[1]!))
        || (index === 4 && parts[1] === 'clientes' && parts[3] === 'proyectos')
        || (index === 6 && parts[1] === 'clientes' && parts[3] === 'proyectos' && parts[5] === 'tareas'))) continue
    const key = SEGMENT_LABELS[part]
    if (key) {
      labels.push(t(key))
    }
    else if (import.meta.dev) {
       
      console.warn(`[Header] no breadcrumb label registered for route segment "${part}" — add it to NAV_ITEMS (app/lib/nav-items.ts). Falling back to the nearest known parent crumb instead of the raw slug.`)
    }
  }
  return labels.length > 0 ? labels : [t('nav.dashboard')]
}
