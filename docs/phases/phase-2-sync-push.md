# Phase 2 — Sync push

| | |
|---|---|
| Status | done |
| Repos | kankaku, kankaku-hub |
| Depends on | [phase-1-catalog-and-selection](phase-1-catalog-and-selection.md) |

## Goal

`sync-state.json`, `/kankaku sync`, the PocketBase sink, the revisit window,
backoff and idempotent upserts of `task_entries`. Optional background sync
at session start. The phase that makes the hub useful, not just configured.

## Scope

### In

- `buildTasks` → `planSync` → `WorkSink.push` pipeline.
- Watermark + revisit window + content-hash skip.
- Create-only assignment fields (see
  [ADR 0011](../adr/0011-create-only-assignment-fields.md)).
- Throttled auto-sync + cross-process lock (see
  [`../specs/auto-sync-and-locking.md`](../specs/auto-sync-and-locking.md)).
- Hardening: prototype-pollution guards, filter-value escaping,
  single-flight auth, atomic lock recovery — all landed as follow-up
  fix/test commits after the initial sync implementation.

### Out

- The unassigned-routing UI (queue screen) — see
  [phase-3-web](phase-3-web.md); the routing *logic* itself is phase 2b,
  shipped alongside this phase.
- A standalone CLI trigger — see
  [ADR 0013](../adr/0013-no-standalone-cli-yet.md).

## Deliverables

- kankaku: `src/domain/{sync-plan,hub-entry}.ts`, `src/ports/work-sink.ts`,
  `src/adapters/{pocketbase-sink,sync-runner,sync-state-store}.ts`,
  `/kankaku sync`, `/kankaku target`, `/kankaku catalog refresh` command
  surface.
- kankaku-hub: `docs/contract.md`'s upsert/batch sections exercised for
  real by this pipeline.

## Acceptance criteria

- [x] A sync push never re-implements the aggregation rule — it upserts
      `buildTasks`' output directly.
- [x] A duplicate create (`400 validation_not_unique`) is treated as
      already-synced.
- [x] A reassignment made in the web survives a re-sync of that task.
- [x] A network/5xx error stops the pass without corrupting the watermark.
- [x] Automatic sync is throttled and short-circuits on an unchanged log.
- [x] Concurrent processes never both run sync at once (atomic lock).

## Evidence

- Commits (kankaku): `c5d95e2` (domain mapping for sync payloads/planning),
  `58fb4af` (WorkSink port + PocketBase sink), `dcc6ffa` (sync state
  persistence + orchestrator), `36cfc18` (wire `/kankaku sync`, backfill,
  auto-sync triggers), `0b18bf2` (docs: sync + create-only rule), `988e909`
  (opt-in e2e proof against real PocketBase), `d9a22c0` (atomic lock),
  `e473b7f` (segment aggregation pollution guard), `23e7678` (home
  directory resolution guard), `b9666f2` (filter-value escaping test),
  `8750035` (single-flight auth + bound first catalog fetch), `d51e564`
  (cheap auto-sync + pollution-safe hash/label maps).
- Tests: `kankaku/tests/{sync-plan,hub-entry,pocketbase-sink,sync-runner,sync-state-store,pocketbase-client}.test.ts`.
- E2E (opt-in, not part of `npm test`): `kankaku/scripts/e2e-hub.ts`
  (`npm run e2e:hub`) — starts a real, isolated PocketBase on `127.0.0.1:8091`,
  asserts union totals across overlapping subagents, legacy-label routing,
  idempotent no-op re-syncs, a late subagent producing a real update, a
  hub-side reassignment surviving re-sync, and a dead target failing
  cleanly.

## Known gaps

- `/kankaku sync --since <date>` (proposal §6.0's resolution for the
  pathological "orchestrator older than the revisit window gains a child
  later" case) is **not confirmed implemented** — the current command
  token list (`SYNC_TOKENS = ["all", "status"]`) does not show a `--since`
  flag. Treat this specific edge case as unresolved until verified.
- A standalone, session-independent sync trigger (cron/launchd) is not
  built — see [ADR 0013](../adr/0013-no-standalone-cli-yet.md).

## Next steps

- See [phase-2b-backfill](phase-2b-backfill.md) (shipped alongside this
  phase) and [phase-3-web](phase-3-web.md).
