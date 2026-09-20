# Phase 6 — Generic subagent support (PLANNED)

| | |
|---|---|
| Status | planned |
| Repos | kankaku |
| Depends on | — (independent of phases 4/5) |

## Goal

Make kankaku recognise subagent processes from more than one mechanism —
not just gentle-pi's `subagent_run` — while keeping gentle-pi the richest,
most robust, first-class path, and without ever again silently
double-counting an unrecognised child as a phantom orchestrator task. See
[the proposal](../proposals/2026-09-20-generic-subagent-detection.md) for
full evidence and design.

Ordered so the **first sub-phase fixes the two correctness bugs that
already cost money today** — before any new profile abstraction is
introduced — because both bugs exist independently of this phase's larger
design and do not need it to be fixed.

## Scope

### In

- **6a — Safe default and gentle-pi cross-worktree fix** (the two
  money bugs, fixed first):
  - Invert `detectRole`'s default: an unrecognised process is classified
    `uncertain`, never `"orchestrator"` (ADR 0022).
  - Machine-wide process registry (`~/.kankaku/run/<pid>.json`) and
    OS-specific ancestor-chain lookup (macOS/Linux single-snapshot,
    Windows graceful no-op), so a gentle-pi subagent running in a
    different worktree can be reunited with its orchestrator locally,
    before `buildTasks` runs (ADR 0023).
  - `matchChildren`'s registry-corroborated second pass, with `project`
    downgraded from a hard filter to a hint (ADR 0021).
- **6b — Profile abstraction and observability**:
  - `SubagentProfile` domain type; built-in profiles for gentle-pi
    (first-class), pi's bundled reference example, and `pi-subagents`
    (ADR 0020).
  - `KANKAKU_SUBAGENT_TOOLS`/`KANKAKU_SUBAGENT_CHILD_ENV` configured
    profile.
  - `/kankaku doctor` diagnostic: matched profile per record, orphan/
    uncertain counts and reasons, ancestor-detection platform availability.
- **6c — In-process nesting**:
  - Read a subagent tool result's `usage` field and attribute it to the
    triggering record.
  - Same-pid overlapping-orchestrator union-not-sum guard, flagged as
    likely nesting.

### Out (planned for a later phase, or explicitly deferred)

- Built-in profiles for `pi-background-tasks` or `@d3ara1n/pi-subagent`
  — real candidates (both offer stronger signals than the two profiles
  built in 6b), deferred until the core abstraction has real usage.
- Passing gentle-pi's `taskId` to the child process itself — depends on
  upstream gentle-pi cooperation, not something this phase can build
  unilaterally (proposal Open Question #1).
- The optional, cosmetic `linked_task_id` hub self-relation for a failed
  local reunification (ADR 0023) — only worth building if the registry's
  TTL turns out to lose real links in practice.
- Any cross-machine subagent relationship.
- Windows ancestor-chain detection beyond graceful no-op.

## Deliverables

- `kankaku/src/domain/subagent-profile.ts` (new): profile type, built-in
  profiles, matching logic including tool-name-ambiguity resolution.
- `kankaku/src/domain/task-view.ts` (extended): registry-corroborated
  second join pass; four-state record classification; same-pid
  overlapping-orchestrator union.
- `kankaku/src/domain/work-tracker.ts` (extended): multi-tool-name
  subagent span opening; `result.usage` reading.
- `kankaku/src/domain/work-record.ts` (extended): new optional fields
  (`roleConfidence`, `profile`, `orchestratorRef`), no schema bump.
- `kankaku/src/ports/process-registry.ts` (new) +
  `kankaku/src/adapters/machine-process-registry.ts` (new): the
  machine-wide registry, with a staleness sweep.
- `kankaku/src/adapters/ancestry.ts` (new): OS-specific ancestor-chain
  lookup, Windows no-op.
- `kankaku/src/config.ts` (extended): `KANKAKU_SUBAGENT_TOOLS`/
  `KANKAKU_SUBAGENT_CHILD_ENV` parsing.
- `kankaku/src/adapters/kankaku-command.ts` (extended): `/kankaku doctor`.

## Acceptance criteria

- [ ] An unrecognised subagent-shaped tool call (e.g. pi's bundled
      reference example) is classified `uncertain`, not `orchestrator`,
      and produces no phantom top-level task.
- [ ] A gentle-pi subagent running in a different git worktree than its
      orchestrator is reunited into one consolidated task locally, before
      sync, without the hub ever summing two independent unions.
- [ ] `project` equality no longer hard-excludes an otherwise-eligible
      cross-project match backed by registry-corroborated ancestry.
- [ ] `KANKAKU_SUBAGENT_TOOLS`/`KANKAKU_SUBAGENT_CHILD_ENV` let a user
      register a third-party tool without a kankaku code change, additive
      to gentle-pi's own built-in recognition.
- [ ] `/kankaku doctor` reports matched profile, orphan/uncertain counts
      with reasons, and ancestor-detection platform availability, with no
      network call.
- [ ] A subagent tool result's `usage` field, when present, is attributed
      to the triggering record's totals.
- [ ] Two same-pid overlapping `"orchestrator"` records (in-process
      nesting) are unioned, not summed, and flagged.
- [ ] `WORK_RECORD_SCHEMA` is unchanged; every new field is optional and a
      pre-existing record stays valid under `isWorkRecord`.
- [ ] `npm run check` passes; every new requirement in
      [`subagent-detection.md`](../specs/subagent-detection.md) has test
      coverage per its Traceability table.

## Evidence

None — not started. This phase file, its spec, and its four ADRs are the
proposal-stage artifacts; no code exists yet.

## Known gaps

Everything — nothing in this phase is implemented. The proposal explicitly
flags one design dependency this phase cannot resolve alone: raising
gentle-pi's cross-worktree join from "registry + ancestry" to "explicit id"
confidence depends on gentle-pi choosing to pass its child a task id,
which is outside kankaku's control (proposal Open Question #1).

## Next steps

- Implement 6a first and ship it independently if useful on its own — both
  bugs it fixes exist today, regardless of whether 6b/6c ever land.
- After 6b/6c have real usage, revisit Open Questions #2 (additional
  built-in profiles) and #5 (the `linked_task_id` fallback) from the
  proposal with actual registry-TTL-loss data instead of speculation.
