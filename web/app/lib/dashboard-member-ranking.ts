export interface MemberCostGroup {
  groupKey: string
  entries: number
  cost: number
  costKnownSum: number
  costKnownEntries: number
  costUnknownEntries: number
  costEstimatedEntries: number
  workMs: number
}

export interface MemberCostRow extends MemberCostGroup {
  id: string
  label: string
  costState: 'known' | 'estimated' | 'unknown' | 'incomplete'
  resolved: boolean
}

export function rankMemberCosts(groups: MemberCostGroup[], names: ReadonlyMap<string, string>): MemberCostRow[] {
  return groups
    .filter(group => group.entries > 0)
    .map((group) => {
      const costState: MemberCostRow['costState'] = group.costKnownEntries === 0
        ? 'unknown'
        : group.costUnknownEntries > 0
          ? 'incomplete'
          : group.costEstimatedEntries > 0 ? 'estimated' : 'known'
      return {
        ...group,
        id: group.groupKey,
        label: group.groupKey ? names.get(group.groupKey) || '' : '',
        resolved: Boolean(group.groupKey && names.has(group.groupKey)),
        costState,
      }
    })
    .sort((a, b) => b.costKnownSum - a.costKnownSum || a.label.localeCompare(b.label))
    .slice(0, 5)
}

export function memberCostLabel(row: MemberCostRow): string {
  return row.costState === 'unknown' ? '—' : String(row.costKnownSum)
}

/** Interpret only the totals endpoint's documented member-group failure envelopes. */
export function memberRankingFailureState(error: unknown, routeUnavailable: boolean): 'error' | 'unavailable' {
  if (routeUnavailable) return 'unavailable'
  const response = error as { status?: unknown, data?: { status?: unknown, data?: { errors?: unknown }, message?: unknown } } | null
  const status = response?.status ?? response?.data?.status
  if (status === 400 && Array.isArray(response?.data?.data?.errors)
    && response.data.data.errors.includes('invalid_group_by')) return 'unavailable'
  if (status === 500 && response?.data?.message === 'Failed to compute totals.') return 'unavailable'
  return 'error'
}
