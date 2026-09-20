# kankaku hub — web

Nuxt 4 SPA (`ssr: false`) dashboard for kankaku-hub: AI time and cost per
client/project, task management, and the "Sin determinar" reassignment
queue. See the repo root `README.md`, `AGENTS.md` and `docs/proposal.md`
§9 for the product context, and `docs/contract.md` for the exact
PocketBase API this app talks to.

## Stack

- Nuxt 4, Vue 3, TypeScript (strict), pnpm.
- Tailwind CSS v4 (`@tailwindcss/vite`) + hand-authored shadcn-vue-style
  components in `app/components/ui/` (`reka-ui` primitives, `cva`,
  `tailwind-merge`, `@lucide/vue` icons).
- `pocketbase` JS SDK for auth, CRUD, batch and realtime.
- `@nuxtjs/i18n` (Spanish default, English second) and
  `@nuxtjs/color-mode` (dark default, light/system available).
- Vitest for unit tests, Playwright for the e2e smoke test.

## Development

```bash
pnpm install

# Terminal 1: PocketBase API on 127.0.0.1:8090 (from the repo root)
cd .. && scripts/dev.sh

# Terminal 2: Nuxt dev server on localhost:3000, talking to the API above
pnpm dev
```

Dev login: `david@kankaku.local` / `kankaku-dev-owner` (see repo root
`ESTADO.md`).

Override the API base URL (e.g. against a different PocketBase instance)
with `NUXT_PUBLIC_PB_URL`.

## Single-process production build

`nuxt generate` produces a static build that PocketBase itself serves via
`--publicDir` — one binary, no Node server:

```bash
pnpm generate
cd .. && scripts/dev.sh   # already points --publicDir at web/.output/public
```

Then `http://127.0.0.1:8090/` serves the app and `/api/` the backend,
same origin — no `NUXT_PUBLIC_PB_URL` needed in this mode.

## Testing

```bash
pnpm lint
pnpm typecheck
pnpm test          # Vitest — pure helpers in app/lib/*, incl. the D6 fixture guard
E2E_ALLOW_PB_WRITES=1 pnpm test:e2e   # Playwright — requires the app running (dev or single-process),
                    # set PW_BASE_URL to point at it (default http://localhost:3000).
                    # E2E_ALLOW_PB_WRITES=1 is a required, explicit opt-in — without it every
                    # write-performing e2e helper refuses, so a stray run can never accidentally
                    # write to the owner's live PocketBase.
```

The e2e smoke test also saves screenshots of the main screens, in both
dark and light theme, to `docs/screenshots/`.

## Architecture rules (do not break — see repo root AGENTS.md, rule D6)

- Every total in this app is a plain `SUM` over `task_entries`
  (`app/lib/aggregate.ts`). `work_records` is drill-down detail only and
  is never summed — the entry detail drawer says so explicitly.
- No money fields beyond the already-measured `cost` (provider token
  cost, USD). No rates, prices, margins or invoices — see D8.
