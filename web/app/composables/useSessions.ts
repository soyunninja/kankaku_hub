import { chunk } from '~/lib/aggregate'
import { groupBySession, type SessionEntryLike, type SessionSummary } from '~/lib/session-aggregate'
import type { TaskEntryRecord } from '~/lib/pocketbase-types'

const FIELDS = 'id,session_id,session_name,started_at,ended_at,client,project,task,machine,agent,repo_project,session_dir,wall_ms,waiting_ms,work_ms,cost'
/** Bound on the unassigned-entries scan — the "sessions without a task"
 * queue is expected to stay small in practice (an owner triages it as it
 * grows); this caps a single fetch instead of blindly pulling the whole
 * table, mirroring `useTaskEntries.fetchRange`'s bounded-by-filter style. */
const UNASSIGNED_SCAN_LIMIT = 500
const SESSION_ID_FILTER_CHUNK = 50

interface IgnoredSessionRow {
  session_id: string
}

/**
 * Session-level views over `task_entries` (D6: never `work_records`),
 * built on top of `session-aggregate.ts#groupBySession` — the task
 * detail sheet's session list, and the "sessions without a task" queue.
 */
export function useSessions() {
  const { $pb } = useNuxtApp()

  /** Sessions that touched a given task, most-recent-first. */
  async function fetchSessionsForTask(taskId: string): Promise<SessionSummary[]> {
    const entries = await $pb.collection('task_entries').getFullList<TaskEntryRecord>({
      filter: `task = "${taskId}"`,
      fields: FIELDS,
      sort: '-started_at',
      perPage: 500,
    })
    return groupBySession(entries as SessionEntryLike[])
  }

  /**
   * Sessions whose entries are ALL unassigned (`task = ""`) — a session
   * with even one assigned entry has already been triaged and is
   * excluded, not just filtered down to its unassigned rows. Also
   * excludes sessions already dismissed into `ignored_sessions`.
   */
  async function fetchUnassignedSessions(opts: { limit?: number } = {}): Promise<{
    sessions: SessionSummary[]
    /** True when the bounded scan may have cut off older unassigned entries. */
    truncated: boolean
  }> {
    const limit = opts.limit ?? UNASSIGNED_SCAN_LIMIT

    const candidateEntries = await $pb.collection('task_entries').getFullList<TaskEntryRecord>({
      filter: 'task = ""',
      fields: FIELDS,
      sort: '-started_at',
      perPage: limit,
    })

    const sessionIds = [...new Set(candidateEntries.map(e => e.session_id).filter(Boolean))]
    if (sessionIds.length === 0) return { sessions: [], truncated: false }

    const [partiallyAssignedIds, ignoredIds] = await Promise.all([
      fetchSessionIdsWithAssignedEntries(sessionIds),
      fetchIgnoredSessionIds(),
    ])

    const pureUnassigned = candidateEntries.filter(e =>
      !partiallyAssignedIds.has(e.session_id) && !ignoredIds.has(e.session_id),
    )

    return {
      sessions: groupBySession(pureUnassigned as SessionEntryLike[]),
      truncated: candidateEntries.length >= limit,
    }
  }

  /** ids of sessions (from `sessionIds`) that have at least one assigned entry elsewhere. */
  async function fetchSessionIdsWithAssignedEntries(sessionIds: string[]): Promise<Set<string>> {
    const results = await Promise.all(
      chunk(sessionIds, SESSION_ID_FILTER_CHUNK).map(async (ids) => {
        const filter = `(${ids.map(id => `session_id = "${id}"`).join(' || ')}) && task != ""`
        return $pb.collection('task_entries').getFullList<TaskEntryRecord>({
          filter,
          fields: 'session_id',
          perPage: 500,
        })
      }),
    )
    return new Set(results.flat().map(r => r.session_id))
  }

  async function fetchIgnoredSessionIds(): Promise<Set<string>> {
    const rows = await $pb.collection('ignored_sessions').getFullList<IgnoredSessionRow>({
      fields: 'session_id',
      perPage: 500,
    })
    return new Set(rows.map(r => r.session_id))
  }

  return { fetchSessionsForTask, fetchUnassignedSessions }
}
