/**
 * Pure helpers for TaskDetailSheet.vue's "expand a session to see all its
 * entries" list (Feature 2) — every `task_entries` row of a session that
 * touched the task being viewed, INCLUDING rows of that same session that
 * belong to another task or to no task at all. No i18n, no Vue, no
 * PocketBase — importable from plain Vitest, same rule as
 * app/lib/entry-detail.ts.
 */

// ---------------------------------------------------------------------
// Task-relation badge
// ---------------------------------------------------------------------

export type SessionEntryTaskBadge =
  | { kind: 'same-task' }
  | { kind: 'other-task', taskTitle: string }
  | { kind: 'no-task' }

/**
 * Classifies one session entry's relation to the task currently being
 * viewed: unassigned (`entryTaskId` empty) is `'no-task'`, a match is
 * `'same-task'` (renders no badge — see `SessionEntryTaskBadge`'s caller),
 * anything else is `'other-task'`. `otherTaskTitle` is the expanded
 * task's title when available; falls back to the raw id when the related
 * task record was deleted (no `expand.task`) so the badge never renders
 * blank.
 */
export function classifySessionEntryTask(
  entryTaskId: string,
  currentTaskId: string,
  otherTaskTitle: string | undefined,
): SessionEntryTaskBadge {
  if (!entryTaskId) return { kind: 'no-task' }
  if (entryTaskId === currentTaskId) return { kind: 'same-task' }
  return { kind: 'other-task', taskTitle: otherTaskTitle || entryTaskId }
}

// ---------------------------------------------------------------------
// Single-line prompt excerpt
// ---------------------------------------------------------------------

/**
 * Collapses a (possibly multi-line) prompt into one truncated line for a
 * compact list row: newlines become spaces, then the result is
 * end-truncated with an ellipsis at `maxLength` (unlike
 * `entry-detail.ts#truncateMiddle`, which keeps a path's meaningful start
 * *and* end — a prompt excerpt only needs "where it starts").
 */
export function singleLineExcerpt(text: string, maxLength = 80): string {
  const collapsed = text.trim().replace(/\s+/g, ' ')
  if (collapsed.length <= maxLength) return collapsed
  return `${collapsed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

// ---------------------------------------------------------------------
// Row view model
// ---------------------------------------------------------------------

export interface SessionEntryRowSource {
  id: string
  started_at: string
  prompt?: string | null
  work_ms: number
  cost: number
  task: string
  expand?: { task?: { title: string } }
}

export interface SessionEntryRow {
  id: string
  startedAt: string
  promptExcerpt: string
  /** True when the entry's own `prompt` is empty — the caller shows the
   * same "prompt hidden" concept `EntryDetailSheet.vue` uses
   * (`entries.detail.promptEmpty`), never an empty excerpt. */
  promptHidden: boolean
  workMs: number
  cost: number
  taskBadge: SessionEntryTaskBadge
}

/**
 * Maps one raw `task_entries` row (fetched via
 * `useEntriesExplorer().list()`, `expand: 'client,project,task'`) into
 * the view model `TaskDetailSheet.vue`'s expanded session list renders.
 * `currentTaskId` is read live from the sheet's own `task` prop by the
 * caller (never cached at fetch time) so the same-task/other-task
 * classification stays correct if the sheet is reopened for a different
 * task without re-fetching this session's rows.
 */
export function toSessionEntryRow(entry: SessionEntryRowSource, currentTaskId: string): SessionEntryRow {
  const prompt = entry.prompt?.trim() ?? ''
  return {
    id: entry.id,
    startedAt: entry.started_at,
    promptExcerpt: prompt ? singleLineExcerpt(prompt) : '',
    promptHidden: !prompt,
    workMs: entry.work_ms,
    cost: entry.cost,
    taskBadge: classifySessionEntryTask(entry.task, currentTaskId, entry.expand?.task?.title),
  }
}
