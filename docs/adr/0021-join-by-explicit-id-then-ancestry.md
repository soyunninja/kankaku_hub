# 0021 — Join by explicit id, then pid ancestry; project is a hint, never a filter; time alone never joins

| | |
|---|---|
| Status | proposed |
| Date | 2026-09-20 |

## Context

`matchChildren` (`kankaku/src/domain/task-view.ts:109-150`) joins a
subagent record to its orchestrator only when all three hold: exact
`project` string equality (line 129), exact `orchestrator.pid ===
child.parentPid` (line 130), and the child's `startedAt` inside the
orchestrator's window (lines 132-134). The `project` equality requirement
is exactly what makes a gentle-pi cross-worktree child unjoinable even
though its `pid`/`parentPid` are correct (proposal §2.A) — kankaku already
correctly marks it `role: "subagent"`, it just can never find its
orchestrator because they resolve to different `worklog.jsonl` files with
different `project` values.

At the same time, relaxing the join too far is dangerous: two independent
`pi` sessions running in the same repository, in two terminals, overlap in
time and share a `project` value with no parent/child relationship at all.
Joining on time-plus-project would misjoin them.

## Decision

Join keys are ranked by confidence and applied in order, never combined
permissively:

1. **Explicit shared id (high)** — gentle-pi's `taskId`
   (`SubagentSpan.taskId`, `kankaku/src/domain/work-record.ts:16-22`,
   captured via `extractTaskId`, `work-tracker.ts:280-288`), when
   available. Confirmed not currently readable by the child itself
   (proposal §2.B, §5.2) — stays parent-side only until/unless gentle-pi
   chooses to pass it to the child too (proposal Open Questions #1).
2. **Pid ancestry against a machine-wide registry of live tracked
   processes (medium)** — see ADR 0023 for the registry itself. `project`
   equality is downgraded to a **hint**: a same-project match is still
   preferred when found, but a cross-project match backed by a live
   registry entry plus confirmed pid/parentPid ancestry is now eligible.
3. **Nothing** — a record with no explicit id and no registry-corroborated
   ancestry match stays unjoined (orphan/uncertain, ADR 0022), never
   defaulting to a guess.

**Time containment alone never auto-joins.** It is used only as a
secondary filter within an already-id-or-ancestry-eligible candidate set
(as `matchChildren` already does for tie-breaking on pid reuse), and,
separately, as a labelled *suggestion* surfaced by `/kankaku doctor` for a
human to evaluate — never applied automatically.

## Consequences

- `matchChildren` gains a second pass, after its existing exact-match pass,
  considering registry-corroborated candidates with `project` as a hint.
  The existing pass and its behaviour are unchanged — this is additive.
- The "two terminals in one repo" scenario stays correctly unjoined: no
  registry entry links them (different, unrelated process ancestries), so
  neither the ranked-key pass nor the existing pass matches them.
- Explicit-id joining for gentle-pi does not improve without upstream
  cooperation (proposal Open Question #1) — this ADR does not claim to
  solve that; ADR 0023's registry path is what actually fixes the
  cross-worktree case in the first phase.

## Alternatives considered

- **Time-containment-plus-project, dropping the pid requirement** —
  rejected: this is precisely the false-positive the "two unrelated
  terminals" scenario guards against.
- **Require the explicit-id key for every join, drop pid/ancestry
  entirely** — rejected: gentle-pi's own child cannot currently supply its
  task id (proposal §2.B); this would regress same-worktree joining, which
  works correctly today via pid/parentPid alone.

## Related

- ADRs: [0020](0020-subagent-profiles-gentle-pi-first-class.md),
  [0022](0022-uncertain-children-never-become-orchestrators.md),
  [0023](0023-cross-worktree-children-reunited-locally-first.md)
- Spec: [`../specs/subagent-detection.md`](../specs/subagent-detection.md)
- Proposal: [`../proposals/2026-09-20-generic-subagent-detection.md`](../proposals/2026-09-20-generic-subagent-detection.md) §5.2
- Code: `kankaku/src/domain/task-view.ts`
