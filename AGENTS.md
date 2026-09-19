# AGENTS.md — conventions for kankaku-hub

This repo is the PocketBase backend for kankaku (a pi extension that
measures agent work time and token cost). Read `docs/proposal.md` first —
it is the design this repo implements.

## The migrations are the contract

`pocketbase/pb_migrations/*.js` is the single source of truth for the
schema. Do not hand-edit collections through the Admin UI in a shared
environment and forget to snapshot them: every schema change must land as
a new migration file, generated or hand-written, and be reviewed like
code. `docs/contract.md` describes the resulting API surface for the
kankaku sync client, but the migrations are what's authoritative if the
two ever disagree.

## Aggregation rule (D6) — do not violate this

- `task_entries` rows are **pre-consolidated** by kankaku's `buildTasks`
  (union of orchestrator + subagent time intervals, not a sum) before they
  ever reach PocketBase. Every row in this collection is safe to
  `SUM(...) GROUP BY ...`. This is what the web dashboard and the
  `task_entries_daily_totals` view read.
- `work_records` rows carry `rollup: false` as a standing warning: they
  are raw per-process detail, they overlap each other, and they must
  **never** be summed by anything outside kankaku. If you're tempted to
  compute a total from `work_records`, stop — read `task_entries` instead.
- The aggregation rule itself lives exactly once, in kankaku
  (`src/domain/task-view.ts`), never here. This backend only stores what
  kankaku already computed.

## No money in the database

Clients, projects, tasks, time and token cost: yes. Hourly rates, prices,
margins, invoice numbers: no, ever, in any migration or seed data. This is
what keeps kankaku-hub a measurement tool instead of invoicing software
(proposal §9.4). If a change introduces a rate/price/invoice field, it is
out of scope for this repo — reject it or take it to an external
invoicing tool.

## Language and commits

- All artifacts (code, comments, docs, migration files, commit messages)
  are in English, except `ESTADO.md`, which is a status note for the
  repo owner and stays in Spanish on purpose.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, ...).
- No AI attribution of any kind in commits (no `Co-Authored-By`, no
  "Generated with", nothing).

## PocketBase specifics worth knowing

- `bool` and `number` fields in PocketBase 0.40 have no schema-level
  default. `active: true` for a new client/project/task is enforced by
  the caller (seed script, sync client), not by PocketBase. Always send
  it explicitly.
- Unique constraints are plain SQL indexes (`CREATE UNIQUE INDEX ...`) on
  the collection's `indexes` array, not a field property.
- `app.findFirstRecordByFilter(...)` throws (does not return `null`) when
  nothing matches — migrations that look up an existing row must wrap it
  in `try/catch`.
- The `/api/batch` endpoint is disabled by default; migration
  `1758300010_enable_batch_api.js` turns it on for this instance.

## Layout

```
pocketbase/
  bin/            pocketbase binary + CHANGELOG/LICENSE (gitignored, see scripts/pb-download.sh)
  pb_data/        SQLite data dir (gitignored)
  pb_migrations/  the schema — the contract
  seed/           dev-only demo data generator (no dependencies)
docs/
  proposal.md     the design doc (copy, kept in sync manually)
  contract.md     the API contract for the kankaku sync client
scripts/          pb-download.sh, dev.sh, create-dev-accounts.sh
web/              (later, not built here) Nuxt dashboard, served from pb_public
```
