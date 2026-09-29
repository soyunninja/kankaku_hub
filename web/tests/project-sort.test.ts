import { describe, expect, it } from 'vitest'
import type { ProjectRecord } from '../app/lib/pocketbase-types'
import { initialSortDirection, sortProjects } from '../app/lib/project-sort'
import type { SortDirection, SortKey } from '../app/lib/project-sort'

function project(id: string, name: string, client: string, active = true): ProjectRecord {
  return { id, name, client, active, code: '', repo_paths: [], created: '', updated: '' }
}

const rows = [
  project('p3', 'Gamma', 'c2', false),
  project('p1', 'Alpha', 'c3'),
  project('p2', 'Beta', 'c1'),
]
const names: Record<string, string> = { c1: 'Zebra', c2: 'Alpha', c3: 'Middle' }
const resolveClient = (id: string) => names[id]
const totals = { p1: { workMs: 20, cost: 5 }, p2: { workMs: 10, cost: 10 }, p3: { workMs: 30, cost: 1 } }
const ids = (key: SortKey, direction: SortDirection) => sortProjects(rows, key, direction, 'en', resolveClient, totals).map(p => p.id)

describe('sortProjects', () => {
  it.each([
    ['name', ['p1', 'p2', 'p3'], ['p3', 'p2', 'p1']],
    ['client', ['p3', 'p1', 'p2'], ['p2', 'p1', 'p3']],
    ['status', ['p3', 'p1', 'p2'], ['p1', 'p2', 'p3']],
    ['time', ['p2', 'p1', 'p3'], ['p3', 'p1', 'p2']],
    ['cost', ['p3', 'p1', 'p2'], ['p2', 'p1', 'p3']],
  ] as const)('sorts %s both ways', (key, asc, desc) => {
    expect(ids(key, 'asc')).toEqual(asc)
    expect(ids(key, 'desc')).toEqual(desc)
  })

  it('compares names naturally, without case or accent sensitivity', () => {
    const names = [project('c', 'Item 10', ''), project('b', 'ítem 2', ''), project('a', 'ITEM 1', '')]
    expect(sortProjects(names, 'name', 'asc', 'en', resolveClient, {}).map(p => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('uses displayed client names, falling back to unknown client IDs', () => {
    const missing = [project('a', 'A', 'm-id'), project('b', 'B', 'c1')]
    expect(sortProjects(missing, 'client', 'asc', 'en', resolveClient, {}).map(p => p.id)).toEqual(['a', 'b'])
  })

  it('treats absent totals as zero for both numeric keys', () => {
    const missing = [project('b', 'B', ''), project('a', 'A', '')]
    for (const key of ['time', 'cost'] as const) {
      const values = { a: { workMs: 1, cost: 1 } }
      expect(sortProjects(missing, key, 'asc', 'en', resolveClient, values).map(p => p.id)).toEqual(['b', 'a'])
      expect(sortProjects(missing, key, 'desc', 'en', resolveClient, values).map(p => p.id)).toEqual(['a', 'b'])
    }
  })

  it('resolves ties by name then ID, independently of direction, without mutating input', () => {
    const tied = Object.freeze([project('b', 'Same', ''), project('c', 'Other', ''), project('a', 'Same', '')])
    for (const direction of ['asc', 'desc'] as const) {
      const sorted = sortProjects(tied, 'cost', direction, 'en', resolveClient, {})
      expect(sorted.map(p => p.id)).toEqual(['c', 'a', 'b'])
      expect(sorted).not.toBe(tied)
    }
    expect(tied.map(p => p.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('initialSortDirection', () => {
  it.each([
    ['name', 'asc'], ['client', 'asc'], ['status', 'desc'], ['time', 'desc'], ['cost', 'desc'],
  ] as const)('%s starts %s', (key, direction) => {
    expect(initialSortDirection(key)).toBe(direction)
  })
})
