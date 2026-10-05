# Retire duplicate Commands page

Goal: Remove the hub's duplicate `/commands` section and direct readers to the kankaku website. Add a visible `https://kankaku.io` link to Settings. Preserve shared copy controls in Entry/Task detail and all other hub functions.

Prerequisite checked before source edits: local `http://localhost:4321/es/docs/guide` and `/es/docs/commands` both returned HTTP 200 with rendered guide/commands content. Guide documents hub setup (`KANKAKU_PB_URL`, email/password), Engram and `KANKAKU_SYNC_PROMPT`; commands page lists `/kankaku` subcommands. Japanese guide/commands at `/ja/docs/...` and default English at `/docs/...` also return 200; `/en/docs/...` is not a route. External production availability was not verified.

Scope: Remove route/navigation/palette entry and page-only command data/UI/tests/i18n. Replace the EntryDetailSheet `/commands#config` link with the locale-aware external guide anchor `#settings`, retaining its prompt privacy explanation. Add Settings external website link and focused tests. `CopyButton` stays: it is shared with Entries/Tasks. No schema/sync/deploy changes.

Working tree: Existing uncommitted cache-hit, dependent Entries/Tasks filter and dashboard padding changes coexist on `feat/cache-hit-display`, plus unrelated owner files. Preserve them. No commit/push/build/deploy without explicit request. This deletion is large; split review into navigation/links and dead-page cleanup, rather than a broad unrelated rewrite.

Checks: `pnpm --dir web test`, `pnpm --dir web typecheck`, `pnpm --dir web lint`, `git diff --check`, focused isolated Playwright :3002/:8092 when exact modules synced. Never write to live :8090.

## Tasks
- [ ] T1 — Remove Commands route/nav and stale in-app link; add localized website link in Settings and focused route/link regressions. Integrated unit/browser checks observed; commit pending explicit request.
- [ ] T2 — Delete unused Commands page-only components/data/translations/tests while retaining shared CopyButton keys; update navigation/i18n and browser test route inventories. Implemented and checks observed; commit pending.
- [ ] T3 — Update active docs/specs to state that the Commands screen was retired in favor of kankaku.io, retaining historical design evidence. Implemented, diff check passed; commit pending.
- [ ] T4 — Independently verify integrated UI and checks, including no broken `/commands` links. Unit/type/lint and selected isolated browser checks passed; commit pending explicit request.

## Progress
- Read-only map identified page-only `CommandRow`, `kankaku-commands`, route, and shared `CopyButton`; `NAV_ITEMS` powers sidebar/palette; stale `/commands#config` in Entry detail and several unit/E2E route inventories.

- T1 writer removed nav/palette entry and icon maps, added Settings external website link and localized Entry detail guide link, updated focused route/link tests and locale labels. Unit 472 passed/38 skipped, typecheck passed, lint 0 errors/19 existing warnings, diff check passed. Parent mechanically deleted `web/app/pages/commands/index.vue` after writer's deletion restriction; post-deletion integrated check still pending. Shared CopyButton remains.

- T2 delegated partial pass removed `/commands` from a11y/smoke/i18n-ja/screenshots-ja inventories and i18n test requirements; parent mechanically reduced commands locale data to shared CopyButton keys and deleted CommandRow, kankaku-commands lib/unit spec and Commands E2E after writer deletion restriction. Independent checks: 461 unit passed/38 skipped, typecheck passed, lint 0 errors/19 existing warnings, diff check passed. No live `/commands` refs remain in web/app/tests/e2e. Browser E2E not yet run.

- T3 docs updated: historical Commands spec marked retired/superseded with current canonical docs first, spec index status retired, Entries prompt-link requirement/traceability points to external guide and explicit E2E coverage, phase-3 retains historical evidence with retirement note. Diff check passed.
- Separate owner-priority change: `web/nuxt.config.ts` appVersion 0.1.1 → 0.2.0; independent typecheck and diff check passed. Personal hub deployment procedure recalled; no build/deploy.

- T4 independent integrated checks: `pnpm --dir web test` 461 passed/38 skipped, typecheck passed, lint 0 errors/19 existing warnings, diff check passed. Selected isolated :3002/:8092 Playwright settings website/hub URL and empty-prompt external guide link 2/2 passed. One temporary fixture was created/deleted only on isolated PB under explicit opt-in. No source-state change observed. Nuxt config declares 0.2.0; isolated browser did not assert displayed version. No broad E2E or production website availability check.

Next: owner review and explicit commit/build/deploy decision. No commit requested; personal/demo instances unchanged.
