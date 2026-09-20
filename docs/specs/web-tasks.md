# Web tasks

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0004](../adr/0004-kankaku-does-not-invent-tasks.md), [0024](../adr/0024-sessions-link-to-tasks-by-explicit-action.md) |
| Code | `web/app/pages/tasks/index.vue`, `web/app/composables/useTasks.ts`, `web/app/components/tasks/TaskDetailSheet.vue` |
| Tests | `web/e2e/polish.spec.ts`, `web/e2e/session-resume.spec.ts`, `web/e2e/task-status.spec.ts` |

## Purpose

Lets the owner create and track tasks (title, project, status,
external_ref, description) and see the kankaku sessions linked to each one
— the minimum CRUD, plus the session-centric linkage flow described in
[`web-sessions.md`](web-sessions.md), that a `/kankaku task` picker
([phase 4, planned](../phases/phase-4-task-linkage.md)) could point at in
the future.

## Requirements

1. `TASKS-REQ-001` — Tasks SHALL support create, edit, and delete, with
   `status` constrained to `open`/`doing`/`done`.
2. `TASKS-REQ-002` — The board view SHALL group tasks by status into three
   columns and support moving a task between them.
3. `TASKS-REQ-003` — A status change via drag-and-drop SHALL update the
   local list optimistically (before the server confirms) and SHALL roll
   back the local change if the write fails.
