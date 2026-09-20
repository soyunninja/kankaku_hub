# Phase 4 — Task linkage (SUPERSEDED BY A SESSION-CENTRIC FLOW)

| | |
|---|---|
| Status | superseded — delivered differently than originally scoped (see below) |
| Repos | kankaku-hub (delivered); kankaku (original `/kankaku task` scope, still not started) |
| Depends on | [phase-3-web](phase-3-web.md) |

## Goal (original scope)

Originally: `/kankaku task` picks an open task of the current project;
`taskId` lands in the record and in `task_entries`, read-only against
`tasks`. That specific CLI-side picker was never built — see "What
actually happened" below for why the goal ended up being met a different
way.

## What actually happened

Instead of a kankaku-side `/kankaku task` picker, task linkage shipped
**entirely inside kankaku-hub's web layer**, session-centric rather than
prompt-centric: every kankaku session (a group of `task_entries` rows
sharing one `session_id`) that has no linked task shows up in a
"sessions without a task" queue, where the owner explicitly converts it
into a new task, attaches it to an existing one, or ignores it — see
[ADR 0024](../adr/0024-sessions-link-to-tasks-by-explicit-action.md) and
[`../specs/web-sessions.md`](../specs/web-sessions.md) for the full
normative spec. The task detail sheet and entry detail sheet both surface
a session's linked task and a copy/paste command to resume that session.
This satisfies the same underlying need the original goal was aimed at
(connect a kankaku session to a task) without requiring kankaku itself to
grow a task picker or to know about `tasks` at sync time — the linkage
decision is made after the fact, in the hub, by a human, which also
avoids the guesswork [ADR 0004](../adr/0004-kankaku-does-not-invent-tasks.md)
already ruled out for individual prompts.

**Implementation status**: complete on the `kankaku-hub` side (schema
migration `1758300014`, the session grouping/resume/queue code, and the
task/entry detail integrations are all merged). **e2e coverage has landed**
from a parallel work unit: `web/e2e/session-resume.spec.ts`,
`web/e2e/sessions-queue.spec.ts`, and `web/e2e/agent-quality.spec.ts` now
exercise the resume block, the convert/attach/ignore queue actions, and
the agent/quality filters end-to-end, on top of the pure-logic unit
coverage (`web/tests/session-aggregate.test.ts`,
`web/tests/session-resume.test.ts`, `web/tests/agents.test.ts`,
`web/tests/measurement-quality.test.ts`). As of this update those three
e2e spec files exist in the working tree but had not yet been committed.
Two things still lack dedicated coverage either way: the mixed-agent
resume fallback on the task detail sheet, and the sidebar/command-palette
badge count — see [`../specs/web-sessions.md`](../specs/web-sessions.md)'s
traceability table for the exact per-requirement state.

## Scope

### Delivered (session-centric, kankaku-hub only)

- Session grouping over `task_entries` by `session_id`.
- "Sessions without a task" queue: convert / attach / ignore, each an
  explicit owner action.
- `ignored_sessions` collection for durably dismissing a session without
  faking a task.
- A derived (never stored) resume command, `pi`-only today.
- Session lists on task detail and entry detail, with resume commands.

### Not delivered (original `/kankaku task` scope — kankaku repo)

- A `/kankaku task` picker inside kankaku itself, read against `tasks`
  filtered by project/`status != done`.
- `taskId` added to `WorkRecordMetadata` / the `task_entries` create
  payload from kankaku's side (create-only, per
  [ADR 0011](../adr/0011-create-only-assignment-fields.md)).
- Declining a task pick remembered for the kankaku session, the same way
  declining client/project already works.

This CLI-side picker may still be worth building later (it would let the
owner assign a task **before** a session even starts, which the
session-centric flow — necessarily after-the-fact — cannot do), but it is
no longer a gap blocking "does the hub know which task a session belongs
to" — that question already has an answer today via the web queue.

### Out (still, either way)

- Creating tasks from kankaku — see
  [phase-5-task-creation-from-pi](phase-5-task-creation-from-pi.md).

## Acceptance criteria

Original criteria, re-assessed truthfully against what shipped:

- [ ] `/kankaku task` lists open tasks of the resolved project. — not
      built; not required for the delivered flow, see above.
- [ ] A picked task's id is stored on the record and included in the
      create-only sync payload. — not built from kankaku's side. The
      delivered flow instead updates `task_entries.task` after the fact,
      from the web, via `/api/batch` (not a create-time field).
- [ ] Declining to pick a task behaves like declining client/project. —
      not applicable to the delivered flow (there is no in-session pick to
      decline; a session that goes untouched simply stays in the queue).
- [x] The hub can associate a kankaku session with a task, durably,
      without kankaku inventing the association — delivered via the
      session queue and `ignored_sessions`.

## Evidence

`kankaku-hub` commits (this branch): `bf4399e` (schema: `ignored_sessions`
+ per-agent daily totals), `da1a60e` (session resume command and
grouping), `8890dd1` (entry detail resume + agent/quality info),
`7443591` (task detail sessions), `b038f83` (sessions-without-task
queue), `7ceb312` (bundled agent icons), `cce0e15` (agent/quality
filtering on entries + dashboard). No `kankaku` repo commits — the
CLI-side picker described in the original goal was not built.

## Known gaps

- The original `/kankaku task` CLI picker: not started, and no longer
  planned as the primary way to link sessions to tasks (superseded by the
  web queue) — revisit only if a "pick the task before starting" workflow
  turns out to matter in practice.
- e2e coverage for the delivered session-centric flow: landed (see "What
  actually happened" above), though not yet committed as of this update,
  and two requirements — the mixed-agent resume fallback and the
  nav/palette badge count — still lack a dedicated test either way.
- Resume commands only cover the `pi` agent today (see
  [`../specs/web-sessions.md`](../specs/web-sessions.md)
  `SESSIONS-REQ-005`) — a session run by another agent shows an
  unsupported-agent notice, not a broken command.

## Next steps

- Once the new e2e specs are committed, update this phase's evidence
  section with their commit hash.
- Decide, based on real usage of the session queue, whether a kankaku-side
  `/kankaku task` picker is still worth building, per the original
  proposal's recommendation (§12) to revisit after a phase has been used
  in practice.
