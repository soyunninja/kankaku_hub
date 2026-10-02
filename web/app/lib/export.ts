import type { TaskEntryRecord } from './pocketbase-types'
import type { TotalsRow } from './totals-map'
import type { EntriesExplorerFilters } from '../composables/useEntriesExplorer'

/** Fixed privacy-safe projection shared with the bounded export fetch. */
export const ENTRIES_DETAIL_FIELDS = [
  'id', 'task_id', 'client', 'project', 'task', 'started_at', 'ended_at',
  'wall_ms', 'waiting_ms', 'work_ms', 'input', 'output', 'cache_read', 'cache_write', 'cost',
  'subagent_count', 'runs', 'turns', 'status', 'session_id', 'session_name', 'machine', 'model',
  'thinking_level', 'agent', 'agent_version', 'plugin', 'plugin_version', 'waiting_quality',
  'cost_quality', 'subagent_linkage', 'legacy_client_label', 'repo_project', 'schema', 'created', 'updated',
] as const satisfies readonly (keyof TaskEntryRecord)[]

export function buildEntriesDetailExport(snapshot: {
  items: readonly TaskEntryRecord[]
  filters: EntriesExplorerFilters
  sort: string
  generatedAt: string
  totalItems: number
  rowLimit: number
  truncated: boolean
}): ExportTable {
  const headers = ['section', 'metadata_key', 'metadata_value', ...ENTRIES_DETAIL_FIELDS, 'client_name', 'project_name', 'task_title']
  const filterKeys = ['client', 'project', 'task', 'status', 'agent', 'quality', 'model', 'machine', 'dateStart', 'dateEnd', 'search', 'session_id'] as const
  const metadata = {
    export_kind: 'entries_detail', generated_at: snapshot.generatedAt,
    ...Object.fromEntries(filterKeys.map(key => [key, snapshot.filters[key] ?? ''])),
    sort: snapshot.sort, row_limit: snapshot.rowLimit, exported_rows: snapshot.items.length,
    total_matching_rows: snapshot.totalItems, truncated: snapshot.truncated,
  }
  return {
    headers,
    rows: [
      ...Object.entries(metadata).map(([key, value]) => ['metadata', key, value, ...Array<null>(headers.length - 3).fill(null)]),
      ...snapshot.items.map(row => ['task_entry', '', '', ...ENTRIES_DETAIL_FIELDS.map(key => row[key]), row.expand?.client?.name, row.expand?.project?.name, row.expand?.task?.title]),
    ],
  }
}

export type ExportCell = string | number | boolean | null | undefined
export interface ExportTable {
  headers: readonly string[]
  rows: readonly (readonly ExportCell[])[]
}
export interface ExportPayload {
  content: string
  mimeType: string
  extension: 'csv'
}

/** Treat caller-provided strings as text, not spreadsheet formulas. */
function cellText(value: ExportCell): string {
  if (value == null) return ''
  if (typeof value === 'string' && /^[\s]*[=+@-]|^[\t\r\n]/.test(value)) return `'${value}`
  return String(value)
}

/** UTF-8 BOM and CRLF make this CSV friendly to spreadsheet applications. */
export function createCsvExport(table: ExportTable): ExportPayload {
  const quote = (value: ExportCell) => `"${cellText(value).replaceAll('"', '""')}"`
  return {
    content: '\uFEFF' + [table.headers, ...table.rows].map(row => row.map(quote).join(',')).join('\r\n') + '\r\n',
    mimeType: 'text/csv;charset=utf-8',
    extension: 'csv',
  }
}

/** Load the universal writer only when XLSX is requested.
 * Explicit text cells preserve IDs and formula-looking strings literally.
 */
export async function createXlsxExport(table: ExportTable): Promise<{ content: Blob, mimeType: string, extension: 'xlsx' }> {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const data = [table.headers, ...table.rows].map(row => row.map(value => {
    if (value == null) return null
    return { value, type: typeof value === 'string' ? String : typeof value === 'number' ? Number : Boolean }
  }))
  return {
    content: await writeExcelFile(data, { sheet: 'Measurements' }).toBlob(),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  }
}

