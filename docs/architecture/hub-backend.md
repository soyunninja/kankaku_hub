# Hub backend (PocketBase)

PocketBase 0.40.4, pinned in `scripts/pb-download.sh` (`PB_VERSION=0.40.4`).
Schema lives entirely in `pocketbase/pb_migrations/*.js` — see
[AGENTS.md](../../AGENTS.md): "the migrations are the contract"; if
`docs/contract.md` and the migrations ever disagree, the migrations win.

## Collections

| Collection | Type | Purpose |
|---|---|---|
| `users` | auth (built-in) | Holds both the human owner and kankaku's service account, distinguished by a `role` field. |
| `clients` | base | Top-level billing entity. |
| `projects` | base | Belongs to exactly one client. |
| `tasks` | base | Created by a human in the hub (or, later, from kankaku); kankaku only links to these. |
| `task_entries` | base | The reporting unit — see [aggregation.md](aggregation.md). |
| `work_records` | base | Optional raw detail, one row per kankaku `WorkRecord`. |
| `task_entries_daily_totals` | view | Read-only rollup, sums only `task_entries`. |

### `users`

Migration `1758300001_users_role_field.js` adds a required `role` select
field (`owner` \| `service`) to the built-in auth collection. Migration
`1758300007_users_rules.js` then tightens it for a single-owner tool:
`listRule`/`viewRule` = `id = @request.auth.id` (each account sees only
itself), `createRule = null` (no public self-registration — accounts are
provisioned only via the superuser CLI/API,
[`scripts/create-dev-accounts.sh`](../../scripts/create-dev-accounts.sh)),
`updateRule = id = @request.auth.id`, `deleteRule = null`.

### `clients`

| Field | Type | Notes |
|---|---|---|
| `name` | text, required | Display name. |
| `code` | text, required, **unique** (`idx_clients_code`) | Short slug, e.g. `cajamar`. |
| `active` | bool | No schema default — always send explicitly (PocketBase 0.40 defaults an omitted bool to `false`). |
| `unassigned` | bool | `true` only for the single "Sin determinar" row. |
| `website` | url, optional | Added by `1758300011_clients_contact_fields.js`. Display/contact metadata only — kankaku's catalog client (`kankaku/src/adapters/pocketbase-catalog.ts`) never reads it. |
| `contact_email` | email, optional | Same migration. Same "kankaku never reads it" note. |
| `contact_phone` | text, optional, max 40 | Same migration. Free-form, no format enforced beyond trimming. |
| `notes` | text, optional, max 5000 | Same migration. Multi-line free text. |

Access: `list`/`view` = any authenticated user; `create`/`update`/`delete` =
`role = 'owner'` only — the four contact fields are not special-cased, they
follow the same rule as `name`/`code`/`active`. The sync client (service
account) only ever reads this collection. No rate/price/invoice field
exists or will exist here (the billing boundary, [ADR
0018](../adr/0018-billing-boundary-enforced-in-schema.md)) — the contact
fields are display metadata, not money.

### `projects`

| Field | Type | Notes |
|---|---|---|
| `name` | text, required | |
| `client` | relation → `clients`, required, `cascadeDelete: false` | |
| `code` | text | Optional slug. |
| `repo_paths` | json array of strings | Absolute paths mapped to this project; enables silent auto-selection at session start. |
| `active` | bool | |

Access: same shape as `clients` — read by any authenticated user, write by
`owner` only. Index: `idx_projects_client`.

### `tasks`

| Field | Type | Notes |
|---|---|---|
| `title` | text, required | |
| `project` | relation → `projects`, required, `cascadeDelete: false` | |
| `status` | select, required: `open` \| `doing` \| `done` | |
| `external_ref` | text | Issue/PR id, optional. |
| `description` | text | |

Access: read by any authenticated user, write by `owner` only (kankaku only
reads this collection today, to link a `task_entries` row — task linkage
from kankaku is [phase 4, planned](../phases/phase-4-task-linkage.md)).
Indexes: `idx_tasks_project`, `idx_tasks_status`.

### `task_entries`

