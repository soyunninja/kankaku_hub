# Sync push

| | |
|---|---|
| Status | implemented |
| Phase | [phase-2-sync-push](../phases/phase-2-sync-push.md) |
| Owners repos | kankaku, kankaku-hub |
| Related ADRs | [0003](../adr/0003-jsonl-log-source-of-truth-outbox-sync.md), [0006](../adr/0006-aggregation-rule-lives-once-in-kankaku.md), [0011](../adr/0011-create-only-assignment-fields.md) |
| Code | `kankaku/src/adapters/sync-runner.ts`, `kankaku/src/domain/sync-plan.ts`, `kankaku/src/domain/hub-entry.ts`, `kankaku/src/adapters/pocketbase-sink.ts`, `kankaku/src/ports/work-sink.ts` |
| Tests | `kankaku/tests/sync-runner.test.ts`, `kankaku/tests/sync-plan.test.ts`, `kankaku/tests/hub-entry.test.ts`, `kankaku/tests/pocketbase-sink.test.ts`, `kankaku/scripts/e2e-hub.ts` (opt-in) |

## Purpose

Pushes already-consolidated task rows (never raw records) from the local
JSONL log to the hub's `task_entries` (and, optionally, `work_records`)
collections, idempotently and safely across retries, network failures, and
late-settling subagents.

## Requirements

1. `SYNC-REQ-001` — The system SHALL build tasks from records read since
   the watermark, via `buildTasks` (see
   [`../architecture/aggregation.md`](../architecture/aggregation.md)) —
   never re-implement the aggregation rule in the sync path.
2. `SYNC-REQ-002` — Every push SHALL be an upsert by `task_id`, never a
   blind create: look up by the unique key first.
3. `SYNC-REQ-003` — Every sync pass SHALL also re-evaluate tasks whose
   `endedAt` falls inside a trailing revisit window (default 24h,
   `KANKAKU_SYNC_WINDOW_HOURS`) behind the watermark, in addition to
   anything past it.
4. `SYNC-REQ-004` — A task whose computed content hash matches the
   previously recorded hash for that `task_id` SHALL be skipped (no
   redundant network call).
5. `SYNC-REQ-005` — The `client`/`project`/`task`/`legacy_client_label`
   fields SHALL be sent only on create, never on update (see
   [ADR 0011](../adr/0011-create-only-assignment-fields.md)).
6. `SYNC-REQ-006` — A `400` on create SHALL be treated as a possible
   duplicate: the client SHALL look the row up by `task_id` and, if found,
   update it instead. The hub reports a duplicate as
   `data.task_id.code == "validation_not_unique"`, but the client does NOT
   parse the response body (`PocketBaseError` does not carry it); a `400`
   whose re-lookup finds nothing is a genuine validation failure
   (`SYNC-REQ-007`).
7. `SYNC-REQ-007` — A per-record validation failure (any other `400`) SHALL
   be recorded in a `failed` list with its id and reason, and SHALL NOT
   block the watermark from advancing past other resolved tasks.
8. `SYNC-REQ-008` — A network error or `5xx` response SHALL stop the sync
   pass, keep the watermark at its last confirmed position, and be retried
   on a later run — never lose data, never spin.
9. `SYNC-REQ-009` — When a task's `clientId`/`projectId` no longer resolves
   in the catalog (e.g. deleted in the hub), the row SHALL be routed to
   "Sin determinar" per [`backfill-unassigned.md`](backfill-unassigned.md)
   rather than silently dropped.
10. `SYNC-REQ-010` — PocketBase's batch API SHALL be used when available;
    the client SHALL fall back to one request per row if `/api/batch` is
    unreachable or disabled.
11. `SYNC-REQ-011` — Filter values interpolated into a PocketBase filter
    string SHALL be escaped (backslash and double-quote) before use.
12. `SYNC-REQ-012` — On `401`, the client SHALL re-authenticate once with
    stored credentials and retry; if that also fails, the sync pass SHALL
    stop and surface the error.
13. `SYNC-REQ-013` — The watermark SHALL only advance past tasks that were
    actually resolved (created, updated, or recorded as failed-validation);
    it SHALL NOT advance past a task that returned a network/auth/5xx
    error.

## Scenarios

### Scenario: overlapping subagents produce one consolidated row (`SYNC-REQ-001`)

- **Given** an orchestrator and two overlapping subagents in the local log
- **When** sync runs
- **Then** exactly one `task_entries` row is upserted, with `wall_ms` equal to the union of all three intervals, not their sum

### Scenario: a late-settling subagent updates an already-synced task (`SYNC-REQ-002`, `SYNC-REQ-003`)

