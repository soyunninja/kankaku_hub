import { describe, expect, it } from 'vitest'
import { memberCostLabel, rankMemberCosts } from '../app/lib/dashboard-member-ranking'

describe('dashboard member cost ranking', () => {
  it('keeps historical identities, unknown cost, estimated quality, and unattributed rows honest', () => {
    const ranked = rankMemberCosts([
      { groupKey: 'inactive-id', entries: 2, cost: 9, costKnownSum: 9, costKnownEntries: 2, costUnknownEntries: 0, costEstimatedEntries: 1, workMs: 10 },
      { groupKey: 'missing-catalog-id', entries: 1, cost: 0, costKnownSum: 0, costKnownEntries: 0, costUnknownEntries: 1, costEstimatedEntries: 0, workMs: 5 },
      { groupKey: '', entries: 1, cost: 0, costKnownSum: 0, costKnownEntries: 0, costUnknownEntries: 1, costEstimatedEntries: 0, workMs: 2 },
      { groupKey: 'zero-id', entries: 1, cost: 0, costKnownSum: 0, costKnownEntries: 1, costUnknownEntries: 0, costEstimatedEntries: 0, workMs: 1 },
    ], new Map([['inactive-id', 'Inactive member'], ['zero-id', 'Zero member']]))

    expect(ranked.map(row => [row.id, row.label, row.costState])).toEqual([
      ['inactive-id', 'Inactive member', 'estimated'],
      ['missing-catalog-id', '', 'unknown'],
      ['', '', 'unknown'],
      ['zero-id', 'Zero member', 'known'],
    ])
    expect(memberCostLabel(ranked[1]!)).toBe('—')
    expect(memberCostLabel(ranked[3]!)).toBe('0')
  })

  it('sorts known recorded costs and limits rows to five', () => {
    const groups = Array.from({ length: 7 }, (_, i) => ({
      groupKey: `m${i}`, entries: 1, cost: i, costKnownSum: i, costKnownEntries: 1, costUnknownEntries: 0, costEstimatedEntries: 0, workMs: i,
    }))
    expect(rankMemberCosts(groups, new Map()).map(row => row.id)).toEqual(['m6', 'm5', 'm4', 'm3', 'm2'])
  })
})
