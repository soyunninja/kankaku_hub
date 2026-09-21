/**
 * Pure mappers from the two session data sources `app/pages/tasks/index.vue`
 * can load (totals-backed `SessionTotal`, or the fallback row-level
 * `SessionSummary`) into `TaskSessionRow` — the single view model
 * `components/tasks/TaskDetailSheet.vue` actually renders. No Vue, no
 * PocketBase — importable from plain Vitest, same rule as
 * `app/lib/aggregate.ts`/`app/lib/totals-map.ts`.
 */
import type { SessionSummary, TaskSessionRow } from '~/lib/session-aggregate'
import { MIXED } from '~/lib/session-aggregate'
import type { SessionTotal } from '~/composables/useSessions'

/**
 * Reshapes a totals-backed `SessionTotal` (`useSessions().fetchSessionTotals`,
 * one row per `group_by: 'session'` group) into `TaskSessionRow`.
 *
 * `workMsMayOverlap`: a totals-backed `workMs` is always a server-side
 * SUM across the session's `task_entries` rows, never a single-row
 * measurement — the same structural reason `SessionSummary`'s own
 * client-side overlap flag exists (see `session-aggregate.ts`'s "Why
 * `wallMs` is not a plain sum" doc comment). The totals endpoint has no
 * equivalent to the fallback path's real raw-interval overlap check, so
 * this conservatively sets the flag whenever the session summed more
 * than one row — a single-row session trivially can't overlap itself,
 * and this never silently drops the "≈" caveat `TaskDetailSheet.vue`
 * shows for it.
 *
 * `agent`: `SessionTotal` has no plain `.agent`, only `sampleAgent`/
 * `distinctAgent` (the totals endpoint's `MIN(agent)`/`COUNT(DISTINCT
 * agent)`) — mirrors screen C's established pattern
 * (`sessions-without-task/index.vue`): mixed when `distinctAgent > 1`,
 * otherwise the sample value.
 *
 * `repoProject`/`sessionDir` are supplied by the caller (`resume`) —
 * the totals endpoint doesn't aggregate them at all (confirmed via the
 * backend SQL: only `distinct`/`sample` for client/project/task/agent),
 * so the page fetches one representative row per session separately
 * (see `app/pages/tasks/index.vue#fetchResumeInfo`) and passes the
 * result in here rather than this module reaching out to PocketBase
 * itself.
 */
export function sessionTotalToRow(session: SessionTotal, resume: { repoProject?: string, sessionDir?: string }): TaskSessionRow {
  return {
    sessionId: session.sessionId,
    sessionName: session.sessionName,
    firstActivity: session.minStartedAt,
    lastActivity: session.maxEndedAt || session.minStartedAt,
    entryCount: session.entries,
    workMs: session.workMs,
    workMsMayOverlap: session.entries > 1,
    elapsedMs: session.elapsedMs,
    waitingMs: session.waitingMs,
    cost: session.cost,
    machine: session.machine,
    agent: session.distinctAgent > 1 ? MIXED : session.sampleAgent,
    repoProject: resume.repoProject,
    sessionDir: resume.sessionDir,
  }
}

/**
 * Reshapes a fallback `SessionSummary` (row-level, `fetchSessionsForTask`)
 * into the same `TaskSessionRow` view model — a straight field rename,
 * every value `SessionSummary` already computes client-side.
 */
export function sessionSummaryToRow(session: SessionSummary): TaskSessionRow {
  return {
    sessionId: session.sessionId,
    sessionName: session.sessionName,
    firstActivity: session.firstActivity,
    lastActivity: session.lastActivity,
    entryCount: session.entryCount,
    workMs: session.workMs,
    workMsMayOverlap: session.workMsMayOverlap,
    elapsedMs: session.elapsedMs,
    waitingMs: session.waitingMs,
    cost: session.cost,
    machine: session.machine,
    agent: session.agent,
    repoProject: session.repoProject,
    sessionDir: session.sessionDir,
  }
}
