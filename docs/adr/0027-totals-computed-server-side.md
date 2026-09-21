# 0027-totals-computed-server-side

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-21 |

## Context

The web pulled whole `task_entries` row sets to the browser and summed
them client-side (`app/lib/aggregate.ts`): `useTaskEntries.fetchRange`
(dashboard, project detail — its `FIELDS` even included the heavy
`prompt` text the dashboard never shows) and, worst, `fetchAll` with
**no date filter**, used for the tasks board's all-time per-task totals.
`useSessions.ts` made up to three `getFullList` calls per screen
(sessions-without-task queue, a task's sessions), `useUnassignedQueue.ts`
fetched every unassigned row, and `useEntriesExplorer.listAgents`
fetched every row's `agent` field just to build a filter dropdown. None
of this is bounded: it grows with every prompt the owner ever runs, and
`fetchAll` in particular re-fetches and re-sums the entire table on
every tasks-board visit.

Measured before this change (100k synthetic `task_entries` rows,
`pocketbase/seed/bulk.js`, isolated instance): the tasks board's
`fetchAll()` transferred ~26 MB and took several seconds to fetch, parse
and group in the browser; the dashboard's `fetchRange` over a 90-day
window on the same dataset transferred several MB depending on density.
Every consolidated `task_entries` row is already safe to
`SUM(...)`/`COUNT(...)`/`MIN(...)`/`MAX(...)` (rule D6,
`docs/architecture/aggregation.md`) — there is no reason a total needs
every row on the wire.

## Decision

**Totals are computed by the server; the browser fetches rows only to
DISPLAY a page of rows.** A new PocketBase JS hook route, `POST
/api/kankaku/totals` (`pocketbase/pb_hooks/totals.pb.js` +
`pocketbase/pb_hooks/lib/totals-query.js`), runs
`SUM`/`COUNT`/`MIN`/`MAX` directly in SQLite over `task_entries` only
(never `work_records` — D6 is enforced here too: the query builder has
no code path that references that table), grouped by a caller-chosen
dimension from a fixed whitelist (`none`, `day`, `client`, `project`,
`task`, `session`, `agent`, `model`, `legacy_label`). The web's
`useTotals()` composable (`web/app/composables/useTotals.ts`) and pure
response mapper (`web/app/lib/totals-map.ts`) replace the
`getFullList`+client-sum pattern on the dashboard, the tasks board's
all-time per-task totals, and the sessions-without-task queue.

**Local-day rule preserved, not reintroduced as UTC**: the caller
(browser) computes local-day boundary instants
(`web/app/lib/local-day.ts#buildLocalDayBoundaries`, reusing
`localWallClockToUtc`) and sends them as `day_boundaries`; the server
buckets `started_at` into those caller-supplied half-open intervals via
a bound `CASE` expression, never by slicing a UTC string
(`task_entries_daily_totals`'s pre-existing UTC-day mistake, see ADR
0026, is not repeated).

**Security**: every dimension the caller can pick (`group_by`, `sort`,
filter keys) resolves through a fixed whitelist to a hard-coded SQL
fragment in `totals-query.js` — request text never becomes a SQL
identifier or is concatenated into a query string. Every value is a
bound `dbx` named parameter. Authentication mirrors `task_entries`' own
list rule (`@request.auth.id != ''`); no new privilege is granted, no
information is exposed beyond what the caller could already reconstruct
by listing `task_entries` itself. Day boundaries are capped at 400,
page size at 200, and the request body at ~60 000 characters.

**Degrades gracefully**: the route is new, so an owner who hasn't
restarted PocketBase yet doesn't have it loaded. Every migrated call
site catches a 404 specifically (`TotalsRouteUnavailableError`) and
falls back to the previous client-side path silently — no error toast,
same numbers, just slower until the owner restarts once.

## Consequences

- Measured on the 100k-row isolated dataset: a date-bounded totals call
  (the realistic dashboard/sessions-queue case) is 10-60 ms server-side
  and transfers well under 5 KB; the tasks board's genuinely unbounded
  all-time `group_by=task` call (no `WHERE` clause at all — nothing to
  index against) is ~190-215 ms, above the 150 ms suggestion but still a
  ~15-25x improvement over fetching and grouping the full table
  client-side, and the transferred payload drops from tens of MB to
  tens of KB regardless.
- `group_by=session` is the slowest group_by (~45 ms date-bounded,
  ~330 ms all-time) because it runs two correlated subqueries
  (`session_name`, `machine`) plus four `COUNT(DISTINCT ...)` aggregates
  per group — documented, not hidden, in
  `docs/architecture/hub-backend.md`.
- New indexes were required (migration `1758300019`) for `task`,
  `session_id`, `model`, and `(legacy_client_label, repo_project)` —
  the pre-existing `(project, started_at)`/`(client, started_at)`/
  `(started_at)`/`(agent, started_at)` indexes already covered the rest.
- The single-dimension `group_by` design cannot express a two-dimensional
  breakdown (e.g. "cost per day, stacked by client") in one call. The
  dashboard's stacked chart works around this with up to 5 extra
  `group_by=day` calls (one per top-5 client/project, reusing the single
  `filters.client`/`filters.project` scalar filter) rather than adding a
  compound-dimension mode to the endpoint — bounded (≤5 calls), simple,
  and avoids widening the whitelist surface for a chart feature only the
  dashboard uses today.
- Every migrated screen needs a fallback code path (see "Degrades
  gracefully" above), roughly doubling the code in each migrated
  composable/page until the fallback is eventually retired (not planned
  as part of this change — see the final report for the retirement
  condition: once every environment this repo cares about has restarted
  PocketBase at least once).
- Not every unbounded-fetch call site was migrated in this change
  (project detail, unassigned queue groups, entries explorer's agent
  filter, the task detail sheet's per-task session list remain on the
  old path) — `useTotals()`/`totals-map.ts` are written generically
  enough that migrating them is a mechanical repeat of the same pattern,
  not a new design; see the final report for the reasoning per screen.

## Alternatives considered

- **A dedicated PocketBase view collection per report** (the existing
  `task_entries_daily_totals` pattern) — rejected: a view's shape is
  fixed at migration time; this feature needs caller-chosen filters,
  group-by dimension, sort, and pagination, none of which a static view
  can parametrize. A JS hook route is the only mechanism PocketBase 0.40
  offers for a parametrized aggregate query.
- **A two-dimensional `group_by` (e.g. `day,client`)** — rejected for
  this change: doubles the whitelist/branch surface in
  `totals-query.js` and the SQL complexity (nested `CASE` × `GROUP BY`
  on two computed keys) for a single caller (the dashboard's stacked
  chart), which the bounded per-series fan-out already serves adequately
  without touching the server's group-by contract. Worth revisiting if a
  second consumer needs it.
- **Compute `total_groups` via a separate `COUNT(*)` query always** —
  rejected in favor of a `COUNT(*) OVER()` window column on the page
  query itself (falling back to the separate query only when the
  requested page is past the last page) — cuts the common case from
  three queries to two.
- **Retire the client-side aggregation helpers (`aggregate.ts`,
  `measurement-quality.ts`) entirely** — rejected: they remain the
  fallback path's implementation and the equivalence tests'
  ground truth; removing them would also remove the safety net this
  feature's own equivalence guard depends on.

## Related

- ADRs: [0006](0006-aggregation-rule-lives-once-in-kankaku.md), [0007](0007-web-is-a-view-layer.md), [0026](0026-day-boundaries-are-local.md)
- Specs: [`../specs/web-dashboard.md`](../specs/web-dashboard.md), [`../specs/web-tasks.md`](../specs/web-tasks.md), [`../specs/web-sessions.md`](../specs/web-sessions.md), [`../specs/web-unassigned-queue.md`](../specs/web-unassigned-queue.md), [`../specs/hub-schema-and-access-rules.md`](../specs/hub-schema-and-access-rules.md)
- Code: `pocketbase/pb_hooks/totals.pb.js`, `pocketbase/pb_hooks/lib/totals-query.js`, `pocketbase/pb_migrations/1758300019_task_entries_totals_indexes.js`, `web/app/composables/useTotals.ts`, `web/app/lib/totals-map.ts`, `web/app/lib/local-day.ts`, `pocketbase/seed/bulk.js`
