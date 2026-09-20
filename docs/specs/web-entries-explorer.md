# Web entries explorer

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0006](../adr/0006-aggregation-rule-lives-once-in-kankaku.md), [0007](../adr/0007-web-is-a-view-layer.md) |
| Code | `web/app/pages/entries/index.vue`, `web/app/composables/useEntriesExplorer.ts` |
| Tests | `web/e2e/smoke.spec.ts` |

## Purpose

A server-paginated, filterable browse of every `task_entries` row, with a
detail drawer showing child `work_records` — for drilling into a single
task, never for computing a total.

## Requirements

1. `ENTRIES-REQ-001` — The explorer SHALL support server-side filtering by
   `client`, `project`, `task`, `status`, `model`, `machine`, a date range
   (`started_at`), and a `prompt` substring search.
2. `ENTRIES-REQ-002` — The explorer SHALL support server-side pagination
   and sorting (not client-side, given the collection can grow large).
3. `ENTRIES-REQ-003` — Filter values SHALL be escaped before being
   interpolated into a PocketBase filter string.
4. `ENTRIES-REQ-004` — Each row SHALL expand its `client`/`project`/`task`
   relations for display (`expand: 'client,project,task'`).
5. `ENTRIES-REQ-005` — The detail drawer SHALL show a row's child
   `work_records` with an explicit notice that they are never summed.
6. `ENTRIES-REQ-006` — This screen SHALL NOT expose any total/sum derived
   from the listed rows (that belongs to the dashboard, per
   [ADR 0007](../adr/0007-web-is-a-view-layer.md)).

## Scenarios

### Scenario: a prompt search with special characters does not break the filter (`ENTRIES-REQ-003`)

- **Given** the search term contains a double quote
- **When** the filter is built
- **Then** the quote is escaped and the request succeeds instead of producing a malformed filter expression

### Scenario: filtering by date range only returns entries within it (`ENTRIES-REQ-001`)

- **Given** `dateStart`/`dateEnd` are set
- **When** the list is fetched
- **Then** only rows with `started_at` inside `[dateStart 00:00:00.000Z, dateEnd 23:59:59.999Z]` are returned

### Scenario: the detail drawer clearly warns against summing work_records (`ENTRIES-REQ-005`)

- **Given** an entry with two `work_records` children
- **When** the detail drawer is opened
- **Then** both children are listed, alongside a visible "never summed" notice

## Configuration

None beyond the shared PocketBase connection.

## Edge cases & failure modes

- A row with no `work_records` children (raw detail sync disabled or not
  yet pushed for that task): the drawer shows an empty state, not an
  error.
- A `project`/`task` relation that no longer resolves (deleted): shown as
  empty per PocketBase's `""`-for-empty-relation convention (see
  [`../contract.md`](../contract.md#gotchas-for-the-sync-client-author)).

## Out of scope

- Any aggregate/sum on this screen — see
  [`web-dashboard.md`](web-dashboard.md) for totals.
- Editing a `task_entries` row from this screen (read-only browse; the only
  supported write on `task_entries` from the web is the unassigned queue's
  reassignment — see [`web-unassigned-queue.md`](web-unassigned-queue.md)).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `ENTRIES-REQ-001` | `web/e2e/smoke.spec.ts` | covered |
| `ENTRIES-REQ-002` | `web/e2e/smoke.spec.ts` | covered |
| `ENTRIES-REQ-003` | code review (`useEntriesExplorer.ts#escapeFilterValue`); not directly exercised by an automated test found in this pass | not covered |
| `ENTRIES-REQ-004` | code review (`useEntriesExplorer.ts#list`) | covered |
| `ENTRIES-REQ-005` | `web/e2e/smoke.spec.ts` | covered |
| `ENTRIES-REQ-006` | code review (no aggregate import in `entries/index.vue`) | covered |