The reporting unit — one row per kankaku task, already consolidated by
`buildTasks` (see [aggregation.md](aggregation.md)). Full field list:
[`../contract.md`](../contract.md#task_entries--what-the-sync-client-writes).

Access: `list`/`view`/`create`/`update` = any authenticated user (owner or
service); `delete` = `owner` only. Indexes:
`idx_task_entries_task_id` (**unique**, the idempotency key), plus
`(project, started_at)`, `(client, started_at)`, `(started_at)` for the
dashboard's date-range/breakdown queries.

Notable fields beyond the obvious measurement ones:

- `legacy_client_label` — the original free-text client label, set only for
  rows routed to "Sin determinar" (see
  [`../specs/backfill-unassigned.md`](../specs/backfill-unassigned.md)).
- `repo_project` — kankaku's local project path, kept even when the
  `project` relation can't be resolved.
- Relation fields with no value are sent/read as `""`, never `null`
  (a PocketBase convention, not a schema property).

### `work_records`

Optional raw per-process detail, `rollup` always `false` (a standing
warning, never a schema-enforced constraint — enforcement is by convention,
documented in `AGENTS.md` and in code comments on both sides). Relation
`task_entry` is **required** with `cascadeDelete: true` (deleting a
`task_entries` row removes its children). Access mirrors `task_entries`.
Index: unique `idx_work_records_kankaku_id`, plus `idx_work_records_task_entry`.

### Two collections, one summable, one not

If there were only one collection, every consumer would need to know that a
subagent's time is contained within its orchestrator's, and would eventually
get it wrong. Splitting them makes the safe path the default: `task_entries`
is summable by construction, `work_records` is flagged as not. Sending
`work_records` at all is optional — see
[`../specs/sync-push.md`](../specs/sync-push.md#configuration).

## The read-only view: `task_entries_daily_totals`

Migration `1758300009_task_entries_daily_totals_view.js`. A PocketBase
**view** collection (inherently read-only — no create/update/delete rules
are meaningful on a view) that sums `task_entries` only, grouped by
`(project, client, day)`. Every aggregate column is wrapped in `CAST(...)`
in the SQL, because PocketBase infers a view's column types from the
`SELECT` and, without the cast, `SUM(...)` columns get inferred as the wrong
type. Fields: `project`, `client`, `day` (`YYYY-MM-DD` text),
`wall_ms`, `work_ms`, `waiting_ms`, `input`, `output`, `cache_read`,
`cache_write`, `cost`, `entries`. Treat it as a starting point — add more
view collections the same way if a report needs a different grouping,
always querying `task_entries`, never `work_records`.

## Access rules summary

| Collection | list/view | create | update | delete |
|---|---|---|---|---|
| `users` | self only | superuser only | self only | superuser only |
| `clients` | authenticated | owner | owner | owner |
| `projects` | authenticated | owner | owner | owner |
| `tasks` | authenticated | owner | owner | owner |
| `task_entries` | authenticated | authenticated | authenticated | owner |
| `work_records` | authenticated | authenticated | authenticated | owner |
| `task_entries_daily_totals` | authenticated | — (view) | — (view) | — (view) |

`@request.auth.id != ''` gates every read; `@request.auth.role = 'owner'`
gates catalog/task writes. The service account (`role: "service"`) can
therefore push `task_entries`/`work_records` but cannot create a missing
client or project — that surfaces as a generic `400` and must be handled by
a human in the web, not auto-created by the sync client (see
[`../contract.md`](../contract.md#gotchas-for-the-sync-client-author)).

## Batch API

Disabled by default in PocketBase 0.40; migration
`1758300010_enable_batch_api.js` enables `/api/batch` with
`maxRequests: 100`. Used by kankaku's sync client (many-row upserts) and by
the web's unassigned-queue bulk reassignment
([`hub-web.md`](hub-web.md#unassigned-queue)), chunked at 50 rows per batch
call to keep progress reporting granular and stay comfortably under the
server cap.

## Seed data

`pocketbase/seed/seed.js` — dependency-free (Node ≥ 20, uses global
`fetch`), deterministic (`mulberry32` PRNG, fixed seed `424242`) and
re-runnable without duplicating: every row has a stable natural key
(`clients.code`, `projects.code`, `tasks.external_ref`,
`task_entries.task_id`, `work_records.kankaku_id`) and the script looks up
existing rows before creating. Generates 400 regular `task_entries` plus 30
"Sin determinar" entries with varied legacy-label spellings across a 60-day
window. Verified counts after two runs:
`clients: 6, projects: 10, tasks: 25, task_entries: 430, work_records: 261`.
Seeds the one required "Sin determinar" client via migration
`1758300008_seed_unassigned_client.js` (idempotent, looks up by `code`
before inserting).

The five demo clients also carry plausible `website`/`contact_email`/
`contact_phone`/`notes` values. Unlike every other row this script
generates, those four fields ARE re-applied to already-existing demo
clients on every run (a deliberate exception — see the header comment in
`seed.js`): they're pure display data, not owner-authored state, so
keeping them in sync with the script's canonical values is more useful
than leaving old runs stale. "Sin determinar" is never touched by this
script and keeps its contact fields empty.

## Related

- [`../contract.md`](../contract.md) — the normative API surface (auth, upsert flow, batch, gotchas).
- [`../proposal.md`](../proposal.md) §4 — the original schema design.
- [`../specs/hub-schema-and-access-rules.md`](../specs/hub-schema-and-access-rules.md)
- [`overview.md`](overview.md), [`aggregation.md`](aggregation.md)
