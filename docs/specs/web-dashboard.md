# Web dashboard

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0007](../adr/0007-web-is-a-view-layer.md), [0014](../adr/0014-dependency-free-charts.md) |
| Code | `web/app/pages/index.vue`, `web/app/lib/aggregate.ts`, `web/app/lib/format.ts`, `web/app/components/charts/StackedBarChart.vue`, `web/app/components/dashboard/*.vue` |
| Tests | `web/tests/aggregate.test.ts`, `web/tests/format.test.ts`, `web/e2e/polish.spec.ts` |

## Purpose

Shows time and cost by project and by client over a date range — the
capability the proposal calls out as "the thing that does not exist
anywhere else" (§9.2) — without ever recomputing the aggregation rule
kankaku already resolved.

## Requirements

1. `DASH-REQ-001` — Every total on the dashboard SHALL be computed by
   `app/lib/aggregate.ts` (`sumTaskEntries`/`groupByKey` and its
   specializations) over `task_entries` rows only.
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

## Scenarios

### Scenario: totals never include work_records (`DASH-REQ-001`)

- **Given** a task_entries row and a work_records child with a different `wall_ms`
- **When** the dashboard computes its total work time
- **Then** the total reflects only the `task_entries` row's value

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
| `DASH-REQ-001` | `web/tests/aggregate.test.ts` | covered |
| `DASH-REQ-002` | `web/tests/period.test.ts` | covered |
| `DASH-REQ-003` | `web/tests/aggregate.test.ts` | covered |
| `DASH-REQ-004` | `web/e2e/polish.spec.ts` | covered |
| `DASH-REQ-005` | `web/e2e/polish.spec.ts` | covered |
| `DASH-REQ-006` | `web/tests/format.test.ts` | covered |
| `DASH-REQ-007` | `web/tests/format.test.ts` | covered |
| `DASH-REQ-008` | manual verification per `ESTADO.md` | not covered by an automated test found in this pass |
| `DASH-REQ-009` | `web/e2e/smoke.spec.ts` | covered |
