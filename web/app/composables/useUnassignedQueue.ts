import { chunk } from '~/lib/aggregate'
import type { TaskEntryRecord } from '~/lib/pocketbase-types'
import type { TotalsGroup } from '~/lib/totals-map'

const BATCH_CHUNK_SIZE = 50

function escapeFilterValue(value: string) {
  return value.replace(/"/g, '\\"')
}

/** A `group_by: 'legacy_label'` totals row, reshaped for the unassigned
 * queue's group listing. The server groups by `(legacy_client_label,
 * repo_project)` — `group_key2` (`repoProject` here) exists precisely to
 * disambiguate two groups that share the same `legacy_client_label`, so
 * a caller expanding a group MUST filter `fetchGroupEntries` by BOTH
 * `legacyLabel` and `repoProject`, never `legacyLabel` alone. */
export interface UnassignedGroup extends TotalsGroup {
  /** `group_key` — the legacy free-text client label. */
  legacyLabel: string
  /** `group_key2` — the repo project path; only non-empty for
   * `group_by: 'legacy_label'`. */
  repoProject: string
}

export interface UnassignedGroupsPage {
  groups: UnassignedGroup[]
  page: number
  perPage: number
  totalGroups: number
  totalPages: number
}

/**
 * The "Sin determinar" reassignment queue (proposal §5.3, screen 7): all
 * `task_entries` currently pointed at the unassigned client, and bulk
 * reassignment via PocketBase's /api/batch endpoint (chunked — the
 * server caps a single batch at 100 sub-requests, migration
 * 1758300010_enable_batch_api.js; we chunk at 50 to stay comfortably
 * under that and keep progress reporting granular).
 */
/** Hard cap of the deprecated fallback scan (hub without the totals route). */
export const UNASSIGNED_FALLBACK_CAP = 2000

export function useUnassignedQueue() {
  const { $pb } = useNuxtApp()
  const { fetchTotals } = useTotals()

  /**
   * Server-totals-backed group listing for the unassigned queue —
   * `group_by: 'legacy_label'` filtered to the unassigned client,
   * sorted by cost descending (the queue's default triage order: work
   * on the biggest groups first). Each group is one
   * `(legacy_client_label, repo_project)` pair. Throws
   * `TotalsRouteUnavailableError` (from `useTotals`) when the totals
   * route 404s; callers must catch it and fall back to `fetchUnassigned`
   * + client-side grouping.
   */
  async function fetchUnassignedGroups(unassignedClientId: string, opts: { page?: number, perPage?: number } = {}): Promise<UnassignedGroupsPage> {
    const response = await fetchTotals({
      groupBy: 'legacy_label',
      filters: { client: unassignedClientId },
      sort: '-cost',
      page: opts.page,
      perPage: opts.perPage,
    })
    return {
      groups: response.groups.map(g => ({ ...g, legacyLabel: g.groupKey, repoProject: g.groupKey2 })),
      page: response.page,
      perPage: response.perPage,
      totalGroups: response.totalGroups,
      totalPages: response.totalPages,
    }
  }

  /**
   * Paginated rows for one `(legacyLabel, repoProject)` group from
   * `fetchUnassignedGroups` — filtered by BOTH fields (not just
   * `legacyLabel`), since `group_key2`/`repoProject` exists exactly to
   * disambiguate groups that share a label. Callers should not hand-roll
   * this filter string.
   */
  async function fetchGroupEntries(unassignedClientId: string, legacyLabel: string, repoProject: string, opts: { page: number, perPage: number }) {
    const filter = [
      `client = "${unassignedClientId}"`,
      `legacy_client_label = "${escapeFilterValue(legacyLabel)}"`,
      `repo_project = "${escapeFilterValue(repoProject)}"`,
    ].join(' && ')
    return $pb.collection('task_entries').getList<TaskEntryRecord>(opts.page, opts.perPage, {
      filter,
      sort: '-started_at',
    })
  }

  /** `@deprecated` fallback-only — used when `fetchUnassignedGroups`
   * throws `TotalsRouteUnavailableError`. The most recent
   * `UNASSIGNED_FALLBACK_CAP` `task_entries` pointed at the unassigned
   * client: ONE `getList` page, never `getFullList` (which pages until a
   * short page whatever `perPage` says, so it cannot cap anything).
   * `truncated` is a real signal — the server's own `totalItems`. */
  async function fetchUnassigned(unassignedClientId: string): Promise<{ entries: TaskEntryRecord[], truncated: boolean, totalItems: number }> {
    const result = await $pb.collection('task_entries').getList<TaskEntryRecord>(1, UNASSIGNED_FALLBACK_CAP, {
      filter: `client = "${unassignedClientId}"`,
      sort: '-started_at',
      skipTotal: false,
    })
    return { entries: result.items, truncated: result.totalItems > result.items.length, totalItems: result.totalItems }
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

  return { fetchUnassignedGroups, fetchGroupEntries, fetchUnassigned, bulkAssign }
}
