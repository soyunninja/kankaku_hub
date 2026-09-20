# 0004 — kankaku does not invent tasks

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-19 |

## Context

A `WorkRecord` is one prompt, not one task. Auto-creating a `tasks` row per
prompt would produce hundreds of junk rows per week, and inferring task
boundaries from prompt text is guesswork with no reliable signal.

## Decision

Tasks are created by a human in the hub's web app. kankaku only *links* a
synced `task_entries` row to an existing `tasks` row when one is picked
(planned, [phase 4](../phases/phase-4-task-linkage.md)). Explicit creation
from kankaku (`/kankaku task new "<title>"`) is a later, optional step
([phase 5](../phases/phase-5-task-creation-from-pi.md), built only if
phase 4 proves it necessary).

## Consequences

- The `tasks` collection stays a meaningful, human-curated list instead of a
  noisy log of every prompt.
- `task_entries` (the actually-synced, always-summable row) does not depend
  on a `tasks` row existing — its `task` relation is optional.
- Phases 4 and 5 are explicitly deferred until phases 1–3 have been used
  long enough to know whether manual linking is a chore worth automating.

## Alternatives considered

- **Auto-create a task per orchestrator run** — rejected, produces
  unmanageable noise.
- **Infer task boundaries from prompt text/NLP** — rejected as guesswork
  with no reliable ground truth, and out of scope for a measurement tool.

## Related

- Code: `kankaku-hub` migration `1758300004_tasks_collection.js`
- Spec: [`../specs/hub-schema-and-access-rules.md`](../specs/hub-schema-and-access-rules.md), [`../specs/web-tasks.md`](../specs/web-tasks.md)
- Phases: [phase-4-task-linkage](../phases/phase-4-task-linkage.md), [phase-5-task-creation-from-pi](../phases/phase-5-task-creation-from-pi.md)
- Proposal: [`../proposal.md`](../proposal.md) §2 (D4)
