/**
 * Unit tests for `app/lib/entries-session-group.ts` — the pure "group by
 * session" presentation over one already-fetched PAGE of entries
 * (app/pages/entries/index.vue). Never re-sorts/re-paginates, only groups
 * and sums the rows it's given.
 */
import { describe, expect, it } from 'vitest'
import { groupEntriesBySession, type SessionGroupEntryLike } from '../app/lib/entries-session-group'

function entry(overrides: Partial<SessionGroupEntryLike> = {}): SessionGroupEntryLike {
  return {
    id: 'e1',
    session_id: 'sess-1',
    session_name: '',
    started_at: '2026-01-01T10:00:00.000Z',
    work_ms: 1000,
    cost: 1,
    cost_quality: 'measured',
    ...overrides,
  }
}

describe('groupEntriesBySession', () => {
  it('groups rows sharing the same session_id', () => {
    const rows = [
      entry({ id: 'a', session_id: 's1' }),
      entry({ id: 'b', session_id: 's1' }),
      entry({ id: 'c', session_id: 's2' }),
    ]
    const groups = groupEntriesBySession(rows)
    expect(groups).toHaveLength(2)
    const s1 = groups.find(g => g.sessionId === 's1')!
    expect(s1.entries.map(e => e.id)).toEqual(['a', 'b'])
  })

  it('orders groups by their most recent entry, descending', () => {
    const rows = [
      entry({ id: 'a', session_id: 's1', started_at: '2026-01-01T10:00:00.000Z' }),
      entry({ id: 'b', session_id: 's2', started_at: '2026-01-03T10:00:00.000Z' }),
      entry({ id: 'c', session_id: 's3', started_at: '2026-01-02T10:00:00.000Z' }),
    ]
    const groups = groupEntriesBySession(rows)
    expect(groups.map(g => g.sessionId)).toEqual(['s2', 's3', 's1'])
  })

  it('uses the most recent started_at within a group, not the first row', () => {
    const rows = [
      entry({ id: 'a', session_id: 's1', started_at: '2026-01-01T10:00:00.000Z' }),
      entry({ id: 'b', session_id: 's1', started_at: '2026-01-05T10:00:00.000Z' }),
    ]
    const groups = groupEntriesBySession(rows)
    expect(groups[0]!.mostRecentStartedAt).toBe('2026-01-05T10:00:00.000Z')
  })

  it('sums work_ms across the group', () => {
    const rows = [
      entry({ id: 'a', session_id: 's1', work_ms: 1000 }),
      entry({ id: 'b', session_id: 's1', work_ms: 2500 }),
    ]
    expect(groupEntriesBySession(rows)[0]!.workMs).toBe(3500)
  })

  it('sums cost across the group, excluding cost_quality: unknown rows', () => {
    const rows = [
      entry({ id: 'a', session_id: 's1', cost: 1, cost_quality: 'measured' }),
      entry({ id: 'b', session_id: 's1', cost: 0, cost_quality: 'unknown' }),
      entry({ id: 'c', session_id: 's1', cost: 2, cost_quality: 'estimated' }),
    ]
    expect(groupEntriesBySession(rows)[0]!.cost).toBe(3)
  })

  it('picks the first non-empty session_name among the group as the label source', () => {
    const rows = [
      entry({ id: 'a', session_id: 's1', session_name: '' }),
      entry({ id: 'b', session_id: 's1', session_name: 'Refactor auth' }),
    ]
    expect(groupEntriesBySession(rows)[0]!.sessionName).toBe('Refactor auth')
  })

  it('groups rows with no session_id together under the empty-string key', () => {
    const rows = [
      entry({ id: 'a', session_id: '' }),
      entry({ id: 'b', session_id: '' }),
      entry({ id: 'c', session_id: 's1' }),
    ]
    const groups = groupEntriesBySession(rows)
    const none = groups.find(g => g.sessionId === '')!
    expect(none.entries.map(e => e.id)).toEqual(['a', 'b'])
  })

  it('returns an empty array for an empty input', () => {
    expect(groupEntriesBySession([])).toEqual([])
  })

  it('counts a single-row session correctly', () => {
    const groups = groupEntriesBySession([entry({ id: 'a', session_id: 's1' })])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.entries).toHaveLength(1)
  })
})
