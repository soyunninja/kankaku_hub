import { describe, expect, it, vi } from 'vitest'
import type { TotalsResponse } from '../app/lib/totals-map'
import { loadTaskTotalsPages } from '../app/lib/task-totals-pages'

function response(page: number, totalPages: number, groups: Array<{ groupKey: string, cost: number, workMs: number, distinctSessions: number }>): TotalsResponse {
  return { page, totalPages, groups } as TotalsResponse
}

describe('task totals pagination', () => {
  it('collects more than 200 groups with stable keys, correct sessions, and no no-task bucket or duplicate sums', async () => {
    const first = Array.from({ length: 200 }, (_, i) => ({ groupKey: `task-${i}`, cost: i + 1, workMs: i * 10, distinctSessions: i + 2 }))
    const second = [
      { groupKey: '', cost: 500, workMs: 5000, distinctSessions: 7 },
      { groupKey: 'task-0', cost: 900, workMs: 9000, distinctSessions: 99 },
      ...Array.from({ length: 5 }, (_, i) => ({ groupKey: `task-${200 + i}`, cost: 300 + i, workMs: 400 + i, distinctSessions: i + 1 })),
    ]
    const fetch = vi.fn().mockResolvedValueOnce(response(1, 2, first)).mockResolvedValueOnce(response(2, 2, second))
    const result = await loadTaskTotalsPages(fetch)
    expect(fetch.mock.calls).toEqual([
      [{ groupBy: 'task', page: 1, perPage: 200, sort: '-cost' }],
      [{ groupBy: 'task', page: 2, perPage: 200, sort: '-cost' }],
    ])
    expect(Object.keys(result.byTask)).toHaveLength(205)
    expect(Object.keys(result.sessionsByTask)).toHaveLength(205)
    expect(result.byTask['task-0']).toEqual({ cost: 1, workMs: 0 })
    expect(result.sessionsByTask['task-0']).toBe(2)
    expect(result.byTask['task-204']).toEqual({ cost: 304, workMs: 404 })
    expect(result.sessionsByTask['task-204']).toBe(5)
    expect(result.byTask['']).toBeUndefined()
    expect(Object.keys(result.byTask).slice(0, 2)).toEqual(['task-0', 'task-1'])
  })

  it('rejects a failed later page instead of returning partial maps', async () => {
    const failure = new Error('page 2 failed')
    const fetch = vi.fn().mockResolvedValueOnce(response(1, 2, [{ groupKey: 'task-1', cost: 5, workMs: 10, distinctSessions: 2 }])).mockRejectedValueOnce(failure)
    await expect(loadTaskTotalsPages(fetch)).rejects.toBe(failure)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each([
    response(1, 20000, []),
    response(1, 2, []),
    response(2, 1, []),
    response(1, Number.NaN, []),
    response(1, 0, [{ groupKey: 'task-1', cost: 1, workMs: 1, distinctSessions: 1 }]),
    response(2, 0, []),
  ])('rejects malformed or runaway page metadata', async (bad) => {
    const fetch = vi.fn().mockResolvedValue(bad)
    await expect(loadTaskTotalsPages(fetch)).rejects.toThrow('Invalid task totals pagination response')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects repeated pages or changed totalPages without looping', async () => {
    const group = { groupKey: 'a', cost: 1, workMs: 2, distinctSessions: 3 }
    const fetch = vi.fn().mockResolvedValueOnce(response(1, 2, [group])).mockResolvedValueOnce(response(1, 3, [group]))
    await expect(loadTaskTotalsPages(fetch)).rejects.toThrow('Invalid task totals pagination response')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('returns empty maps for an empty first page with zero total_pages, as the PocketBase route emits', async () => {
    const fetch = vi.fn().mockResolvedValue(response(1, 0, []))
    const result = await loadTaskTotalsPages(fetch)
    expect(Object.keys(result.byTask)).toEqual([])
    expect(Object.keys(result.sessionsByTask)).toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