4. `TASKS-REQ-004` — An accessible, non-drag alternative ("move to: <next
   status>") SHALL be available for keyboard/pointer users who cannot use
   drag-and-drop.
   (Reversed on 2026-09-20 at the owner's request: the per-card "Mover a"
   button is removed from the board — it read as visual clutter once the
   board had many cards. The accessible, non-drag alternative it
   satisfied is no longer a single button but two paths, `TASKS-REQ-011`
   (a status control inside the task detail sheet) and `TASKS-REQ-012`
   (keyboard shortcuts on a focused board card) — drag-and-drop itself is
   unaffected. The id is kept so history stays traceable.)
5. `TASKS-REQ-005` — A list view SHALL be available as an alternative to
   the board.
6. `TASKS-REQ-006` — Each task SHALL show its accumulated cost/time,
   derived from its linked `task_entries` rows via the D6-guarded
   aggregation module.
7. `TASKS-REQ-007` — Clicking a board card SHALL open a task detail sheet
   showing the task's title/project/status and every kankaku session that
   touched it, grouped by `session_id` from that task's `task_entries`
   rows (never `work_records`) — see
   [`web-sessions.md`](web-sessions.md).
8. `TASKS-REQ-008` — Each session listed in the task detail sheet SHALL
   show its per-session totals (work/wall/waiting time, cost, entry
   count, machine, agent) and its derived resume command, or an
   unsupported-agent notice when none can be derived.
9. `TASKS-REQ-009` — Each board card SHALL show a chip with the count of
   distinct sessions linked to that task, so the owner can tell at a
   glance which tasks have session activity without opening the detail
   sheet.
10. `TASKS-REQ-010` — The `open` → `doing` transition SHALL happen
    automatically, server-side, when a `task_entries` row is created with,
    or updated to, a non-empty `task` (`pocketbase/pb_hooks/task-auto-doing.pb.js`,
    see [`hub-schema-and-access-rules.md`](hub-schema-and-access-rules.md)
    `SCHEMA-REQ-017`). The web SHALL NOT attempt this transition itself —
    it is not part of `useTasks`' write path — and SHALL reflect the
    server's status whenever it re-reads a task rather than assuming the
    status it last wrote is still current. `done` SHALL never be set
    automatically by this mechanism and a `done` task SHALL never be
    reopened by it.
11. `TASKS-REQ-011` — The task detail sheet SHALL offer a status control
    (open/doing/done) that calls the same `useTasks().moveStatus()` the
    board's drag-and-drop uses (optimistic update, rollback on failure).
    Changing status through this control SHALL be reflected on the board
    immediately and SHALL remain reflected after the sheet is closed,
    without a page reload — the sheet and the board read the same shared
    reactive task list, never two independent copies.
12. `TASKS-REQ-012` — A focused board card SHALL support, without a
    mouse: `Enter`/`Space` to open its detail sheet (same as a click);
    `ArrowLeft`/`ArrowRight` (aliased to `[`/`]`) to move it to the
    previous/next status column via the same `moveStatus()`, clamped at
    the `open`/`done` ends (no-op, never wrapping). Focus SHALL remain on
    the moved card's element in its new column after the move, and the
    change SHALL be announced through an `aria-live="polite"` region.

## Scenarios

### Scenario: a failed status update rolls back (`TASKS-REQ-003`)

- **Given** a task is dragged from "open" to "doing"
- **When** the underlying PocketBase update fails
- **Then** the task visually returns to "open" and an error is surfaced

### Scenario: keyboard users can change status without drag-and-drop (`TASKS-REQ-004`, reversed — superseded by `TASKS-REQ-011`/`TASKS-REQ-012`)

- **Given** a user navigating by keyboard
- **When** they open the task's detail sheet and select "Doing" in the
  status control (`TASKS-REQ-011`), or focus the card on the board and
  press `ArrowRight`/`]` (`TASKS-REQ-012`)
- **Then** the task moves to "doing" the same way a successful drag would

### Scenario: the sheet's status control keeps the board in sync after closing (`TASKS-REQ-011`)

- **Given** a task detail sheet is open for an "open" task
- **When** the owner selects "Doing" in the sheet's status control and
  then closes the sheet
- **Then** the board card is already showing under "Doing" while the
  sheet is still open, and stays there after closing it — no page reload

### Scenario: keyboard shortcuts move a focused card and keep focus on it (`TASKS-REQ-012`)

- **Given** a board card for a "doing" task is focused
- **When** the owner presses `ArrowLeft`
- **Then** the task moves to "open", the same card element (now rendered
  in the "open" column) keeps keyboard focus, and an `aria-live="polite"`
  region announces the task's title and its new status
- **When** the owner then presses `ArrowLeft` again on an "open" task
- **Then** nothing happens — the shortcut clamps at the "open" boundary
  instead of wrapping to "done"

### Scenario: a task's accumulated cost never includes work_records (`TASKS-REQ-006`)

- **Given** a task has linked `task_entries` rows with child `work_records`
- **When** its accumulated cost is computed
- **Then** it sums only the `task_entries` rows' `cost` field

### Scenario: a task with no linked sessions shows no chip (`TASKS-REQ-009`)

- **Given** a task has zero `task_entries` rows with a `session_id`
- **When** the board renders that task's card
- **Then** no session-count chip is shown for it

### Scenario: linking work to an open task moves it to doing without web involvement (`TASKS-REQ-010`)

- **Given** a task has `status: "open"`
- **When** a `task_entries` row is created (or updated) with that task's id
  in its `task` field, by any writer (the web, the sync client, or the
  `service` account) — never by the web itself calling a `tasks` update
- **Then** the task's `status` becomes `doing` on the server, and the web
  reflects this the next time it reads the task rather than showing a
  stale `open`

### Scenario: opening a task shows its sessions with resume commands (`TASKS-REQ-007`, `TASKS-REQ-008`)

- **Given** a task has two sessions linked to it, one from `pi` and one
  whose entries disagree on `agent`
- **When** the owner clicks the board card
- **Then** the detail sheet lists both sessions with their totals, the
  `pi` session shows a copyable resume command, and the mixed-agent
  session shows a best-effort resume command per
  [`web-sessions.md`](web-sessions.md) (`SESSIONS-REQ-008`)

## Configuration

None beyond the shared PocketBase connection.

## Edge cases & failure modes

- Deleting a task that has linked `task_entries`: the `task` relation on
  `task_entries` is optional and not cascade-deleting (see
  [`hub-schema-and-access-rules.md`](hub-schema-and-access-rules.md)), so
  linked entries keep their other fields and lose only the task reference
  — verify this against `1758300005_task_entries_collection.js`
  (`cascadeDelete: false` on the `task` relation) before relying on exact
  post-delete behavior in the UI.

## Out of scope

- Task creation from kankaku (`/kankaku task new`) — see
  [phase-5-task-creation-from-pi](../phases/phase-5-task-creation-from-pi.md), planned.
- A `/kankaku task` picker inside kankaku itself — see
  [phase-4-task-linkage](../phases/phase-4-task-linkage.md) (superseded in
  practice by the session-centric flow in
  [`web-sessions.md`](web-sessions.md), see that phase file).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `TASKS-REQ-001` | `web/e2e/smoke.spec.ts` | covered |
| `TASKS-REQ-002` | `web/e2e/polish.spec.ts` | covered |
| `TASKS-REQ-003` | code review (`useTasks.moveStatus`); not directly exercised by an automated test found in this pass | not covered |
| `TASKS-REQ-004` | reversed 2026-09-20 — see the note on the requirement and `TASKS-REQ-011`/`TASKS-REQ-012` | reversed |
| `TASKS-REQ-005` | `web/e2e/smoke.spec.ts` | covered |
| `TASKS-REQ-006` | `web/tests/aggregate.test.ts` | covered |
| `TASKS-REQ-007` | `web/e2e/session-resume.spec.ts` ("task detail sheet lists its sessions") | covered |
| `TASKS-REQ-008` | `web/e2e/session-resume.spec.ts` (session totals + resume command asserted) | covered |
| `TASKS-REQ-009` | code review (`pages/tasks/index.vue#sessionCountByTask`); the chip itself is not asserted by the e2e spec above | not covered by an automated test found in this pass |
| `TASKS-REQ-010` | `pocketbase/pb_hooks/lib/task-status-rule.test.js` (`npm run hooks:test`), `web/e2e/task-status.spec.ts` (the sessions-without-task queue's attach action reflects the hook on the board via `useTasks().refreshOne`, for an `open` and a `done` target task) | covered |
| `TASKS-REQ-011` | `web/e2e/task-status.spec.ts` ("the sheet status control moves a card...") | covered |
| `TASKS-REQ-012` | `web/e2e/task-status.spec.ts` ("ArrowLeft/ArrowRight (and [ / ]) move the focused card...", "Enter/Space on a focused card opens...") | covered |
