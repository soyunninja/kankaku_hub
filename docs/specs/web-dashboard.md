# Web dashboard

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0007](../adr/0007-web-is-a-view-layer.md), [0014](../adr/0014-dependency-free-charts.md), [0027](../adr/0027-totals-computed-server-side.md) |
| Code | `web/app/pages/index.vue`, `web/app/composables/useTotals.ts`, `web/app/lib/totals-map.ts`, `web/app/lib/aggregate.ts` (fallback path), `web/app/lib/format.ts`, `web/app/lib/measurement-quality.ts`, `web/app/lib/agents.ts`, `web/app/components/charts/StackedBarChart.vue`, `web/app/components/dashboard/*.vue`, `pocketbase/pb_hooks/totals.pb.js`, `pocketbase/pb_hooks/lib/totals-query.js` |
| Tests | `web/tests/totals-map.test.ts`, `web/tests/totals-equivalence.test.ts`, `pocketbase/pb_hooks/lib/totals-query.test.js`, `web/tests/aggregate.test.ts`, `web/tests/format.test.ts`, `web/tests/measurement-quality.test.ts`, `web/e2e/polish.spec.ts`, `web/e2e/agent-quality.spec.ts`, `web/e2e/smoke.spec.ts` |

## Purpose

Shows time and cost by project and by client over a date range — the
capability the proposal calls out as "the thing that does not exist
anywhere else" (§9.2) — without ever recomputing the aggregation rule
kankaku already resolved.

## Requirements

1. `DASH-REQ-001` — Every total on the dashboard SHALL be computed over
   `task_entries` rows only (never `work_records`), by the server
   (`POST /api/kankaku/totals`, `SUM`/`COUNT`/`MIN`/`MAX` in SQL —
   [ADR 0027](../adr/0027-totals-computed-server-side.md)) when that
   route is available, or by `app/lib/aggregate.ts`
   (`sumTaskEntries`/`groupByKey` and its specializations) as a
   client-side fallback when it is not (`DASH-REQ-014`) — the two SHALL
   produce identical results for the same rows
   (`web/tests/totals-equivalence.test.ts`).
2. `DASH-REQ-002` — The dashboard SHALL support a date-range filter and
   compute a comparison against the equivalent previous period.
3. `DASH-REQ-003` — The dashboard SHALL provide a toggle to include or
   exclude the "Sin determinar" client's rows from every total.
4. `DASH-REQ-004` — A stackable/switchable time-series chart SHALL render
   via the dependency-free SVG component, sized to its container's actual
   width (not a fixed pixel width).
5. `DASH-REQ-005` — KPI values SHALL never be visually truncated/clipped
   at common viewport widths (390px, 768px, 1440px), in both themes.
6. `DASH-REQ-006` — Cost values SHALL be formatted with 2 decimals for
   amounts ≥ 1 (unit) and up to 4 significant decimals for amounts < 1.
7. `DASH-REQ-007` — Each KPI SHALL indicate whether its period-over-period
   delta is favorable using a metric-specific polarity: cost, waiting time,
   and average cost/task are `lowerIsBetter`; work time, total time, task
   count, and tokens are `neutral` (rendered without a good/bad color).
8. `DASH-REQ-008` — The dashboard SHALL refresh live via a debounced
   realtime subscription on `task_entries` when kankaku syncs new data.
9. `DASH-REQ-009` — The dashboard SHALL show breakdown tables by client and
   by project, and a "top costliest entries" list.
10. `DASH-REQ-010` — The dashboard SHALL support an `agent` filter (built
    from the distinct `agent` values in the currently-loaded date range,
    including a legacy/not-reported option) that narrows every KPI,
    breakdown table, and chart series consistently, the same way the
    "Sin determinar" toggle does.
11. `DASH-REQ-011` — A work-time honesty notice SHALL be shown only when
    at least one visible row has `waiting_quality: "unavailable"`
    (`work_ms` is an upper bound, not a true measurement), stating how
    many rows are affected, and SHALL link to the entries explorer
    pre-filtered to exactly those rows (same date range and agent
    filter) for drill-down.
