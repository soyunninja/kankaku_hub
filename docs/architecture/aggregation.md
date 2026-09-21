# The aggregation rule: interval union

This is the single most important rule in the system (see
[ADR 0006](../adr/0006-aggregation-rule-lives-once-in-kankaku.md)): a task's
wall time is the **union** of the orchestrator's and its subagents' time
intervals, never their **sum**. It exists in exactly one place — kankaku's
domain layer — and every downstream consumer (the hub, the web) only ever
reads the already-consolidated result.

## Why union, not sum

A subagent can run concurrently with its orchestrator (they overlap), and a
background subagent can keep running — and settle — after the orchestrator
that spawned it has already finished. Summing `orchestratorMs + subagent1Ms
+ subagent2Ms + ...` double-counts every overlapping second and produces a
wall time longer than the time that actually elapsed. Summing also has no
stable answer: it changes retroactively as late subagents settle, which is
exactly the case [sync's revisit window](../specs/sync-push.md) exists to
handle.

## Where it lives

- **Primitive**: `unionMs(intervals)` in
  `kankaku/src/domain/intervals.ts` — sort intervals by start; walk them,
  merging any interval whose start falls inside (or right at the end of) the
  running window into that window, extending the window's end to the
  furthest point reached; when a gap is found, close the window and add its
  duration to the total; start a new window. The same primitive is reused
  for waiting spans, segment spans, one task's wall time, and one session's
  wall time — there is exactly one merge algorithm in the codebase.
- **Task assembly**: `buildTaskView(orchestrator, subagents)` in
  `kankaku/src/domain/task-view.ts` computes, per task:
  - `wallMs = unionMs([orchestratorInterval, ...subagentIntervals])`
  - `waitingMs = orchestrator.waitingMs` (waiting is tracked on the
    orchestrator only — subagents never wait on the user)
  - `workMs = wallMs - waitingMs`
- **Matching children to a task**: `matchChildren` (`task-view.ts`) matches a
  subagent record to the orchestrator record where
  `orchestrator.project === child.project && orchestrator.pid === child.parentPid`
  and the child's start falls inside `[parentStart, parentEnd]`, tie-broken
  toward the latest-starting orchestrator (handles pid reuse). Unmatched
  children become orphans and are reported separately, never silently
  dropped or silently summed into another task.
- **Building every task**: `buildTasks(records)` (`task-view.ts`, exported)
  — the function referenced by proposal §6/D6 and by
  `kankaku/AGENTS.md`. Filters and sorts orchestrator records, matches
  children via `matchChildren`, and calls `buildTaskView` per task.
- **Sessions**: `buildSessions(tasks)` groups tasks by `sessionId` (falling
  back to `"unknown"`), unioning every orchestrator+subagent interval across
  a session's tasks the same way, for the session-level `wallMs`.

## What "summable" means downstream

Because `buildTasks` already resolved every overlap before a row is ever
sent to the hub, a `task_entries` row's `wall_ms`/`work_ms`/`waiting_ms` are
final numbers that can be added across rows without re-deriving anything:
`SUM(wall_ms) GROUP BY project` is correct. This is why the hub schema has
**two** collections instead of one — see
[`hub-backend.md`](hub-backend.md#two-collections-one-summable-one-not):

- `task_entries` — one row per task, pre-consolidated, always safe to sum.
- `work_records` — optional raw per-process detail, flagged `rollup: false`,
  **never** safe to sum (its rows are exactly the intervals `unionMs`
  already merged into the parent task).

The web enforces the same boundary in the opposite direction: it only ever
reads `task_entries` for a total, and the one function allowed to add these
fields together is a single guarded helper — see
[`hub-web.md`](hub-web.md#the-d6-guard) and
[ADR 0007](../adr/0007-web-is-a-view-layer.md).

## The server sums; the browser displays

D6 says a `task_entries` row is safe to `SUM(...) GROUP BY ...` — it does
not say WHERE that sum has to run. Before
[ADR 0027](../adr/0027-totals-computed-server-side.md), every sum ran in
the browser: a screen fetched the full row set for its date range (or,
for the tasks board's all-time per-task totals, the full table with no
date filter at all) and reduced it client-side
(`web/app/lib/aggregate.ts`). That is unbounded work that grows with
every prompt the owner ever runs, for a result that is, by construction,
just a handful of numbers.

`POST /api/kankaku/totals` (`pocketbase/pb_hooks/totals.pb.js` +
`pocketbase/pb_hooks/lib/totals-query.js`) moves the SUM/COUNT/MIN/MAX
into SQLite, still reading only `task_entries` (D6 is enforced in the SQL
builder itself: there is no code path that ever references
`work_records`), and still computing local-day buckets the same way ADR
0026 requires — the browser computes the local-day boundary instants
(`web/app/lib/local-day.ts#buildLocalDayBoundaries`) and sends them to
the server, which buckets `started_at` into those caller-supplied
half-open intervals; the server never re-derives a day from a UTC string
slice. The rule this repo has followed since the dashboard existed —
**the browser fetches rows only to display them, a total is never
assembled by fetching every row that makes it up** — is now enforced
structurally for the two worst previous offenders (the dashboard, the
tasks board) and the sessions-without-task queue, not just by convention.
See [`hub-backend.md`](hub-backend.md#the-totals-endpoint) and
[`hub-web.md`](hub-web.md#totals-the-server-sums-the-browser-displays)
for the implementation, and this feature's final report for which
screens still use the pre-totals client-side path and why.

## The shared-fixture guard

Both sides of the D6 boundary are tested against the same expectation, so a
divergence fails a test rather than surfacing in front of a client:

- **kankaku**: `kankaku/tests/task-view.test.ts` asserts `buildTasks`'
  union-based totals against hand-computed expectations, including
  overlapping and late-settling subagents.
- **kankaku-hub web**: `web/tests/aggregate.test.ts` (using
  `web/tests/fixtures/task-entries.ts`) asserts that
  `sumTaskEntries`/`groupByKey` (`web/app/lib/aggregate.ts`) produce the same
  kind of plain-sum totals over already-consolidated `task_entries` rows —
  proving the web never needs to (and structurally cannot, per the D6 guard
  comment at the top of `aggregate.ts`) re-run interval union itself.
- **the totals endpoint vs. the client-side path**:
  `pocketbase/pb_hooks/lib/totals-query.test.js` unit-tests the SQL
  builder in isolation (33 cases: acceptance, injection/unknown-param
  rejection, oversized/malformed input), and
  `web/tests/totals-equivalence.test.ts` is a THIRD, permanent guard —
  skipped by default (`describe.skipIf(!process.env.TOTALS_LIVE_PB_URL)`,
  so `pnpm test`/CI never needs a live server), but when pointed at a
  live isolated PocketBase instance it computes the same totals both ways
  (the OLD `aggregate.ts`/`measurement-quality.ts`/`local-day.ts` path
  over rows fetched with `getFullList`, and the NEW `POST
  /api/kankaku/totals` response) and asserts they agree to the last
  ms/token (ints, exact) and cost within float tolerance, across
  `group_by=none/client/project/day`, three time zones (UTC, Asia/Tokyo,
  America/Los_Angeles), and a spring-forward DST-transition week
  (America/Los_Angeles, 2026-03-07..2026-03-09).

These are, in total, three independent test suites (two repos plus the
web's two-sided guard) asserting the same contract from each side, not a
single shared fixture file — see [`../specs/sync-push.md`](../specs/sync-push.md) and
[`../specs/web-dashboard.md`](../specs/web-dashboard.md) for the exact
traceability.

## The session rule, as the web applies it

The hub never receives a session's raw orchestrator/subagent intervals —
only each task's already-collapsed `task_entries` row. So when the web
groups several of a session's rows together
(`web/app/lib/session-aggregate.ts#groupBySession`, feeding
`TaskDetailSheet.vue` and the "sessions without a task" queue), it CANNOT
re-run `unionMs` the way kankaku's own `buildSessions` does — doing so
from incomplete data would produce a different wrong number, not a fix
(ADR 0006 stays intact: the union lives exactly once, in kankaku).

Verified against `kankaku/src/domain/task-view.ts#buildSessions` on
2026-09-21 (an independent review had assumed the opposite for `waitingMs`
and needed correcting):

- **`wallMs`/`workMs` summed across a session's rows are upper bounds,
  not exact** — a background subagent from task N can still be running
  when task N+1 starts, so task N's own already-unioned `wall_ms` window
  can overlap task N+1's, and summing double-counts that overlap. The web
  shows the session's `elapsedMs` (`min(started_at)` to `max(ended_at)`)
  instead — exact, honestly labelled "elapsed", never claimed to be a
  true wall-time union.
- **`waitingMs` summed across a session's rows IS exact**, not an upper
  bound: kankaku's own `buildSessions` computes the true session
  `waitingMs` the same way — a plain sum over each task's `waitingMs`,
  never a union — because waiting is tracked on the orchestrator only and
  distinct orchestrator turns don't overlap each other the way a
  lingering background subagent can overlap the next turn's start. The
  web's sum matches kankaku's own session-level definition exactly.

See [`hub-web.md`](hub-web.md#session-level-totals-are-not-a-plain-d6-sum)
for the web-side details and the affected components.

## Planned change

A [proposal](../proposals/2026-09-20-generic-subagent-detection.md) would
extend `matchChildren` with a second, registry-corroborated pass so a
gentle-pi subagent running in a different git worktree can be reunited
with its orchestrator **locally, before `buildTasks` runs** — this page's
"exactly once, in kankaku" rule stays intact; the hub is explicitly
designed to never sum two independently-unioned rows to recover a missing
join. See [ADR 0023](../adr/0023-cross-worktree-children-reunited-locally-first.md).

## Related

- [ADR 0006 — the aggregation rule lives exactly once, in kankaku](../adr/0006-aggregation-rule-lives-once-in-kankaku.md)
- [ADR 0007 — the web is a view layer, not a second brain](../adr/0007-web-is-a-view-layer.md)
- [`kankaku-extension.md`](kankaku-extension.md) — full domain/ports/adapters map
- [`hub-backend.md`](hub-backend.md) — the two-collection schema this rule motivates
- [`../specs/record-identity.md`](../specs/record-identity.md), [`../specs/sync-push.md`](../specs/sync-push.md)
