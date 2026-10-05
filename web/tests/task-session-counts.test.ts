import { describe, expect, it, vi } from 'vitest'
import { loadTaskSessionCounts } from '../app/lib/task-session-counts'

const scope = { client: 'c1', project: 'p1' }
const grouped = (groups: { groupKey: string, distinctSessions: number }[] = [], page = 1, totalPages = 1, totalGroups = groups.length) => ({ groups, page, totalPages, totalGroups })
const records = (items: any[] = [], totalItems = items.length) => ({ items, page: 1, totalPages: totalItems ? 1 : 0, totalItems })
class Unavailable extends Error {}
function ports() {
  return {
    fetchTotals: vi.fn().mockResolvedValue(grouped()),
    readEntries: vi.fn().mockResolvedValue(records()),
    isUnavailable: (error: unknown) => error instanceof Unavailable,
  }
}

describe('bounded all-time task session counts', () => {
  it('uses distinct groups, corrects one blank per task, and does not use entries', async () => {
    const p = ports()
    p.fetchTotals.mockResolvedValue(grouped([
      { groupKey: 't1', distinctSessions: 4, entries: 10 } as any,
      { groupKey: 't2', distinctSessions: 1 },
    ]))
    p.readEntries.mockResolvedValue(records([
      { client: 'c1', project: 'p1', task: 't1', session_id: '' },
      { client: 'c1', project: 'p1', task: 't1', session_id: '' },
      { client: 'c1', project: 'p1', task: 't2', session_id: '' },
      { client: 'foreign', project: 'other', task: 't1', session_id: '' },
    ]))
    expect(await loadTaskSessionCounts(scope, p)).toEqual({ t1: 3, t2: 0 })
    expect(p.fetchTotals).toHaveBeenCalledWith({ groupBy: 'task', filters: scope, page: 1, perPage: 200, sort: 'group_key' })
    expect(p.readEntries).toHaveBeenCalledWith(1, 2000, expect.objectContaining({
      filter: 'client = "c1" && project = "p1" && session_id = ""', fields: 'task,session_id,client,project',
    }))
  })
  it('pages complete groups in stable order without per-card requests', async () => {
    const p = ports()
    const first = Array.from({ length: 200 }, (_, i) => ({ groupKey: `t${i}`, distinctSessions: 1 }))
    p.fetchTotals.mockResolvedValueOnce(grouped(first, 1, 2, 201)).mockResolvedValueOnce(grouped([{ groupKey: 'last', distinctSessions: 2 }], 2, 2, 201))
    const result = await loadTaskSessionCounts(scope, p)
    expect(Object.keys(result)).toHaveLength(201)
    expect(result.last).toBe(2)
    expect(p.fetchTotals).toHaveBeenCalledTimes(2)
    expect(p.readEntries).toHaveBeenCalledTimes(1)
  })
  it('falls back to complete all-time rows and deduplicates nonempty IDs per task', async () => {
    const p = ports()
    p.fetchTotals.mockRejectedValue(new Unavailable())
    const entry = (task: string, session_id: string) => ({ ...scope, task, session_id, started_at: '2001-01-01' })
    p.readEntries.mockResolvedValue(records([
      entry('t1', 'same'), entry('t1', 'same'), entry('t1', 'old'), entry('t1', ''),
      entry('t2', 'same'), entry('blank', ''), { ...entry('t1', 'foreign'), project: 'other' },
    ]))
    expect(await loadTaskSessionCounts(scope, p)).toEqual({ t1: 2, t2: 1, blank: 0 })
    expect(p.readEntries.mock.calls[0][2].filter).toBe('client = "c1" && project = "p1"')
    expect(p.readEntries.mock.calls[0][2].filter).not.toContain('started_at')
  })
  it('establishes known zero only after complete empty authorities', async () => {
    expect(await loadTaskSessionCounts(scope, ports())).toEqual({})
  })
  it.each([NaN, Infinity, -1, 1.5, undefined])('rejects invalid distinct count %s', async count => {
    const p = ports()
    p.fetchTotals.mockResolvedValue(grouped([{ groupKey: 't1', distinctSessions: count as number }]))
    await expect(loadTaskSessionCounts(scope, p)).rejects.toThrow()
  })
  it.each(['cap', 'missing groups', 'page failure', 'denied', 'network', 'blank cap', 'fallback cap', 'bad correction'])('never invents zero for %s', async state => {
    const p = ports()
    if (state === 'cap') p.fetchTotals.mockResolvedValue(grouped([], 1, 6, 1200))
    if (state === 'missing groups') p.fetchTotals.mockResolvedValue(grouped([], 1, 1, 1))
    if (state === 'page failure') p.fetchTotals.mockResolvedValueOnce(grouped(Array.from({ length: 200 }, (_, i) => ({ groupKey: String(i), distinctSessions: 1 })), 1, 2, 201)).mockRejectedValueOnce(new Error('Denied'))
    if (state === 'denied' || state === 'network') p.fetchTotals.mockRejectedValue(new Error(state))
    if (state === 'blank cap') p.readEntries.mockResolvedValue(records([], 2001))
    if (state === 'fallback cap') { p.fetchTotals.mockRejectedValue(new Unavailable()); p.readEntries.mockResolvedValue(records([], 2001)) }
    if (state === 'bad correction') {
      p.fetchTotals.mockResolvedValue(grouped([{ groupKey: 't1', distinctSessions: 0 }]))
      p.readEntries.mockResolvedValue(records([{ ...scope, task: 't1', session_id: '' }]))
    }
    await expect(loadTaskSessionCounts(scope, p)).rejects.toThrow()
    if (state === 'denied' || state === 'network') expect(p.readEntries).not.toHaveBeenCalled()
  })
  it('quotes scoped relation filters without allowing filter injection', async () => {
    const p = ports()
    await loadTaskSessionCounts({ client: 'c"\\', project: 'p" || true' }, p)
    expect(p.readEntries.mock.calls[0][2].filter).toBe(`client = ${JSON.stringify('c"\\')} && project = ${JSON.stringify('p" || true')} && session_id = ""`)
  })
})
