import { describe, expect, it, vi } from 'vitest'
import type { TotalsResponse } from '../app/lib/totals-map'
import { loadProjectMemberTotals } from '../app/lib/project-member-totals'

function row(groupKey: string, workMs = 0, cost = 0, overrides: Record<string, unknown> = {}) {
  return { groupKey, workMs, cost, entries: 1, costUnknownEntries: 0, costEstimatedEntries: 0, ...overrides }
}
function response(page: number, totalPages: number, groups: ReturnType<typeof row>[], totalGroups = groups.length): TotalsResponse {
  return { page, totalPages, totalGroups, groups } as TotalsResponse
}

const scope = { client: 'c1', project: 'p1' }

describe('project member totals', () => {
  it('fetches all-time project-filtered member groups, including inactive history and unknown attribution', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(1, 2, Array.from({ length: 200 }, (_, i) => row(`m${i}`, i, 2)), 202))
      .mockResolvedValueOnce(response(2, 2, [row('inactive', 42, 0, { costUnknownEntries: 1 }), row('', 9, 0)], 202))
    const result = await loadProjectMemberTotals(fetch, scope)
    expect(fetch.mock.calls.map(([request]) => request)).toEqual([
      { groupBy: 'member', filters: scope, page: 1, perPage: 200 },
      { groupBy: 'member', filters: scope, page: 2, perPage: 200 },
    ])
    expect(result.members.inactive).toEqual({ workMs: 42, cost: 0, entries: 1, costUnknownEntries: 1, costEstimatedEntries: 0 })
    expect(result.unattributed?.workMs).toBe(9)
    expect(Object.keys(result.members)).toHaveLength(201)
  })

  it('accepts complete empty history but does not infer empty history from legacy or partial responses', async () => {
    await expect(loadProjectMemberTotals(vi.fn().mockResolvedValue(response(1, 0, [])), scope)).resolves.toEqual({ members: Object.create(null), unattributed: null })
    await expect(loadProjectMemberTotals(vi.fn().mockResolvedValue({ ...response(1, 0, []), totalPages: undefined }), scope)).rejects.toThrow()
    const fetch = vi.fn().mockResolvedValueOnce(response(1, 2, [row('m1')])).mockRejectedValueOnce(new Error('page failed'))
    await expect(loadProjectMemberTotals(fetch, scope)).rejects.toThrow('page failed')
  })

  it.each([
    { cost: NaN }, { cost: Infinity }, { cost: -1 }, { workMs: NaN }, { entries: -1 },
  ])('rejects malformed aggregate values rather than publishing false totals: $cost', async invalid => {
    await expect(loadProjectMemberTotals(vi.fn().mockResolvedValue(response(1, 1, [row('m1', 10, 1, invalid)])), scope)).rejects.toThrow()
  })

  it('rejects duplicate groups and inconsistent pagination metadata', async () => {
    await expect(loadProjectMemberTotals(vi.fn().mockResolvedValue(response(1, 1, [row('m1'), row('m1')])), scope)).rejects.toThrow()
    const inconsistent = { ...response(1, 2, [row('m1')], 2), totalGroups: 1 }
    await expect(loadProjectMemberTotals(vi.fn().mockResolvedValue(inconsistent), scope)).rejects.toThrow()
  })
})
