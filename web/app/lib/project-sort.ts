import type { ProjectRecord } from './pocketbase-types'

export type SortKey = 'name' | 'client' | 'status' | 'time' | 'cost'
export type SortDirection = 'asc' | 'desc'

export interface ProjectSortTotals {
  workMs: number
  cost: number
}

export function initialSortDirection(key: SortKey): SortDirection {
  return key === 'name' || key === 'client' ? 'asc' : 'desc'
}

/** Sort the already-loaded catalog without changing its shared order. */
export function sortProjects(
  projects: readonly ProjectRecord[],
  key: SortKey,
  direction: SortDirection,
  locale: string,
  clientName: (id: string) => string | undefined,
  totalsByProject: Readonly<Record<string, ProjectSortTotals | undefined>>,
): ProjectRecord[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' })
  const factor = direction === 'asc' ? 1 : -1
  const compare = (a: ProjectRecord, b: ProjectRecord): number => {
    switch (key) {
      case 'name': return collator.compare(a.name, b.name)
      case 'client': return collator.compare(clientName(a.client) ?? a.client, clientName(b.client) ?? b.client)
      case 'status': return Number(a.active) - Number(b.active)
      case 'time': return (totalsByProject[a.id]?.workMs ?? 0) - (totalsByProject[b.id]?.workMs ?? 0)
      case 'cost': return (totalsByProject[a.id]?.cost ?? 0) - (totalsByProject[b.id]?.cost ?? 0)
    }
  }
  return [...projects].sort((a, b) => factor * compare(a, b)
    || collator.compare(a.name, b.name)
    || collator.compare(a.id, b.id)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
