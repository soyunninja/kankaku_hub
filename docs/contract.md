# API contract for kankaku's sync client

This is the exact contract kankaku's catalog/sync adapters must follow.
Every request/response body below was captured from a real request against
a local PocketBase 0.40.4 instance running this repo's migrations and seed
data — nothing here is guessed from memory. If PocketBase's behavior ever
disagrees with this file, re-run the equivalent `curl` against your local
instance and trust that, then fix this file.

## Base URL

Local dev: `http://127.0.0.1:8090`
Production: whatever `KANKAKU_PB_URL` is configured to. Proposal §8: refuse
a plain-HTTP URL unless it's localhost.

## Authentication

Auth collection: the built-in `users` collection (holds both the human
owner and the kankaku service account, distinguished by a `role` field:
`owner` | `service`).

`POST /api/collections/users/auth-with-password`

Request body:

```json
{ "identity": "kankaku-sync@kankaku.local", "password": "kankaku-dev-sync" }
```

Response (200), captured from a real call:

```json
{
  "record": {
    "avatar": "",
    "collectionId": "_pb_users_auth_",
    "collectionName": "users",
    "created": "2026-09-19 22:56:59.942Z",
    "email": "kankaku-sync@kankaku.local",
    "emailVisibility": true,
    "id": "ovi57pb9scckxws",
    "name": "",
    "role": "service",
    "updated": "2026-09-19 22:56:59.942Z",
    "verified": true
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...."
}
```

Wrong credentials → `400`:

```json
{ "data": {}, "message": "Failed to authenticate.", "status": 400 }
```

**Every subsequent request** sends the token as a plain `Authorization`
header — **no `Bearer ` prefix**:

```
Authorization: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
```

Tokens are JWTs with an `exp` claim (PocketBase default auth token TTL).
On `401`, re-authenticate once with the stored credentials and retry;
if that also fails, stop and surface the error (proposal §8).

Public self-registration is disabled (`createRule: null` on `users`) —
accounts are provisioned only via the superuser CLI/API
(`scripts/create-dev-accounts.sh`). Do not attempt to auto-create the
service account at sync time.

## Collections and fields

All collections require `@request.auth.id != ""` to list/view. See
`AGENTS.md` and the migration files in `pocketbase/pb_migrations/` for the
authoritative field list — this is a summary for the sync client's
mapping code.

### `clients`

| field | type |
|---|---|
| `name` | text, required |
| `code` | text, required, **unique** |
| `active` | bool |
| `unassigned` | bool |

Write access: owner only. The sync client only *reads* this collection.

### `projects`

| field | type |
|---|---|
| `name` | text, required |
| `client` | relation → clients, required |
| `code` | text |
| `repo_paths` | json array of strings |
| `active` | bool |

Write access: owner only. The sync client only *reads* this collection.

### `tasks`

| field | type |
|---|---|
| `title` | text, required |
| `project` | relation → projects, required |
| `status` | select: `open` \| `doing` \| `done` |
| `external_ref` | text |
| `description` | text |

Write access: owner only. The sync client only *reads* this collection
(to link a `task_entries` row to an existing task, phase 4).

### `task_entries` — what the sync client writes

| field | type | notes |
|---|---|---|
| `task_id` | text, **unique index** | idempotency key — the orchestrator record's id |
| `client` | relation → clients | **required** |
| `project` | relation → projects | optional |
| `task` | relation → tasks | optional |
| `started_at` / `ended_at` | date | **required** |
| `wall_ms` / `waiting_ms` / `work_ms` | number (int) | |
| `input` / `output` / `cache_read` / `cache_write` | number (int) | |
| `cost` | number | |
| `segments` | json | |
| `subagent_count` / `runs` / `turns` | number (int) | |
| `status` | select: `completed` \| `aborted` \| `interrupted` | **required** |
| `session_id` / `session_name` | text | |
| `machine` | text | |
| `model` | text | |
| `prompt` | text | subject to `KANKAKU_SYNC_PROMPT` (proposal §8) |
| `legacy_client_label` | text | only set for rows routed to "Sin determinar" |
| `repo_project` | text | kankaku's local project path |
| `schema` | number (int) | |

Write access: any authenticated user (owner or service) may create/update;
only owner may delete.

Relation fields that have no value must be sent as `""` (empty string),
**not omitted and not `null`** — PocketBase accepts either, but `""` is
what this backend's own seed script and manual tests use.

### `work_records` — optional raw detail

| field | type | notes |
|---|---|---|
| `kankaku_id` | text, **unique index** | idempotency key |
| `task_entry` | relation → task_entries | **required**, cascade delete |
| `rollup` | bool | always `false` — never summed |
| `role` | select: `orchestrator` \| `subagent` | |
| `pid` / `parent_pid` | number (int) | |
| `started_at` / `settled_at` | date | |
| `wall_ms` / `waiting_ms` / `work_ms` / `runs` / `turns` | number (int) | |
| `status` | select: `completed` \| `aborted` \| `interrupted` | |
| `model` | text | |
| `input` / `output` / `cache_read` / `cache_write` | number (int) | |
| `cost` | number | |
| `segments` / `tools` | json | |
| `session_id` | text | |
| `prompt` | text | |
| `machine` | text | |
| `schema` | number (int) | |

Write access: same as `task_entries`. Sending `work_records` at all is
optional — see proposal §4 "why two collections".

## Upsert by `task_id` (and `kankaku_id`)

PocketBase has no native upsert. The sync client does it in two calls:

**1. Look up** by the unique key, URL-encoded filter syntax:

```
GET /api/collections/task_entries/records?filter=task_id%3D%22seed-te-0001%22
```

