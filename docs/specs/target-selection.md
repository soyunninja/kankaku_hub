# Target selection (client/project picker)

| | |
|---|---|
| Status | implemented |
| Phase | [phase-1-catalog-and-selection](../phases/phase-1-catalog-and-selection.md) |
| Owners repos | kankaku |
| Related ADRs | [0001](../adr/0001-identity-is-an-id-not-a-name.md), [0002](../adr/0002-selection-is-a-pick-from-a-list.md) |
| Code | `kankaku/src/adapters/target-picker.ts`, `kankaku/src/adapters/session-target.ts`, `kankaku/src/domain/work-target.ts`, `kankaku/src/adapters/project-config.ts` |
| Tests | `kankaku/tests/target-picker.test.ts`, `kankaku/tests/session-target.test.ts`, `kankaku/tests/work-target.test.ts` |

## Purpose

Resolves the `{ clientId, projectId }` a session works against, silently
when possible and by an explicit pick from a list otherwise, and persists
the result for the session (and optionally the repo).

## Requirements

1. `TARGET-REQ-001` — The system SHALL only offer/run the picker when
   `role === "orchestrator"` and `ctx.hasUI` is true. Subagents SHALL
   inherit the orchestrator's target and never ask.
2. `TARGET-REQ-002` — The system SHALL resolve a project mapping silently,
   in order: (a) the current session's already-picked/skipped target, then
   (b) `<KANKAKU_DIR>/config.json`'s `clientId`/`projectId`, then (c) the
   cached catalog's `repo_paths` matching the current working directory.
3. `TARGET-REQ-003` — When a mapping resolves silently, the system SHALL
   NOT show the picker.
4. `TARGET-REQ-004` — When no mapping resolves and no prior pick/skip
   exists for the session, the system SHALL show `ctx.ui.select` for client,
   then for project of that client, each offering a `— skip —` option.
5. `TARGET-REQ-005` — Declining at either step (choosing `— skip —` or
   dismissing the dialog) SHALL cancel the whole pick and SHALL be
   remembered for the rest of the session (not asked again).
6. `TARGET-REQ-006` — Same-named options in a picker list SHALL be
   disambiguated by appending their code.
7. `TARGET-REQ-007` — A picked target SHALL be persisted as a session entry
   so a session reload keeps it.
8. `TARGET-REQ-008` — After a pick, the user MAY be asked to remember the
   choice for the repository; on confirmation, the ids are written to
   `<KANKAKU_DIR>/config.json`.
9. `TARGET-REQ-009` — Target resolution SHALL run after crash-recovery of
   in-flight records and before any automatic sync trigger for the session.

## Scenarios

### Scenario: a configured project asks nothing (`TARGET-REQ-002`, `TARGET-REQ-003`)

- **Given** `<KANKAKU_DIR>/config.json` has `clientId`/`projectId` set
- **When** a new orchestrator session starts
- **Then** no picker is shown and the status bar reflects the configured target

### Scenario: skipping is remembered for the session (`TARGET-REQ-005`)

- **Given** no mapping exists
- **When** the user chooses `— skip —` at the client step
- **Then** the picker is not shown again for the remainder of that session, even across multiple prompts

### Scenario: subagents never ask (`TARGET-REQ-001`)

- **Given** an orchestrator has a resolved (or skipped) target
- **When** it spawns a subagent
- **Then** the subagent inherits the target/skip state without showing any picker

### Scenario: repo_paths auto-selects silently (`TARGET-REQ-002`)

- **Given** the cached catalog has a project whose `repo_paths` includes the current working directory
- **And** no `config.json` mapping exists yet
- **When** a session starts
- **Then** that project (and its client) is used silently, with no picker shown

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `<KANKAKU_DIR>/config.json` | — | Optional per-repo persisted target. |
| Session entry `kankaku-target` | — | Per-session persisted pick/skip state. |

## Edge cases & failure modes

- Hub unreachable and no cache: picker cannot show a catalog; falls back to
  the legacy free-text `/kankaku client <name>` behaviour with a one-time
  notice.
- A `clientId`/`projectId` in `config.json` no longer present in the
  catalog (deleted in the hub): resolution still uses the stored ids for
  the record (see [`record-identity.md`](record-identity.md)); sync handles
  the "no longer resolvable" case separately (see
  [`sync-push.md`](sync-push.md)).

## Out of scope

- Editing/removing a remembered repo mapping other than via
  `/kankaku target clear` (see [`kankaku-commands.md`](kankaku-commands.md)).
- Task selection (see [phase-4-task-linkage](../phases/phase-4-task-linkage.md), planned).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `TARGET-REQ-001` | `kankaku/tests/session-target.test.ts` | covered |
| `TARGET-REQ-002` | `kankaku/tests/work-target.test.ts`, `kankaku/tests/session-target.test.ts` | covered |
| `TARGET-REQ-003` | `kankaku/tests/session-target.test.ts` | covered |
| `TARGET-REQ-004` | `kankaku/tests/target-picker.test.ts` | covered |
| `TARGET-REQ-005` | `kankaku/tests/target-picker.test.ts`, `kankaku/tests/session-target.test.ts` | covered |
| `TARGET-REQ-006` | `kankaku/tests/target-picker.test.ts` | covered |
| `TARGET-REQ-007` | `kankaku/tests/session-target.test.ts` | covered |
| `TARGET-REQ-008` | `kankaku/tests/session-target.test.ts` | covered |
| `TARGET-REQ-009` | `kankaku/tests/pi-tracker.test.ts` | covered |
