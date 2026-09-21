# Web unassigned queue

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0002](../adr/0002-selection-is-a-pick-from-a-list.md), [0012](../adr/0012-historical-records-to-sin-determinar.md) |
| Code | `web/app/pages/unassigned/index.vue`, `web/app/composables/useUnassignedQueue.ts`, `web/app/lib/aggregate.ts` (`groupUnassigned`), `web/app/lib/suggest-client.ts` |
| Tests | `web/tests/aggregate.test.ts`, `web/tests/suggest-client.test.ts`, `web/e2e/polish.spec.ts` |

## Purpose

The screen that pays for the backfill design ([ADR 0012](../adr/0012-historical-records-to-sin-determinar.md)):
lets the owner bulk-reassign `task_entries` rows currently pointed at "Sin
determinar" to their real client.

## Requirements

1. `UNASSIGNED-REQ-001` — The queue SHALL fetch every `task_entries` row
   whose `client` is the "Sin determinar" id.
2. `UNASSIGNED-REQ-002` — Rows SHALL be grouped by the tuple
   `(legacy_client_label, repo_project)`, keyed structurally (not by string
   concatenation, to avoid corruption when either value contains the
   delimiter).
3. `UNASSIGNED-REQ-003` — The owner SHALL be able to select a whole group
   or individual rows and bulk-reassign them to a real client (and
   optionally a project) via PocketBase's batch API, chunked at 50 rows per
   batch call.
4. `UNASSIGNED-REQ-004` — Each chunk's per-row result SHALL be checked
   individually; a chunk-level failure SHALL NOT be assumed to mean every
   row in it failed.
5. `UNASSIGNED-REQ-005` — Progress SHALL be reported during a bulk
   reassignment (done/total), and a toast SHALL report how many rows moved
   and to which client on completion.
6. `UNASSIGNED-REQ-006` — The local list SHALL update immediately after a
   successful reassignment (the reassigned group disappears from the
   queue) without a full page reload.
7. `UNASSIGNED-REQ-007` — A per-group client suggestion SHALL be offered
   only on an **exact** normalized match (lowercase, no spaces/punctuation/
   accents) against a client's name or code — never a fuzzy/typo match —
   and SHALL only pre-fill the selector; the owner must still confirm.
8. `UNASSIGNED-REQ-008` — Every icon-only interactive control on this
   page (per-row/per-group checkboxes, the group expand/collapse toggle)
   SHALL have an accessible name that includes the row's own identity
   (e.g. "Select «{group}»"), not a generic "checkbox"/unlabelled
   control. A toast confirming a bulk action's result SHALL be announced
   to screen readers via an always-mounted live region
   (`components/ui/toast/Toaster.vue`, shared app-wide — see
   `docs/specs/web-sessions.md` `SESSIONS-REQ-017` for the sessions
   queue's equivalent). Found by an independent review on 2026-09-21.

## Scenarios

### Scenario: an exact-normalized label suggests its client (`UNASSIGNED-REQ-007`)

- **Given** a group's `legacy_client_label` is `"Caja Mar"`
- **And** a real client exists with `name: "Cajamar"`
- **When** the reassignment dialog opens for that group
- **Then** "Cajamar" is pre-selected, and the owner must still confirm

### Scenario: a typo does not get a suggestion (`UNASSIGNED-REQ-007`)

- **Given** a group's `legacy_client_label` is `"cjamar"` (a typo, not a normalized match for any client)
- **When** the reassignment dialog opens
- **Then** no client is pre-selected

### Scenario: bulk reassignment survives a partial batch failure (`UNASSIGNED-REQ-004`)

- **Given** a group of 60 rows (two batch chunks) is bulk-reassigned
- **And** one row in the second chunk fails
- **When** the operation completes
- **Then** 59 rows are reported succeeded and 1 reported failed, not the whole chunk treated as failed

### Scenario: the dashboard reflects a reassignment without reload (`UNASSIGNED-REQ-006`)

- **Given** the dashboard's "by client" breakdown is showing before a reassignment
- **When** rows are reassigned to a real client via the queue and the user navigates back to the dashboard (SPA navigation, no full reload)
- **Then** that client's breakdown total increases by exactly the reassigned rows' contribution

## Configuration

| Name | Default | Purpose |
|---|---|---|
| Batch chunk size | 50 | Client-side chunking, comfortably under PocketBase's 100-request `/api/batch` cap. |

## Edge cases & failure modes

- A group with an empty `legacy_client_label` (never set, e.g. a manually
  created "Sin determinar" row): grouped under a placeholder key
  (`'(sin etiqueta)'`), still reassignable.
- Every request in a batch failing (e.g. the client id sent no longer
  exists): all rows in that chunk reported failed; no rows change.

## Out of scope

- Automatic (non-suggested, non-confirmed) reassignment.
- Fuzzy/typo-tolerant suggestions — deliberately excluded, see
  [ADR 0002](../adr/0002-selection-is-a-pick-from-a-list.md).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `UNASSIGNED-REQ-001` | `web/e2e/polish.spec.ts` | covered |
| `UNASSIGNED-REQ-002` | `web/tests/aggregate.test.ts` | covered |
| `UNASSIGNED-REQ-003` | `web/e2e/polish.spec.ts` | covered |
| `UNASSIGNED-REQ-004` | code review (`useUnassignedQueue.ts#bulkAssign`) | not covered by an automated test found in this pass |
| `UNASSIGNED-REQ-005` | `web/e2e/polish.spec.ts` | covered |
| `UNASSIGNED-REQ-006` | `web/e2e/polish.spec.ts` | covered |
| `UNASSIGNED-REQ-007` | `web/tests/suggest-client.test.ts` | covered |
| `UNASSIGNED-REQ-008` | `web/e2e/a11y.spec.ts` (accessible-name sweep; toast live-region a11y-tree assertion after a bulk action) | covered |
