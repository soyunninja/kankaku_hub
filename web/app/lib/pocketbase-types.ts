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
  schema: number
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
