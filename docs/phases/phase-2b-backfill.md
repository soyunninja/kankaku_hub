# Phase 2b — Backfill

| | |
|---|---|
| Status | done |
| Repos | kankaku, kankaku-hub |
| Depends on | [phase-2-sync-push](phase-2-sync-push.md) |

## Goal

The "Sin determinar" client, `legacy_client_label`, and `/kankaku backfill`.
Shipped with phase 2, not after: the first sync is what fills the database,
and deciding this afterwards would mean migrating twice.

## Scope

### In

- The seeded "Sin determinar" client row.
- `resolveTaskAssignment`'s routing logic (unresolvable client → unassigned
  + label preserved).
- `/kankaku backfill` command.

### Out

- The reassignment UI itself — see
  [phase-3-web](phase-3-web.md#unassigned-queue) and
  [`../specs/web-unassigned-queue.md`](../specs/web-unassigned-queue.md).

## Deliverables

- kankaku-hub: `pocketbase/pb_migrations/1758300008_seed_unassigned_client.js`.
- kankaku: `resolveTaskAssignment` (`src/domain/hub-entry.ts`),
  `handleBackfillCommand` (`src/adapters/kankaku-command.ts`).

## Acceptance criteria

- [x] Exactly one "Sin determinar" client row exists, seeded idempotently.
- [x] An unresolvable client routes there with its original label kept in
      `legacy_client_label`.
- [x] `/kankaku backfill` is safely re-runnable.

## Evidence

- Commits (kankaku): `c5d95e2` (domain mapping incl. `resolveTaskAssignment`),
  `36cfc18` (wires `/kankaku backfill`).
- Commits (kankaku-hub): `b26de9a` (migration `1758300008`).
- Tests: `kankaku/tests/{hub-entry,kankaku-command}.test.ts`,
  `kankaku/scripts/e2e-hub.ts` (legacy-label routing assertion).
- Manual verification (kankaku-hub): seed script routes 30 varied-label
  entries to "Sin determinar" (`ESTADO.md`).

## Known gaps

- No automatic reconciliation of near-duplicate legacy labels (`cjamar` vs
  `Cajamar`) beyond the web's exact-normalized-match suggestion — by
  design, see [ADR 0002](../adr/0002-selection-is-a-pick-from-a-list.md).

## Next steps

- See [phase-3-web](phase-3-web.md).
