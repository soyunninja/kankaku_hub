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
- Localized user-facing UI text is exempt from the English-only artifact
  rule: translations in `web/i18n/locales/` use their target languages,
  and language-picker display names (including locale `name` values in
  `web/nuxt.config.ts`) may use native names such as `Español` and `日本語`.
  Identifiers, locale keys, code comments, and technical documentation
  remain in English. Do not require localized UI text to be translated
  back to English during review.
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, ...).
- No AI attribution of any kind in commits (no `Co-Authored-By`, no
  "Generated with", nothing).

## Publishing the hub package (npm: kankaku-hub)

kankaku-hub is published to npm as `kankaku-hub` so a consumer (the
standalone `kankaku` CLI, `kankaku hub install`) can install a local hub
without a git checkout. The published tarball ships exactly:
`pocketbase/pb_migrations/**` (the schema — the contract, see above),
`pocketbase/pb_hooks/**` without its `*.test.js` files (excluded via the
nested `pocketbase/pb_hooks/.npmignore`), the prebuilt static web app
(`public/`, copied from `web/.output/public` at pack time), and a
generated `hub-manifest.json`. Nothing else — no seed data, no scripts, no
web sources, no docs beyond `README.md`/`LICENSE`. See `package.json`'s
`files` field for the exact allowlist.

- `npm publish` runs `prepack`, which runs `npm run pack:hub`:
  `npm run web:build` (`pnpm --dir web generate`, needs `pnpm` — see
  `docs/runbooks/local-development.md`), then `scripts/write-manifest.mjs`
  (regenerates `hub-manifest.json`) and `scripts/copy-public.mjs` (copies
  the web build to `public/`). Both `public/` and `hub-manifest.json` are
  gitignored and generated fresh on every pack/publish — never hand-edit
  or commit either.
- `hub-manifest.json` records the schema version (the last applied
  migration filename), the full migration list, and the pinned PocketBase
  binary's download URL + SHA256 per OS/arch, read from the committed
  `pocketbase/pocketbase-checksums.json`. `scripts/write-manifest.mjs`
  fails loudly (before any file is written) if that checksums file has no
  entry for the version currently pinned in `scripts/pb-download.sh`.
- When the pinned PocketBase version in `scripts/pb-download.sh` changes,
  run `node scripts/pb-checksums.mjs` (downloads the four release zips and
  hashes them — needs network) and commit the resulting
  `pocketbase/pocketbase-checksums.json` **before** the next publish.
- Version bump: `npm version x.y.z --no-git-tag-version`, update a
  changelog if this repo has one by then, tag `vX.Y.Z`, `npm publish`. See
  [`docs/runbooks/publish-hub-package.md`](docs/runbooks/publish-hub-package.md)
  for the full step-by-step procedure.
- Never edit a shipped migration file after it has been published — this
  is the same rule as "the migrations are the contract" above, and it
  applies even harder once a migration has shipped to consumers who may
  already be running it.
- `npm run manifest:test` (`node --test scripts/*.test.mjs`) covers
  `write-manifest.mjs` and `copy-public.mjs` with fixture/temp-dir tests
  and must stay green alongside `hooks:test`/`seed:test`.

## PocketBase specifics worth knowing

- `bool` and `number` fields in PocketBase 0.40 have no schema-level
  default. `active: true` for a new client/project is enforced by the
  caller (seed script, sync client), not by PocketBase. Always send it
  explicitly. Tasks have no `active` field: explicitly send their required
  `status` instead (for example, `status: "open"`), as defined in
  `1758300004_tasks_collection.js`. Do not add nonexistent fields to payloads.
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
web/              Nuxt 4 SPA dashboard (pnpm, Tailwind v4, shadcn-vue), served from PocketBase publicDir
docs/             documentation system: specs, ADRs, phases, runbooks (start at docs/README.md)
```
