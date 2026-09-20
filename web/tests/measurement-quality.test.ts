import { describe, expect, it } from 'vitest'
import {
  computeAverageCost,
  describeEntryQuality,
  LEGACY_AGENT,
  listDistinctAgents,
  normalizeAgentInfo,
  summarizeWorkTimeQuality,
} from '../app/lib/measurement-quality'

describe('normalizeAgentInfo', () => {
  it('normalizes a fully-reported row', () => {
    expect(normalizeAgentInfo({
      agent: 'pi', agent_version: '1.2.3', plugin: 'kankaku', plugin_version: '0.9.0',
    })).toEqual({
      agent: 'pi', agentVersion: '1.2.3', plugin: 'kankaku', pluginVersion: '0.9.0', isLegacy: false,
    })
  })

  it('treats empty agent as legacy, not an error state', () => {
    expect(normalizeAgentInfo({ agent: '', agent_version: '', plugin: '', plugin_version: '' }))
      .toEqual({ agent: '', agentVersion: '', plugin: '', pluginVersion: '', isLegacy: true })
  })

  it('treats undefined fields the same as empty strings', () => {
    expect(normalizeAgentInfo({})).toEqual({
      agent: '', agentVersion: '', plugin: '', pluginVersion: '', isLegacy: true,
    })
  })

  it('trims whitespace', () => {
    expect(normalizeAgentInfo({ agent: '  pi  ' }).agent).toBe('pi')
  })
})

describe('describeEntryQuality — waiting_quality', () => {
  it('measured: not an upper bound, no badge', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: 'measured', subagent_linkage: 'not_applicable' })
    expect(result.workTimeIsUpperBound).toBe(false)
    expect(result.badges).toEqual([])
  })

  it('unavailable: is an upper bound, badge present', () => {
    const result = describeEntryQuality({ waiting_quality: 'unavailable', cost_quality: 'measured', subagent_linkage: 'not_applicable' })
    expect(result.workTimeIsUpperBound).toBe(true)
    expect(result.badges).toContainEqual({ kind: 'upper-bound' })
  })

  it('empty/undefined behaves like measured (good case, not bad case)', () => {
    const result = describeEntryQuality({ waiting_quality: '', cost_quality: 'measured', subagent_linkage: 'not_applicable' })
    expect(result.workTimeIsUpperBound).toBe(false)
    expect(result.badges).toEqual([])
  })
})

describe('describeEntryQuality — cost_quality', () => {
  it('measured: no badge', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: 'measured', subagent_linkage: 'not_applicable' })
    expect(result.costIsApprox).toBe('measured')
    expect(result.badges).toEqual([])
  })

  it('estimated: flagged approximate', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: 'estimated', subagent_linkage: 'not_applicable' })
    expect(result.costIsApprox).toBe('estimated')
    expect(result.badges).toContainEqual({ kind: 'cost-approx', quality: 'estimated' })
  })

  it('unknown: flagged approximate', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: 'unknown', subagent_linkage: 'not_applicable' })
    expect(result.costIsApprox).toBe('unknown')
    expect(result.badges).toContainEqual({ kind: 'cost-approx', quality: 'unknown' })
  })

  it('empty/undefined behaves like measured', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: '', subagent_linkage: 'not_applicable' })
    expect(result.costIsApprox).toBe('measured')
    expect(result.badges).toEqual([])
  })
})

describe('describeEntryQuality — subagent_linkage', () => {
  it('linked: no warning', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: 'measured', subagent_linkage: 'linked' })
    expect(result.showsUnlinkedWarning).toBe(false)
    expect(result.badges).toEqual([])
  })

  it('not_applicable: no warning', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: 'measured', subagent_linkage: 'not_applicable' })
    expect(result.showsUnlinkedWarning).toBe(false)
    expect(result.badges).toEqual([])
  })

  it('unlinked: warning badge', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: 'measured', subagent_linkage: 'unlinked' })
    expect(result.showsUnlinkedWarning).toBe(true)
    expect(result.badges).toContainEqual({ kind: 'unlinked' })
  })

  it('empty/undefined behaves like not_applicable (no warning)', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: 'measured', subagent_linkage: '' })
    expect(result.showsUnlinkedWarning).toBe(false)
    expect(result.badges).toEqual([])
  })
})

