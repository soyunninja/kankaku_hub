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
| `favicon` | file, optional, single, max 512000 bytes | Added by `1758300012_clients_favicon_fields.js`. Mime types restricted to `image/png`, `image/x-icon`, `image/vnd.microsoft.icon`, `image/jpeg`, `image/gif`, `image/webp` — no `image/svg+xml` (SVG can carry inline script). Populated only by the favicon-refresh route below. |
| `favicon_source` | text, optional, max 2000 | Same migration. The exact URL the stored icon was downloaded from. |
| `favicon_checked_at` | date, optional | Same migration. Stamped on every refresh attempt except `no_website` (see below). |

Access: `list`/`view` = any authenticated user; `create`/`update`/`delete` =
`role = 'owner'` only — the four contact fields and the three favicon
fields are not special-cased, they follow the same rule as
`name`/`code`/`active`. The sync client (service account) only ever reads
this collection. No rate/price/invoice field exists or will exist here
(the billing boundary, [ADR
0018](../adr/0018-billing-boundary-enforced-in-schema.md)) — the contact
and favicon fields are display metadata, not money.

### The favicon fetcher (`pocketbase/pb_hooks/`)

Migration `1758300012_clients_favicon_fields.js` adds the three fields
above; `pocketbase/pb_hooks/favicon.pb.js` implements
`POST /api/kankaku/clients/{id}/favicon/refresh`, the only route that
populates them. See [ADR
0019](../adr/0019-hub-fetches-and-stores-client-favicons.md) for why this
is a server-side, explicitly-triggered fetch (never hot-linking, never a
third-party favicon service) and
[`../contract.md`](../contract.md#post-apikankakuclientsidfaviconrefresh)
for the exact request/response contract and reason codes.

**Loading.** `pb_hooks/*.pb.js` files are auto-loaded by PocketBase at
boot from the directory passed via `--hooksDir` (both `scripts/dev.sh` and
the isolated test setup used to verify this feature pass
`--hooksDir pocketbase/pb_hooks`). Shared pure logic lives under
`pb_hooks/lib/*.js` (not `*.pb.js`, so PocketBase never tries to
auto-execute it as a hook) and is loaded with
``require(`${__hooks}/lib/<name>.js`)``, following the pattern from
PocketBase's own `js-overview` docs.

**A real goja/PocketBase hooks constraint hit while building this** (not
guessed — reproduced against a running isolated instance): a `routerAdd`
handler closure does **not** see the hook file's top-level scope at all —
not a top-level `function` declaration, not a top-level `var`/`const`
binding, and not the result of a top-level `require(...)` call.
Referencing any of them from inside the handler throws `ReferenceError:
<name> is not defined` at request time, even though the exact same code
runs correctly under Node. The fix: every `require(...)` call and every
helper function the handler needs must be declared **inside** the handler
function body (nested `function` declarations and `require(...)` calls
both work fine there — ordinary intra-function hoisting is unaffected,
only the top-level-to-handler boundary is broken). `favicon.pb.js`
declares everything — the three `require(...)` calls, all constants, and
every helper function — inside the single `routerAdd(...)` callback for
this reason.

Other goja constraints actually encountered (confirmed, not assumed):

- **No global `URL`/`URLSearchParams`.** Not declared in
  `pocketbase/pb_data/types.d.ts` and not documented as available (the
  js-overview docs list `URL` among Web/Node APIs outside the ES5+partial-ES6
  baseline). `pb_hooks/lib/favicon-html.js` and
  `pb_hooks/lib/favicon-ssrf-guard.js` therefore hand-roll their own
  minimal absolute-URL parsing/resolution instead of `new URL(...)` — this
  also keeps them running unmodified under plain Node for `node --test`.
- **No `async`/`await`, no `setTimeout`/`setInterval`** (documented by
  PocketBase; not used anywhere in this feature — `$http.send` is
  synchronous).
- **`const`, `let`, arrow functions, template literals, and destructuring
  work fine** — already proven by this repo's existing migrations (e.g.
  `migrate((app) => {...})`) and confirmed again in `favicon.pb.js` itself.
  Optional chaining (`?.`) and nullish coalescing (`??`) were avoided
  throughout as a precaution (not confirmed unsupported, just not risked).
