import { describe, expect, it, vi } from 'vitest'
import type { TotalsResponse } from '../app/lib/totals-map'
import { loadTeamMemberTotals } from '../app/lib/team-member-totals'

function response(page: number, totalPages: number, groups: Array<{ groupKey: string, activeProjects?: number, workMs: number, cost: number }>): TotalsResponse {
  return { page, totalPages, groups, activeProjectsAvailable: true } as TotalsResponse
}

describe('team member totals', () => {
  it('loads all lifetime member groups in 200-row pages and maps recorded member keys', async () => {
    const first = Array.from({ length: 200 }, (_, i) => ({ groupKey: `member-${i}`, activeProjects: i, workMs: i * 60000, cost: i / 100 }))
    const second = [{ groupKey: 'member-200', activeProjects: 2, workMs: 90_000, cost: 2.5 }]
    const fetch = vi.fn().mockResolvedValueOnce(response(1, 2, first)).mockResolvedValueOnce(response(2, 2, second))

    const result = await loadTeamMemberTotals(fetch)

    expect(fetch.mock.calls).toEqual([
      [{ groupBy: 'member', page: 1, perPage: 200 }],
      [{ groupBy: 'member', page: 2, perPage: 200 }],
    ])
    expect(Object.keys(result)).toHaveLength(201)
    expect(result['member-1']).toEqual({ activeProjects: 1, workMs: 60_000, cost: 0.01 })
    expect(result['member-200']).toEqual({ activeProjects: 2, workMs: 90_000, cost: 2.5 })
    expect(result['missing-member']).toBeUndefined()
  })

  it('returns an empty map only after a successful complete empty response', async () => {
    const fetch = vi.fn().mockResolvedValue(response(1, 0, []))
    await expect(loadTeamMemberTotals(fetch)).resolves.toEqual(Object.create(null))
    expect(fetch).toHaveBeenCalledWith({ groupBy: 'member', page: 1, perPage: 200 })
  })

  it('does not return partial member groups after a later page fails', async () => {
    const failure = new Error('page 2 failed')
    const fetch = vi.fn().mockResolvedValueOnce(response(1, 2, [{ groupKey: 'member-1', activeProjects: 1, workMs: 10, cost: 1 }])).mockRejectedValueOnce(failure)
    await expect(loadTeamMemberTotals(fetch)).rejects.toBe(failure)
  })

  it('propagates unsupported-route errors without returning a raw-record fallback', async () => {
    const unavailable = Object.assign(new Error('route unavailable'), { name: 'TotalsRouteUnavailableError' })
    const fetch = vi.fn().mockRejectedValue(unavailable)
    await expect(loadTeamMemberTotals(fetch)).rejects.toBe(unavailable)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed pagination instead of treating missing groups as zero', async () => {
    const fetch = vi.fn().mockResolvedValue(response(1, 2, []))
    await expect(loadTeamMemberTotals(fetch)).rejects.toThrow('Invalid team member totals pagination response')
  })

  it('rejects older successful responses without the active-project capability or count', async () => {
    const noMarker = { ...response(1, 0, []), activeProjectsAvailable: undefined }
    await expect(loadTeamMemberTotals(vi.fn().mockResolvedValue(noMarker))).rejects.toThrow('Member project totals are unavailable')
    const noCount = { ...response(1, 1, [{ groupKey: 'member-1', workMs: 10, cost: 1 }]) }
    noCount.groups[0]!.activeProjects = undefined
    await expect(loadTeamMemberTotals(vi.fn().mockResolvedValue(noCount))).rejects.toThrow('Member project totals are unavailable')
  })
})
