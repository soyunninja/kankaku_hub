# Local development

Both repos are local-only (see [ADR 0010](../adr/0010-everything-local-for-now.md)).
Commands below are verified against `package.json` in each repo.

## kankaku-hub — PocketBase backend

Requires Node ≥ 20 and `curl`/`unzip`.

```bash
cd kankaku-hub

# 1. Download the pinned PocketBase binary (0.40.4, darwin/linux, arm64/amd64)
scripts/pb-download.sh          # or: npm run pb:download

# 2. Start PocketBase — applies pb_migrations automatically
scripts/dev.sh                  # or: npm run dev
# -> Dashboard: http://127.0.0.1:8090/_/
# -> API:       http://127.0.0.1:8090/api/

# 3. In another terminal: create the local dev accounts (safe to re-run)
scripts/create-dev-accounts.sh  # or: npm run pb:accounts

# 4. Seed demo data (deterministic, safe to re-run)
node pocketbase/seed/seed.js --i-know   # or: npm run pb:seed
```

`pocketbase/pb_data/` is gitignored but persists on disk; deleting it and
re-running steps 2–4 rebuilds everything from scratch.

### Seed demo data

`pocketbase/seed/seed.js` refuses to run against port 8090 — the owner's
live PocketBase — unless `--i-know` is passed (mirrors the same guard on
`pocketbase/seed/bulk.js`). `npm run pb:seed` already passes it, since
running the seed against your own real local instance is the normal,
intentional use of this recipe; passing `PB_URL` at a different port (an
isolated stack, see below) never needs the flag.

`SEED_PROFILE` selects the dataset shape (default `standard`):

- `standard` — today's small realistic dataset: 5 clients, 10 projects, 25
  tasks, ~437 task_entries over 60 days.
- `rich` — a much larger, still fully fictional dataset for screenshots and
  a future public demo: ~12 clients, ~30 projects, ~90 tasks, ~3000
  task_entries over 180 days grouped into sessions, a `thinking_level`/
  agent/model/quality mix, and a handful of "Sin determinar" rows. Client
  websites are restricted to the `.example`/`.test` TLDs so the favicon
  fetch feature can never reach a real site. Never point this profile at
  the owner's real `pocketbase/pb_data` — always seed it into a fresh,
  isolated data dir (see `scripts/isolated-stack.sh` below).

```bash
SEED_PROFILE=rich PB_URL=http://127.0.0.1:8092 node pocketbase/seed/seed.js
```

Both profiles are idempotent: every row has a stable natural key, so
re-running the script never duplicates data. The pure catalogs/generators
live in `pocketbase/seed/lib/seed-data.js` (unit tested by
`pocketbase/seed/lib/seed-data.test.js` / `npm run seed:test`); `seed.js`
itself only orchestrates the PocketBase calls.

### Isolated stack for e2e/screenshots

Never run e2e specs or bulk/rich seeding against the owner's live
`pocketbase/pb_data`, `:8090`, `:3000` or `:4321` — that has already caused
real accidents (see `web/e2e/helpers.ts`'s `assertPbWritesAllowed` doc
comment). `scripts/isolated-stack.sh` replaces the ad-hoc "start a second
PocketBase and Nuxt by hand on other ports" recipe with one script that
refuses to point at those owner paths/ports and always seeds into a fresh
directory:

```bash
scripts/isolated-stack.sh up /tmp/kankaku-e2e --seed --seed-profile rich
# ... prints the exact env to export for Playwright ...
scripts/isolated-stack.sh status /tmp/kankaku-e2e
scripts/isolated-stack.sh down /tmp/kankaku-e2e --purge
```

`up` accepts `--pb-port` (default 8092), `--web-port` (default 3002),
`--seed`, `--seed-profile standard|rich`, `--engram-url <URL>` and
`--no-web` (skip building/starting the Nuxt dev server, e.g. when only the
PocketBase API is needed). It refuses outright — before starting
anything — when the data directory resolves inside/equal to
`pocketbase/pb_data`, or when the chosen port is 8090, 3000, 4321, or
already listening. After a screenshot run against this stack, remember to
`git checkout -- web/docs/screenshots` unless the new screenshots were
intentional.

### Dev accounts

| Account | Email | Password | Role |
|---|---|---|---|
| PocketBase superuser | `admin@kankaku.local` | `kankaku-dev-admin` | superuser (`/_/` panel) |
| Owner (human) | `david@kankaku.local` | `kankaku-dev-owner` | `role: owner` |
| Service (kankaku sync) | `kankaku-sync@kankaku.local` | `kankaku-dev-sync` | `role: service` |