- **`$os.getenv(key)` works inside pb_hooks route handlers** — used by
  `pb_hooks/lib/favicon-ssrf-guard.js`'s test-only
  `KANKAKU_FAVICON_ALLOW_PRIVATE` override (see below), read via
  `process.env` under Node and `$os.getenv` under goja, defaulting off in
  both.
- **`$http.send`'s body comes back as `Array<number>` (raw bytes), not a
  string** — the response also exposes a deprecated `raw` string and a
  parsed `json` field, but favicon bytes need the raw array. HTML text is
  decoded with the global `toString(bytes)` helper PocketBase exposes for
  exactly this (per the `js-sending-http-requests` docs' own example).

**SSRF guard** (`pb_hooks/lib/favicon-ssrf-guard.js`). Before every
fetch — the initial page fetch and each candidate icon download — the
target URL is checked against `isUrlAllowed()`: only `http`/`https`
schemes; `localhost` and any `*.localhost`/`*.local`/`*.internal`
hostname (proper-suffix match only — `localhost.evil.com` is **not**
blocked, only `localhost` itself or a real subdomain of it); and every
IPv4/IPv6 literal in the loopback, private (`10/8`, `172.16/12`,
`192.168/16`), link-local (`169.254/16`, which covers the cloud metadata
address `169.254.169.254`), unique-local (`fc00::/7`), and unspecified
ranges — including the classic bypass encodings (decimal integer,
hex, octal, IPv4-mapped IPv6, bracketed IPv6) that a naive string check
would miss. A `KANKAKU_FAVICON_ALLOW_PRIVATE` env var overrides the guard
for integration testing only, and defaults off.

Two limitations are real and documented rather than assumed away:

- **DNS rebinding is not covered.** The guard only inspects the literal
  hostname/IP text in a URL. It cannot see, and `$http.send` gives no hook
  to inspect, the IP address a public-looking hostname actually resolves
  to at connect time — a hostname that passes this check today could
  resolve to a private address when PocketBase's HTTP client actually
  connects. This is an honest gap, not a solved problem.
- **Redirects are not re-validated per hop.** `$http.send` follows
  redirects itself (standard Go `net/http` client behavior) with no hook
  to inspect or stop at an intermediate redirect target — only the
  originally requested URL is checked before the request is sent. A
  malicious redirect chain that starts at an allowed host and hops to a
  blocked one is not caught by this guard.

**Extraction and ranking** (`pb_hooks/lib/favicon-html.js`). Parses
`<link rel="icon"|"shortcut icon"|"apple-touch-icon"|
"apple-touch-icon-precomposed">` tags (case-insensitive tag/attribute
names, single- or double-quoted values), resolves relative/protocol-relative
hrefs against the final page URL (honoring a `<base href>` override when
present), and ranks candidates preferring a declared `sizes` in the
32-192px range, then png over ico at equal rank. Only the first ~200KB of
the fetched HTML is parsed (`HTML_PARSE_CAP_BYTES`) — favicon `<link>`
tags live in `<head>`, no page needs more than that to find them. If no
candidate is found (or all fail), `{origin}/favicon.ico` is tried as a
fallback.

**Content validation** (`pb_hooks/lib/favicon-sniff.js`). Every downloaded
candidate is checked against **both** its declared `Content-Type` header
**and** its actual magic bytes (PNG `89 50 4E 47`, ICO `00 00 01 00`, JPEG
`FF D8 FF`, GIF `47 49 46 38`, WEBP `RIFF....WEBP`) before being accepted
— a mismatch (e.g. an HTML error page served with an `image/png` header)
is rejected as `unsupported_type`, never trusted from the header alone.
`$http.send` has no streaming mode (it returns the whole body at once), so
the 512000-byte size cap can only reject an oversized download after the
fact, not abort it mid-transfer — a documented, accepted limitation.

All three `pb_hooks/lib/*.js` files are pure functions with no
PocketBase/goja globals (aside from the guard's try/catch-guarded,
defaults-off env override) and are unit tested with plain
`node --test pocketbase/pb_hooks/lib/*.test.js` (`npm run hooks:test`),
so the parsing/sniffing/SSRF logic is verified independently of a running
PocketBase instance.

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

### The task-auto-doing hook (`pocketbase/pb_hooks/task-auto-doing.pb.js`)

Registered on `task_entries`' `onRecordAfterCreateSuccess` and
`onRecordAfterUpdateSuccess`: when a row is created with, or updated to, a
non-empty `task`, the linked task's `status` moves from `open` to `doing`.
A `doing` task is left alone and a `done` task is never reopened — `done`
is never set automatically, closing a task stays the owner's judgement
(pure decision rule in `pb_hooks/lib/task-status-rule.js`, unit tested by
`pb_hooks/lib/task-status-rule.test.js`, `npm run hooks:test`). The hook
runs with the app's own privileges, so it can update `tasks` even though
the `service` account cannot (see [`hub-schema-and-access-rules.md`
`SCHEMA-REQ-017`](../specs/hub-schema-and-access-rules.md)) — the same
"runs with app privileges, everything needed is `require`d inside the
handler" pattern as `favicon.pb.js` above. A failure in the hook is logged
and swallowed; it never fails the `task_entries` write that triggered it.

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

Migration `1758300009_task_entries_daily_totals_view.js`, reshaped by
`1758300015` (grouping added `agent`) and `1758300018` (sentinel fix). A
PocketBase **view** collection (inherently read-only — no create/update/
delete rules are meaningful on a view) that sums `task_entries` only,
grouped by `(project, client, day, agent)`. Every aggregate column is
wrapped in `CAST(...)` in the SQL, because PocketBase infers a view's
column types from the `SELECT` and, without the cast, `SUM(...)` columns
get inferred as the wrong type. Fields: `project`, `client`, `day`
(`YYYY-MM-DD` text), `agent`, `wall_ms`, `work_ms`, `waiting_ms`, `input`,
`output`, `cache_read`, `cache_write`, `cost`, `entries`. Treat it as a
starting point — add more view collections the same way if a report
needs a different grouping, always querying `task_entries`, never
`work_records`.

**`day` is a UTC calendar day, not the viewer's local day.** The SQL
`CAST(substr(te.started_at, 1, 10) AS TEXT)` slices the stored UTC
instant — SQLite has no per-row timezone context to do anything else.
The web app's own day-ranged screens (dashboard, entries explorer,
project detail) do NOT read this view for that reason — they fetch
`task_entries` directly and bucket by the viewer's LOCAL day client-side
(`web/app/lib/local-day.ts`, see
[ADR 0026](../adr/0026-day-boundaries-are-local.md)). This view has no
in-app consumer today; it is kept as a documented, read-only aggregation
surface for external tooling per [`../contract.md`](../contract.md), not
as the source of any day-labelled figure the web displays. A future
consumer that needs a LOCAL-day total must compute it from `task_entries`
the same way the web does, not from this view.

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

