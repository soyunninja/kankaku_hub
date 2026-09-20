# kankaku commands

| | |
|---|---|
| Status | implemented |
| Phase | [phase-1-catalog-and-selection](../phases/phase-1-catalog-and-selection.md), [phase-2-sync-push](../phases/phase-2-sync-push.md) |
| Owners repos | kankaku |
| Related ADRs | [0002](../adr/0002-selection-is-a-pick-from-a-list.md) |
| Code | `kankaku/src/adapters/kankaku-command.ts` |
| Tests | `kankaku/tests/kankaku-command.test.ts` |

## Purpose

Defines the `/kankaku` command surface: the local reporting commands that
predate the hub feature, plus the hub-specific subcommands added by this
system (gated on a hub target being configured).

## Requirements

1. `CMD-REQ-001` — The system SHALL register a single `/kankaku` command
   with pi (`registerKankakuCommand`), dispatching on the first token.
2. `CMD-REQ-002` — Bare `/kankaku` (no arguments) SHALL show today's role
   totals and task segment summary.
3. `CMD-REQ-003` — The system SHALL support `/kankaku all`, `/kankaku tasks
   [all]`, `/kankaku sessions [all]`, `/kankaku client [<name>|--clear]`,
   `/kankaku clients [all]`, `/kankaku export [csv|json] [all]` regardless
   of hub configuration.
4. `CMD-REQ-004` — The hub-specific tokens `/kankaku target [pick|clear]`,
   `/kankaku catalog refresh`, `/kankaku projects [all]`, `/kankaku sync
   [all|status]`, `/kankaku backfill` SHALL only be available when
   `deps.sessionTarget` (a hub target) is configured.
5. `CMD-REQ-005` — `/kankaku target pick` SHALL re-invoke the picker even
   if a target was already resolved or skipped for the session.
6. `CMD-REQ-006` — `/kankaku target clear` SHALL clear the session's
   picked/skipped state (does not delete `config.json`'s persisted ids).
7. `CMD-REQ-007` — `/kankaku sync status` SHALL report the current sync
   state (watermark, last run, any recorded failures) without triggering a
   sync run.
8. `CMD-REQ-008` — `/kankaku sync` (no argument) SHALL trigger a manual,
   unthrottled sync pass and report a summary.
9. `CMD-REQ-009` — Argument completion SHALL offer the correct sub-token
   list per command (`target`: `pick`/`clear`; `catalog`: `refresh`;
   `sync`: `all`/`status`).

## Scenarios

### Scenario: hub commands are hidden without a hub target (`CMD-REQ-004`)

- **Given** no hub credentials are configured
- **When** `/kankaku` argument completion is requested
- **Then** `target`, `catalog`, `projects`, `sync`, `backfill` do not appear

### Scenario: `/kankaku sync status` never triggers a network call (`CMD-REQ-007`)

- **Given** a hub target is configured
- **When** `/kankaku sync status` is run
- **Then** the reported state comes from `sync-state.json` only, with no upsert attempted

### Scenario: `/kankaku target pick` re-opens the picker mid-session (`CMD-REQ-005`)

- **Given** a target was already picked earlier in the session
- **When** `/kankaku target pick` is run
- **Then** the client/project picker is shown again, overriding the earlier pick on completion

## Configuration

No dedicated env vars; command availability is gated on the presence of a
hub target (see [`hub-credentials-and-config.md`](hub-credentials-and-config.md)
and [`target-selection.md`](target-selection.md)).

## Edge cases & failure modes

- Running a hub subcommand with a since-invalidated hub target (e.g.
  credentials removed mid-session): surfaces the same error path as an
  unreachable hub during sync/catalog operations.

## Out of scope

- `/kankaku task` (task linkage) and `/kankaku task new` — planned, not
  implemented; see [phase-4-task-linkage](../phases/phase-4-task-linkage.md)
  and [phase-5-task-creation-from-pi](../phases/phase-5-task-creation-from-pi.md).
- A `/kankaku sync --since <date>` flag for the pathological
  older-than-window-orchestrator case mentioned in
  [`../proposal.md`](../proposal.md) §6.0 — not confirmed present in the
  current token list (`SYNC_TOKENS = ["all", "status"]`); treat as
  **not implemented** until verified otherwise.

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `CMD-REQ-001` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `CMD-REQ-002` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `CMD-REQ-003` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `CMD-REQ-004` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `CMD-REQ-005` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `CMD-REQ-006` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `CMD-REQ-007` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `CMD-REQ-008` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `CMD-REQ-009` | `kankaku/tests/kankaku-command.test.ts` | covered |
