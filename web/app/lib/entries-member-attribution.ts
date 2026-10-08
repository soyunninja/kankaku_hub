export type MemberAttribution =
  | { kind: 'named', name: string }
  | { kind: 'assigned' | 'multiple' | 'mixed' | 'unassigned' | 'unknown' }

export interface MemberSummary {
  available?: boolean
  distinctMember?: number
  sampleMember?: string
  unassignedEntries?: number
}

/** Resolve a server-provided historical summary without exposing IDs. */
export function sessionMemberAttribution(
  summary: MemberSummary,
  catalog?: readonly { id: string, name: string }[],
): MemberAttribution {
  if (summary.available !== true || summary.distinctMember === undefined || summary.unassignedEntries === undefined) return { kind: 'unknown' }
  if (summary.distinctMember < 0 || summary.unassignedEntries < 0) return { kind: 'unknown' }
  if (summary.distinctMember === 0) return summary.unassignedEntries > 0 ? { kind: 'unassigned' } : { kind: 'unknown' }
  if (summary.unassignedEntries > 0) return { kind: 'mixed' }
  if (summary.distinctMember > 1) return { kind: 'multiple' }
  const member = catalog?.find(row => row.id === summary.sampleMember)
  return member ? { kind: 'named', name: member.name } : { kind: 'assigned' }
}

/** A fallback page group is explicitly scoped to the rows on this page. */
export function pageMemberAttribution(members: readonly (string | undefined)[], catalog?: readonly { id: string, name: string }[]): MemberAttribution {
  if (members.length === 0 || members.some(member => member === undefined)) return { kind: 'unknown' }
  const ids = [...new Set(members.filter((member): member is string => !!member))]
  const unassigned = members.some(member => member === '')
  if (ids.length === 0) return { kind: 'unassigned' }
  if (unassigned) return { kind: 'mixed' }
  if (ids.length > 1) return { kind: 'multiple' }
  const member = catalog?.find(row => row.id === ids[0])
  return member ? { kind: 'named', name: member.name } : { kind: 'assigned' }
}