## The totals endpoint (`pocketbase/pb_hooks/totals.pb.js`)

`POST /api/kankaku/totals` — server-side `SUM`/`COUNT`/`MIN`/`MAX` over
`task_entries` (D6, never `work_records`), replacing the web's previous
`getFullList()`+client-side-sum pattern for the dashboard, the tasks
board's all-time per-task totals, and the sessions-without-task queue.
See [`../contract.md`](../contract.md#post-apikankakutotals) for the
full request/response contract and
[ADR 0027](../adr/0027-totals-computed-server-side.md) for why.

**Split into a route file and a pure lib**, same pattern as the favicon
feature: `totals.pb.js` only wires `$app.db()` to
`pocketbase/pb_hooks/lib/totals-query.js`, which does all request
validation and SQL building as plain, PocketBase-free functions
(`validateRequest`, `buildQueries`) — unit tested with
`node --test`/`npm run hooks:test`
(`pocketbase/pb_hooks/lib/totals-query.test.js`, 33 tests covering
acceptance, unknown-param/injection-attempt rejection, oversized/malformed
input, and the exact SQL/params `buildQueries` produces) independent of a
running PocketBase instance.

**The goja SQL API** (verified against a real running PocketBase 0.40.4
instance — `docs/architecture/hub-backend.md`'s existing favicon-feature
rule: "against the real binary, do not guess" applied again here):

```js
const rows = arrayOf(new DynamicModel({ group_key: "", cnt: 0, total: -0 }));
$app.db().newQuery("SELECT ... FROM task_entries te WHERE ... GROUP BY ...")
  .bind({ p_from: "...", p_client: "..." })
  .all(rows);
// rows is now populated in place — an array of plain objects.
```

- `arrayOf(new DynamicModel({...shape}))` pre-declares the result row
  shape (Go's `.All(&slice)` out-parameter convention, adapted for
  scripting) — every query in this route uses ONE of two fixed shapes
  (`AGG_SHAPE` for a total, `GROUP_ROW_SHAPE` for a grouped row) so a
  single `DynamicModel` declaration covers every `group_by` branch.
  `-0` (not `0`) declares a float field (`cost`, `cost_known_sum`) — `0`
  would declare an int field instead (documented `DynamicModel` caveat).
- Named bind params (`{:name}` in the SQL, `.bind({name: value})`) work
  exactly like the Go `dbx` package's documented syntax.
- **`dbx` bind params do NOT support a JS array value for an `IN(...)`
  clause** — confirmed by reproducing the failure, not assumed:
  `.bind({ codes: ["a", "b"] })` against `WHERE code IN ({:codes})`
  throws `GoError: sql: converting argument $1 type: unsupported type
  []interface {}, a slice of interface`. Not needed by this route (every
  filter is a scalar equality, and the day-bucket `CASE` binds one named
  param per boundary instant — see `totals-query.js#buildDayCase` — never
  an array), but worth recording so a future route doesn't rediscover
  this the hard way. The fix, if ever needed: generate one named
  placeholder per array element (`{:v0}, {:v1}, ...`) rather than a
  single array-valued bind.
- `EXPLAIN QUERY PLAN <sql>` works the same way, scanned into
  `{ id, parent, notused, detail }` rows — used to verify index usage
  while building this feature (see below), not shipped in the route
  itself.

**`COUNT(*) OVER()` for pagination** — the paginated "page" query
carries `total_groups` as a window column
(`CAST(COUNT(*) OVER() AS INTEGER) as total_groups_window`, computed over
the full grouped result before `LIMIT`/`OFFSET` trims it), so the common
case (a page within range) needs only 2 queries (grand total + page)
instead of 3. The one case a window value can't attach to — a requested
page past the last page, where `LIMIT`/`OFFSET` yields zero rows — falls
back to a separate `groupCount` query (`totals-query.js` still builds
it, unconditionally; `totals.pb.js` only runs it when `pageRows.length
=== 0`).

**Security**: `group_by`, `sort`, and every `filters` key are resolved
through a fixed whitelist (`GROUP_BY_VALUES`, `SORT_SQL`, `FILTER_KEYS`
in `totals-query.js`) to a hard-coded SQL fragment — request text is
NEVER used as a SQL identifier or concatenated into the query string;
every value is a bound `dbx` named parameter. Authentication is
`$apis.requireAuth()` (any authenticated user, matching `task_entries`'
own `list`/`view` rule — no new privilege). `day_boundaries` is capped at
401 entries (400 buckets), `per_page` at 200, and the request body at
~60 000 JSON-stringified characters. Unknown top-level or `filters` keys
are rejected with `400` naming the offending key
(`unknown_param:<name>`/`unknown_filter:<name>`).

**Indexes** (migration `1758300019_task_entries_totals_indexes.js`):
`(task, started_at)`, `(session_id, started_at)`, `(model, started_at)`,
`(legacy_client_label, repo_project)` — the pre-existing `(project,
started_at)`/`(client, started_at)`/`(started_at)`/`(agent, started_at)`
indexes (migrations `1758300005`, `1758300013`) already covered the
other `group_by` dimensions. Verified with `EXPLAIN QUERY PLAN` against
a 100k-row isolated dataset (`pocketbase/seed/bulk.js`):

| `group_by` | plan |
|---|---|
| `task` (no date filter — the tasks board's all-time case) | `SCAN te USING INDEX idx_task_entries_task_started` |
| `client`, date-bounded | `SEARCH te USING INDEX idx_task_entries_started (started_at>? AND started_at<?)` + `TEMP B-TREE FOR GROUP BY` |
| `session` | `SCAN te USING INDEX idx_task_entries_session_id` + `USING INDEX idx_ignored_sessions_session_id FOR IN-OPERATOR` + 4×`TEMP B-TREE FOR count(DISTINCT)` + 2 correlated scalar subqueries (`session_name`, `machine`), each `SEARCH ... USING INDEX idx_task_entries_session_id` |
| `day`, date-bounded | `SEARCH te USING INDEX idx_task_entries_started` + `TEMP B-TREE FOR GROUP BY` |

`group_by=session` is the most expensive shape by a clear margin (two
correlated subqueries plus four `COUNT(DISTINCT ...)` aggregates per
group) — see the measured latencies in this feature's final report.

**Measured latency** (100k rows, isolated instance, 5-run median,
server-observed via `process.hrtime` around the fetch, not the network
round-trip):

| Request | Median |
|---|---|
| `group_by: "none"`, 90-day range | 11 ms |
| `group_by: "client"`, 90-day range | 25 ms |
| `group_by: "session"`, 90-day range | 46 ms |
| `group_by: "day"`, 90 buckets | 59 ms |
| `group_by: "task"`, **all-time (no filter)** | 199 ms |
| `group_by: "session"`, all-time | 330 ms |

Every date-bounded call comfortably beats a 150 ms budget; the two
all-time (no `WHERE` clause at all, nothing to index against) cases do
not, because `task_entries` has no date-independent way to shrink the
scan — see [ADR 0027](../adr/0027-totals-computed-server-side.md)
"Consequences" and this feature's final report for the full before/after
comparison against the client-side path it replaces (both all-time cases
are still an order of magnitude faster and transfer orders of magnitude
less than fetching and summing the full table client-side).

## Migrations policy

`pocketbase/pb_migrations/*.js` files ARE the schema (`AGENTS.md`, "the
migrations are the contract"). PocketBase reconciles the database against
whichever migration files are present in `--migrationsDir` on every
`serve` startup, in filename order — there is no independent
"applied/rolled-back" runtime state that survives once a file is deleted
or edited. Two consequences:

- **`pocketbase migrate down` does not survive a restart.** It runs one
  migration's `down(app)` and un-records it as applied, but the file is
  still there, so the next `serve` re-applies its `up(app)` again. The
  supported rollback is either deleting the migration file (after
  `migrate down` has already run everywhere it was applied) or — the
  preferred, safer option — a NEW forward migration that reverts the
  change, the same way `1758300018` fixes `1758300015`'s sentinel rather
  than editing that file. Full procedure and the data-loss warning for a
  dropped column: [`../runbooks/troubleshooting.md`](../runbooks/troubleshooting.md#pocketbase-migrate-down-doesnt-survive-a-restart).
- **Never edit an already-shipped migration file's `up(app)`/`down(app)`
  bodies after it has been applied anywhere** (dev, the owner's instance,
  a deploy). An environment that already ran the old body has no way to
  detect the file changed underneath it; a later migration that changes
  the same collection is the only safe way to alter shipped state.

## Related

- [`../contract.md`](../contract.md) — the normative API surface (auth, upsert flow, batch, gotchas).
- [`../proposal.md`](../proposal.md) §4 — the original schema design.
- [`../specs/hub-schema-and-access-rules.md`](../specs/hub-schema-and-access-rules.md)
- [`overview.md`](overview.md), [`aggregation.md`](aggregation.md)
