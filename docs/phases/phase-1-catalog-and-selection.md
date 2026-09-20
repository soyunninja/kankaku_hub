# Phase 1 — Catalog and selection (no writes to PocketBase)

| | |
|---|---|
| Status | done |
| Repos | kankaku, kankaku-hub |
| Depends on | [phase-0-foundation](phase-0-foundation.md) |

## Goal

Read-only catalog, cached; the two pickers at session start; ids stored in
records; status bar shows `client · project`. Value on its own even without
sync: consistent naming, plus a project dimension in local reports.

## Scope

### In

- PocketBase schema for `clients`/`projects`/`tasks` and the `users.role`
  field (kankaku-hub).
- Hub credential resolution and URL validation (kankaku).
- PocketBase HTTP client, single-flight auth, cached catalog (kankaku).
- Client/project session picker, target persistence in
  `<KANKAKU_DIR>/config.json` (kankaku).
- Hub metadata fields on `WorkRecord` (kankaku).

### Out

- Writing anything to PocketBase — pushed to
  [phase-2-sync-push](phase-2-sync-push.md).

## Deliverables

- `docs/contract.md`, `docs/proposal.md` (kankaku-hub).
- `pocketbase/pb_migrations/1758300001`–`1758300010` (schema — see
  [`../specs/hub-schema-and-access-rules.md`](../specs/hub-schema-and-access-rules.md);
  note some of these migrations, e.g. the "Sin determinar" seed, the daily
  totals view and the batch-API toggle, are used by phase 2/2b/3 but landed
  together with the rest of the schema in one commit).
- `pocketbase/seed/seed.js`, `scripts/{pb-download,dev,create-dev-accounts}.sh`.
- kankaku: `src/adapters/{hub-credentials,cached-catalog,pocketbase-catalog,pocketbase-client,target-picker,session-target,project-config}.ts`, `src/domain/work-target.ts`, `src/ports/catalog.ts`.

## Acceptance criteria

- [x] Catalog is read-only from kankaku's perspective (no writes attempted).
- [x] Session start resolves a target silently when possible, otherwise
      shows a picker with a skip option — see
      [`../specs/target-selection.md`](../specs/target-selection.md).
- [x] `<KANKAKU_DIR>/config.json` gains `clientId`/`projectId` without
      losing the legacy `client` field.
- [x] The catalog cache never blocks session start on the network.

## Evidence

- Commits (kankaku, `45415ce..HEAD`): `194138e` (domain work-target +
  record metadata), `a389e8e` (credential resolution + URL validation),
  `0939161` (PocketBase HTTP client + cached catalog), `f206a0c`
  (config.json target ids), `a16e877` (session picker), `d2619f6` (wire hub
  target into records/status bar/commands), `ce7f93b` (docs).
- Commits (kankaku-hub): `932a893` (repo scaffold), `b26de9a` (all 10
  migrations, one commit), `416394b` (scripts), `223e066` (seed script),
  `4f2155a` (contract + status docs).
- Tests: `kankaku/tests/{work-target,work-record,hub-credentials,config,cached-catalog,pocketbase-catalog,pocketbase-client,project-config,target-picker,session-target}.test.ts`.
- Manual verification (kankaku-hub): migrations apply cleanly from empty
  `pb_data`, `migrate down 8` → `migrate up` round-trips cleanly, seed
  script produces stable counts across two runs (`ESTADO.md`).

## Known gaps

- None identified for the scope of this phase.

## Next steps

- See [phase-2-sync-push](phase-2-sync-push.md).
