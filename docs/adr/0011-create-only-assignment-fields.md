# 0011 — Assignment fields are create-only in sync

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

A task is not final when first written: a background subagent can settle
after its orchestrator, so sync must be able to re-upsert an already-synced
`task_entries` row (see [`../specs/sync-push.md`](../specs/sync-push.md)
and the revisit window). Separately, a human can reassign a `task_entries`
row's client/project in the web's unassigned queue. If a later re-sync
overwrote `client`/`project`/`task`/`legacy_client_label` unconditionally,
every manual reassignment would be silently undone the next time that row's
task changed (e.g. a late subagent settling). The proposal's D6/§6 sections
describe the revisit-window mechanics but do not spell out this specific
field-level rule — it was fixed during sync implementation.

## Decision

`client`, `project`, `task` and `legacy_client_label` on a `task_entries`
row are written **only** when the row is first created by sync, and never
included in a later update payload. In code:
`kankaku/src/domain/hub-entry.ts` defines
`TaskEntryUpdatePayload = Omit<TaskEntryPayload, "client" | "project" | "task" | "legacy_client_label">`;
`buildTaskEntryUpdatePayload` structurally cannot include those fields.
`pocketbase-sink.ts#upsertTaskEntry` sends the full payload only on `POST`
(create); every `PATCH` (update) uses the trimmed payload.

## Consequences

- A reassignment made in the web survives any number of later re-syncs of
  that task, including ones triggered by a late-settling subagent.
- Measurement fields (`wall_ms`, `cost`, `status`, ...) do still update on
  every re-sync, so a task's numbers stay accurate even after reassignment.
- If a task genuinely needs its assignment corrected from kankaku's side
  (not the web), that requires either a new `task_id` (a new task) or a
  manual reassignment in the web — there is no supported path to change
  `client`/`project` on an existing `task_entries` row from kankaku.
- Enforced structurally (the TypeScript type omits the fields), not just by
  convention — a future change that tries to add them back to the update
  payload fails to compile against `TaskEntryUpdatePayload`.

## Alternatives considered

- **Always overwrite assignment fields on re-sync** — rejected: undoes
  every manual reassignment the moment a task's stats change, which is
  exactly the workflow the unassigned queue exists to support.
- **Overwrite only if the row hasn't been manually edited (dirty flag)** —
  rejected as unnecessary complexity; create-only is simpler and has no
  failure mode where a flag could get out of sync.

## Related

- Code: `kankaku/src/domain/hub-entry.ts`, `kankaku/src/adapters/pocketbase-sink.ts`
- Docs: `kankaku/AGENTS.md` (states this as a hard rule)
- Spec: [`../specs/sync-push.md`](../specs/sync-push.md)
- ADR: [0006](0006-aggregation-rule-lives-once-in-kankaku.md) (why a task can be re-synced at all)
