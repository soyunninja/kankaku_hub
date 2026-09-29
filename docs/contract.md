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

Auth collection: the built-in `users` collection (holds the human owner,
the kankaku service account, and — since migration `1758300021` — an
optional read-only demo account, distinguished by a `role` field: `owner`
| `service` | `viewer`).

`service` keeps create/update access on `task_entries` and `work_records`
(the sync client's contract below is unaffected by this migration).
`viewer` can list/view every collection and call every hook route, exactly
like `owner`/`service`, but cannot create, update, or delete anything —
every write attempt (including on `task_entries`/`work_records`) 403s.
`owner` is unchanged. See
[ADR 0029](adr/0029-viewer-role-read-only.md) for why.

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
| `website` | url, optional |
| `contact_email` | email, optional |
| `contact_phone` | text, optional, max 40 |
| `notes` | text, optional, max 5000, multi-line |
| `favicon` | file, optional, single, max 512000 bytes |
| `favicon_source` | text, optional, max 2000 |
| `favicon_checked_at` | date, optional |

Write access: owner only. The sync client only *reads* this collection.

`website`, `contact_email`, `contact_phone` and `notes` are display/contact
metadata for the web app's owner-facing client management screens
(`CATMGMT-REQ-006`–`CATMGMT-REQ-008`, `docs/specs/web-catalog-management.md`).
kankaku's own catalog client
(`kankaku/src/adapters/pocketbase-catalog.ts#mapClient`) only ever reads
`id`, `name`, `code`, `active` and `unassigned` off a `clients` record — it
ignores these four fields (and the three favicon fields below) entirely,
so none of them need handling on the kankaku side. No money-related field
(rate, price, margin, invoice number) exists or will exist on this
collection — see `AGENTS.md` and
[ADR 0018](adr/0018-billing-boundary-enforced-in-schema.md).

`favicon`, `favicon_source` and `favicon_checked_at` are populated only by
the custom route below, never set directly through the regular
`clients` create/update endpoints (nothing stops a raw `PATCH` from
setting them, but the web app never does, and doing so bypasses the
validation the route performs). `favicon`'s allowed mime types are
`image/png`, `image/x-icon`, `image/vnd.microsoft.icon`, `image/jpeg`,
`image/gif`, `image/webp` — deliberately no `image/svg+xml` (an SVG can
carry inline script). See
[ADR 0019](adr/0019-hub-fetches-and-stores-client-favicons.md) for why
this is a server-side, explicitly-triggered fetch rather than hot-linking
or a third-party favicon service.

#### `POST /api/kankaku/clients/{id}/favicon/refresh`

Owner-only. Fetches the client's `website` once, extracts and downloads a
favicon, and stores it on the client record. **Not** part of the
service-account sync contract — the sync client never calls this route.

Request: no body.

Response is always `200` on a request that reaches business logic (never
`500`, even on a fetch failure — a failed favicon fetch is an expected,
recorded outcome, not a server error):

```json
{ "ok": true }
```

or

```json
{ "ok": false, "reason": "no_website" }
```

`reason` is one of the following stable codes:

| reason | meaning |
|---|---|
| `no_website` | the client is the "Sin determinar" unassigned row, or `website` is empty — nothing to fetch. All three favicon fields are cleared, `favicon_checked_at` included (no check was attempted). |
| `fetch_failed` | network error, timeout, non-2xx response, or an unanticipated error while fetching the page or a candidate icon. |
| `no_icon_found` | the page was fetched and parsed but no usable `<link rel="icon">`-family candidate was found, and the `{origin}/favicon.ico` fallback also failed. |
| `unsupported_type` | a candidate downloaded but its content-type/magic bytes weren't a recognized raster image type. |
| `too_large` | a candidate exceeded 512000 bytes (`Content-Length` or actual body size). |
| `blocked_host` | the SSRF guard refused to fetch the host (see [`architecture/hub-backend.md`](architecture/hub-backend.md)). |

Every `ok: false` outcome except `no_website` stamps `favicon_checked_at`
with the current time and clears `favicon`/`favicon_source` (a stale icon
for a now-broken site is more misleading than no icon at all).

Error responses for the route itself (not a fetch failure):

- `401` — no authenticated user.
- `403` — authenticated but not `role: "owner"` (the generic
  `{"data":{},"message":"...","status":403}` shape).
- `404` — `{id}` doesn't match an existing `clients` record.

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
| `thinking_level` | text (max 40) | optional — the model's reasoning effort when the record settled, as the agent names it (pi: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`); empty when unknown |
| `prompt` | text | subject to `KANKAKU_SYNC_PROMPT` (proposal §8) |
| `legacy_client_label` | text | only set for rows routed to "Sin determinar" |
| `repo_project` | text | kankaku's local project path |
| `session_dir` | text (≤1000) | pi's non-default session directory, when it used one (`pi --session-dir <dir> --session <id>`); optional, sent on create **and** update like `repo_project`. Same category as `repo_project` for privacy purposes — an absolute local path, so it can expose the machine's username/disk layout the same way `repo_project` already can |
| `schema` | number (int) | |
| `agent` | text (≤40) | which coding agent ran the work, lowercase slug: `pi`, `opencode`, … See "Agent and measurement quality" below |
| `agent_version` | text (≤60) | that agent's own version, free text |
| `plugin` | text (≤60) | the integration that wrote the row (`kankaku` for the pi package) |
| `plugin_version` | text (≤60) | its version |
| `waiting_quality` | select | `measured` \| `unavailable` |
| `cost_quality` | select | `measured` \| `estimated` \| `unknown` |
| `subagent_linkage` | select | `linked` \| `unlinked` \| `not_applicable` |

#### Agent and measurement quality

The hub is agent-agnostic: any integration that honours this contract may
write `task_entries`. Because agents expose different signals, every row
declares **which agent produced it and how well each figure was measured**,
so a consumer can show what exists, label what is approximate, and never
blend figures that are not comparable without saying so. Added by migration
`1758300013`; index `idx_task_entries_agent_started (agent, started_at)`.

| field | value | meaning for a consumer |
|---|---|---|
| `waiting_quality` | `measured` | time blocked on the human was observed and excluded; `work_ms < wall_ms` is meaningful |
| | `unavailable` | the agent exposes no such signal: `waiting_ms` is `0`, `work_ms == wall_ms`, and `work_ms` is an **upper bound** — do not present it as measured work time |
| `cost_quality` | `measured` | provider-reported cost |
| | `estimated` | computed by the integration from token counts and a price table |
| | `unknown` | `cost` is `0` because it could not be known — exclude from cost averages rather than averaging in a zero |
| `subagent_linkage` | `linked` | child work is folded into this row (interval union, see `architecture/aggregation.md`) |
| | `unlinked` | children ran but could not be joined; this row under-reports |
| | `not_applicable` | the run used no subagents |

Rules:

- They are **selects, not bools, on purpose**: PocketBase bools have no
  default and read back as `false`, which would make "not measured"
  indistinguishable from "not reported". An **empty** value always means
  *not reported* (an older client); treat it as unknown, never as the best
  or the worst case.
- All seven fields are optional and additive: a client that does not send
  them still gets `200` (captured below). A value outside the select's list
  is rejected with `400`.
- Like every measurement field they may be sent on create **and** on update
  (they are not assignment fields; the create-only rule covers only
  `client`, `project`, `task`, `legacy_client_label`).
- Rows that existed before the migration were all written by the pi package
  and were backfilled to `agent: "pi"`, `plugin: "kankaku"`,
  `waiting_quality: "measured"`, `cost_quality: "measured"`, and
  `subagent_linkage` = `linked` when `subagent_count > 0`, else
  `not_applicable`.
- The `task_entries_daily_totals` view now groups by `agent` too
  (migration `1758300015`): up to one row per `(project, client, day,
  agent)` instead of one row per `(project, client, day)`. This is a
  breaking shape change for any consumer built against the old shape —
  see [`specs/hub-schema-and-access-rules.md`](specs/hub-schema-and-access-rules.md)
  (`SCHEMA-REQ-008`, `SCHEMA-REQ-016`).

Captured against PocketBase 0.40.4 on an isolated copy, authenticated as the
`service` account, 2026-09-20:

| request | status |
|---|---|
| create with `agent: "opencode"`, `waiting_quality: "unavailable"`, `cost_quality: "estimated"`, `subagent_linkage: "not_applicable"` | `200` |
| create with `waiting_quality: "maybe"` | `400` |
| create sending none of the seven fields | `200` |

Write access: `owner` and `service` may create/update; only `owner` may
delete. Any authenticated role may read, but `viewer` is read-only.

Sync sends `client`, `project`, `task`, and `legacy_client_label` only on
create; its later update payload omits them so re-sync preserves manual
assignments ([ADR 0011](adr/0011-create-only-assignment-fields.md)).
Separately, kankaku 1.2.0's Tasks CLI supports explicit reassignment via
an authenticated service-account `PATCH` with `{ client, project, task }`.
Relation validation only checks that each supplied relation exists; the hub
does not check project–client or task–project hierarchy consistency. The
client must validate those relationships. There is no reassignment-specific
actor/timestamp audit log; the generic record `updated` timestamp is not
such a log.

Relation fields that have no value must be sent as `""` (empty string),
**not omitted and not `null`** — PocketBase accepts either, but `""` is
what this backend's own seed script and manual tests use.

#### Side effects of writing `task_entries`

An explicit assignment `PATCH` can trigger the same task-status side effect
as a create; ordinary sync updates omit `task` and do not reassign it.
Assigning `task` on a `task_entries` create or update can silently move the
linked task's `status` from `open` to `doing`. This is not a new field, not
a new endpoint, and not a change to the request/response shapes documented
above — it happens server-side, with app privileges, in a PocketBase hook
(`pocketbase/pb_hooks/task-auto-doing.pb.js`) that runs after the
`task_entries` write has already succeeded. A `doing` task is left alone,
and a `done` task is never reopened; `done` is never set automatically —
closing a task stays the owner's call. A client `PATCH`ing
`task_entries.task` (or creating a row with it set) should not assume the
task's previously-known status still holds: refetch/resync `tasks` if the
UI displays task status, rather than trusting a locally cached value. See
[`specs/hub-schema-and-access-rules.md`](specs/hub-schema-and-access-rules.md)
(`SCHEMA-REQ-017`) and [`specs/web-tasks.md`](specs/web-tasks.md)
(`TASKS-REQ-010`).

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
| `thinking_level` | text (max 40) | optional — the model's reasoning effort when the record settled, as the agent names it (pi: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`); empty when unknown |
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
per day per agent (migration `1758300015`; grouping added `agent` on top
of the original `(project, client, day)` shape — a breaking shape change,
see `specs/hub-schema-and-access-rules.md` `SCHEMA-REQ-016`). Read-only
(`listRule`/`viewRule` only, no create/update/delete — view collections
are inherently read-only in PocketBase). Fields: `project`, `client`,
`day` (text `YYYY-MM-DD`), `agent`, `wall_ms`, `work_ms`, `waiting_ms`,
`input`, `output`, `cache_read`, `cache_write`, `cost`, `entries`. The web
app should treat this as a starting point, not the only possible
aggregation — add more view collections the same way if needed, always
querying `task_entries`.

**`day` is a UTC calendar day** (`CAST(substr(started_at, 1, 10) AS
TEXT)` — SQLite has no per-row timezone context), never the viewer's
local day. The web app does not read this view for any day-labelled
figure for exactly that reason — it computes local-day boundaries and
buckets client-side from `task_entries` (`web/app/lib/local-day.ts`, see
[ADR 0026](adr/0026-day-boundaries-are-local.md)). A consumer that needs
a figure aligned with what the owner calls "today" must not use this
view's `day` column directly in a non-UTC timezone.

The synthetic `id` column's empty-`agent` sentinel is `'~none'` as of
migration `1758300018` (previously `'unreported'`, which collided with a
real agent literally named `unreported` — fixed by an independent review
on 2026-09-21). `'~none'` cannot be a valid `agent` slug (agent values are
lowercase identifiers like `pi`/`opencode`, never containing `~`), so it
cannot collide with any reported value.

### Day boundaries are local, not UTC

Every OTHER date-ranged filter or grouping in this contract (`started_at`
range filters, anything a client buckets "by day") means the VIEWER's
LOCAL calendar day, never UTC — `started_at`/`ended_at` are stored as UTC
instants, and a naive `"YYYY-MM-DD 00:00:00.000Z"` filter built from a
local date string silently drops or mis-buckets an entry near local
midnight for any non-UTC timezone. Convert the local boundary to UTC
before filtering (see `web/app/lib/local-day.ts` for the reference
implementation — DST-correct, via `Intl`, not a fixed offset) rather than
string-concatenating a local date onto a `Z`-suffixed instant.

## `POST /api/kankaku/totals`

Server-side aggregation over `task_entries` (D6: `SUM`/`COUNT`/`MIN`/
`MAX` only, never `work_records`) — see
[`architecture/hub-backend.md`](architecture/hub-backend.md#the-totals-endpoint)
and [ADR 0027](adr/0027-totals-computed-server-side.md) for the design.
**Not** part of the sync client's contract — this is the web dashboard's
route, authenticated the same way as every other collection (any
authenticated user, owner or service, may call it; there is no
`role: 'owner'` gate — it exposes nothing a caller couldn't already
reconstruct by listing `task_entries` itself).

Request body (every field optional except `group_by` implicitly
defaulting to `"none"`):

```json
{
  "from": "2026-06-01 00:00:00.000Z",
  "to": "2026-09-21 23:59:59.999Z",
  "filters": {
    "client": "<id>", "project": "<id>", "task": "<id>", "agent": "pi",
    "status": "completed", "machine": "<name>", "session_id": "<id>",
    "unassigned_only": true, "without_task": true,
    "exclude_unassigned_client": "<id>", "session_fully_unassigned": true
  },
  "group_by": "none | day | client | project | task | session | agent | model | legacy_label",
  "day_boundaries": ["...UTC instant...", "..."],
  "sort": "-cost",
  "page": 1,
  "per_page": 50
}
```

- `from`/`to` — UTC instant strings, PocketBase's stored form
  (`YYYY-MM-DD HH:MM:SS.mmmZ`, space or `T` separator both accepted, always
  normalized to space form before comparison) or omitted for an all-time
  total.
- `filters` — a fixed whitelist (`client`, `project`, `task`, `agent`,
  `status`, `machine`, `session_id`, `unassigned_only`, `without_task`,
  `exclude_unassigned_client`, `session_fully_unassigned`); any other key
  is a `400`.
  `agent: ""` matches rows with no reported agent (the `LEGACY_AGENT`
  sentinel case, see `app/lib/measurement-quality.ts`).
  `unassigned_only: true` requires `filters.client` to also be set (`400
  unassigned_only_requires_client` otherwise) — it documents intent
  rather than adding SQL beyond the `client` equality already applied.
  `session_fully_unassigned: true` (only meaningful with
  `group_by: "session"`, typically combined with `without_task: true`)
  adds a `NOT EXISTS` clause excluding any row whose `session_id` has a
  SIBLING row elsewhere with `task != ''` — i.e. only sessions where
  **every** entry is unassigned. This reproduces the pre-totals
  `web/app/composables/useSessions.ts#fetchUnassignedSessions` semantic
  exactly (a session with even one triaged entry was excluded outright,
  not just filtered down to its unassigned rows), which a plain
  `without_task` filter cannot express on its own since it already
  narrows the row set to `task=''` before the sibling check could see a
  triaged row in the same session. Adds no bound parameter (boolean-only,
  fixed SQL fragment).
- `group_by` — one of the 9 listed values; anything else is a `400`.
  This is a fixed server-side whitelist mapped to a hard-coded SQL
  fragment — request text is never used as a SQL identifier.
- `day_boundaries` — required (and only valid) when `group_by: "day"`: an
  array of **local-day boundary UTC instants** the CALLER computes (see
  "Day boundaries are local, not UTC" above —
  `web/app/lib/local-day.ts#buildLocalDayBoundaries` is the reference
  implementation), strictly increasing, 2-401 entries (≤400 buckets). Row
  `N` (`0`-indexed) covers `[day_boundaries[N], day_boundaries[N+1])`; the
  response's `group_key` for a day bucket is that index as text
  (`"0"`, `"1"`, ...) — the caller maps it back to a label using the same
  array it sent.
- `sort` — one of `-cost`/`cost`/`-entries`/`entries`/`-wall_ms`/`wall_ms`/
  `-work_ms`/`work_ms`/`-waiting_ms`/`waiting_ms`/`-group_key`/`group_key`/
  `-min_started_at`/`min_started_at`/`-max_ended_at`/`max_ended_at`,
  default `-cost`. Anything else is a `400` (same whitelist-to-fragment
  rule as `group_by`).
- `page`/`per_page` — 1-based, `per_page` capped at 200.

Response shape:

```json
{
  "groups": [ { "...": "one row per group_by value, see below" } ],
  "total": { "...": "grand total over the WHOLE filtered set, ungrouped" },
  "page": 1,
  "per_page": 50,
  "total_groups": 7,
  "total_pages": 4
}
```

`total` and every entry in `groups` share the same measurement-honesty
fields (`docs/contract.md` "Agent and measurement quality"): `entries`,
`wall_ms`, `work_ms`, `waiting_ms`, `input`, `output`, `cache_read`,
`cache_write`, `cost`, `waiting_unavailable_entries`,
`cost_unknown_entries`, `cost_estimated_entries`, `cost_known_entries`,
`cost_known_sum` (so `cost_known_sum / cost_known_entries` reproduces
`app/lib/measurement-quality.ts#computeAverageCost`'s average exactly —
it excludes `cost_quality: "unknown"` rows the same way), `unlinked_entries`,
and `distinct_sessions` (`COUNT(DISTINCT session_id)`, used by the tasks
board's per-task session-count chip). Each `groups[]` entry additionally
carries `group_key`/`group_key2` (the group's identity — `group_key2` is
only non-empty for `group_by: "legacy_label"`, which groups by
`(legacy_client_label, repo_project)`), and the `group_by: "session"`-only
fields `session_name` (the session's latest non-empty `session_name`),
`min_started_at`/`max_ended_at`, `machine` (the most-recently-started
row's `machine`), and `distinct_client`/`sample_client`,
`distinct_project`/`sample_project`, `distinct_task`/`sample_task`,
`distinct_agent`/`sample_agent` (a `distinct_* > 1` means the session's
rows disagree on that field — display "mixed"; otherwise `sample_*` is
the unanimous value). These five field pairs are present but empty/zero
for every other `group_by`, so every response shares one fixed column
shape.

Captured against PocketBase 0.40.4 on an isolated instance with 100k
synthetic `task_entries` rows (`pocketbase/seed/bulk.js`), authenticated
as the `owner` account, 2026-09-21:

`POST /api/kankaku/totals` with `{"from": "2026-06-01 00:00:00.000Z",
"to": "2026-09-21 23:59:59.999Z", "group_by": "none"}` → `200`:

```json
{"total_pages":0,"groups":[],"total":{"entries":10793,"wall_ms":21821190560,"work_ms":19177877530,"waiting_ms":2643313030,"input":105739354,"output":42822626,"cache_read":31201005,"cache_write":11667596,"cost":21514.336682,"waiting_unavailable_entries":1738,"cost_unknown_entries":1705,"cost_estimated_entries":1759,"cost_known_entries":9088,"cost_known_sum":21514.336682,"unlinked_entries":2548,"distinct_sessions":3343},"page":1,"per_page":50,"total_groups":0}
```

(`total_pages`/`total_groups` are `0` for `group_by: "none"` — there is
exactly one ungrouped total, not a list of groups.)

`POST /api/kankaku/totals` with `{"group_by": "bogus"}` → `400`:

```json
{"data":{"errors":["invalid_group_by"]},"message":"Invalid totals request.","status":400}
```

No `Authorization` header → `401`:

```json
{"data":{},"message":"The request requires valid record authorization token.","status":401}
```

### Client fallback (the route may not exist yet)

This route ships alongside a new migration
(`1758300019_task_entries_totals_indexes.js`) and hook file
(`pocketbase/pb_hooks/totals.pb.js`) that only take effect after the
owner restarts PocketBase. Until then, `POST /api/kankaku/totals` 404s.
Every web call site catches that specific status and falls back to the
pre-existing client-side `getFullList`+sum path — silently, no error
shown to the owner (`web/app/composables/useTotals.ts`'s
`TotalsRouteUnavailableError`).

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
- A `role: "viewer"` account (migration `1758300021`, ADR 0029) is
  read-only everywhere: it can auth and list/view exactly like
  `owner`/`service`, but every create/update/delete — including on
  `task_entries`/`work_records`, which `service` can still write — returns
  the same 400/403 shape as an unauthenticated request. The sync client
  never authenticates as `viewer`; this only matters for a hub demo
  instance.
