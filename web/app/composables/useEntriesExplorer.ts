import { LEGACY_AGENT, listDistinctAgents } from '~/lib/measurement-quality'
import type { TaskEntryRecord } from '~/lib/pocketbase-types'

/** The two "not measured" quality filters this screen supports (`waiting_quality
 * = 'unavailable'` / `cost_quality = 'unknown'`) — see docs/contract.md "Agent
 * and measurement quality". */
export type QualityFilter = 'waitingUnavailable' | 'costUnknown'

export interface EntriesExplorerFilters {
  client?: string
  project?: string
  task?: string
  status?: string
  model?: string
  machine?: string
  /** `agent` slug, or the `LEGACY_AGENT` sentinel for rows with no
   * reported agent (see `app/lib/measurement-quality.ts`). */
  agent?: string
  quality?: QualityFilter
  dateStart?: string
  dateEnd?: string
  search?: string
}

function escapeFilterValue(value: string) {
  return value.replace(/"/g, '\\"')
}

function buildFilter(filters: EntriesExplorerFilters): string {
  const parts: string[] = []
  if (filters.client) parts.push(`client = "${filters.client}"`)
  if (filters.project) parts.push(`project = "${filters.project}"`)
  if (filters.task) parts.push(`task = "${filters.task}"`)
  if (filters.status) parts.push(`status = "${filters.status}"`)
  if (filters.model) parts.push(`model = "${filters.model}"`)
  if (filters.machine) parts.push(`machine = "${filters.machine}"`)
  if (filters.agent) parts.push(filters.agent === LEGACY_AGENT ? `agent = ""` : `agent = "${filters.agent}"`)
  if (filters.quality === 'waitingUnavailable') parts.push(`waiting_quality = "unavailable"`)
  if (filters.quality === 'costUnknown') parts.push(`cost_quality = "unknown"`)
  if (filters.dateStart) parts.push(`started_at >= "${filters.dateStart} 00:00:00.000Z"`)
  if (filters.dateEnd) parts.push(`started_at <= "${filters.dateEnd} 23:59:59.999Z"`)
  if (filters.search) parts.push(`prompt ~ "${escapeFilterValue(filters.search)}"`)
  return parts.join(' && ')
}

/** Server-side paginated/sorted/filtered browse of every `task_entries`
 * row — screen 8, "detail rows", never summed by this composable. */
export function useEntriesExplorer() {
  const { $pb } = useNuxtApp()

  async function list(opts: {
    page: number
    perPage: number
    sort: string
    filters: EntriesExplorerFilters
  }) {
    return $pb.collection('task_entries').getList<TaskEntryRecord>(opts.page, opts.perPage, {
      filter: buildFilter(opts.filters),
      sort: opts.sort,
      expand: 'client,project,task',
    })
  }

  async function getOne(id: string) {
    return $pb.collection('task_entries').getOne<TaskEntryRecord>(id, { expand: 'client,project,task' })
  }

  async function updateAssignment(id: string, data: { client?: string, project?: string, task?: string }) {
    return $pb.collection('task_entries').update<TaskEntryRecord>(id, data)
  }

  async function listWorkRecords(taskEntryId: string) {
    return $pb.collection('work_records').getFullList({
      filter: `task_entry = "${taskEntryId}"`,
      sort: 'started_at',
    })
  }

  /** Distinct `agent` values across every `task_entries` row (not just the
   * current page) for the agent filter dropdown — a narrow field-only
   * fetch, the same field-projection idiom `useTaskEntries` uses for its
   * `fields` param, since there is no dedicated `agents` collection to
   * page against. */
  async function listAgents() {
    const rows = await $pb.collection('task_entries').getFullList<Pick<TaskEntryRecord, 'agent'>>({
      fields: 'agent',
      perPage: 500,
    })
    return listDistinctAgents(rows)
  }

  return { list, getOne, updateAssignment, listWorkRecords, listAgents }
}
