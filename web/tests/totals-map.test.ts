import { describe, expect, it } from 'vitest'
import {
  avgCostPerTaskFromTotal,
  computeAverageCostFromTotal,
  groupsToGroupTotals,
  mapTotalsGroup,
  mapTotalsResponse,
  mapTotalsRow,
  summarizeWorkTimeQualityFromTotal,
  totalsByGroupKey,
  type TotalsGroupRaw,
  type TotalsResponseRaw,
  type TotalsRowRaw,
} from '../app/lib/totals-map'

function rawRow(overrides: Partial<TotalsRowRaw> = {}): TotalsRowRaw {
  return {
    entries: 10,
    wall_ms: 100_000,
    work_ms: 80_000,
    waiting_ms: 20_000,
    input: 1000,
    output: 500,
    cache_read: 100,
    cache_write: 50,
    cost: 5,
    waiting_unavailable_entries: 2,
    cost_unknown_entries: 1,
    cost_estimated_entries: 3,
    cost_known_entries: 9,
    cost_known_sum: 4.5,
    unlinked_entries: 1,
    distinct_sessions: 4,
    ...overrides,
  }
}

function rawGroup(key: string, overrides: Partial<TotalsGroupRaw> = {}): TotalsGroupRaw {
  return {
    ...rawRow(overrides),
    group_key: key,
    group_key2: '',
    session_name: '',
    min_started_at: '',
    max_ended_at: '',
    distinct_client: 0,
    sample_client: '',
    distinct_project: 0,
    sample_project: '',
    distinct_task: 0,
    sample_task: '',
    machine: '',
    distinct_agent: 0,
    sample_agent: '',
    ...overrides,
  }
}

describe('mapTotalsRow', () => {
  it('renames every snake_case field to camelCase without changing values', () => {
    const raw = rawRow()
    const row = mapTotalsRow(raw)
    expect(row).toEqual({
      entries: 10,
      count: 10,
      wallMs: 100_000,
      workMs: 80_000,
      waitingMs: 20_000,
      input: 1000,
      output: 500,
      cacheRead: 100,
      cacheWrite: 50,
      cost: 5,
      waitingUnavailableEntries: 2,
      costUnknownEntries: 1,
      costEstimatedEntries: 3,
      costKnownEntries: 9,
      costKnownSum: 4.5,
      unlinkedEntries: 1,
      distinctSessions: 4,
    })
  })
})

describe('mapTotalsGroup / mapTotalsResponse', () => {
  it('maps a full response, preserving group identity fields', () => {
    const raw: TotalsResponseRaw = {
      groups: [rawGroup('client-a', { cost: 3 }), rawGroup('client-b', { cost: 7 })],
      total: rawRow({ cost: 10 }),
      page: 1,
      per_page: 50,
      total_groups: 2,
      total_pages: 1,
    }
    const mapped = mapTotalsResponse(raw)
    expect(mapped.totalGroups).toBe(2)
    expect(mapped.perPage).toBe(50)
    expect(mapped.groups.map(g => g.groupKey)).toEqual(['client-a', 'client-b'])
    expect(mapped.groups[0]!.cost).toBe(3)
  })

  it('maps the session-specific fields', () => {
    const raw = rawGroup('session-1', {
      session_name: 'Fix bug',
      min_started_at: '2026-09-01 00:00:00.000Z',
      max_ended_at: '2026-09-01 02:00:00.000Z',
      distinct_client: 1,
      sample_client: 'c1',
      machine: 'macbook',
    })
    const mapped = mapTotalsGroup(raw)
    expect(mapped.sessionName).toBe('Fix bug')
    expect(mapped.minStartedAt).toBe('2026-09-01 00:00:00.000Z')
    expect(mapped.maxEndedAt).toBe('2026-09-01 02:00:00.000Z')
    expect(mapped.distinctClient).toBe(1)
    expect(mapped.sampleClient).toBe('c1')
    expect(mapped.machine).toBe('macbook')
  })
})

