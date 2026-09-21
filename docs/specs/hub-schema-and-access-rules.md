# Hub schema and access rules

| | |
|---|---|
| Status | implemented |
| Phase | [phase-0-foundation](../phases/phase-0-foundation.md), [phase-2-sync-push](../phases/phase-2-sync-push.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0004](../adr/0004-kankaku-does-not-invent-tasks.md), [0006](../adr/0006-aggregation-rule-lives-once-in-kankaku.md), [0008](../adr/0008-no-money-in-the-database.md), [0012](../adr/0012-historical-records-to-sin-determinar.md), [0018](../adr/0018-billing-boundary-enforced-in-schema.md), [0019](../adr/0019-hub-fetches-and-stores-client-favicons.md), [0024](../adr/0024-sessions-link-to-tasks-by-explicit-action.md) |
| Code | `kankaku-hub/pocketbase/pb_migrations/*.js` |
| Tests | manual verification recorded in `kankaku-hub/ESTADO.md` (migrate up/down round-trip, seed idempotency, unique-constraint, auth rules) |

## Purpose

Defines the eight PocketBase collections that make up the hub schema, their
fields, and their access rules — the normative contract for anything
reading or writing the hub. See
[`../architecture/hub-backend.md`](../architecture/hub-backend.md) for the
narrative version and [`../contract.md`](../contract.md) for the exact API
surface captured from real requests.

## Requirements

1. `SCHEMA-REQ-001` — The migrations directory SHALL be the single source
   of truth for the schema; any disagreement with `docs/contract.md`
   SHALL be resolved in favor of the migrations.
2. `SCHEMA-REQ-002` — `clients.code` and `projects` → `clients` relation
   SHALL enforce `clients.code` uniqueness via a SQL unique index.
3. `SCHEMA-REQ-003` — `task_entries.task_id` and `work_records.kankaku_id`
   SHALL each be enforced unique via a SQL unique index, serving as the
   sync idempotency keys.
4. `SCHEMA-REQ-004` — `clients`/`projects`/`tasks` SHALL be readable by any
   authenticated user and writable only by `role = 'owner'`.
5. `SCHEMA-REQ-005` — `task_entries`/`work_records` SHALL be
   readable/creatable/updatable by any authenticated user (owner or
   service), and deletable only by `role = 'owner'`.
6. `SCHEMA-REQ-006` — `work_records.task_entry` SHALL cascade-delete:
   removing a `task_entries` row removes its child `work_records` rows.
7. `SCHEMA-REQ-007` — The `users` collection SHALL disallow public
   self-registration (`createRule: null`) and SHALL restrict list/view/
   update to the record's own account (`id = @request.auth.id`).
8. `SCHEMA-REQ-008` — The `task_entries_daily_totals` view SHALL be
   read-only, derived exclusively from `SUM(...)`/`COUNT(...)` over
   `task_entries`, grouped by `(project, client, day, agent)` (migration
   `1758300015`; grouped by `(project, client, day)` only before it — see
   the shape-change note below), and SHALL never reference
   `work_records`.
9. `SCHEMA-REQ-009` — `/api/batch` SHALL be enabled for this instance, with
   `maxRequests: 100`.
10. `SCHEMA-REQ-010` — No collection SHALL define a rate, price, margin, or
    invoice-number field (the billing boundary — see
    [ADR 0018](../adr/0018-billing-boundary-enforced-in-schema.md)).
11. `SCHEMA-REQ-011` — `clients` SHALL support four optional contact fields
    (`website`: `url`; `contact_email`: `email`; `contact_phone`: `text`,
    max 40; `notes`: `text`, max 5000), writable only by `role = 'owner'`
    like every other `clients` field, and none of the four SHALL ever
    become a rate/price/invoice field (`SCHEMA-REQ-010` applies to them
    too).