describe('describeEntryQuality — zero noise on fully-measured data', () => {
  it('produces an empty badges array for a fully-measured row', () => {
    const result = describeEntryQuality({ waiting_quality: 'measured', cost_quality: 'measured', subagent_linkage: 'not_applicable' })
    expect(result.badges).toEqual([])
  })

  it('produces an empty badges array for a fully-empty legacy row', () => {
    const result = describeEntryQuality({ waiting_quality: '', cost_quality: '', subagent_linkage: '' })
    expect(result.badges).toEqual([])
    expect(result.workTimeIsUpperBound).toBe(false)
    expect(result.costIsApprox).toBe('measured')
    expect(result.showsUnlinkedWarning).toBe(false)
  })

  it('produces all three badges when everything is at its worst', () => {
    const result = describeEntryQuality({ waiting_quality: 'unavailable', cost_quality: 'unknown', subagent_linkage: 'unlinked' })
    expect(result.badges).toHaveLength(3)
  })
})

describe('summarizeWorkTimeQuality', () => {
  it('counts all-measured rows with isUpperBound false', () => {
    const entries = [{ waiting_quality: 'measured' as const }, { waiting_quality: 'measured' as const }]
    expect(summarizeWorkTimeQuality(entries)).toEqual({ measuredCount: 2, upperBoundCount: 0, isUpperBound: false })
  })

  it('counts mixed rows and flags the set as an upper bound', () => {
    const entries = [
      { waiting_quality: 'measured' as const },
      { waiting_quality: 'unavailable' as const },
      { waiting_quality: 'unavailable' as const },
    ]
    expect(summarizeWorkTimeQuality(entries)).toEqual({ measuredCount: 1, upperBoundCount: 2, isUpperBound: true })
  })

  it('treats empty/undefined as measured for the count', () => {
    const entries = [{ waiting_quality: '' as const }, {}]
    expect(summarizeWorkTimeQuality(entries)).toEqual({ measuredCount: 2, upperBoundCount: 0, isUpperBound: false })
  })

  it('returns zeroed counts for an empty set', () => {
    expect(summarizeWorkTimeQuality([])).toEqual({ measuredCount: 0, upperBoundCount: 0, isUpperBound: false })
  })
})

describe('computeAverageCost', () => {
  it('averages over all rows when none are unknown', () => {
    const entries = [
      { cost_quality: 'measured' as const, cost: 10 },
      { cost_quality: 'estimated' as const, cost: 20 },
    ]
    expect(computeAverageCost(entries)).toEqual({ average: 15, excludedCount: 0, includedCount: 2 })
  })

  it('excludes only unknown-cost rows from the average', () => {
    const entries = [
      { cost_quality: 'measured' as const, cost: 10 },
      { cost_quality: 'unknown' as const, cost: 0 },
      { cost_quality: 'measured' as const, cost: 20 },
    ]
    expect(computeAverageCost(entries)).toEqual({ average: 15, excludedCount: 1, includedCount: 2 })
  })

  it('is null when every row is unknown', () => {
    const entries = [
      { cost_quality: 'unknown' as const, cost: 0 },
      { cost_quality: 'unknown' as const, cost: 0 },
    ]
    expect(computeAverageCost(entries)).toEqual({ average: null, excludedCount: 2, includedCount: 0 })
  })

  it('is null for an empty set', () => {
    expect(computeAverageCost([])).toEqual({ average: null, excludedCount: 0, includedCount: 0 })
  })

  it('treats empty/undefined cost_quality as included, not excluded', () => {
    const entries = [{ cost_quality: '' as const, cost: 10 }, { cost: 20 }]
    expect(computeAverageCost(entries)).toEqual({ average: 15, excludedCount: 0, includedCount: 2 })
  })
})

describe('listDistinctAgents', () => {
  it('lists distinct agents sorted alphabetically', () => {
    const entries = [{ agent: 'pi' }, { agent: 'opencode' }, { agent: 'pi' }]
    expect(listDistinctAgents(entries)).toEqual(['opencode', 'pi'])
  })

  it('collapses empty/undefined agent into the legacy sentinel, sorted last', () => {
    const entries = [{ agent: 'pi' }, { agent: '' }, { agent: undefined }]
    expect(listDistinctAgents(entries)).toEqual(['pi', LEGACY_AGENT])
  })

  it('returns an empty list for an empty set', () => {
    expect(listDistinctAgents([])).toEqual([])
  })
})
