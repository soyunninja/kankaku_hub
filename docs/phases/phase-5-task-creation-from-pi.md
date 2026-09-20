# Phase 5 — Task creation from pi (PLANNED, optional)

| | |
|---|---|
| Status | planned |
| Repos | kankaku |
| Depends on | [phase-4-task-linkage](phase-4-task-linkage.md) |

## Goal

`/kankaku task new "<title>"`. Still no automatic creation — the proposal
is explicit that kankaku never invents tasks from prompts (see
[ADR 0004](../adr/0004-kankaku-does-not-invent-tasks.md)); this phase only
adds an *explicit* creation command as a convenience, and only "if phase 4
proves it necessary" (proposal §10).

## Scope

### In (planned)

- `/kankaku task new "<title>"` — creates a `tasks` row against the
  resolved project and immediately links the current record to it.

### Out (planned)

- Any automatic/inferred task creation from prompt content — permanently
  out of scope per D4.

## Deliverables

None yet — not started, and explicitly conditional on phase 4's outcome.

## Acceptance criteria

- [ ] `/kankaku task new "<title>"` creates a `tasks` row with `status:
      "open"` and links it as the current record's `taskId`.

## Evidence

None — no commits implement this yet.

## Known gaps

Everything — this phase has not been started, and per the proposal may
never be: "if you only look at `/kankaku` in the terminal, ... that is an
acceptable outcome."

## Next steps

- Decide only after [phase-4-task-linkage](phase-4-task-linkage.md) has
  been used and shown that manual linking is a real chore.