These are throwaway local-only credentials, intentionally not treated as a
secret — do not reuse them anywhere real (see
[`deploy-to-vps.md`](deploy-to-vps.md) for rotation before any deployment).

### Demo instance (read-only)

`scripts/isolated-stack.sh` also provisions a third, read-only account
(migration `1758300021`, [ADR 0029](../adr/0029-viewer-role-read-only.md))
so a fresh isolated stack always has a public-demo-ready login without any
extra step:

| Account | Email | Password | Role |
|---|---|---|---|
| Demo (viewer) | `demo@kankaku.local` | `kankaku-demo-viewer` | `role: viewer` |

A `viewer` can log in and browse every screen — clients, projects, tasks,
entries, sessions, totals, the Engram narrative proxy when configured —
but every write (create/update/delete, including on
`task_entries`/`work_records`) is rejected server-side with a 400/403,
regardless of what the UI shows.

```bash
scripts/isolated-stack.sh up /tmp/kankaku-demo --seed --seed-profile rich
```

then hand out the `demo@kankaku.local` credentials above against the
printed `NUXT_PUBLIC_PB_URL`/web port. **The seeded data is entirely
fictional** — generated client/project/task names and synthetic
`task_entries`/`work_records` rows, never real client information — so it
is safe to leave running for others to browse.

