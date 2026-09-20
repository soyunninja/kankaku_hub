# Phase 3 — Web (Nuxt + shadcn-vue)

| | |
|---|---|
| Status | done |
| Repos | kankaku-hub |
| Depends on | [phase-2-sync-push](phase-2-sync-push.md), [phase-2b-backfill](phase-2b-backfill.md) |

## Goal

Static build served from PocketBase's publicDir: dashboard, project detail,
the "Sin determinar" queue, minimal task CRUD. Depends on phase 2 having
put data there, and on phase 2b for the assignment queue to be useful.

## Scope

### In

- All nine screens: login, dashboard, clients, projects, project detail,
  tasks (board + list), unassigned queue, entries explorer, settings.
- App shell: sidebar, header, command palette, toasts, skeletons, empty
  states.
- Theming (dark default, dark/light/system) and i18n (es default, en
  secondary, no auto-detect).
- The D6 guard (`app/lib/aggregate.ts`).
- A dependency-free SVG chart component.
- A visual/UX polish pass (KPI layout, money precision, delta polarity,
  chart responsiveness, full-height shell, i18n audit, drag-and-drop task
  board, unassigned-queue client suggestions).

### Out

- Migrating `app/components/ui/` to the official shadcn-vue registry
  components — partially done (many primitives adopted from the registry;
  `select` and `avatar` remain hand-authored, `sonner`/toast not adopted)
  and explicitly still in flux per `ESTADO.md` — this documentation set
  intentionally does not track that folder's implementation detail further.
- Component-level Vue tests (only `app/lib/*` pure helpers are unit-tested,
  plus Playwright e2e).

## Deliverables

- `web/` — full Nuxt 4 SPA (see
  [`../architecture/hub-web.md`](../architecture/hub-web.md) for the
  complete page/composable map).
- `web/e2e/{smoke,polish}.spec.ts`, `web/tests/*.test.ts`.
- `web/docs/screenshots/` (regenerated from the production build, both
  themes, 8 screens + mobile dashboard).

## Acceptance criteria

- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` (59/59), `pnpm generate`
      all pass (per `ESTADO.md`).
- [x] `pnpm test:e2e` passes against both `nuxt dev` and the production
      build served by PocketBase in one process (11/11 specs).
- [x] Dark theme is the default with no flash on a fresh profile; theme and
      locale choices persist.
- [x] Every dashboard/project total is a plain `SUM` over `task_entries`
      (D6/D7 respected) — no rate/price/margin field anywhere (D8
      respected).
- [x] KPI values do not clip at 390/768/1440px in either theme.

## Evidence

- Commits (kankaku-hub): `cc1f694` (scaffold: theme/i18n/PocketBase
  client), `a6d3a9d` (hand-authored UI kit + shell), `3f26fcb` (dashboard,
  catalog, entries screens), `f35a193` (unit tests + D6 fixture guard +
  Playwright smoke), `ad69cf0` (root package.json web scripts), `4a6a337`
  (docs), `96a9770` (genuine shadcn-vue components from the registry),
  `6dadc87` (KPI layout/money precision/delta polarity/chart width fixes),
  `d42cfa3` (full-height shell + untranslated strings fix), `adfd799`
  (drag-and-drop board + unassigned-queue suggestions), `7327076`
  (extended e2e coverage + refreshed screenshots), `899292d` (ESTADO.md
  record of the polish pass).
- Tests: `web/tests/{aggregate,format,i18n,period,suggest-client}.test.ts`.
- E2E: `web/e2e/{smoke,polish}.spec.ts` — verified both against `nuxt dev`
  and against the production build served by PocketBase
  (`PW_BASE_URL=http://127.0.0.1:8090`).

## Known gaps

- No automated test for component-level Vue behaviour beyond `app/lib/*`
  helpers and end-to-end specs.
- Not load-tested beyond the ~430-row seed dataset; dashboard/project pages
  use `getFullList` over the date range rather than server pagination —
  flagged in `ESTADO.md` as worth revisiting if volume grows significantly.
- `app/components/ui/` is mid-migration to the official shadcn-vue
  registry (`select` and `avatar` remain hand-authored).

## Next steps

- See [phase-4-task-linkage](phase-4-task-linkage.md) (planned) and
  [phase-deployment-to-vps](phase-deployment-to-vps.md) (planned).