describe('avgCostPerTaskFromTotal (mirrors aggregate.ts#avgCostPerTask)', () => {
  it('divides cost by entries', () => {
    const total = mapTotalsRow(rawRow({ cost: 30, entries: 10 }))
    expect(avgCostPerTaskFromTotal(total)).toBe(3)
  })
  it('is 0 for zero entries', () => {
    const total = mapTotalsRow(rawRow({ cost: 0, entries: 0 }))
    expect(avgCostPerTaskFromTotal(total)).toBe(0)
  })
})

describe('computeAverageCostFromTotal (mirrors measurement-quality.ts#computeAverageCost)', () => {
  it('averages only over cost_known_entries/cost_known_sum, excluding unknown-cost rows', () => {
    const total = mapTotalsRow(rawRow({ cost_known_sum: 9, cost_known_entries: 3, cost_unknown_entries: 2 }))
    const result = computeAverageCostFromTotal(total)
    expect(result.average).toBe(3)
    expect(result.includedCount).toBe(3)
    expect(result.excludedCount).toBe(2)
  })
  it('returns null average when every row was excluded', () => {
    const total = mapTotalsRow(rawRow({ cost_known_sum: 0, cost_known_entries: 0, cost_unknown_entries: 5 }))
    expect(computeAverageCostFromTotal(total).average).toBeNull()
  })
})

describe('summarizeWorkTimeQualityFromTotal (mirrors measurement-quality.ts#summarizeWorkTimeQuality)', () => {
  it('splits entries into measured vs upper-bound', () => {
    const total = mapTotalsRow(rawRow({ entries: 10, waiting_unavailable_entries: 3 }))
    const result = summarizeWorkTimeQualityFromTotal(total)
    expect(result.measuredCount).toBe(7)
    expect(result.upperBoundCount).toBe(3)
    expect(result.isUpperBound).toBe(true)
  })
  it('isUpperBound is false when nothing is unavailable', () => {
    const total = mapTotalsRow(rawRow({ entries: 10, waiting_unavailable_entries: 0 }))
    expect(summarizeWorkTimeQualityFromTotal(total).isUpperBound).toBe(false)
  })
})

describe('groupsToGroupTotals (mirrors aggregate.ts#groupByKey shape)', () => {
  it('computes cost/work shares against the grand total and sorts by cost descending', () => {
    const groups = [rawGroup('a', { cost: 2 }), rawGroup('b', { cost: 8 })].map(mapTotalsGroup)
    const grand = mapTotalsRow(rawRow({ cost: 10, work_ms: 100 }))
    const result = groupsToGroupTotals(groups, grand)
    expect(result.map(g => g.key)).toEqual(['b', 'a'])
    expect(result[0]!.costShare).toBeCloseTo(0.8, 10)
    expect(result[1]!.costShare).toBeCloseTo(0.2, 10)
  })

  it('cost shares sum to 1', () => {
    const groups = [rawGroup('a', { cost: 1 }), rawGroup('b', { cost: 3 }), rawGroup('c', { cost: 6 })].map(mapTotalsGroup)
    const grand = mapTotalsRow(rawRow({ cost: 10 }))
    const totalShare = groupsToGroupTotals(groups, grand).reduce((sum, g) => sum + g.costShare, 0)
    expect(totalShare).toBeCloseTo(1, 10)
  })

  it('handles a zero grand total without dividing by zero', () => {
    const groups = [rawGroup('a', { cost: 0, work_ms: 0 })].map(mapTotalsGroup)
    const grand = mapTotalsRow(rawRow({ cost: 0, work_ms: 0 }))
    const result = groupsToGroupTotals(groups, grand)
    expect(result[0]!.costShare).toBe(0)
    expect(result[0]!.workMsShare).toBe(0)
  })
})

describe('totalsByGroupKey', () => {
  it('builds a lookup keyed by group_key, skipping the empty-key bucket', () => {
    const groups = [rawGroup('', { cost: 99 }), rawGroup('task-1', { cost: 5 }), rawGroup('task-2', { cost: 7 })].map(mapTotalsGroup)
    const lookup = totalsByGroupKey(groups)
    expect(Object.keys(lookup).sort()).toEqual(['task-1', 'task-2'])
    expect(lookup['task-1']!.cost).toBe(5)
    expect(lookup['task-2']!.cost).toBe(7)
  })
})
