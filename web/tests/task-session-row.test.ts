/**
 * Unit tests for `app/lib/task-session-row.ts`'s pure mappers —
 * `sessionTotalToRow` (totals-backed `SessionTotal` -> `TaskSessionRow`)
 * and `sessionSummaryToRow` (fallback `SessionSummary` -> `TaskSessionRow`),
 * the shared view model `components/tasks/TaskDetailSheet.vue` renders
 * regardless of which source `app/pages/tasks/index.vue` used.
 */
import { describe, expect, it } from 'vitest'
import { sessionSummaryToRow, sessionTotalToRow } from '../app/lib/task-session-row'
import { MIXED, type SessionSummary } from '../app/lib/session-aggregate'
import type { SessionTotal } from '../app/composables/useSessions'

function sessionTotal(overrides: Partial<SessionTotal> = {}): SessionTotal {
  return {
    entries: 2,
    wallMs: 1000,
    workMs: 900,
    waitingMs: 100,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cost: 0.5,
    waitingUnavailableEntries: 0,
    costUnknownEntries: 0,
    costEstimatedEntries: 0,
    costKnownEntries: 2,
    costKnownSum: 0.5,
    unlinkedEntries: 0,
    distinctSessions: 1,
    count: 2,
    groupKey: 'sess-1',
    groupKey2: '',
    sessionName: 'Refactor auth',
    minStartedAt: '2026-01-01T10:00:00.000Z',
    maxEndedAt: '2026-01-01T10:20:00.000Z',
    distinctClient: 1,
    sampleClient: 'client-a',
    distinctProject: 1,
    sampleProject: 'project-a',
    distinctTask: 1,
    sampleTask: 'task-a',
    machine: 'mac-mini',
    distinctAgent: 1,
    sampleAgent: 'pi',
    sessionId: 'sess-1',
    elapsedMs: 20 * 60 * 1000,
    mixed: false,
    ...overrides,
  }
}

function sessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: 'sess-1',
    sessionName: 'Refactor auth',
    firstActivity: '2026-01-01T10:00:00.000Z',
    lastActivity: '2026-01-01T10:20:00.000Z',
    entryCount: 2,
    workMs: 900,
    workMsMayOverlap: true,
    wallMs: 1000,
    elapsedMs: 20 * 60 * 1000,
    waitingMs: 100,
    cost: 0.5,
    client: 'client-a',
    project: 'project-a',
    task: 'task-a',
    machine: 'mac-mini',
    agent: 'pi',
    repoProject: '/home/dev/repo',
    sessionDir: undefined,
    entryIds: ['e1', 'e2'],
    ...overrides,
  }
}

describe('sessionTotalToRow', () => {
  it('maps a single-agent, single-entry-group session straight across', () => {
    const row = sessionTotalToRow(sessionTotal(), { repoProject: '/home/dev/repo', sessionDir: '/custom/dir' })

    expect(row).toEqual({
      sessionId: 'sess-1',
      sessionName: 'Refactor auth',
      firstActivity: '2026-01-01T10:00:00.000Z',
      lastActivity: '2026-01-01T10:20:00.000Z',
      entryCount: 2,
      workMs: 900,
      workMsMayOverlap: true, // entries: 2 > 1
      elapsedMs: 20 * 60 * 1000,
      waitingMs: 100,
      cost: 0.5,
      machine: 'mac-mini',
      agent: 'pi',
      repoProject: '/home/dev/repo',
      sessionDir: '/custom/dir',
    })
  })

  it('sets workMsMayOverlap: false for a single-entry session (cannot overlap itself)', () => {
    const row = sessionTotalToRow(sessionTotal({ entries: 1 }), {})
    expect(row.workMsMayOverlap).toBe(false)
  })

  it('falls back to minStartedAt when maxEndedAt is empty', () => {
    const row = sessionTotalToRow(sessionTotal({ maxEndedAt: '' }), {})
    expect(row.lastActivity).toBe('2026-01-01T10:00:00.000Z')
  })

  it('reports the MIXED sentinel for agent when distinctAgent > 1, ignoring the coarse `mixed` field', () => {
    const row = sessionTotalToRow(sessionTotal({ distinctAgent: 2, sampleAgent: 'pi', mixed: false }), {})
    expect(row.agent).toBe(MIXED)
  })

  it('uses sampleAgent (not the coarse `mixed` field) when the agent is unanimous', () => {
    const row = sessionTotalToRow(sessionTotal({ distinctAgent: 1, sampleAgent: 'claude-code' }), {})
    expect(row.agent).toBe('claude-code')
  })

  it('passes repoProject/sessionDir through undefined when the caller found no resume info', () => {
    const row = sessionTotalToRow(sessionTotal(), {})
    expect(row.repoProject).toBeUndefined()
    expect(row.sessionDir).toBeUndefined()
  })
})

describe('sessionSummaryToRow', () => {
  it('renames fields 1:1 from SessionSummary, dropping entryIds/client/project/task/wallMs', () => {
    const row = sessionSummaryToRow(sessionSummary())

    expect(row).toEqual({
      sessionId: 'sess-1',
      sessionName: 'Refactor auth',
      firstActivity: '2026-01-01T10:00:00.000Z',
      lastActivity: '2026-01-01T10:20:00.000Z',
      entryCount: 2,
      workMs: 900,
      workMsMayOverlap: true,
      elapsedMs: 20 * 60 * 1000,
      waitingMs: 100,
      cost: 0.5,
      machine: 'mac-mini',
      agent: 'pi',
      repoProject: '/home/dev/repo',
      sessionDir: undefined,
    })
  })

  it('carries the MIXED sentinel through for agent unchanged', () => {
    const row = sessionSummaryToRow(sessionSummary({ agent: MIXED }))
    expect(row.agent).toBe(MIXED)
  })
})