- **Given** a task was synced and its orchestrator's `endedAt` is within the last 24 hours
- **When** a subagent belonging to that task settles afterward and sync runs again
- **Then** the task is re-upserted (via update, not a duplicate create) with the new totals

### Scenario: a reassignment made in the hub survives a re-sync (`SYNC-REQ-005`)

- **Given** a `task_entries` row was reassigned to a different client in the web
- **When** that task is re-synced (e.g. a late subagent changed its stats)
- **Then** the PATCH request does not include `client`/`project`/`task`/`legacy_client_label`, and the reassignment is preserved

### Scenario: duplicate-create is treated as already-synced (`SYNC-REQ-006`)

- **Given** a `task_entries` row with this `task_id` already exists
- **When** the sink attempts a create anyway (e.g. a stale local hash)
- **Then** the `400 validation_not_unique` response triggers a look-up and update instead of surfacing as an error

### Scenario: a network error stops the pass without losing the watermark (`SYNC-REQ-008`, `SYNC-REQ-013`)

- **Given** three eligible tasks, and the second upsert fails with a network error
- **When** sync runs
- **Then** the first task's success is kept, the watermark does not advance past the second task, and the third task is not attempted this run

### Scenario: a dead client/project target routes to Sin determinar (`SYNC-REQ-009`)

- **Given** a task's `clientId` no longer resolves in the catalog
- **When** the create-only payload is built
- **Then** the row is created against the "Sin determinar" client with `legacy_client_label` set from the task's original client label

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `KANKAKU_SYNC_WINDOW_HOURS` | 24 | Revisit window (`SYNC-REQ-003`). |
| `KANKAKU_SYNC_RECORDS` | enabled | Whether `work_records` rows are pushed at all (optional, per proposal §4). |
| `KANKAKU_SYNC_PROMPT` | `none` | Prompt upload level (`none`/`truncated`/`full`) — see [`security-and-privacy.md`](security-and-privacy.md). |
| `sync-state.json` (`<KANKAKU_DIR>/sync-state.json`) | — | Persists `syncedThrough` (watermark), `lastRunAt`, `logVersion`, per-task content hashes, `failed` list. |

## Edge cases & failure modes

- Empty log / nothing eligible: sync completes as a no-op, watermark
  unchanged.
- `/api/batch` disabled on the target instance: falls back transparently to
  one request per row.
- A task whose orchestrator is older than the revisit window gains a child
  later (a pathological, rare case): not auto-corrected; resolved with
  `/kankaku sync --since <date>` per the proposal — see
  [`kankaku-commands.md`](kankaku-commands.md) for the currently
  implemented command surface (note: verify `--since` is implemented before
  relying on it; it is not confirmed in the command-token list gathered for
  this documentation pass).

## Out of scope

- Recomputing history from `work_records` server-side (kankaku is always
  the source of the aggregation; see
  [`../architecture/aggregation.md`](../architecture/aggregation.md)).
- A standalone CLI sync trigger outside pi — see
  [ADR 0013](../adr/0013-no-standalone-cli-yet.md).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `SYNC-REQ-001` | `kankaku/tests/sync-runner.test.ts`, `kankaku/tests/task-view.test.ts` | covered |
| `SYNC-REQ-002` | `kankaku/tests/pocketbase-sink.test.ts` | covered |
| `SYNC-REQ-003` | `kankaku/tests/sync-plan.test.ts` | covered |
| `SYNC-REQ-004` | `kankaku/tests/sync-plan.test.ts` | covered |
| `SYNC-REQ-005` | `kankaku/tests/hub-entry.test.ts`, `kankaku/scripts/e2e-hub.ts` | covered |
| `SYNC-REQ-006` | `kankaku/tests/pocketbase-sink.test.ts` | covered |
| `SYNC-REQ-007` | `kankaku/tests/sync-runner.test.ts` | covered |
| `SYNC-REQ-008` | `kankaku/tests/sync-runner.test.ts` | covered |
| `SYNC-REQ-009` | `kankaku/tests/hub-entry.test.ts`, `kankaku/scripts/e2e-hub.ts` | covered |
| `SYNC-REQ-010` | `kankaku/tests/pocketbase-sink.test.ts` | covered |
| `SYNC-REQ-011` | `kankaku/tests/pocketbase-sink.test.ts` | covered |
| `SYNC-REQ-012` | `kankaku/tests/pocketbase-client.test.ts` | covered |
| `SYNC-REQ-013` | `kankaku/tests/sync-runner.test.ts` | covered |
