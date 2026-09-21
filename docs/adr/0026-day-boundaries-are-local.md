# 0026-day-boundaries-are-local

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-21 |

## Context

An independent review on 2026-09-21 found that `task_entries.started_at`
(a UTC instant) was being range-filtered and chart-bucketed as if the
`YYYY-MM-DD` strings `app/lib/period.ts` computes (from the VIEWER's
local calendar, via `Date.getFullYear()`/`getMonth()`/`getDate()`) were
already UTC. A UTC+9 viewer working at local `2026-09-21 07:00` stores
`2026-09-20 22:00Z`; the old "today" filter (`started_at >= "2026-09-21
00:00:00.000Z"`) excluded it, while the dashboard/project trend charts
bucketed it by slicing the stored string's first 10 characters
(`e.started_at.slice(0, 10)`) — the UTC day, `2026-09-20`. The same entry
could land on two different "days" on two different screens.

Separately, `task_entries_daily_totals` (migration `1758300009`, reshaped
by `1758300015`) groups by `CAST(substr(started_at, 1, 10) AS TEXT)` —
inherently a UTC day, computed in SQL with no timezone context available
to it. It also used `'unreported'` as its empty-`agent` sentinel in the
synthetic `id` column, which collides with a real agent literally named
`unreported` (finding 8 of the same review).

## Decision

A "day" in this app is always the **viewer's local calendar day** — what
kankaku's own `localDay` means, and what a person means by "today". Every
local-day boundary is converted to a UTC instant, and every stored UTC
instant is converted back to a local day, through one shared module:
`web/app/lib/local-day.ts` (`localDateRangeToUtcFilters`,
`localWallClockToUtc`, `utcInstantToLocalDay`) — DST-correct, via `Intl`,
not a fixed offset. `useTaskEntries.fetchRange`, `useEntriesExplorer`'s
`dateStart`/`dateEnd` filters, and the dashboard/project-detail chart
bucketing all go through it now.

`task_entries_daily_totals` is **kept**, not removed: it has no in-app
consumer (grep confirms neither `web/app` nor `web/tests` ever queries
it — `settings/index.vue` only lists its name as a collection in a
static schema summary), so finding 1 does not make it "unused" in a new
way; it was already unused by the web. It stays available as a
documented, read-only aggregation surface for external tooling (per
`docs/contract.md`: "add more view collections the same way if needed").
Its sentinel is fixed in migration `1758300018` (`'unreported'` →
`'~none'`, which cannot be a valid agent slug — see `docs/contract.md`
"Agent and measurement quality", agent values are lowercase slugs) to
close the collision. Its `day` column stays UTC-bucketed by construction
(SQL has no timezone context) — `docs/contract.md` and
`docs/architecture/hub-web.md` now say so explicitly, so nobody
mistakes it for a local-day aggregation later.

## Consequences

- One pure, unit-tested (UTC+9, UTC-8, UTC, a DST transition day)
  conversion module is the only place local/UTC day math happens in the
  web — every date-ranged screen agrees.
- The view remains a UTC-day aggregation; any future consumer of it for
  a *displayed* day must not assume it matches what the web shows for
  "today" in a non-UTC timezone. This is now documented, not implicit.
- No migration was needed to fix the boundary bug itself — it was
  entirely a web-layer (TypeScript) defect, not a schema defect.

## Alternatives considered

- **Fix the view to bucket by local day** — rejected: SQLite has no
  reliable per-row timezone context (the owner's timezone is a client
  concern, not a stored fact), and the view is meant to stay a thin
  `SUM(...) GROUP BY` over `task_entries`, matching every other rule in
  `docs/architecture/aggregation.md`.
- **Remove `task_entries_daily_totals` entirely** — rejected: it has an
  external contract (`docs/contract.md`) and no evidence anything
  outside this repo depends on it either, but removing a documented
  read-only API surface on the strength of "the web doesn't use it" is a
  bigger, unrelated change than this review's scope; the sentinel fix
  is the minimal correct change.
- **Keep using `Date.getTimezoneOffset()` (a fixed numeric offset)
  instead of `Intl`** — rejected: does not handle a DST transition
  correctly for an instant other than "now" (the offset changes within
  the same calendar day), which the review explicitly asked to be
  tested.

## Related

- ADRs: [0006](0006-aggregation-rule-lives-once-in-kankaku.md), [0007](0007-web-is-a-view-layer.md)
- Specs: [`../specs/web-dashboard.md`](../specs/web-dashboard.md), [`../specs/hub-schema-and-access-rules.md`](../specs/hub-schema-and-access-rules.md)
- Code: `web/app/lib/local-day.ts`, `web/app/composables/useTaskEntries.ts`, `web/app/composables/useEntriesExplorer.ts`, `pocketbase/pb_migrations/1758300018_task_entries_daily_totals_sentinel.js`
