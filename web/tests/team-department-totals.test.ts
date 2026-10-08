import { describe, expect, it } from 'vitest'
import { sumDepartmentMemberTotals, sumTeamMemberCost, departmentCostShare } from '../app/lib/team-department-totals'

const members = [
  { id: 'active-a', department: 'design', active: true },
  { id: 'inactive-a', department: 'design', active: false },
  { id: 'active-b', department: 'engineering', active: true },
  { id: 'unassigned', department: '', active: true },
]

const totals = {
  'active-a': { activeProjects: 2, workMs: 60_000, cost: 1.25 },
  'inactive-a': { activeProjects: 7, workMs: 120_000, cost: 2.5 },
  'active-b': { activeProjects: 3, workMs: 30_000, cost: 0.75 },
  unassigned: { activeProjects: 0, workMs: 0, cost: 0.75 },
  unrelated: { activeProjects: 99, workMs: 900_000, cost: 99 },
}

describe('department member totals', () => {
  it('sums only work and cost for all current department members, including inactive members', () => {
    expect(sumDepartmentMemberTotals([{ id: 'design' }, { id: 'engineering' }, { id: 'empty' }], members, totals)).toEqual({
      design: { workMs: 180_000, cost: 3.75 },
      engineering: { workMs: 30_000, cost: 0.75 },
      empty: { workMs: 0, cost: 0 },
    })
  })

  it('returns zero totals for empty departments and members without activity after complete loading', () => {
    expect(sumDepartmentMemberTotals([{ id: 'design' }], [
      { id: 'no-activity', department: 'design' },
      { id: 'unassigned', department: '' },
    ], {})).toEqual({ design: { workMs: 0, cost: 0 } })
    expect(sumDepartmentMemberTotals([], [], {})).toEqual({})
  })

  it('is independent of filtered member lists and excludes unassigned members', () => {
    expect(sumDepartmentMemberTotals([{ id: 'design' }, { id: 'engineering' }], members, totals)).toEqual({
      design: { workMs: 180_000, cost: 3.75 },
      engineering: { workMs: 30_000, cost: 0.75 },
    })
    const rollup = sumDepartmentMemberTotals([{ id: 'design' }, { id: 'engineering' }], members, totals)
    expect(Object.hasOwn(rollup, '')).toBe(false)
    expect(rollup.design?.workMs).toBe(180_000)
  })

  it('uses every current member, including unassigned and inactive, but excludes orphan totals from the team denominator', () => {
    expect(sumTeamMemberCost(members, totals)).toBe(5.25)
    expect(sumTeamMemberCost(members.filter(member => member.id !== 'inactive-a'), totals)).toBe(2.75)
  })

  it('returns known, zero, unavailable, and clamped department cost shares', () => {
    expect(departmentCostShare(1.25, 5.25)).toEqual({ state: 'known', percentage: 23.81 })
    expect(departmentCostShare(0, 0)).toEqual({ state: 'zero', percentage: null })
    expect(departmentCostShare(1, 0)).toEqual({ state: 'unavailable', percentage: null })
    expect(departmentCostShare(12, 5)).toEqual({ state: 'known', percentage: 100 })
    for (const [department, team] of [[-1, 5], [1, -1], [Number.NaN, 5], [1, Number.POSITIVE_INFINITY]]) {
      expect(departmentCostShare(department!, team!)).toEqual({ state: 'unavailable', percentage: null })
    }
  })
})