To serve the demo as a single origin (no separate Nuxt dev server, closer
to how a real deployment looks), build the web app once and point
PocketBase's `--publicDir` at that build instead of the script's own empty
placeholder directory — the same single-process shape ["Single-process
mode"](#single-process-mode-as-in-production) below and
[`deploy-to-vps.md`](deploy-to-vps.md) already use:

```bash
cd web && pnpm generate   # static build to web/.output/public
```

`scripts/isolated-stack.sh` does not currently take a `--publicDir`
override — it always serves an empty placeholder directory alongside the
API — so serving that build through the isolated stack today means
running PocketBase directly with the flags `cmd_up` uses (same `--dir`,
`--migrationsDir`, `--hooksDir`, plus `--publicDir web/.output/public`
instead of its empty one) rather than through `isolated-stack.sh up`
itself; see [`deploy-to-vps.md`](deploy-to-vps.md) §1 for the exact
`pocketbase serve` invocation to copy. This is a description of the
option, not a step this runbook has run.

## kankaku-hub — web (Nuxt SPA)

Requires `pnpm`.

**Recommended for day-to-day work:** one terminal, hot reload, no build step.

```bash
cd kankaku-hub
npm run dev:all   # PocketBase on 127.0.0.1:8090 + Nuxt dev on localhost:3000; Ctrl+C stops both
```

`scripts/dev-all.sh` reuses a PocketBase already listening on 8090, writes
its log to `pocketbase/dev.log`, and stops only the PocketBase it started.
The static build is neither needed nor used in this mode.

The two processes can also be run separately:

```bash
cd kankaku-hub/web
pnpm install
pnpm dev          # localhost:3000, talks to PocketBase on 127.0.0.1:8090
```

Or, from the repo root, via convenience scripts:
`npm run web:install`, `npm run web:dev`, `npm run web:build`,
`npm run web:test`, `npm run web:lint`, `npm run web:typecheck`.

### Single-process mode (as in production)

```bash
cd kankaku-hub/web
pnpm generate      # static build to web/.output/public

cd ..
scripts/dev.sh     # --publicDir already points at web/.output/public
```

Now `http://127.0.0.1:8090/` serves the app and `http://127.0.0.1:8090/api/`
the backend, same origin — no `NUXT_PUBLIC_PB_URL` needed.

### Verification commands (web)

| Command | Checks |
|---|---|
| `pnpm lint` | ESLint (`eslint .`) |
| `pnpm typecheck` | `nuxt typecheck` (vue-tsc) |
| `pnpm test` | Vitest unit tests (`app/lib/*`, i18n parity) |
| `E2E_ALLOW_PB_WRITES=1 pnpm test:e2e` | Playwright e2e (`e2e/smoke.spec.ts`, `e2e/polish.spec.ts`) — run once against `nuxt dev` (`localhost:3000`) and once against the production build (`E2E_ALLOW_PB_WRITES=1 PW_BASE_URL=http://127.0.0.1:8090 pnpm test:e2e`), since some bugs (see [`troubleshooting.md`](troubleshooting.md)) only appear in the single-process build. `E2E_ALLOW_PB_WRITES=1` is a required, explicit opt-in — without it every write-performing e2e helper refuses, so a stray run never accidentally writes to the owner's live PocketBase. |
| `pnpm generate` | Static build succeeds |

## kankaku — the pi extension

Requires the versions pinned in `kankaku/package.json`'s devDependencies
(`@earendil-works/pi-coding-agent@0.85.1` — types only; pi itself supplies
the runtime).

```bash
cd kankaku
npm install
npm run check      # tsc --noEmit && node --test tests/*.test.ts
```

| Command | Checks |
|---|---|
| `npm test` | `node --test tests/*.test.ts` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run check` | both of the above |
| `npm run e2e:hub` | opt-in: starts a real PocketBase from the sibling `kankaku-hub` checkout on port `8091` and runs a full sync round-trip against it. **Not** part of `npm test`/`npm run check`. Requires `kankaku-hub/pocketbase/bin/pocketbase` and `kankaku-hub/pocketbase/pb_migrations/` to exist at `../kankaku-hub` relative to `kankaku` (i.e. both repos checked out as siblings) — run `scripts/pb-download.sh` in `kankaku-hub` first if the binary is missing. |

Env vars for `e2e:hub`: `KANKAKU_E2E_SCRATCH` (scratch root, default
`os.tmpdir()`), `KANKAKU_E2E_KEEP_DATA=1` (keep the throwaway data dir
instead of cleaning up), `KANKAKU_E2E_VERBOSE=1` (print server output on
failure).

### Optional: Engram narratives

Shows each session's [Engram](https://github.com/soyunninja/engram) Goal
(or first prompt) on the entries table and the sessions-without-task
queue — see [`../specs/engram-narrative.md`](../specs/engram-narrative.md).
Entirely optional; skip this if you don't run Engram locally.

```bash
# Before scripts/dev.sh (or scripts/dev-all.sh), in the same terminal:
export KANKAKU_ENGRAM_URL=http://127.0.0.1:7437
# Only if your Engram daemon was started with ENGRAM_HTTP_TOKEN set:
export KANKAKU_ENGRAM_TOKEN=<the same token>

cd kankaku-hub
scripts/dev.sh   # restart PocketBase so it picks up the new env vars
```

Check **Settings → Engram** in the web app: it should show "Conectado"
(reachable) once both the daemon and PocketBase are running with the env
var set. `KANKAKU_ENGRAM_URL` unset (the default) means the feature is
fully disabled and every screen renders exactly as without it.

**Running the e2e spec with the fake daemon** (see the header comment of
[`web/e2e/engram-narrative.spec.ts`](../../web/e2e/engram-narrative.spec.ts)
for the full explanation) — the "with Engram" path needs a fake Engram
HTTP server plus `E2E_ENGRAM=1`, on the isolated e2e stack only, never
the owner's live `:8090`/`:3000`:

```bash
# 1. Start the fake daemon with the two session ids the spec expects:
FAKE_ENGRAM_SESSIONS=e2e-engram-summary-session,e2e-engram-prompt-session \
  node web/e2e/fixtures/fake-engram.mjs
# Listens on 127.0.0.1:7438 by default (FAKE_ENGRAM_PORT to override).

# 2. Point the isolated PocketBase at it and run the e2e suite with the flag:
KANKAKU_ENGRAM_URL=http://127.0.0.1:7438 E2E_ENGRAM=1 \
  E2E_ALLOW_PB_WRITES=1 pnpm --dir web test:e2e
```

Without `E2E_ENGRAM=1`, the "with Engram configured" spec is skipped and
only the "without Engram" spec runs (against a PocketBase that has
`KANKAKU_ENGRAM_URL` unset, the normal case for every other e2e run in
this repo).

## Running the whole system together

1. Start the hub (`kankaku-hub`, steps above).
2. Point a real kankaku extension at it — see
   [`connect-kankaku-to-hub.md`](connect-kankaku-to-hub.md).
3. Optionally open the web dashboard to watch synced data arrive.

## Related

- [`connect-kankaku-to-hub.md`](connect-kankaku-to-hub.md)
- [`troubleshooting.md`](troubleshooting.md)
- [`../../ESTADO.md`](../../ESTADO.md) — latest status notes (Spanish, owner-facing)
