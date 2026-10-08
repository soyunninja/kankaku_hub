import type { TeamMemberTotal } from './team-member-totals'

export interface DepartmentMemberTotal {
  workMs: number
  cost: number
}

export interface DepartmentTotalMember {
  id: string
  department: string
}

export type DepartmentCostShare = {
  state: 'known' | 'zero' | 'unavailable'
  percentage: number | null
}

/** Sum only loaded totals belonging to current team members, including unassigned members. */
export function sumTeamMemberCost(
  members: readonly Pick<DepartmentTotalMember, 'id'>[],
  totals: Readonly<Record<string, Pick<TeamMemberTotal, 'cost'>>>,
): number {
  return members.reduce((sum, member) => sum + (totals[member.id]?.cost ?? 0), 0)
}

/** Calculate a safe department share of the current team's lifetime member cost. */
export function departmentCostShare(departmentCost: number, teamCost: number): DepartmentCostShare {
  if (!Number.isFinite(departmentCost) || departmentCost < 0 || !Number.isFinite(teamCost) || teamCost < 0) {
    return { state: 'unavailable', percentage: null }
  }
  if (teamCost === 0) return departmentCost === 0
    ? { state: 'zero', percentage: null }
    : { state: 'unavailable', percentage: null }
  const ratio = departmentCost / teamCost * 100
  if (!Number.isFinite(ratio) || ratio < 0) return { state: 'unavailable', percentage: null }
  return { state: 'known', percentage: Math.min(100, Number(ratio.toFixed(2))) }
}

/** Roll up loaded lifetime member totals by current department membership. */
export function sumDepartmentMemberTotals(
  departments: readonly { id: string }[],
  members: readonly DepartmentTotalMember[],
  totals: Readonly<Record<string, Pick<TeamMemberTotal, 'workMs' | 'cost'>>>,
): Record<string, DepartmentMemberTotal> {
  const byDepartment: Record<string, DepartmentMemberTotal> = Object.create(null)
  for (const department of departments) byDepartment[department.id] = { workMs: 0, cost: 0 }

  for (const member of members) {
    if (!member.department || !Object.hasOwn(byDepartment, member.department)) continue
    const total = totals[member.id]
    if (!total) continue
    byDepartment[member.department]!.workMs += total.workMs
    byDepartment[member.department]!.cost += total.cost
  }

  return byDepartment
}
