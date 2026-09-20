import { describe, expect, it } from 'vitest'
import { groupBySession, MIXED, type SessionEntryLike } from '../app/lib/session-aggregate'

function entry(overrides: Partial<SessionEntryLike> & { session_id: string, started_at: string }): SessionEntryLike {
  return {
    client: 'client-a',
    project: 'project-a',
    task: 'task-a',
    machine: 'mac-mini',
    agent: 'pi',
    repo_project: '/home/dev/repo',
    session_name: 'Refactor auth',
    wall_ms: 0,
    waiting_ms: 0,
    work_ms: 0,
    cost: 0,
    ...overrides,
  }
}

describe('groupBySession', () => {
  it('groups a single session into one summary with summed totals', () => {
    const entries = [
      entry({ id: 'e1', session_id: 's1', started_at: '2026-01-01T10:00:00.000Z', wall_ms: 1000, waiting_ms: 100, work_ms: 900, cost: 0.1 }),
      entry({ id: 'e2', session_id: 's1', started_at: '2026-01-01T10:05:00.000Z', wall_ms: 2000, waiting_ms: 200, work_ms: 1800, cost: 0.2 }),
    ]
    const [summary] = groupBySession(entries)

    expect(summary).toMatchObject({
      sessionId: 's1',
      sessionName: 'Refactor auth',
      firstActivity: '2026-01-01T10:00:00.000Z',
      lastActivity: '2026-01-01T10:05:00.000Z',
      entryCount: 2,
      wallMs: 3000,
      waitingMs: 300,
      workMs: 2700,
      cost: 0.30000000000000004,
      client: 'client-a',
      project: 'project-a',
      task: 'task-a',
      machine: 'mac-mini',
      agent: 'pi',
      repoProject: '/home/dev/repo',
    })
    expect(summary!.entryIds).toEqual(['e1', 'e2'])
  })

  it('splits multiple sessions into separate summaries, most-recent-first', () => {
    const entries = [
      entry({ id: 'e1', session_id: 's-old', started_at: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'e2', session_id: 's-new', started_at: '2026-01-05T00:00:00.000Z' }),
    ]
    const summaries = groupBySession(entries)
    expect(summaries.map(s => s.sessionId)).toEqual(['s-new', 's-old'])
  })

  it('marks client/project/task as mixed when they disagree within one session', () => {
    const entries = [
      entry({ id: 'e1', session_id: 's1', started_at: '2026-01-01T00:00:00.000Z', client: 'client-a', project: 'project-a', task: 'task-a' }),
      entry({ id: 'e2', session_id: 's1', started_at: '2026-01-01T00:01:00.000Z', client: 'client-b', project: 'project-a', task: 'task-b' }),
    ]
    const [summary] = groupBySession(entries)
    expect(summary!.client).toBe(MIXED)
    expect(summary!.project).toBe('project-a') // unanimous, stays as-is
    expect(summary!.task).toBe(MIXED)
  })

  it('marks agent as mixed when it disagrees, and keeps a uniform agent as-is', () => {
    const mixed = groupBySession([
      entry({ id: 'e1', session_id: 's1', started_at: '2026-01-01T00:00:00.000Z', agent: 'pi' }),
      entry({ id: 'e2', session_id: 's1', started_at: '2026-01-01T00:01:00.000Z', agent: 'opencode' }),
    ])
    expect(mixed[0]!.agent).toBe(MIXED)

    const uniform = groupBySession([
      entry({ id: 'e1', session_id: 's2', started_at: '2026-01-01T00:00:00.000Z', agent: 'pi' }),
      entry({ id: 'e2', session_id: 's2', started_at: '2026-01-01T00:01:00.000Z', agent: 'pi' }),
    ])
    expect(uniform[0]!.agent).toBe('pi')
  })

  it('returns an empty array for an empty input', () => {
    expect(groupBySession([])).toEqual([])
  })

  it('treats legacy rows with an empty agent/session_name as unanimous, not mixed', () => {
    const entries = [
      entry({ id: 'e1', session_id: 's1', started_at: '2026-01-01T00:00:00.000Z', agent: undefined, session_name: undefined }),
      entry({ id: 'e2', session_id: 's1', started_at: '2026-01-01T00:01:00.000Z', agent: undefined, session_name: undefined }),
    ]
    const [summary] = groupBySession(entries)
    expect(summary!.agent).toBe('')
    expect(summary!.sessionName).toBe('')
  })

  it('picks the majority session_name when rows disagree, breaking ties by first appearance', () => {
    const entries = [
      entry({ id: 'e1', session_id: 's1', started_at: '2026-01-01T00:00:00.000Z', session_name: 'Old name' }),
      entry({ id: 'e2', session_id: 's1', started_at: '2026-01-01T00:01:00.000Z', session_name: 'New name' }),
      entry({ id: 'e3', session_id: 's1', started_at: '2026-01-01T00:02:00.000Z', session_name: 'New name' }),
    ]
    const [summary] = groupBySession(entries)
    expect(summary!.sessionName).toBe('New name')
  })

  it('falls back to the first entry with a repo_project when it disagrees mid-session', () => {
    const entries = [
      entry({ id: 'e1', session_id: 's1', started_at: '2026-01-01T00:00:00.000Z', repo_project: '/repo/a' }),
      entry({ id: 'e2', session_id: 's1', started_at: '2026-01-01T00:01:00.000Z', repo_project: '/repo/b' }),
    ]
    const [summary] = groupBySession(entries)
    expect(summary!.repoProject).toBe('/repo/a')
  })

  it('leaves repoProject undefined when no entry in the session has one', () => {
    const entries = [
      entry({ id: 'e1', session_id: 's1', started_at: '2026-01-01T00:00:00.000Z', repo_project: undefined }),
    ]
    const [summary] = groupBySession(entries)
    expect(summary!.repoProject).toBeUndefined()
  })

  it('falls back to the first entry with a session_dir when it disagrees mid-session', () => {
    const entries = [
      entry({ id: 'e1', session_id: 's1', started_at: '2026-01-01T00:00:00.000Z', session_dir: '/home/dev/.pi/sessions/a' }),
      entry({ id: 'e2', session_id: 's1', started_at: '2026-01-01T00:01:00.000Z', session_dir: '/home/dev/.pi/sessions/b' }),
    ]
    const [summary] = groupBySession(entries)
    expect(summary!.sessionDir).toBe('/home/dev/.pi/sessions/a')
  })

  it('leaves sessionDir undefined when no entry in the session has one', () => {
    const entries = [
      entry({ id: 'e1', session_id: 's1', started_at: '2026-01-01T00:00:00.000Z', session_dir: undefined }),
    ]
    const [summary] = groupBySession(entries)
    expect(summary!.sessionDir).toBeUndefined()
  })

  it('drops rows without a session_id rather than grouping them together', () => {
    const entries = [
      entry({ id: 'e1', session_id: '', started_at: '2026-01-01T00:00:00.000Z' }),
      entry({ id: 'e2', session_id: 's1', started_at: '2026-01-01T00:01:00.000Z' }),
    ]
    const summaries = groupBySession(entries)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]!.sessionId).toBe('s1')
  })
})
