# 0020 — Subagent detection is profile-based, with gentle-pi first-class

| | |
|---|---|
| Status | accepted — implemented 2026-09-21 (kankaku branch `feat/pocketbase-hub`) |
| Date | 2026-09-20 |

## Context

kankaku recognises exactly one subagent mechanism today: a single hardcoded
tool name (`SUBAGENT_TOOL = "subagent_run"`, `kankaku/src/config.ts:19`) and
a single env-var check (`GENTLE_PI_AGENTS_CHILD === "1"`,
`kankaku/src/config.ts:97-99`). Any other pi subagent mechanism — pi's own
bundled reference example, the published `pi-subagents` package, a
third-party package a user installs — is invisible as a "subagent" concept
entirely: its tool call is measured as an ordinary tool span, and the
spawned child process (when out-of-process) defaults to `"orchestrator"`,
becoming a phantom, double-counted task (see the proposal's §1, §3).

The owner's explicit goal is for kankaku to work across the whole pi
ecosystem while keeping gentle-pi/gentle-ai the richest, most robust path —
not a lowest-common-denominator that treats every mechanism identically
and poorly.

## Decision

Subagent recognition is profile-based: a `SubagentProfile` (pure domain
type, `kankaku/src/domain/subagent-profile.ts`) declares the tool
names that open a subagent span, how to read agent/mode from launch args
and task id/status/usage from the tool result, and which env var(s) mark a
child process. Built-in profiles ship for **gentle-pi** (first-class: task
id, live status, mode, cwd, and — per ADR 0023 — cross-worktree
correctness that no other profile gets in the first phase), pi's bundled
reference example, and the published `pi-subagents` package. A fourth,
**configured**, profile is built from two new env vars —
`KANKAKU_SUBAGENT_TOOLS` and `KANKAKU_SUBAGENT_CHILD_ENV` — parsed with the
same conventions as the existing `KANKAKU_INTERACTIVE_TOOLS`/
`KANKAKU_SEGMENTS` variables, so a user can register an unlisted package
without a kankaku code change.

Configuring an additional profile is always additive: it never disables or
narrows gentle-pi's own built-in profile.

## Consequences

- `WorkTracker.onToolStart`'s single `toolName === this.subagentTool`
  comparison (`kankaku/src/domain/work-tracker.ts:131`) becomes a
  membership check against the union of every matched profile's
  `toolNames`.
- `extractTaskId` (`work-tracker.ts:280-288`), today gentle-pi-specific,
  generalises into each profile's own `readResult`; gentle-pi's exact
  current behaviour (reading `result.details.gentleAgents.taskId`) is
  preserved unchanged as that profile's implementation.
- Two profiles can register the same tool name (`pi-subagents` and pi's
  reference example both use `subagent` — proposal §2.B); profile matching
  must resolve that ambiguity via env markers, and must fall back to
  "uncertain" (ADR 0022) rather than guess when no marker resolves it.
- Adding a profile is a config/data change, not a new `===` branch in
  `work-tracker.ts` — keeps the domain layer profile-agnostic and testable
  without new source changes per package.

## What implementation taught us (2026-09-21)

- **The `pi-subagents` child marker is `PI_SUBAGENT_DEPTH`**, matched by
  presence, not by value. It was read from the package's source; the name the
  proposal guessed was wrong.
- **No pi subagent system nests a session in-process.** gentle-pi, pi's
  reference example and `pi-subagents` all spawn a real OS process; pi's own
  `newSession`/`fork` replace the session sequentially. "In-process
  nesting" (phase 6c) is therefore a forwarded-usage mechanism, not a
  nesting detector.
- **Forwarded usage is reconciled, never added blindly.** A tool result's
  `usage` is kept on the span and only counts when no child record of that
  profile joined the task — otherwise the child's own record already carries
  it (`SUBAGENT-REQ-006`).
- **An ambiguous tool-name match contributes timing only** — no profile, no
  task id, no forwarded usage (`SUBAGENT-REQ-025`). The parent has no child
  env to disambiguate with, and money is never derived from a guess.
- **A configured child marker is a weaker tier than a built-in one**: its
  name is validated and denylisted at config time, and it never demotes an
  interactive session (`SUBAGENT-REQ-026`).

## Alternatives considered

- **One hardcoded tool name, extended with more `===` branches per known
  package** — rejected: does not scale, and embeds every package's
  env-marker/result-shape knowledge directly into the pure tracker, which
  should stay generic.
- **A single generic profile with no gentle-pi specialisation** — rejected:
  directly contradicts the owner's stated priority that gentle-pi stay the
  richest, most robust path, not a lowest-common-denominator.

## Related

- ADRs: [0021](0021-join-by-explicit-id-then-ancestry.md),
  [0022](0022-uncertain-children-never-become-orchestrators.md),
  [0023](0023-cross-worktree-children-reunited-locally-first.md)
- Spec: [`../specs/subagent-detection.md`](../specs/subagent-detection.md)
- Proposal: [`../proposals/2026-09-20-generic-subagent-detection.md`](../proposals/2026-09-20-generic-subagent-detection.md) §2.B, §5.1
- Code: `kankaku/src/config.ts`, `kankaku/src/domain/work-tracker.ts`
