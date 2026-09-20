# 0016 — Auto-sync is throttled and short-circuits on an unchanged log

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

The proposal (§6.3, option 2) allows a fire-and-forget background sync on
session start. Run naively, that means a real network round trip (catalog
auth, task diffing, upserts) on every single pi session start, even when
nothing changed since the last sync moments ago — expensive and pointless
for a rapid sequence of short sessions.

## Decision

Automatic sync (triggered, not manual) is gated two ways, in
`kankaku/src/adapters/sync-runner.ts#runSync`:

1. **Cheap short-circuit**: if the work log's version is unchanged since
   the last successful sync and there was no previous error, return
   immediately — no read, no network call at all.
2. **Throttle**: otherwise, `isThrottled(...)` gates a real run behind
   `KANKAKU_SYNC_MIN_INTERVAL_MINUTES` (default 5, `0` explicitly disables
   throttling), persisted via `SyncState.lastRunAt` so it holds across
   process restarts. A `session_start` trigger bypasses the throttle only
   when the previous attempt errored or never ran, so a broken sync doesn't
   silently stay broken for 5 minutes of retries that never happen.

Manual `/kankaku sync` is never throttled.

## Consequences

- Opening many short pi sessions in a row does not spam the hub with
  redundant sync calls.
- A user who wants an immediate sync after a fix can always run
  `/kankaku sync` manually — the throttle only affects automatic triggers.
- The throttle is configurable to `0` (effectively disabled) for anyone who
  wants every automatic trigger to attempt a real sync.

## Alternatives considered

- **No throttle, always attempt sync on session start** — rejected:
  wasteful for rapid session cycling and adds latency risk to every
  session start.
- **Only manual sync, no automatic trigger at all** — rejected: defeats
  the "makes the VPS useful without extra user effort" goal of phase 2.

## Related

- Code: `kankaku/src/adapters/sync-runner.ts`, `kankaku/src/config.ts` (`SyncConfig.minIntervalMinutes`)
- Spec: [`../specs/auto-sync-and-locking.md`](../specs/auto-sync-and-locking.md)
- Proposal: [`../proposal.md`](../proposal.md) §6.3
