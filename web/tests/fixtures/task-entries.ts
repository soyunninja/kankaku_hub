import type { TaskEntryLike } from '../../app/lib/aggregate'

/**
 * D6 guard fixture: hand-written `task_entries` rows (already consolidated
 * by kankaku's buildTasks — union of intervals, never re-derived here) with
 * hand-computed expected totals below. If the web's summing helpers ever
 * disagree with these numbers, that's a regression in `aggregate.ts`, not
 * in the fixture. See AGENTS.md rule D6 and docs/proposal.md §9.3.
 */
export const fixtureTaskEntries: TaskEntryLike[] = [
  {
    id: 'te1',
    client: 'client-cajamar',
    project: 'project-portal',
    started_at: '2026-09-10',
    wall_ms: 600_000,
    waiting_ms: 100_000,
    work_ms: 500_000,
    input: 1000,
    output: 500,
    cache_read: 200,
    cache_write: 50,
    cost: 1.25,
  },
  {
    id: 'te2',
    client: 'client-cajamar',
    project: 'project-portal',
    started_at: '2026-09-11',
    wall_ms: 300_000,
    waiting_ms: 0,
    work_ms: 300_000,
    input: 400,
    output: 200,
    cache_read: 0,
    cache_write: 0,
    cost: 0.5,
  },
  {
    id: 'te3',
    client: 'client-cajamar',
    project: 'project-app',
    started_at: '2026-09-12',
    wall_ms: 1_200_000,
    waiting_ms: 200_000,
    work_ms: 1_000_000,
    input: 2000,
    output: 1000,
    cache_read: 500,
    cache_write: 100,
    cost: 3.0,
  },
  {
    id: 'te4',
    client: 'client-vega',
    project: 'project-agenda',
    started_at: '2026-09-12',
    wall_ms: 450_000,
    waiting_ms: 50_000,
    work_ms: 400_000,
    input: 800,
    output: 300,
    cache_read: 100,
    cache_write: 0,
    cost: 0.75,
  },
  {
    id: 'te5',
    client: 'client-unassigned',
    project: '',
    started_at: '2026-09-13',
    wall_ms: 100_000,
    waiting_ms: 0,
    work_ms: 100_000,
    input: 100,
    output: 50,
    cache_read: 0,
    cache_write: 0,
    cost: 0.1,
    legacy_client_label: 'cjamar',
    repo_project: '/home/dev/repos/cajamar-app',
  },
]

/** Hand-computed grand totals across all 5 rows above. */
export const fixtureGrandTotals = {
  wallMs: 600_000 + 300_000 + 1_200_000 + 450_000 + 100_000, // 2_650_000
  waitingMs: 100_000 + 0 + 200_000 + 50_000 + 0, // 350_000
  workMs: 500_000 + 300_000 + 1_000_000 + 400_000 + 100_000, // 2_300_000
  input: 1000 + 400 + 2000 + 800 + 100, // 4300
  output: 500 + 200 + 1000 + 300 + 50, // 2050
  cacheRead: 200 + 0 + 500 + 100 + 0, // 800
  cacheWrite: 50 + 0 + 100 + 0 + 0, // 150
  cost: 1.25 + 0.5 + 3.0 + 0.75 + 0.1, // 5.6
  count: 5,
}

/** Hand-computed per-client cost totals. */
export const fixtureClientCosts: Record<string, number> = {
  'client-cajamar': 1.25 + 0.5 + 3.0, // 4.75
  'client-vega': 0.75,
  'client-unassigned': 0.1,
}
