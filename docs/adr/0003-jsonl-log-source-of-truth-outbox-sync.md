# 0003 — The JSONL log stays the source of truth; sync is a separate, idempotent outbox push

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-19 |

## Context

Recording work time happens inside pi's event handlers, on the critical path
of every prompt. Anything that can fail or stall there (a network call to a
remote hub) risks corrupting or blocking the core measurement feature.

## Decision

Nothing in a pi event handler waits on the network. Records are appended
locally, exactly as before this feature existed, to the append-only
`.kankaku/worklog.jsonl`. A separate sync step (manual command, background
trigger, or later a cron job) uploads what is pending — the outbox pattern.
If the hub is unreachable, work continues locally and nothing is lost.

## Consequences

- kankaku works fully offline; the hub is an optional destination, never a
  dependency of core measurement.
- Sync must be idempotent (safe to retry, safe to run twice) since it is
  decoupled from the write path — see
  [ADR 0011](0011-create-only-assignment-fields.md) and
  [`../specs/sync-push.md`](../specs/sync-push.md).
- A watermark (byte offset into the append-only log) is a valid, cheap
  "what's pending" cursor precisely because the log is never rewritten.
- Sync failures (network error, 5xx) must never lose data or corrupt local
  state — they stop the current pass, keep the watermark where it was, and
  retry later.

## Alternatives considered

- **Push directly from the event handler that creates the record** —
  rejected: makes every prompt's latency depend on the hub's availability
  and latency, which is unacceptable for the core feature.
- **A message queue / durable job system** — rejected as unnecessary
  complexity for a single-user, single-machine (or few-machines) tool; the
  append-only log plus a watermark already gives durability.

## Related

- Code: `kankaku/src/adapters/sync-runner.ts`, `kankaku/src/adapters/jsonl-work-log.ts`, `kankaku/src/adapters/sync-state-store.ts`
- Spec: [`../specs/sync-push.md`](../specs/sync-push.md), [`../specs/auto-sync-and-locking.md`](../specs/auto-sync-and-locking.md)
- Proposal: [`../proposal.md`](../proposal.md) §2 (D3), §6
