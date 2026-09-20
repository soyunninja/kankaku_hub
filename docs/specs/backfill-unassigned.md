# Backfill to "Sin determinar"

| | |
|---|---|
| Status | implemented |
| Phase | [phase-2b-backfill](../phases/phase-2b-backfill.md) |
| Owners repos | kankaku, kankaku-hub |
| Related ADRs | [0012](../adr/0012-historical-records-to-sin-determinar.md) |
| Code | `kankaku/src/domain/hub-entry.ts` (`resolveTaskAssignment`), `kankaku/src/adapters/kankaku-command.ts` (`handleBackfillCommand`), `kankaku-hub/pocketbase/pb_migrations/1758300008_seed_unassigned_client.js` |
| Tests | `kankaku/tests/hub-entry.test.ts`, `kankaku/tests/kankaku-command.test.ts`, `kankaku/scripts/e2e-hub.ts` (opt-in) |

## Purpose

Routes task rows whose client cannot be resolved in the catalog to a real
"Sin determinar" client row, preserving the original free-text label so
they can later be bulk-reassigned in the web — instead of being dropped or
requiring a `NULL` special case everywhere.

## Requirements

1. `BACKFILL-REQ-001` — The hub SHALL provide exactly one seeded `clients`
   row with `code: sin-determinar` and `unassigned: true`, created
   idempotently by migration.
2. `BACKFILL-REQ-002` — When a task's `clientId` does not resolve to a
   known catalog client, `resolveTaskAssignment` SHALL route the task to
   the "Sin determinar" client and set `legacy_client_label` from the
   task's original free-text client/name.
3. `BACKFILL-REQ-003` — When a task's `clientId` does resolve, the row
   SHALL NOT be routed to "Sin determinar" and `legacy_client_label` SHALL
   be empty.
4. `BACKFILL-REQ-004` — `/kankaku backfill` SHALL trigger a full
   re-evaluation of sync (`sync.run({ full: true })`) and report the
   resulting unassigned routing grouped by legacy label with counts.
5. `BACKFILL-REQ-005` — `/kankaku backfill` SHALL be safely re-runnable
   without duplicating or corrupting already-routed rows (idempotent via
   the same upsert-by-`task_id` mechanism as ordinary sync).

## Scenarios

### Scenario: an unresolvable client routes to Sin determinar with its label kept (`BACKFILL-REQ-002`)

- **Given** a task record has `client: "cjamar"` and no resolvable `clientId`
- **When** `resolveTaskAssignment` runs
- **Then** the resulting payload's `client` is the "Sin determinar" id and `legacy_client_label` is `"cjamar"`

### Scenario: backfill reports counts per legacy label (`BACKFILL-REQ-004`)

- **Given** several historical tasks with labels `"cjamar"`, `"Cajamar"`, `"acme sl"`
- **When** `/kankaku backfill` runs
- **Then** the command output groups and counts them by their original label, e.g. `"acme (legacy): 3 task(s) -> Sin determinar"`

### Scenario: backfill is safe to run twice (`BACKFILL-REQ-005`)

- **Given** backfill has already run once
- **When** it is run again with no new local records
- **Then** no duplicate rows are created and reported counts reflect no additional changes

## Configuration

No dedicated env vars; backfill reuses [`sync-push.md`](sync-push.md)'s
configuration (it is a full sync run).

## Edge cases & failure modes

- A client that existed at record-write time but was later deleted in the
  hub: resolves the same as "never resolved" — routed to "Sin determinar"
  on the next sync/backfill.
- Two different legacy labels that both mean the same real client (e.g.
  `"cjamar"` and `"Cajamar"`): both land in "Sin determinar" as separate
  groups; reconciling them to one client is a manual reassignment in the
  web ([`web-unassigned-queue.md`](web-unassigned-queue.md)) — kankaku does
  not fuzzy-match them together (per
  [ADR 0002](../adr/0002-selection-is-a-pick-from-a-list.md)).

## Out of scope

- Automatic suggestion of which real client a legacy label maps to — that
  lives in the web ([`web-unassigned-queue.md`](web-unassigned-queue.md)),
  not in kankaku's backfill.
- Merging/renaming clients after the fact.

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `BACKFILL-REQ-001` | migration `1758300008_seed_unassigned_client.js` (applied, verified in `ESTADO.md`) | covered |
| `BACKFILL-REQ-002` | `kankaku/tests/hub-entry.test.ts`, `kankaku/scripts/e2e-hub.ts` | covered |
| `BACKFILL-REQ-003` | `kankaku/tests/hub-entry.test.ts` | covered |
| `BACKFILL-REQ-004` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `BACKFILL-REQ-005` | `kankaku/scripts/e2e-hub.ts` | covered |
