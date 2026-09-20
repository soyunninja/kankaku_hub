# Catalog cache

| | |
|---|---|
| Status | implemented |
| Phase | [phase-1-catalog-and-selection](../phases/phase-1-catalog-and-selection.md) |
| Owners repos | kankaku |
| Related ADRs | [0005](../adr/0005-reads-cached-writes-queued.md) |
| Code | `kankaku/src/adapters/cached-catalog.ts`, `kankaku/src/adapters/pocketbase-catalog.ts`, `kankaku/src/adapters/pocketbase-client.ts`, `kankaku/src/ports/catalog.ts` |
| Tests | `kankaku/tests/cached-catalog.test.ts`, `kankaku/tests/pocketbase-catalog.test.ts`, `kankaku/tests/pocketbase-client.test.ts` |

## Purpose

Makes the client/project catalog available to the session-start picker
without ever blocking startup on a network round trip, per
[ADR 0005](../adr/0005-reads-cached-writes-queued.md).

## Requirements

1. `CATALOG-REQ-001` — The system SHALL cache the catalog on disk at
   `~/.kankaku/catalog.json` (machine-wide, one cache regardless of
   project).
2. `CATALOG-REQ-002` — A read SHALL return the cached snapshot immediately
   (synchronous, memoized within a process) without waiting on a refresh.
3. `CATALOG-REQ-003` — The system SHALL consider a cache entry stale after
   its TTL (6 hours) has elapsed, based on `fetchedAt`.
4. `CATALOG-REQ-004` — A cache write SHALL be atomic (temp file + rename).
5. `CATALOG-REQ-005` — A cache entry fetched for a different hub URL SHALL
   be ignored (treated as absent), not trusted.
6. `CATALOG-REQ-006` — A refresh failure SHALL leave the previous snapshot
   untouched rather than clearing it or throwing.
7. `CATALOG-REQ-007` — The first (no-cache) catalog fetch of a session
   SHALL be bounded by an overall deadline (default 5000ms) so a session
   never stalls indefinitely waiting on the hub.
8. `CATALOG-REQ-008` — Concurrent callers with no valid auth token SHALL
   share a single in-flight authentication attempt (single-flight), never
   issuing duplicate `auth-with-password` requests.
9. `CATALOG-REQ-009` — `/kankaku catalog refresh` SHALL force an immediate
   refresh regardless of TTL.

## Scenarios

### Scenario: a stale cache is still shown immediately (`CATALOG-REQ-002`, `CATALOG-REQ-003`)

- **Given** a cached catalog older than 6 hours
- **When** a session starts
- **Then** the picker is shown using the stale cache immediately, and a background refresh updates the cache for next time

### Scenario: a cache for a different hub URL is not trusted (`CATALOG-REQ-005`)

- **Given** `~/.kankaku/catalog.json` was written while `KANKAKU_PB_URL` pointed at hub A
- **When** kankaku is now configured against hub B
- **Then** the cache is treated as absent, not shown as hub B's catalog

### Scenario: a failed refresh does not clear the cache (`CATALOG-REQ-006`)

- **Given** a valid cached snapshot exists
- **When** a background refresh fails (network error)
- **Then** the previous snapshot remains readable and unchanged

### Scenario: concurrent requests share one auth attempt (`CATALOG-REQ-008`)

- **Given** no valid auth token is held
- **And** two catalog operations are triggered concurrently
- **When** both need to authenticate
- **Then** exactly one `auth-with-password` request is made; both callers await its result

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `~/.kankaku/catalog.json` | — | Disk cache path (fixed, not configurable). |
| TTL | 6 hours | Hardcoded (`DEFAULT_TTL_MS`), overridable only via injected deps in tests. |
| First-fetch deadline | 5000ms | `DEFAULT_FIRST_FETCH_DEADLINE_MS`, bounds auth + pagination + one 401 retry together. |

## Edge cases & failure modes

- No cache and hub unreachable: catalog is empty; the picker/target
  resolution falls back to pre-hub free-text behaviour with a one-time
  notice (see [`target-selection.md`](target-selection.md)).
- Auth failure during background refresh: caught, previous snapshot kept,
  no user-facing error on a background trigger.

## Out of scope

- Per-project cache (the cache is intentionally machine-wide).
- Manual TTL configuration via env var (not currently exposed).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `CATALOG-REQ-001` | `kankaku/tests/cached-catalog.test.ts` | covered |
| `CATALOG-REQ-002` | `kankaku/tests/cached-catalog.test.ts` | covered |
| `CATALOG-REQ-003` | `kankaku/tests/cached-catalog.test.ts` | covered |
| `CATALOG-REQ-004` | `kankaku/tests/cached-catalog.test.ts` | covered |
| `CATALOG-REQ-005` | `kankaku/tests/cached-catalog.test.ts` | covered |
| `CATALOG-REQ-006` | `kankaku/tests/cached-catalog.test.ts` | covered |
| `CATALOG-REQ-007` | `kankaku/tests/pocketbase-client.test.ts`, `kankaku/tests/session-target.test.ts` | covered |
| `CATALOG-REQ-008` | `kankaku/tests/pocketbase-client.test.ts` | covered |
| `CATALOG-REQ-009` | `kankaku/tests/kankaku-command.test.ts` | covered |
