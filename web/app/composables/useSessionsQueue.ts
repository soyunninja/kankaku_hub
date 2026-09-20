import { chunk } from '~/lib/aggregate'
import { MIXED, type SessionSummary } from '~/lib/session-aggregate'
import type { TaskRecord } from '~/lib/pocketbase-types'

const BATCH_CHUNK_SIZE = 50

/**
 * Actions on a "sessions without a task" queue entry (see
 * `useSessions.fetchUnassignedSessions`): convert it into a new task,
 * attach it to an existing one, or ignore it. Batch updates mirror
 * `useUnassignedQueue.bulkAssign` exactly (chunked `$pb.createBatch()`,
 * per-row status check, `onProgress` callback) — same reassignment
 * mechanism, keyed by session instead of by legacy-label group.
 */
export function useSessionsQueue() {
  const { $pb } = useNuxtApp()
  const { create } = useTasks()

  /**
   * Points every `task_entries` row in `entryIds` at `taskId`, in
   * chunks of 50, reporting progress after each chunk. Returns the ids
   * that failed (per-request status checked individually, as the batch
   * endpoint does not fail the whole call for one bad sub-request).
   */
  async function batchAssignTask(
    entryIds: string[],
    taskId: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ succeeded: string[], failed: string[] }> {
    const succeeded: string[] = []
    const failed: string[] = []
    const chunks = chunk(entryIds, BATCH_CHUNK_SIZE)
    let done = 0

    for (const ids of chunks) {
      const batch = $pb.createBatch()
      for (const id of ids) {
        batch.collection('task_entries').update(id, { task: taskId })
      }

      try {
        const results = await batch.send()
        results.forEach((result: { status: number }, idx: number) => {
          if (result.status >= 200 && result.status < 300) succeeded.push(ids[idx]!)
          else failed.push(ids[idx]!)
        })
      }
      catch {
        failed.push(...ids)
      }

      done += ids.length
      onProgress?.(done, entryIds.length)
    }

    return { succeeded, failed }
  }

  /**
   * Creates a new task from a session (title/project prefilled from the
   * session, both overridable) and reassigns every entry in the session
   * to it. Optimistic-friendly: the caller owns any UI rollback if
   * `updatedCount` comes back short of `session.entryIds.length`.
   */
  async function convertToTask(
    session: SessionSummary,
    overrides: { title: string, project?: string },
  ): Promise<{ task: TaskRecord, updatedCount: number }> {
    const project = overrides.project ?? (session.project !== MIXED ? session.project : '')
    const task = await create({ title: overrides.title, project, status: 'open' })
    const { succeeded } = await batchAssignTask(session.entryIds, task.id)
    return { task, updatedCount: succeeded.length }
  }

  /** Reassigns every entry in a session to an existing task, no task creation. */
  async function attachToExisting(
    session: SessionSummary,
    taskId: string,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ succeeded: string[], failed: string[] }> {
    return batchAssignTask(session.entryIds, taskId, onProgress)
  }

  /**
   * Dismisses a session from the queue without creating a task, by
   * creating one `ignored_sessions` row.
   * DESIGN CHOICE: catch-the-unique-violation, not check-then-create —
   * `session_id` has a unique index (the actual source of truth), and a
   * check-then-create has a race window (two tabs/machines ignoring the
   * same session at once) that catching the write's own conflict does
   * not. See docs/contract.md "What a unique-violation response
   * actually looks like" for the exact error shape checked here.
   */
  async function ignoreSession(session: SessionSummary): Promise<void> {
    try {
      await $pb.collection('ignored_sessions').create({
        session_id: session.sessionId,
        machine: session.machine,
      })
    }
    catch (err) {
      if (!isSessionIdUniqueViolation(err)) throw err
    }
  }

  return { convertToTask, attachToExisting, ignoreSession }
}

function isSessionIdUniqueViolation(err: unknown): boolean {
  const fieldError = (err as { data?: { data?: Record<string, { code?: string }> } })?.data?.data?.session_id
  return fieldError?.code === 'validation_not_unique'
}