12. `SCHEMA-REQ-012` — `clients` SHALL support three optional favicon
    fields (`favicon`: file, single, max 512000 bytes, mime types
    restricted to `image/png`, `image/x-icon`, `image/vnd.microsoft.icon`,
    `image/jpeg`, `image/gif`, `image/webp` — never `image/svg+xml`;
    `favicon_source`: text, max 2000; `favicon_checked_at`: date), writable
    only by `role = 'owner'` like every other `clients` field.
13. `SCHEMA-REQ-013` — `POST /api/kankaku/clients/{id}/favicon/refresh`
    SHALL be restricted to `role = 'owner'` (401 unauthenticated, 403
    authenticated non-owner), SHALL fetch the client's site server-side at
    most once per call, and SHALL NOT be reachable from a `clients`
    create/update hook (see [ADR
    0019](../adr/0019-hub-fetches-and-stores-client-favicons.md)).
14. `SCHEMA-REQ-014` — The favicon-refresh route SHALL never return `500`;
    every failure mode SHALL resolve to `200` with
    `{ ok: false, reason: "<code>" }` using one of the stable codes
    `no_website`, `fetch_failed`, `no_icon_found`, `unsupported_type`,
    `too_large`, `blocked_host` (see
    [`../contract.md`](../contract.md#post-apikankakuclientsidfaviconrefresh)).
15. `SCHEMA-REQ-015` — `ignored_sessions` (migration `1758300014`) SHALL
    be a base collection recording a session the owner dismissed from the
    "sessions without a task" queue: `session_id` (text, required,
    **unique** index — the natural key, same one `task_entries` groups
    entries by), `machine` (text, informational only), `ignored_at`
    (autodate, set on create), `note` (text, optional). List/view SHALL
    require any authenticated user; create/update/delete SHALL require
    `role = 'owner'` — see
    [ADR 0024](../adr/0024-sessions-link-to-tasks-by-explicit-action.md).
16. `SCHEMA-REQ-016` — Migration `1758300015`'s reshape of
    `task_entries_daily_totals` (adding `agent` to the `GROUP BY` and to
    the view's output columns) is a **breaking shape change**: the view
    can now return up to one row per `(project, client, day, agent)`
    instead of one row per `(project, client, day)`. A web build compiled
    against the old shape SHALL continue to run without erroring against
    the new view (it simply won't see the new `agent` column) until the
    owner restarts PocketBase to pick up the current web build.
17. `SCHEMA-REQ-017` — `pocketbase/pb_hooks/task-auto-doing.pb.js` (rule in
    `pocketbase/pb_hooks/lib/task-status-rule.js`) SHALL be the sole
    exception to `SCHEMA-REQ-004`'s `tasks` write restriction: it runs
    with app/hook privileges, not through the `tasks` collection's normal
    API rules, after a `task_entries` create or update succeeds, and MAY
    move that entry's linked task from `status: "open"` to
    `status: "doing"` — never to `done`, and never reopening a task that
    is already `done` (see `TASKS-REQ-010`,
    [`web-tasks.md`](web-tasks.md)). Outside this one hook-mediated
    transition, the `service` role SHALL still be unable to write `tasks`
    directly through the API.
18. `SCHEMA-REQ-018` — `task_entries` SHALL support an optional
    `session_dir` field (migration `1758300016`, text, max 1000, no
    index — pi's non-default session directory, when it used one: `pi
    [--session-dir <dir>] --session <id>`), writable on create **and**
    update like `repo_project`, and subject to the same privacy category
    as `repo_project` — an absolute local path that can expose the
    machine's username/disk layout (see
    [`../contract.md`](../contract.md)). `work_records` SHALL NOT get
    this field: its rows are per-span, not per-session, and every span
    within one task already shares one `session_dir`, so there is no
    per-span resume path that would need it.
19. `SCHEMA-REQ-019` — `task_entries_daily_totals`' synthetic `id` column
    SHALL use a sentinel for an empty `agent` that cannot collide with a
    real reported `agent` value (migration `1758300018`: `'~none'`,
    replacing `1758300015`'s `'unreported'`, which could collide with an
    agent literally named `unreported`). `agent` values are lowercase
    slugs (see [`../contract.md`](../contract.md) "Agent and measurement
    quality"); `'~none'` cannot be one, so it is collision-proof by
    construction. Found by an independent review on 2026-09-21.

## Scenarios

### Scenario: an unauthenticated create is rejected (`SCHEMA-REQ-004`, `SCHEMA-REQ-005`)

- **Given** no `Authorization` header is sent
- **When** a client attempts `POST /api/collections/task_entries/records`
- **Then** the request fails with `400`

### Scenario: an unauthenticated list still returns 200 with an empty page (`SCHEMA-REQ-004`)

- **Given** no `Authorization` header is sent
- **When** a client attempts `GET /api/collections/task_entries/records`
- **Then** the request returns `200` with `items: []` (PocketBase's listRule filters rather than denying outright)

### Scenario: the service account cannot create a client (`SCHEMA-REQ-004`)

- **Given** the request is authenticated as `role: "service"`
- **When** it attempts `POST /api/collections/clients/records`
- **Then** the request fails with the generic `400 Failed to create record.` shape (a rule mismatch, not a field-level error)

### Scenario: deleting a task_entries row removes its work_records (`SCHEMA-REQ-006`)

- **Given** a `task_entries` row has two child `work_records` rows
- **When** the owner deletes the `task_entries` row
- **Then** both child `work_records` rows are also deleted

### Scenario: the daily-totals view never counts work_records (`SCHEMA-REQ-008`)

- **Given** a task with a `work_records` child whose `wall_ms` differs from the parent's `wall_ms`
- **When** `task_entries_daily_totals` is queried for that day/project/client
- **Then** the returned `wall_ms` matches the `task_entries` row's value, not any sum involving `work_records`

### Scenario: the service account cannot write a client's contact fields either (`SCHEMA-REQ-011`)

- **Given** the request is authenticated as `role: "service"`
- **When** it attempts to `PATCH` a `clients` record's `website`/`contact_email`/`contact_phone`/`notes`
- **Then** the request fails with the same generic `400` shape as any other service-account write to `clients` (verified manually — see `ESTADO.md`)

### Scenario: the four contact fields round-trip through migrate down/up (`SCHEMA-REQ-011`)

- **Given** migration `1758300011_clients_contact_fields.js` is reverted (`migrate down`)
- **When** the schema is inspected
- **Then** `website`/`contact_email`/`contact_phone`/`notes` are gone from `clients` and every other field is untouched; re-applying (`migrate up`) restores exactly those four fields (verified manually — see `ESTADO.md`)

### Scenario: an unauthenticated favicon refresh is rejected (`SCHEMA-REQ-013`)

- **Given** no `Authorization` header is sent
- **When** a client attempts `POST /api/kankaku/clients/{id}/favicon/refresh`
- **Then** the request fails with `401` (verified manually against an isolated instance — see `ESTADO.md`)

### Scenario: the service account cannot refresh a client's favicon (`SCHEMA-REQ-013`)

- **Given** the request is authenticated as `role: "service"`
- **When** it attempts `POST /api/kankaku/clients/{id}/favicon/refresh`
- **Then** the request fails with `403` (verified manually against an isolated instance — see `ESTADO.md`)

### Scenario: refreshing a client with no website never touches the network (`SCHEMA-REQ-014`)

- **Given** a `clients` row has an empty `website` (or is the "Sin determinar" unassigned row)
- **When** the owner calls `POST /api/kankaku/clients/{id}/favicon/refresh`
- **Then** the request returns `200` with `{ ok: false, reason: "no_website" }`, and `favicon`/`favicon_source`/`favicon_checked_at` are all cleared to empty (verified manually — see `ESTADO.md`)

### Scenario: a blocked host never reaches 500 (`SCHEMA-REQ-013`, `SCHEMA-REQ-014`)

- **Given** a `clients` row's `website` resolves to a loopback/private address
- **When** the owner calls the favicon-refresh route without the `KANKAKU_FAVICON_ALLOW_PRIVATE` test override set
- **Then** the request returns `200` with `{ ok: false, reason: "blocked_host" }`, never `500` (verified manually against an isolated instance — see `ESTADO.md`)

### Scenario: a duplicate ignored_sessions create is rejected at the schema level (`SCHEMA-REQ-015`)

- **Given** an `ignored_sessions` row already exists with `session_id: "abc"`
- **When** a second create is attempted with the same `session_id`
- **Then** it fails with a unique-constraint violation (`validation_not_unique` on `session_id`), which the calling composable treats as an idempotent no-op (see
  [`web-sessions.md`](web-sessions.md), `SESSIONS-REQ-012`)

### Scenario: the service account cannot delete an ignored_sessions row (`SCHEMA-REQ-015`)

- **Given** the request is authenticated as `role: "service"`
- **When** it attempts `DELETE /api/collections/ignored_sessions/records/<id>`
- **Then** the request fails with `403`, the same rule shape as every other owner-only write in this schema

### Scenario: the task-auto-doing hook is the sole exception to the tasks write restriction (`SCHEMA-REQ-017`)

- **Given** the request is authenticated as `role: "service"`
- **When** it attempts `PATCH /api/collections/tasks/records/{id}` directly
- **Then** the request still fails (`404`, the single-record rule-mismatch
  shape — distinct from the generic `400` a rejected `create` returns, see
  the `SCHEMA-REQ-004` scenario above); the only way that same `service`
  account can move a task from `open` to `doing` is indirectly, by
  creating or updating a `task_entries` row with that task's id in `task`,
  which the hook then applies with its own app privileges (verified
  manually end-to-end on an isolated copy, with the `service` account)

### Scenario: the reshaped view returns one row per agent within a day (`SCHEMA-REQ-008`, `SCHEMA-REQ-016`)

- **Given** two `task_entries` rows share `project`/`client`/`started_at` day but have `agent: "pi"` and `agent: "opencode"` respectively
- **When** `task_entries_daily_totals` is queried for that project/client/day
- **Then** it returns two rows, one per agent, each summing only its own agent's entries — never blended into a single row

### Scenario: session_dir round-trips through migrate down/up (`SCHEMA-REQ-018`)

- **Given** migration `1758300016_task_entries_session_dir.js` is reverted (`migrate down`)
- **When** the schema is inspected
- **Then** `session_dir` is gone from `task_entries` and every other field is untouched; re-applying (`migrate up`) restores exactly that one optional text field, and `work_records` never had it to begin with

## Configuration

None — schema is fixed by migration, not runtime-configurable. See
[`../architecture/hub-backend.md`](../architecture/hub-backend.md) for the
full field tables per collection.

## Edge cases & failure modes

- `app.findFirstRecordByFilter` throws (not returns `null`) when nothing
  matches — every migration that looks up an existing row wraps the call in
  `try/catch` (documented in `kankaku-hub/AGENTS.md`).
- `bool`/`number` fields have no PocketBase schema-level default in 0.40 —
  callers (seed script, sync client) must always send `active: true`
  explicitly; an omitted bool defaults to `false`.
- The favicon-refresh route's SSRF guard does not protect against DNS
  rebinding: it only inspects the literal hostname/IP text in a URL, and
  `$http.send` gives no hook to inspect the IP address a public-looking
  hostname actually resolves to at connect time. This is a known,
  documented limitation, not a solved problem — see [ADR
  0019](../adr/0019-hub-fetches-and-stores-client-favicons.md) and
  [`../architecture/hub-backend.md`](../architecture/hub-backend.md).
- `$http.send` follows redirects itself with no hook to re-validate the
  SSRF guard against intermediate redirect targets — only the originally
  requested URL is checked before the request is sent.

## Out of scope

- Row-level ownership beyond `owner`/`service` roles (no per-client or
  per-project access scoping — this is a single-owner tool).
- Multi-tenancy of any kind.
- Automatic/background favicon refresh (owner-triggered only, see [ADR
  0019](../adr/0019-hub-fetches-and-stores-client-favicons.md)).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `SCHEMA-REQ-001` | policy statement in `kankaku-hub/AGENTS.md` | covered (documentation, not a test) |
| `SCHEMA-REQ-002` | migration `1758300002_clients_collection.js` (`idx_clients_code`) | covered |
| `SCHEMA-REQ-003` | migrations `1758300005`, `1758300006` (`idx_task_entries_task_id`, `idx_work_records_kankaku_id`); duplicate-create verified manually per `ESTADO.md` | covered |
| `SCHEMA-REQ-004` | migrations `1758300002`–`1758300004`; auth rules verified manually per `ESTADO.md` | covered |
| `SCHEMA-REQ-005` | migrations `1758300005`, `1758300006`; auth rules verified manually per `ESTADO.md` | covered |
| `SCHEMA-REQ-006` | migration `1758300006_work_records_collection.js` (`cascadeDelete: true`) | not covered by an automated test found in this pass |
| `SCHEMA-REQ-007` | migration `1758300007_users_rules.js` | covered |
| `SCHEMA-REQ-008` | migration `1758300009_task_entries_daily_totals_view.js`; type/CAST behavior verified manually per `ESTADO.md` | covered |
| `SCHEMA-REQ-009` | migration `1758300010_enable_batch_api.js` | covered |
| `SCHEMA-REQ-010` | absence across all migrations (grep) | covered |
| `SCHEMA-REQ-011` | migration `1758300011_clients_contact_fields.js`; up/round-trip/down and service-role rejection verified manually per `ESTADO.md` | covered |
| `SCHEMA-REQ-012` | migration `1758300012_clients_favicon_fields.js`; applied and inspected on an isolated instance per `ESTADO.md` | covered |
| `SCHEMA-REQ-013` | `pocketbase/pb_hooks/favicon.pb.js`; owner/service/anon role checks verified manually against an isolated instance per `ESTADO.md` | covered |
| `SCHEMA-REQ-014` | `pocketbase/pb_hooks/favicon.pb.js`, `pocketbase/pb_hooks/lib/favicon-*.js`; unit tests `pocketbase/pb_hooks/lib/*.test.js` (`npm run hooks:test`); reason codes verified manually against an isolated instance (no_website, blocked_host, and a real successful fetch) per `ESTADO.md` | covered |
| `SCHEMA-REQ-015` | migration `1758300014_ignored_sessions_collection.js` (unique index `idx_ignored_sessions_session_id`, owner-only write rules) | not covered by an automated test found in this pass |
| `SCHEMA-REQ-016` | migration `1758300015_task_entries_daily_totals_by_agent.js` | not covered by an automated test found in this pass |
| `SCHEMA-REQ-017` | `pocketbase/pb_hooks/task-auto-doing.pb.js`, `pocketbase/pb_hooks/lib/task-status-rule.js`; unit tests `pocketbase/pb_hooks/lib/task-status-rule.test.js` (`npm run hooks:test`) | partially covered — the unit tests prove the pure `open`→`doing` decision rule only; the hook integration (the actual PocketBase-level trigger on `task_entries` create/update, and the `service`-role `tasks` PATCH rejection) is covered by a manual/e2e check, not by these unit tests alone |
| `SCHEMA-REQ-018` | migration `1758300016_task_entries_session_dir.js`; resume-command wiring proven by `web/tests/session-resume.test.ts`/`web/tests/session-aggregate.test.ts` (see `web-sessions.md` `SESSIONS-REQ-019`); migrate up/down round-trip not separately exercised by an automated test found in this pass | not covered by an automated test found in this pass |
| `SCHEMA-REQ-019` | migration `1758300018_task_entries_daily_totals_sentinel.js`; applied and its `viewQuery` inspected on an isolated instance (2026-09-21) | not covered by an automated test found in this pass |
