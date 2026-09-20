# 0005 — Reads are cached, writes are queued

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-19 |

## Context

The picker ([ADR 0002](0002-selection-is-a-pick-from-a-list.md)) needs the
catalog at session start, on the critical path of the user seeing a prompt.
A network round trip there would make every session start latency-dependent
on the hub.

## Decision

The catalog is cached on disk (`~/.kankaku/catalog.json`) so startup never
blocks on the network — a stale cache still lets you pick. The cache is
read and shown immediately; refresh happens in the background and updates
the cache for next time. Writes (sync) queue behind a watermark rather than
happening inline — see [ADR 0003](0003-jsonl-log-source-of-truth-outbox-sync.md).

## Consequences

- A cold start with no cache and an unreachable hub degrades to the
  pre-hub free-text behaviour rather than blocking work, with a one-time
  notice.
- The cache can go stale (TTL 6 hours,
  `kankaku/src/adapters/cached-catalog.ts`); `/kankaku catalog refresh`
  forces an update.
- A cache written for a different hub URL is ignored rather than trusted,
  preventing a stale cross-environment catalog from leaking in.

## Alternatives considered

- **Always fetch fresh on session start** — rejected: makes every session
  start latency-dependent on the hub, defeating the "silence is the reward
  for a configured project" goal.
- **No cache, always use the last picker result** — rejected: a stale
  catalog is still more useful than none, and refreshing in the background
  keeps it current without blocking.

## Related

- Code: `kankaku/src/adapters/cached-catalog.ts`
- Spec: [`../specs/catalog-cache.md`](../specs/catalog-cache.md)
- Proposal: [`../proposal.md`](../proposal.md) §2 (D5), §5.2