12. `DASH-REQ-012` — The "average cost per task" KPI SHALL exclude rows
    whose `cost_quality` is `"unknown"` from the average's denominator
    and numerator, and SHALL show a notice naming how many rows were
    excluded whenever that count is greater than zero; every other total
    on the dashboard (sums) SHALL continue to include those rows
    unchanged.
13. `DASH-REQ-013` — Every date-range filter (preset resolution, custom
    range) and every day-bucketed chart on the dashboard SHALL use the
    VIEWER'S LOCAL calendar day, never the UTC day a stored
    `started_at`/`ended_at` instant happens to fall on. A local range
    boundary SHALL be converted to a UTC instant (`app/lib/local-day.ts`)
    before being sent as a `started_at` filter, and a stored UTC instant
    SHALL be converted back to the viewer's local day before it becomes a
    chart bucket key — never a raw string slice of either. See
    [ADR 0026](../adr/0026-day-boundaries-are-local.md) and
    `docs/contract.md` "Day boundaries are local, not UTC". Found by an
    independent review on 2026-09-21.
14. `DASH-REQ-014` — When `POST /api/kankaku/totals` responds `404` (the
    owner has not yet restarted PocketBase to load the route), the
    dashboard SHALL fall back to the pre-existing client-side
    `getFullList`+`app/lib/aggregate.ts` path silently — no error toast,
    same numbers, only a slower load — rather than showing a broken or
    empty dashboard.

## Scenarios

### Scenario: totals never include work_records (`DASH-REQ-001`)

- **Given** a task_entries row and a work_records child with a different `wall_ms`
- **When** the dashboard computes its total work time
- **Then** the total reflects only the `task_entries` row's value

### Scenario: the server and the client-side fallback agree exactly (`DASH-REQ-001`, `DASH-REQ-014`)

- **Given** the same set of `task_entries` rows, fetched two ways: raw
  rows summed by `app/lib/aggregate.ts`, and `POST
  /api/kankaku/totals`'s response for the same filters
- **When** both are compared (`web/tests/totals-equivalence.test.ts`,
  run against a live isolated instance)
- **Then** every KPI figure (ms, tokens: exact; cost: float tolerance)
  matches, across `group_by=none/client/project/day`, three time zones,
  and a DST-transition week

### Scenario: the dashboard falls back silently when the totals route is missing (`DASH-REQ-014`)

