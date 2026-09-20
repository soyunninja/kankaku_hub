# Phase 4 — Task linkage (PLANNED)

| | |
|---|---|
| Status | planned |
| Repos | kankaku, kankaku-hub |
| Depends on | [phase-3-web](phase-3-web.md) |

## Goal

`/kankaku task` picks an open task of the current project; `taskId` lands
in the record and in `task_entries`. Read-only against `tasks`, which the
web already lets a human create ([phase-3-web](phase-3-web.md)).

## Scope

### In (planned)

- A `/kankaku task` picker analogous to the client/project picker (read
  `tasks` filtered by the resolved project and `status != done`).
- `taskId` added to `WorkRecordMetadata` and to the `task_entries` create
  payload.

### Out (planned)

- Creating tasks from kankaku — see
  [phase-5-task-creation-from-pi](phase-5-task-creation-from-pi.md).

## Deliverables

None yet — not started.

## Acceptance criteria

- [ ] `/kankaku task` lists open tasks of the resolved project.
- [ ] A picked task's id is stored on the record and included in the
      create-only sync payload (never overwritten on update, consistent
      with [ADR 0011](../adr/0011-create-only-assignment-fields.md)).
- [ ] Declining to pick a task behaves like declining client/project: no
      task, remembered for the session.

## Evidence

None — no commits implement this yet, in either repo.

## Known gaps

Everything — this phase has not been started. The proposal (§10) explicitly
recommends holding phases 4 and 5 "until you have used the first three for
a couple of weeks — by then you will know whether linking tasks by hand is
a chore worth automating."

## Next steps

- Revisit after phase 3 has been used in practice, per the proposal's
  recommendation (§12).
