import { chunk } from '~/lib/aggregate'
import type { TaskEntryRecord } from '~/lib/pocketbase-types'

const BATCH_CHUNK_SIZE = 50

/**
 * The "Sin determinar" reassignment queue (proposal §5.3, screen 7): all
 * `task_entries` currently pointed at the unassigned client, and bulk
 * reassignment via PocketBase's /api/batch endpoint (chunked — the
 * server caps a single batch at 100 sub-requests, migration
 * 1758300010_enable_batch_api.js; we chunk at 50 to stay comfortably
 * under that and keep progress reporting granular).
 */
export function useUnassignedQueue() {
  const { $pb } = useNuxtApp()

  async function fetchUnassigned(unassignedClientId: string) {
    return $pb.collection('task_entries').getFullList<TaskEntryRecord>({
      filter: `client = "${unassignedClientId}"`,
      sort: '-started_at',
      perPage: 500,
    })
  }

  /**
   * Reassign a set of entry ids to a client (+ optional project) in
   * chunks, reporting progress after each chunk. Returns the ids that
   * failed.
   *
   * CORRECTION (verified against a real running PocketBase 0.40.4
   * instance while building `POST /api/kankaku/totals` — see
   * docs/architecture/hub-backend.md "The totals endpoint" and
   * `pocketbase/seed/bulk.js`'s header comment): `/api/batch` runs as a
   * SINGLE DB TRANSACTION, not independent per-request results — one
   * failing sub-request rolls back the WHOLE batch and the endpoint
   * returns a single top-level `400` (`batch.send()` throws), never a
   * `200` with a mix of per-item statuses. The `try`/`catch` below still
   * behaves correctly for that reality (the `catch` branch marks the
   * entire chunk failed), but the per-item `results.forEach` in the
   * `try` branch is effectively dead code for a real partial failure —
   * it only ever sees an all-success batch. Left as defensive handling
   * rather than removed, since PocketBase's transactional guarantee here
   * is observed behavior, not a documented contract this repo controls.
   */
  async function bulkAssign(
    entryIds: string[],
    target: { client: string, project?: string },
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ succeeded: string[], failed: string[] }> {
    const succeeded: string[] = []
    const failed: string[] = []
    const chunks = chunk(entryIds, BATCH_CHUNK_SIZE)
    let done = 0

    for (const ids of chunks) {
      const batch = $pb.createBatch()
      for (const id of ids) {
        const data: Record<string, string> = { client: target.client }
        if (target.project !== undefined) data.project = target.project
        batch.collection('task_entries').update(id, data)
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

  return { fetchUnassigned, bulkAssign }
}
