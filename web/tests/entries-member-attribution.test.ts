import { describe, expect, it } from 'vitest'
import { pageMemberAttribution, sessionMemberAttribution } from '../app/lib/entries-member-attribution'

const catalog = [{ id: 'inactive-member', name: 'Mika', active: false }]

describe('sessionMemberAttribution', () => {
  it('resolves one historical owner, including an inactive catalog member', () => {
    expect(sessionMemberAttribution({ available: true, distinctMember: 1, sampleMember: 'inactive-member', unassignedEntries: 0 }, catalog))
      .toEqual({ kind: 'named', name: 'Mika' })
  })

  it('uses generic assigned for unknown catalog ids and unavailable catalogs', () => {
    expect(sessionMemberAttribution({ available: true, distinctMember: 1, sampleMember: 'unknown-id', unassignedEntries: 0 }, catalog))
      .toEqual({ kind: 'assigned' })
    expect(sessionMemberAttribution({ available: true, distinctMember: 1, sampleMember: 'inactive-member', unassignedEntries: 0 }, undefined))
      .toEqual({ kind: 'assigned' })
  })

  it('keeps page-local mixed attribution explicit and legacy rows unknown', () => {
    expect(pageMemberAttribution(['inactive-member', ''], catalog)).toEqual({ kind: 'mixed' })
    expect(pageMemberAttribution(['inactive-member', undefined], catalog)).toEqual({ kind: 'unknown' })
    expect(pageMemberAttribution(['inactive-member'], catalog)).toEqual({ kind: 'named', name: 'Mika' })
  })

  it('requires explicit true capability even when stale counts are populated', () => {
    const populated = { distinctMember: 1, sampleMember: 'inactive-member', unassignedEntries: 0 }
    expect(sessionMemberAttribution({ available: false, ...populated }, catalog)).toEqual({ kind: 'unknown' })
    expect(sessionMemberAttribution({ available: false, ...populated })).toEqual({ kind: 'unknown' })
    expect(sessionMemberAttribution({ ...populated }, catalog)).toEqual({ kind: 'unknown' })
    expect(sessionMemberAttribution({ ...populated })).toEqual({ kind: 'unknown' })
  })

  it('distinguishes multiple, mixed, wholly unassigned and legacy unknown summaries', () => {
    expect(sessionMemberAttribution({ available: true, distinctMember: 2, sampleMember: 'inactive-member', unassignedEntries: 0 }, catalog))
      .toEqual({ kind: 'multiple' })
    expect(sessionMemberAttribution({ available: true, distinctMember: 1, sampleMember: 'inactive-member', unassignedEntries: 1 }, catalog))
      .toEqual({ kind: 'mixed' })
    expect(sessionMemberAttribution({ available: true, distinctMember: 0, unassignedEntries: 2 }, catalog))
      .toEqual({ kind: 'unassigned' })
    expect(sessionMemberAttribution({ available: false, distinctMember: 0, unassignedEntries: 2 }, catalog))
      .toEqual({ kind: 'unknown' })
    expect(sessionMemberAttribution({ available: true }, catalog)).toEqual({ kind: 'unknown' })
  })
})