export interface DashboardExportMetadata {
  dataSource: 'totals_endpoint' | 'fallback_task_entries'
  /** null means no group cap; fallback rows may still be incomplete. */
  clientBreakdownLimit: number | null
  projectBreakdownLimit: number | null
  topExpensiveLimit: number
  clientBreakdownTruncated: boolean
  projectBreakdownTruncated: boolean
  /** null on the totals endpoint, which does not use fallback rows. */
  fallbackRowsTruncated: boolean | null
}

export interface DashboardExportSnapshot {
  generatedAt: string
  metadata: DashboardExportMetadata
  period: { start: string, end: string }
  includeUnassigned: boolean
  agent: string
  totals: TotalsRow
  byClient: readonly (TotalsRow & { key: string, label: string })[]
  byProject: readonly (TotalsRow & { key: string, label: string })[]
  topExpensive: readonly Pick<TaskEntryRecord, 'id' | 'client' | 'project' | 'cost' | 'work_ms' | 'model'>[]
}

const metrics = [
  ['entries', 'entries'], ['wall_ms', 'wallMs'], ['work_ms', 'workMs'],
  ['waiting_ms', 'waitingMs'], ['input', 'input'], ['output', 'output'],
  ['cache_read', 'cacheRead'], ['cache_write', 'cacheWrite'], ['cost', 'cost'],
  ['waiting_unavailable_entries', 'waitingUnavailableEntries'],
  ['cost_unknown_entries', 'costUnknownEntries'], ['cost_estimated_entries', 'costEstimatedEntries'],
  ['cost_known_entries', 'costKnownEntries'], ['cost_known_sum', 'costKnownSum'],
  ['unlinked_entries', 'unlinkedEntries'], ['distinct_sessions', 'distinctSessions'],
] as const satisfies readonly (readonly [string, keyof TotalsRow])[]

/** D6: reshape already-loaded dashboard totals/task_entries only; no fetching or aggregation.
 * Preserve caller order and raw units (milliseconds, token counts, provider cost).
 * Top entries are a selected subset, not another total. Missing metrics stay blank.
 */
export function buildDashboardExport(snapshot: DashboardExportSnapshot): ExportTable {
  const context = [snapshot.period.start, snapshot.period.end, snapshot.includeUnassigned, snapshot.agent]
  const totalRow = (section: string, id: string, label: string, totals: TotalsRow): ExportCell[] => [
    section, id, label, '', '', '', ...context, ...metrics.map(([, key]) => totals[key]),
  ]
  return {
    headers: [
      'section', 'id', 'label', 'client_id', 'project_id', 'model',
      'period_start', 'period_end', 'include_unassigned', 'agent',
      ...metrics.map(([header]) => header),
    ],
    rows: [
      ...Object.entries({
        export_kind: 'dashboard_summary',
        generated_at: snapshot.generatedAt,
        data_source: snapshot.metadata.dataSource,
        period_start: snapshot.period.start,
        period_end: snapshot.period.end,
        include_unassigned: snapshot.includeUnassigned,
        agent: snapshot.agent,
        client_breakdown_limit: snapshot.metadata.clientBreakdownLimit ?? 'none',
        project_breakdown_limit: snapshot.metadata.projectBreakdownLimit ?? 'none',
        top_expensive_limit: snapshot.metadata.topExpensiveLimit,
        client_breakdown_truncated: snapshot.metadata.clientBreakdownTruncated,
        project_breakdown_truncated: snapshot.metadata.projectBreakdownTruncated,
        fallback_rows_truncated: snapshot.metadata.fallbackRowsTruncated ?? 'not_applicable',
      }).map(([key, value]) => [
        'metadata', key, value, '', '', '', ...context, ...metrics.map(() => null),
      ]),
      totalRow('totals', '', '', snapshot.totals),
      ...snapshot.byClient.map(row => totalRow('client', row.key, row.label, row)),
      ...snapshot.byProject.map(row => totalRow('project', row.key, row.label, row)),
      ...snapshot.topExpensive.map(row => [
        'task_entry', row.id, '', row.client, row.project, row.model, ...context,
        ...metrics.map(([header]) => header === 'cost' ? row.cost : header === 'work_ms' ? row.work_ms : null),
      ]),
    ],
  }
}
