# 0002 — Selection is a pick from a list, never free text

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-19 |

## Context

If identity is an id ([ADR 0001](0001-identity-is-an-id-not-a-name.md)),
something still has to resolve which id a session means. Typing a name
reintroduces the exact spelling-drift problem ADR 0001 exists to remove.

## Decision

At session start, kankaku shows `ctx.ui.select(...)` with the catalog pulled
from the hub (client, then project of that client). `/kankaku client <name>`
stays available as a compatibility path but is no longer the recommended
flow, and it validates the typed name against the catalog rather than
accepting it verbatim.

Fuzzy matching (`cjamar` → `Cajamar`) is deliberately absent: the picker
removes the class of error entirely, and fuzzy matching would reintroduce it
with a confidence score attached instead of a definite answer. The legacy
`/kankaku client <name>` path rejects unknown names with a "did you mean"
listing instead of silently guessing.

## Consequences

- Selecting is one or two extra keystrokes at session start, mitigated by
  [ADR 0005](0005-reads-cached-writes-queued.md) (cache-first, so the picker
  never waits on the network) and by silent auto-selection when a project's
  `repo_paths` already maps the current directory.
- A `— skip —` option must always exist: declining to pick must be possible
  and must be remembered for the session so the user is not asked twice.
- The web's own reassignment-suggestion feature
  (`app/lib/suggest-client.ts`, [`../specs/web-unassigned-queue.md`](../specs/web-unassigned-queue.md))
  follows the same discipline: it only ever proposes an **exact** normalized
  match, never a fuzzy one, and always requires human confirmation.

## Alternatives considered

- **Fuzzy/typo-tolerant matching against the catalog** — rejected; see
  Context above and [`../proposal.md`](../proposal.md) §5.4.
- **Keep free text as the only path, normalize server-side** — rejected;
  moves the same drift problem one hop downstream instead of removing it.

## Related

- Code: `kankaku/src/adapters/target-picker.ts`, `kankaku/src/adapters/session-target.ts`
- Spec: [`../specs/target-selection.md`](../specs/target-selection.md)
- Proposal: [`../proposal.md`](../proposal.md) §2 (D2), §5
