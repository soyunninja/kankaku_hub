# Auto-sync and locking

| | |
|---|---|
| Status | implemented |
| Phase | [phase-2-sync-push](../phases/phase-2-sync-push.md) |
| Owners repos | kankaku |
| Related ADRs | [0016](../adr/0016-throttled-auto-sync.md) |
| Code | `kankaku/src/adapters/sync-runner.ts`, `kankaku/src/adapters/sync-state-store.ts`, `kankaku/src/config.ts` |
| Tests | `kankaku/tests/sync-runner.test.ts`, `kankaku/tests/sync-state-store.test.ts`, `kankaku/tests/config.test.ts` |

## Purpose

Triggers sync automatically (session start, and potentially other pi
lifecycle events) without spamming the hub, and guarantees only one sync
process touches `sync-state.json` at a time across concurrent pi processes
on the same machine.

## Requirements

1. `AUTOSYNC-REQ-001` — Automatic (triggered, non-manual) sync SHALL be
   controlled by `KANKAKU_SYNC_AUTO` (default enabled).
2. `AUTOSYNC-REQ-002` — On a triggered sync, if the work log's version is
   unchanged since the last successful sync and there was no previous
   error, the system SHALL return immediately with no disk read beyond the
   version check and no network call.
3. `AUTOSYNC-REQ-003` — Otherwise, a triggered sync SHALL be throttled by
   `KANKAKU_SYNC_MIN_INTERVAL_MINUTES` (default 5; `0` disables
   throttling), measured against the persisted `lastRunAt`.
4. `AUTOSYNC-REQ-004` — A `session_start` trigger SHALL bypass the throttle
   when the previous sync attempt errored or never ran.
5. `AUTOSYNC-REQ-005` — Manual `/kankaku sync` SHALL never be throttled.
6. `AUTOSYNC-REQ-006` — Lock acquisition (`<KANKAKU_DIR>/sync.lock`) SHALL
   be atomic: only one concurrent process may create the lock file
   (exclusive-create open flag); losers SHALL back off rather than
   proceeding.
7. `AUTOSYNC-REQ-007` — A lock older than the stale threshold (5 minutes)
   or owned by a no-longer-alive pid SHALL be recoverable, and recovery
   SHALL be race-safe: only one racer's recovery attempt may succeed
   (atomic rename to a tombstone before delete), and a loser SHALL back off
   without deleting a lock it never proved was stale.
8. `AUTOSYNC-REQ-008` — Unlocking SHALL only remove the lock file if the
   current process owns it (matching pid); a process SHALL NOT clobber a
   lock it does not own.

## Scenarios

### Scenario: an unchanged log short-circuits with no I/O (`AUTOSYNC-REQ-002`)

- **Given** the previous sync succeeded and no local records were written since
- **When** `session_start` triggers an automatic sync
- **Then** the run returns immediately with an empty summary, with no read of the work log and no network request

### Scenario: rapid session starts are throttled (`AUTOSYNC-REQ-003`)

- **Given** an automatic sync ran less than `KANKAKU_SYNC_MIN_INTERVAL_MINUTES` ago
- **And** the work log has changed since then
- **When** another `session_start` trigger fires
- **Then** the sync attempt is skipped (throttled) rather than run

### Scenario: a previously failed sync is retried immediately (`AUTOSYNC-REQ-004`)

- **Given** the last sync attempt recorded an error
- **When** a new `session_start` trigger fires, even within the throttle interval
- **Then** the throttle is bypassed and sync is attempted again

### Scenario: two concurrent processes never both hold the lock (`AUTOSYNC-REQ-006`)

- **Given** two pi processes attempt to sync at the same moment
- **When** both call `tryLock()`
- **Then** exactly one succeeds; the other receives `EEXIST` and backs off without running sync concurrently

### Scenario: a stale lock from a dead process is recovered safely (`AUTOSYNC-REQ-007`)

- **Given** a lock file exists, older than 5 minutes, owned by a pid that is no longer alive
- **And** two processes concurrently attempt recovery
- **When** both call `acquireFresh()`
- **Then** only one succeeds in the atomic rename-then-delete recovery; the other gets `ENOENT` and backs off, and no fresher lock is ever clobbered

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `KANKAKU_SYNC_AUTO` | enabled | Master switch for automatic (non-manual) sync triggers. |
| `KANKAKU_SYNC_MIN_INTERVAL_MINUTES` | 5 | Throttle interval; `0` disables throttling. |
| `<KANKAKU_DIR>/sync.lock` | — | Cross-process lock file (fixed path, not configurable). |
| Stale-lock threshold | 5 minutes (`STALE_LOCK_MS`) | Hardcoded. |

## Edge cases & failure modes

- Clock skew between processes on different machines sharing a
  `KANKAKU_DIR` (unlikely, but the lock file check is pid-based and
  local-clock-based, not designed for network filesystems with skewed
  clocks).
- A process crashing mid-sync while holding the lock: recovered after the
  stale threshold by a later process, per `AUTOSYNC-REQ-007`.

## Out of scope

- A cron/launchd-triggered sync outside pi entirely (proposal §6.3 option
  3) — see [ADR 0013](../adr/0013-no-standalone-cli-yet.md).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `AUTOSYNC-REQ-001` | `kankaku/tests/config.test.ts` | covered |
| `AUTOSYNC-REQ-002` | `kankaku/tests/sync-runner.test.ts` | covered |
| `AUTOSYNC-REQ-003` | `kankaku/tests/sync-runner.test.ts` | covered |
| `AUTOSYNC-REQ-004` | `kankaku/tests/sync-runner.test.ts` | covered |
| `AUTOSYNC-REQ-005` | `kankaku/tests/kankaku-command.test.ts` | covered |
| `AUTOSYNC-REQ-006` | `kankaku/tests/sync-state-store.test.ts` | covered |
| `AUTOSYNC-REQ-007` | `kankaku/tests/sync-state-store.test.ts` | covered |
| `AUTOSYNC-REQ-008` | `kankaku/tests/sync-state-store.test.ts` | covered |
