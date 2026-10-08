import type { LocationQuery, LocationQueryRaw } from 'vue-router'

/** Resolve retired team URLs, preserving all query values and the URL hash. */
export function legacyTeamRedirect(path: string, query: LocationQuery, hash: string) {
  let destination: string | undefined
  if (path === '/organizacion' && query.tab === 'team') destination = '/team'
  else if (path === '/organizacion/equipo') destination = '/team'
  else if (path === '/organizacion/equipo/actividad') destination = '/team/activity'
  else if (path.startsWith('/organizacion/equipo/')) destination = `/team/${path.slice('/organizacion/equipo/'.length)}`
  if (!destination) return undefined

  const preservedQuery: LocationQueryRaw = { ...query }
  if (path === '/organizacion' && query.tab === 'team') delete preservedQuery.tab
  return { path: destination, query: preservedQuery, hash }
}
