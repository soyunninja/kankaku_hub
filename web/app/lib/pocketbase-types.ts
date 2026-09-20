/**
 * Field shapes for the collections this app reads/writes. Kept as plain
 * types (not generated) — see docs/contract.md for the authoritative
 * field list and pocketbase/pb_migrations/*.js for the schema itself.
 */

export interface ClientRecord {
  id: string
  name: string
  code: string
  active: boolean
  unassigned: boolean
  /** Optional — PocketBase `url` field, empty string when unset. */
  website: string
  /** Optional — PocketBase `email` field, empty string when unset. */
  contact_email: string
  /** Optional — free-form phone number, empty string when unset. */
  contact_phone: string
  /** Optional — free-form multi-line text, empty string when unset. */
  notes: string
  /**
   * Optional — PocketBase `file` field, the stored filename when a
   * favicon has been fetched, empty string otherwise. Build a URL with
   * `pb.files.getURL(record, record.favicon)` (see
   * `app/lib/client-avatar.ts`), never a raw path.
   */
  favicon: string
  /** Optional — the URL the current favicon was fetched from, empty string when unset. */
  favicon_source: string
  /** Optional — ISO timestamp of the last favicon fetch attempt, empty string when never checked. */
  favicon_checked_at: string
  created: string
  updated: string
}

export interface ProjectRecord {
  id: string
  name: string
  client: string
  code: string
  repo_paths: string[]
  active: boolean
  created: string
  updated: string
}

export type TaskStatus = 'open' | 'doing' | 'done'

export interface TaskRecord {
  id: string
  title: string
  project: string
  status: TaskStatus
  external_ref: string
  description: string
  created: string
  updated: string
}

export type EntryStatus = 'completed' | 'aborted' | 'interrupted'

/**
 * Agent and measurement quality fields (migration `1758300013`, see
 * docs/contract.md "Agent and measurement quality"). All optional and
 * additive — an empty value means *not reported* (an older client),
 * never the best or the worst case.
 */
export type WaitingQuality = 'measured' | 'unavailable'
export type CostQuality = 'measured' | 'estimated' | 'unknown'
export type SubagentLinkage = 'linked' | 'unlinked' | 'not_applicable'

export interface TaskEntryRecord {
  id: string
  task_id: string
  client: string
  project: string
  task: string
  started_at: string
  ended_at: string
  wall_ms: number
  waiting_ms: number
  work_ms: number
  input: number
  output: number
  cache_read: number
  cache_write: number
  cost: number
  segments: unknown
  subagent_count: number
  runs: number
  turns: number
  status: EntryStatus
  session_id: string
  session_name: string
  machine: string
  model: string
  prompt: string
  legacy_client_label: string
  repo_project: string
  /** pi's non-default session directory, when it used one (`pi --session-dir <dir> --session <id>`). Empty/undefined when pi used its default location. */
  session_dir?: string
  schema: number
  /** Lowercase slug (≤40 chars), e.g. `"pi"`, `"opencode"`. Empty/undefined on rows written before the migration. */
  agent?: string
  /** Free text (≤60 chars), the agent's own version. */
  agent_version?: string
  /** Free text (≤60 chars), the integration that wrote the row (`"kankaku"` for the pi package). */
  plugin?: string
  /** Free text (≤60 chars), that plugin's version. */
  plugin_version?: string
  waiting_quality?: WaitingQuality | ''
  cost_quality?: CostQuality | ''
  subagent_linkage?: SubagentLinkage | ''
  created: string
  updated: string
  // expand
  expand?: {
    client?: ClientRecord
    project?: ProjectRecord
    task?: TaskRecord
  }
}

export interface WorkRecordRecord {
  id: string
  kankaku_id: string
  task_entry: string
  rollup: boolean
  role: 'orchestrator' | 'subagent'
  pid: number
  parent_pid: number
  started_at: string
  settled_at: string
  wall_ms: number
  waiting_ms: number
  work_ms: number
  runs: number
  turns: number
  status: EntryStatus
  model: string
  input: number
  output: number
  cache_read: number
  cache_write: number
  cost: number
  segments: unknown
  tools: unknown
  session_id: string
  prompt: string
  machine: string
  schema: number
  created: string
  updated: string
}

export interface DailyTotalRecord {
  id: string
  project: string
  client: string
  day: string
  wall_ms: number
  work_ms: number
  waiting_ms: number
  input: number
  output: number
  cache_read: number
  cache_write: number
  cost: number
  entries: number
}

export type UserRole = 'owner' | 'service'

export interface UserRecord {
  id: string
  email: string
  name: string
  role: UserRole
  verified: boolean
}