(i.e. `filter=task_id="<value>"`, then percent-encode the whole query
value — `encodeURIComponent('task_id="' + taskId + '"')` in JS.)

Response shape (`items: []` when not found, one item when found):

```json
{ "items": [ { "...": "..." } ], "page": 1, "perPage": 30, "totalItems": 1, "totalPages": 1 }
```

**2a. Not found → create:**

```
POST /api/collections/task_entries/records
```

**2b. Found → update by id:**

```
PATCH /api/collections/task_entries/records/<id>
```

### What a unique-violation response actually looks like

Captured from a real duplicate-create attempt against a seeded
`task_entries` row:

```json
{
  "data": { "task_id": { "code": "validation_not_unique", "message": "Value must be unique." } },
  "message": "Failed to create record.",
  "status": 400
}
```

Treat this specific shape (`status: 400`, `data.task_id.code ==
"validation_not_unique"`) as "already synced" and fall back to the
look-up-then-update path, per proposal §6.2. Any other `400` is a real
validation error and should be recorded in the local `failed` list, not
retried blindly.

A generic rejected create (e.g. missing required field, or rule mismatch —
including an unauthenticated request) looks like:

```json
{ "data": {}, "message": "Failed to create record.", "status": 400 }
```

Field-level errors always appear under `data.<field>.code` /
`data.<field>.message` when PocketBase can attribute them to a specific
field; a bare `"data": {}` means either an API-rule rejection or an error
PocketBase couldn't attribute to one field.

## Batch API

`POST /api/batch` is **enabled** for this instance (migration
`1758300010_enable_batch_api.js`, `maxRequests: 100`). Use it to upsert
many `task_entries`/`work_records` rows in one round trip instead of one
request per row (proposal §6.2).

Request:

```json
{
  "requests": [
    { "method": "POST", "url": "/api/collections/task_entries/records", "body": { "task_id": "...", "...": "..." } },
    { "method": "PATCH", "url": "/api/collections/task_entries/records/<id>", "body": { "wall_ms": 123 } }
  ]
}
```

- One `Authorization` header on the outer request applies to every
  sub-request — there is no per-request auth.
- Response is an array, same order as the requests, each item shaped
  `{ "status": <int>, "body": <response body> }`.
- A sub-request that fails does **not** fail the whole batch by default;
  check each item's `status` individually.
- If `/api/batch` is unreachable or returns `403 Batch requests are not
  allowed.`, fall back to one request per row — this is what "otherwise
  one request per row" in the proposal means in practice, and it's the
  right behavior if someone disables batch on a given instance.

## Pagination

Every list endpoint (`GET /api/collections/<name>/records`) takes:

- `page` (1-based, default 1)
- `perPage` (default 30, PocketBase caps this server-side)
- `sort` (e.g. `sort=name`, `sort=-started_at` for descending)
- `filter` (see upsert section above)
- `fields` (comma-separated, trims the response — e.g.
  `fields=id,task_id` when you only need to build a dedup set)

Real example, `GET /api/collections/projects/records?page=1&perPage=2&sort=name`:

```json
{
  "items": [
    { "id": "tinfj2fhevc5dmf", "name": "Agenda Pacientes", "code": "clinica-dental-vega-agenda", "client": "jy0r2fztuwt4wie", "active": true, "repo_paths": ["/home/dev/repos/clinica-dental-vega-agenda"], "collectionId": "pbc_484305853", "collectionName": "projects", "created": "2026-09-19 22:57:02.134Z", "updated": "2026-09-19 22:57:02.134Z" },
    { "id": "1kmrwu5or6lr4wq", "name": "App Móvil", "code": "cajamar-app", "client": "mpfetzo7r36b9kx", "active": true, "repo_paths": ["/home/dev/repos/cajamar-app"], "collectionId": "pbc_484305853", "collectionName": "projects", "created": "2026-09-19 22:57:02.134Z", "updated": "2026-09-19 22:57:02.134Z" }
  ],
  "page": 1,
  "perPage": 2,
  "totalItems": 10,
  "totalPages": 5
}
```

For the catalog cache (proposal §5.2), fetch all clients/projects with a
large `perPage` (e.g. 200 — both collections are small) rather than
paginating; there is no realistic scenario with hundreds of clients.

## Read-only dashboard view

`task_entries_daily_totals` (a PocketBase **view** collection) sums
**only** `task_entries` — never `work_records` — per project per client
per day. Read-only (`listRule`/`viewRule` only, no create/update/delete —
view collections are inherently read-only in PocketBase). Fields:
`project`, `client`, `day` (text `YYYY-MM-DD`), `wall_ms`, `work_ms`,
`waiting_ms`, `input`, `output`, `cache_read`, `cache_write`, `cost`,
`entries`. The web app should treat this as a starting point, not the only
possible aggregation — add more view collections the same way if needed,
always querying `task_entries`.

## Gotchas for the sync client author

- `date` fields accept and return `"YYYY-MM-DD HH:MM:SS.mmmZ"` (space, not
  `T`) — see the `started_at`/`ended_at` examples above. ISO-with-`T`
  strings are also accepted on write; PocketBase normalizes to the
  space form on read.
- Relation fields with no value are `""` on read, not `null`.
- `active`/other bools have no schema default — always send `active: true`
  explicitly when creating a client/project/task; PocketBase defaults an
  omitted bool to `false`.
- The service account (`role: "service"`) can write `task_entries` and
  `work_records` and can list/view `clients`/`projects`/`tasks`, but
  **cannot** create/update/delete `clients`/`projects`/`tasks` — that
  returns the generic `{"data":{},"message":"Failed to create
  record.","status":400}` shape. Don't try to auto-create a missing
  project from the sync client; surface it to the user instead.
