# Web entries explorer

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0006](../adr/0006-aggregation-rule-lives-once-in-kankaku.md), [0007](../adr/0007-web-is-a-view-layer.md) |
| Code | `web/app/pages/entries/index.vue`, `web/app/composables/useEntriesExplorer.ts`, `web/app/components/entries/EntryDetailSheet.vue`, `web/app/lib/entry-detail.ts` |
| Tests | `web/e2e/smoke.spec.ts`, `web/e2e/entry-detail.spec.ts`, `web/tests/entry-detail.test.ts` |

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
7. `ENTRIES-REQ-007` — The detail drawer SHALL present every field through
   a human-readable view (status badge, formatted durations/cost/token
   counts, resolved relation names) instead of a raw key/value dump of the
   PocketBase record, and SHALL NEVER render an object or array field as
   the literal text `[object Object]` — an unhandled object/array value
   renders as pretty-printed JSON instead.
8. `ENTRIES-REQ-008` — The drawer's assignment section SHALL show the
   client/project/task by resolved name (with a client avatar and a link
   to the relation's screen when it resolves), and a distinct empty
   (`—`) vs. deleted-relation state when the id is blank or no longer
   resolvable.
9. `ENTRIES-REQ-009` — The drawer SHALL show the `segments` field as a
   tag → duration list sorted by duration descending when it holds at
   least one valid entry, and SHALL hide the whole section when it does
   not (empty, `null`, or a shape it cannot recognise as a tag→ms map).
10. `ENTRIES-REQ-010` — The drawer SHALL show the raw `prompt` in a
    scrollable block with line breaks preserved (never via `v-html`) when
    present, and an explanatory note referencing `KANKAKU_SYNC_PROMPT`
    (linking to the `/commands` configuration section) when absent.
11. `ENTRIES-REQ-011` — The drawer SHALL NEVER render PocketBase-internal
    fields (`collectionId`, `collectionName`, `expand`); every entry field
    not already covered by a dedicated section SHALL be grouped into a
    single "technical details" disclosure that is collapsed by default.

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

### Scenario: a `segments` object never renders as `[object Object]` (`ENTRIES-REQ-007`, `ENTRIES-REQ-009`)

- **Given** an entry whose `segments` field is a tag→ms object (e.g. `{"review": 600000}`)
- **When** the detail drawer is opened
- **Then** the segments section lists `review` with its formatted duration, and the sheet's rendered text never contains the literal string `[object Object]`

### Scenario: a malformed `segments` field hides the section instead of throwing (`ENTRIES-REQ-009`)

- **Given** an entry whose `segments` field is `null`, `{}`, or a shape that is not a tag→ms map (e.g. an array)
- **When** the detail drawer is opened
- **Then** the segments section is not rendered at all

### Scenario: a deleted relation shows a distinct state from an unset one (`ENTRIES-REQ-008`)

- **Given** an entry whose `project` id is set but the related `projects` record no longer exists
- **When** the detail drawer is opened
- **Then** the assignment section shows a "deleted" indicator for that field, never the raw id and never the same `—` shown for an entry with no project set at all

### Scenario: technical fields are collapsed by default and reachable by keyboard (`ENTRIES-REQ-011`)

- **Given** the detail drawer is open
- **When** no interaction has happened yet
- **Then** the "technical details" disclosure is collapsed (`aria-expanded="false"`), its raw id/session id/machine/schema/timestamps are not visible, and pressing Enter/Space on the focused disclosure button expands it

## Configuration

None beyond the shared PocketBase connection.

## Edge cases & failure modes

- A row with no `work_records` children (raw detail sync disabled or not
  yet pushed for that task): the drawer shows an empty state, not an
  error.
- A `client`/`project`/`task` relation whose id is set but no longer
  resolves (the target record was deleted after this entry was written):
  the drawer shows a distinct "deleted" indicator, never the same `—`
  shown for a relation that was never set, and never the raw id (see
  `ENTRIES-REQ-008`).
- A `segments` field in a shape kankaku never produced (an array, a
  primitive, a malformed JSON string): treated the same as absent —
  the section is hidden rather than throwing or rendering garbage (see
  `ENTRIES-REQ-009`).

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
| `ENTRIES-REQ-007` | `web/tests/entry-detail.test.ts` (`safeDisplayValue`, `normalizeSegments`), `web/e2e/entry-detail.spec.ts` | covered |
| `ENTRIES-REQ-008` | `web/tests/entry-detail.test.ts` (`resolveRelation`), `web/e2e/entry-detail.spec.ts` | covered |
| `ENTRIES-REQ-009` | `web/tests/entry-detail.test.ts` (`normalizeSegments`), `web/e2e/entry-detail.spec.ts` | covered |
| `ENTRIES-REQ-010` | `web/e2e/entry-detail.spec.ts` (prompt line-break preservation; empty-prompt note not separately exercised in this pass) | partial |
| `ENTRIES-REQ-011` | `web/e2e/entry-detail.spec.ts` | covered |
