import { describe, expect, it } from 'vitest'
import { avgCostPerTask, chunk, groupByClient, groupUnassigned, sumTaskEntries, unassignedGroupKey } from '../app/lib/aggregate'
import { fixtureClientCosts, fixtureGrandTotals, fixtureTaskEntries } from './fixtures/task-entries'

describe('sumTaskEntries (D6 guard)', () => {
  it('reproduces the hand-computed fixture grand totals exactly', () => {
    const totals = sumTaskEntries(fixtureTaskEntries)
    expect(totals).toEqual(fixtureGrandTotals)
  })

  it('returns all-zero totals for an empty list', () => {
    expect(sumTaskEntries([])).toEqual({
      wallMs: 0, waitingMs: 0, workMs: 0, input: 0, output: 0,
      cacheRead: 0, cacheWrite: 0, cost: 0, count: 0,
    })
  })
})

describe('avgCostPerTask', () => {
  it('divides total cost by count', () => {
    const totals = sumTaskEntries(fixtureTaskEntries)
    expect(avgCostPerTask(totals)).toBeCloseTo(fixtureGrandTotals.cost / 5, 10)
  })
  it('is 0 for no entries', () => {
    expect(avgCostPerTask(sumTaskEntries([]))).toBe(0)
  })
})

describe('groupByClient', () => {
  it('reproduces hand-computed per-client cost totals', () => {
    const groups = groupByClient(fixtureTaskEntries)
    const byKey = Object.fromEntries(groups.map(g => [g.key, g.cost]))
    for (const [client, cost] of Object.entries(fixtureClientCosts)) {
      expect(byKey[client]).toBeCloseTo(cost, 10)
    }
  })

  it('cost shares add up to 1', () => {
    const groups = groupByClient(fixtureTaskEntries)
    const totalShare = groups.reduce((acc, g) => acc + g.costShare, 0)
    expect(totalShare).toBeCloseTo(1, 10)
  })

  it('is sorted by cost descending', () => {
    const groups = groupByClient(fixtureTaskEntries)
    const costs = groups.map(g => g.cost)
    expect(costs).toEqual([...costs].sort((a, b) => b - a))
  })
})

describe('chunk', () => {
  it('splits into chunks of the given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
  it('returns one chunk when size >= length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]])
  })
  it('returns an empty array for an empty input', () => {
    expect(chunk([], 5)).toEqual([])
  })
  it('throws for a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow()
  })
})

describe('unassignedGroupKey', () => {
  it('does not collide when a space could be reinterpreted as the join separator', () => {
    const a = unassignedGroupKey('A B', 'C')
    const b = unassignedGroupKey('A', 'B C')
    expect(a).not.toBe(b)
  })

  it('is stable for the same inputs', () => {
    expect(unassignedGroupKey('Acme Corp', '/home/dev/acme')).toBe(unassignedGroupKey('Acme Corp', '/home/dev/acme'))
  })
})

describe('groupUnassigned', () => {
  it('groups the one unassigned fixture row by legacy label and repo project', () => {
    const unassignedOnly = fixtureTaskEntries.filter(e => e.client === 'client-unassigned')
    const groups = groupUnassigned(unassignedOnly)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      legacyLabel: 'cjamar',
      repoProject: '/home/dev/repos/cajamar-app',
      count: 1,
    })
    expect(groups[0].totals.cost).toBeCloseTo(0.1, 10)
  })

  it('handles labels containing spaces without corrupting the key', () => {
    const rows = [
      { client: 'c', started_at: '2026-01-01', cost: 1, legacy_client_label: 'Clinica Dental Vega', repo_project: '/a/b c' },
      { client: 'c', started_at: '2026-01-02', cost: 2, legacy_client_label: 'Clinica Dental Vega', repo_project: '/a/b c' },
    ]
    const groups = groupUnassigned(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].legacyLabel).toBe('Clinica Dental Vega')
    expect(groups[0].repoProject).toBe('/a/b c')
    expect(groups[0].count).toBe(2)
  })

  it('falls back to placeholders when label/project are missing', () => {
    const groups = groupUnassigned([{ client: 'c', started_at: '2026-01-01', cost: 1 }])
    expect(groups[0].legacyLabel).toBe('(sin etiqueta)')
    expect(groups[0].repoProject).toBe('(sin proyecto)')
  })
})
