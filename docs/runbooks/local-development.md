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
node pocketbase/seed/seed.js    # or: npm run pb:seed
```

`pocketbase/pb_data/` is gitignored but persists on disk; deleting it and
re-running steps 2–4 rebuilds everything from scratch.

### Dev accounts

| Account | Email | Password | Role |
|---|---|---|---|
| PocketBase superuser | `admin@kankaku.local` | `kankaku-dev-admin` | superuser (`/_/` panel) |
| Owner (human) | `david@kankaku.local` | `kankaku-dev-owner` | `role: owner` |
| Service (kankaku sync) | `kankaku-sync@kankaku.local` | `kankaku-dev-sync` | `role: service` |

These are throwaway local-only credentials, intentionally not treated as a
secret — do not reuse them anywhere real (see
[`deploy-to-vps.md`](deploy-to-vps.md) for rotation before any deployment).

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
| `pnpm test:e2e` | Playwright e2e (`e2e/smoke.spec.ts`, `e2e/polish.spec.ts`) — run once against `nuxt dev` (`localhost:3000`) and once against the production build (`PW_BASE_URL=http://127.0.0.1:8090 pnpm test:e2e`), since some bugs (see [`troubleshooting.md`](troubleshooting.md)) only appear in the single-process build. |
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

## Running the whole system together

1. Start the hub (`kankaku-hub`, steps above).
2. Point a real kankaku extension at it — see
   [`connect-kankaku-to-hub.md`](connect-kankaku-to-hub.md).
3. Optionally open the web dashboard to watch synced data arrive.

## Related

- [`connect-kankaku-to-hub.md`](connect-kankaku-to-hub.md)
- [`troubleshooting.md`](troubleshooting.md)
- [`../../ESTADO.md`](../../ESTADO.md) — latest status notes (Spanish, owner-facing)
