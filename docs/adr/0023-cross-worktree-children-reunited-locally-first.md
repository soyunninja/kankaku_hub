# 0023 — Cross-worktree/cross-repo children are reunited locally first, via a machine-wide registry; the hub never sums two independent unions

| | |
|---|---|
| Status | proposed |
| Date | 2026-09-20 |

## Context

A gentle-pi subagent can run in a different git worktree than its
orchestrator. Investigation (proposal §2.A) established this is worse than
"excluded from local task/session views": `KANKAKU_DIR` resolves per
project (`kankaku/src/adapters/kankaku-dir.ts:8-10`), so the child writes to
a different `worklog.jsonl` entirely, and since `buildTasks` only ever
anchors a `TaskView` on a `role === "orchestrator"` record
(`kankaku/src/domain/task-view.ts:193-196`), the child's own
`role: "subagent"` record can never anchor a sync-able task by itself —
neither automatic sync (gated on `role === "orchestrator"`,
`kankaku/src/adapters/pi-tracker.ts:153`) nor a manual `/kankaku sync` run
from inside the child's worktree ever uploads it. The child's work is lost
to the hub, not merely absent from one local report.

[ADR 0006](0006-aggregation-rule-lives-once-in-kankaku.md) establishes that
the interval-union aggregation rule lives exactly once, in kankaku's domain
layer, and that downstream consumers only ever sum already-consolidated
rows. This ADR has to decide whether fixing the cross-worktree case is
allowed to bend that boundary — the task that produced this proposal
explicitly asked the question.

## Decision

**No, the boundary does not bend, and the reason is arithmetic, not just
architectural preference.** If local reunification fails and each side
independently uploads its own `unionMs` result, the two resulting `wall_ms`
values are not disjoint — the child ran concurrently with part of the
parent's span by construction — so summing them server-side would
double-count the overlap. That is a different, and wrong, operation from
`unionMs`; it cannot be substituted for it no matter where it runs.

Instead: a machine-wide registry (`~/.kankaku/run/<pid>.json`, independent
of any project's `KANKAKU_DIR`, per proposal §2.D's finding that
`inflight/<pid>.json` is only sound within one project) lets a subagent
process discover its true orchestrator's identity — pid, project,
`startedAt` — by walking its OS ancestor chain and matching a live registry
entry, then records that discovery on its own record
(`orchestratorRef?: { pid, project, startedAt }`, a new optional field).
`matchChildren` (ADR 0021) uses this to reunite parent and child **locally,
before `buildTasks` runs**, so the exact same single `unionMs` call already
in place today still produces the one, fully consolidated `TaskView` that
gets synced — no change to what the hub ever receives.

When local reunification cannot happen (the registry entry already expired
by the time sync runs, or ancestry could not be established at all), the
child's record stays an orphan (ADR 0022) — undercounted but not lost, and
not compensated for by a server-side sum. A purely cosmetic, optional
`linked_task_id` hub self-relation was considered for this fallback case
(grouping two rows visually in the web, never summing them) and is
explicitly deferred, not built in `phase-6`'s first pass.

## Consequences

- The registry needs its own liveness/staleness sweep (mirroring
  `sync-state-store.ts`'s stale-lock pattern), since it is not bounded by
  any single project's lifecycle.
- A cross-worktree child correctly reunited locally is indistinguishable,
  from the hub's point of view, from a same-worktree one — the hub's
  contract and ADR 0006 are both untouched.
- If reunification's TTL turns out to lose real links in practice, the
  deferred `linked_task_id` fallback (cosmetic grouping only, never
  summed) is the next thing to build — not a relaxation of this decision.
- **A pid is not an identity (learned in the 6a review, 2026-09-20).** The
  first implementation matched ancestors by pid alone and never removed an
  entry on exit. Because the OS reuses pids, a leftover entry could end up
  naming the user's interactive shell, and every genuine session launched
  from it would be classed as uncertain and dropped — the exact silent
  undercount this work exists to prevent. Entries now carry a
  `processStartId` (OS start time taken from the same single startup
  snapshot: `ps -eo pid,ppid,etime` on macOS/BSD — `etimes` is GNU-only —
  and `/proc/<pid>/stat` + `/proc/uptime` on Linux), a match requires
  identity agreement within 2000 ms, entries are removed on exit, and the
  sweep discards dead, stale-by-reuse, unverifiable and over-age (7 days)
  entries. See `SUBAGENT-REQ-019`/`-020`. Windows remains a graceful no-op.

## Alternatives considered

- **Set `KANKAKU_DIR` to an absolute, shared path** — rejected as the
  primary fix: fixes storage location but not `matchChildren`'s `project`
  equality (still needs the ADR 0021 change regardless), asks every user
  to hand-configure a shared directory, and mixes unrelated repositories'
  records in one file. See proposal §2.A.
- **Let the hub sum two independently-synced `task_entries` rows sharing a
  taskId** — rejected: arithmetically wrong when the two local unions
  overlap in wall-clock time, which they do by construction whenever the
  scenario actually applies.
- **Re-implement interval union server-side over raw `work_records`** —
  already rejected by ADR 0006 for the same reasons that decision gives;
  this ADR does not reopen that question.

## Related

- ADRs: [0006](0006-aggregation-rule-lives-once-in-kankaku.md),
  [0020](0020-subagent-profiles-gentle-pi-first-class.md),
  [0021](0021-join-by-explicit-id-then-ancestry.md),
  [0022](0022-uncertain-children-never-become-orchestrators.md)
- Spec: [`../specs/subagent-detection.md`](../specs/subagent-detection.md)
- Proposal: [`../proposals/2026-09-20-generic-subagent-detection.md`](../proposals/2026-09-20-generic-subagent-detection.md) §2.A, §5.5
- Architecture: [`../architecture/aggregation.md`](../architecture/aggregation.md)
- Code: `kankaku/src/adapters/kankaku-dir.ts`, `kankaku/src/domain/task-view.ts`,
  `kankaku/src/adapters/file-inflight-store.ts`
