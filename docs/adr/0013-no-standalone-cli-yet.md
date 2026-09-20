# 0013 — No standalone CLI yet

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

The proposal (§6.3, option 3) floats a small standalone CLI entry point
(`npx kankaku sync`) so sync can run outside a pi session entirely — the
most robust trigger, since it doesn't depend on a pi session being open —
and suggests it "can be pulled into phase 2 or deferred." It was deferred.

A standalone CLI would need to run kankaku's TypeScript sources directly
(the extension has no build step — pi loads `src/extension.ts` via type
stripping). Node's native TypeScript support refuses to strip types for a
file loaded from inside a `node_modules` directory, which is exactly where
an installed npm package's own CLI entry point would live when invoked by
its consumers. Solving that cleanly (a build step, or a different loading
strategy) is nontrivial engineering that phases 1–2 did not need.

## Decision

No standalone CLI is shipped yet. The only ways to trigger sync today are
from inside a pi session: `/kankaku sync` (manual), automatic
session-start sync (throttled, see
[ADR 0016](0016-throttled-auto-sync.md)), or (per the proposal) a future
cron/launchd job running outside pi — still blocked on the same
type-stripping constraint.

## Consequences

- Sync cannot currently run unattended (e.g. nightly) without a pi session
  being opened; the "robust, session-independent" trigger from the
  proposal's option 3 is not available.
- Extending kankaku with a CLI later requires resolving the type-stripping
  constraint first (a build step, a published `dist/`, or an alternate
  loader) — a prerequisite worth surfacing before committing to a CLI
  design.

## Alternatives considered

- **Ship a CLI now, accept a build step** — rejected for this stage:
  adds release-process complexity (a compiled artifact to keep in sync with
  sources) for a capability nothing currently depends on.

## Related

- Proposal: [`../proposal.md`](../proposal.md) §6.3, §10 ("Standalone CLI ... can be pulled into phase 2 or deferred")
- ADR: [0016 — throttled auto-sync](0016-throttled-auto-sync.md) (the trigger that exists instead)
