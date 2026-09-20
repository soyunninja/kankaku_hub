# 0022 — An unproven process never defaults to orchestrator (the safe default, inverted)

| | |
|---|---|
| Status | proposed |
| Date | 2026-09-20 |

## Context

`detectRole` (`kankaku/src/config.ts:97-99`) returns `"orchestrator"` for
every process except one whose env carries `GENTLE_PI_AGENTS_CHILD === "1"`.
Concretely, pi's own bundled reference example (tool `subagent`, no env
marker at all) and the published `pi-subagents` package's foreground-named
`subagent` tool both spawn children that kankaku labels `"orchestrator"`
every time — a phantom top-level task on top of the time already measured
inside the parent's own tool-call span (proposal §1, §3). This is an
overcount: billable time counted twice.

Undercount (a real subagent excluded from its task) is the opposite
failure and is recoverable — the record itself is never lost, only
unjoined, and a later sync pass or config fix can pick it up. Overcount is
not recoverable without a human finding and manually correcting an
already-billed, already-synced duplicate.

## Decision

A process that cannot be positively proven top-level is never counted as a
new orchestrator task by default. Four states, not two:

- **orchestrator** — confirmed: no recognised child-env-marker present.
- **subagent-joined** — matched to an orchestrator (ADR 0021).
- **subagent-unjoined (orphan)** — a recognised child-env-marker matched,
  but no orchestrator could be found; shown separately, never dropped
  (existing `orphanSubagents` behaviour, unchanged), never synced as its
  own task.
- **uncertain** — no child-env-marker matched, and no confirmed-orchestrator
  ancestor could be found either. Not counted as a new top-level task by
  default; surfaced in `/kankaku doctor` and report output as its own
  bucket, so the gap is visible rather than silently wrong in either
  direction.

This does not change `WorkRecord.role`'s persisted two values
(`"orchestrator"` | `"subagent"`) — see ADR 0020's proposal reference and
the main proposal's "Alternatives considered" for why a third enum value
was rejected in favour of an additional optional field. The classification
above is applied by reporting/task-view code on top of the existing binary
`role`.

## Consequences

- `/kankaku` reports and hub sync both need an explicit "uncertain" bucket
  that is neither summed into orchestrator totals nor silently dropped.
- A user who wants an uncertain process correctly recognised has a clear
  remediation path: add its tool/env marker via `KANKAKU_SUBAGENT_TOOLS`/
  `KANKAKU_SUBAGENT_CHILD_ENV` (ADR 0020), then re-sync — no data was lost
  in the meantime.
- Today's two double-counting scenarios (pi's reference example,
  `pi-subagents`' `subagent`-named tool) are fixed by this ADR alone, even
  before any profile is specifically built for them, because the default
  they currently fall into no longer exists.

## Alternatives considered

- **Default unrecognised processes to `"subagent"` instead of
  `"orchestrator"`** — rejected: an actual top-level session with some
  unrelated ancestor process (e.g. a terminal multiplexer, an unrelated
  shell) would vanish from every report entirely. Flipping which silent
  wrong default applies is not a fix.
- **Require explicit user confirmation before counting any newly-seen
  process at all** — rejected: would make kankaku non-functional out of
  the box for its own primary case (a bare `pi` session with no subagents),
  which never had this ambiguity to begin with.

## Related

- ADRs: [0020](0020-subagent-profiles-gentle-pi-first-class.md),
  [0021](0021-join-by-explicit-id-then-ancestry.md),
  [0023](0023-cross-worktree-children-reunited-locally-first.md)
- Spec: [`../specs/subagent-detection.md`](../specs/subagent-detection.md)
- Proposal: [`../proposals/2026-09-20-generic-subagent-detection.md`](../proposals/2026-09-20-generic-subagent-detection.md) §5.4
- Code: `kankaku/src/config.ts`, `kankaku/src/domain/task-view.ts`