- **Given** PocketBase is serving without `pocketbase/pb_hooks/totals.pb.js`
  loaded (the owner hasn't restarted since this feature shipped)
- **When** the dashboard loads
- **Then** it shows the same KPIs/charts/breakdowns via the client-side
  fallback path, with no error toast and no visible difference to the
  owner

### Scenario: excluding Sin determinar changes every total consistently (`DASH-REQ-003`)

- **Given** some `task_entries` rows belong to the "Sin determinar" client
- **When** the toggle is set to exclude it
- **Then** every KPI, breakdown table, and chart series recomputes without those rows

### Scenario: a sub-dollar cost keeps its significant decimals (`DASH-REQ-006`)

- **Given** a cost of `0.0722`
- **When** it is formatted for display
- **Then** it renders as `$0.0722`, not rounded to `$0.07`

### Scenario: KPI cards never clip at mobile width (`DASH-REQ-005`)

- **Given** the dashboard is viewed at 390px width
- **When** KPI values are measured
- **Then** each value's `scrollWidth` does not exceed its `clientWidth`

### Scenario: a new synced task_entries row updates the dashboard without a reload (`DASH-REQ-008`)

- **Given** the dashboard is open
- **When** kankaku syncs a new `task_entries` row via the REST API
- **Then** the relevant breakdown updates via the realtime subscription within the debounce window, with no full page reload

### Scenario: fully-measured data shows no honesty notice (`DASH-REQ-011`)

- **Given** every visible row has `waiting_quality: "measured"` (or empty/legacy)
- **When** the dashboard renders
- **Then** the work-time honesty notice is not shown at all

### Scenario: the honesty notice's drill-down link matches what is being shown (`DASH-REQ-011`)

- **Given** the date range is `2026-08-01`–`2026-08-31` and the agent filter is set to `"pi"`
- **When** the honesty notice's link is followed
- **Then** it opens the entries explorer at `/entries?quality=waitingUnavailable&dateStart=2026-08-01&dateEnd=2026-08-31&agent=pi`

### Scenario: an unknown-cost row is excluded from the average but not the sum (`DASH-REQ-012`)

- **Given** one row has `cost_quality: "unknown"` and `cost: 0`, alongside several rows with real measured costs
- **When** the average-cost-per-task KPI and the total-cost KPI are computed
- **Then** the average excludes that row entirely (denominator and numerator), the total-cost sum still includes its `0`, and the average KPI shows an "excluded N rows" notice

## Configuration

None beyond the shared PocketBase connection
([`web-auth-and-shell.md`](web-auth-and-shell.md)).

## Edge cases & failure modes

- Zero entries in the selected range: KPIs show zero, no divide-by-zero
  (verified by `avgCostPerTask`'s explicit zero-count guard).
- Very large data volumes: the dashboard/project pages use `getFullList`
  over the date range rather than paginating — reasonable at the current
  seed scale (430 `task_entries`), flagged in `ESTADO.md` as unverified at
  much larger volumes.

## Out of scope

- Any computation that touches `work_records` for a total.
- Currency conversion (cost is shown as measured, presumed USD — see
  [`../vision.md`](../vision.md) open question in the proposal).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `DASH-REQ-001` | `web/tests/aggregate.test.ts` (fallback path), `web/tests/totals-map.test.ts` + `pocketbase/pb_hooks/lib/totals-query.test.js` (server path), `web/tests/totals-equivalence.test.ts` (both paths agree, live-server-gated) | covered |
| `DASH-REQ-002` | `web/tests/period.test.ts` | covered |
| `DASH-REQ-003` | `web/tests/aggregate.test.ts` | covered |
| `DASH-REQ-004` | `web/e2e/polish.spec.ts` | covered |
| `DASH-REQ-005` | `web/e2e/polish.spec.ts` | covered |
| `DASH-REQ-006` | `web/tests/format.test.ts` | covered |
| `DASH-REQ-007` | `web/tests/format.test.ts` | covered |
| `DASH-REQ-008` | manual verification per `ESTADO.md` | not covered by an automated test found in this pass |
| `DASH-REQ-009` | `web/e2e/smoke.spec.ts` | covered |
| `DASH-REQ-010` | `web/e2e/agent-quality.spec.ts` (agent filter hides the honesty notice once filtered to `pi`) | covered |
| `DASH-REQ-011` | `web/tests/measurement-quality.test.ts` (`summarizeWorkTimeQuality`), `web/e2e/agent-quality.spec.ts` (notice visibility + exact count, hidden when filtered); the drill-down link's exact target query is not separately exercised | partial |
| `DASH-REQ-012` | `web/tests/measurement-quality.test.ts` (`computeAverageCost`) | covered |
| `DASH-REQ-013` | `web/tests/local-day.test.ts` (UTC+9, UTC-8, UTC, DST transition); `web/e2e/day-boundary.spec.ts` (Asia/Tokyo, America/Los_Angeles browser timezone, dashboard + entries explorer + project detail agreement) | covered |
| `DASH-REQ-014` | `web/app/composables/useTotals.ts`'s `TotalsRouteUnavailableError` catch in `pages/index.vue`; manually verified against an isolated PocketBase instance serving without `totals.pb.js` loaded (404 confirmed, fallback path exercised) — not yet covered by an automated Playwright test | partial |
