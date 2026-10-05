# Compact dates and lean Entries tables

Goal: On `/entries`, show Inicio as `YY/MM/DD HH:mm` (local viewer time), replace the two top date filters with a calendar picker plus exact `YY/MM/DD` text entry, and remove Modelo from the entry-level tables. Keep the model filter and model in the entry detail; keep the primary grouped session table's existing columns.

Product decision (revised): Browser-native `type=date` cannot guarantee its visible format. Owner now wants the shadcn-vue Date Picker pattern (Calendar + Popover), with visible and typed `YY/MM/DD`; the already implemented text drafts/parsing can be reused beside the calendar. Parse strictly as `YY/MM/DD`; map `YY` to 2000–2099 (the existing app's task/history range starts at 2000), reject impossible dates including invalid leap days. Internal filters remain `YYYY-MM-DD` local calendar days, so grouped totals and flat PocketBase queries retain their existing timezone/DST rules. Invalid/incomplete input must not replace the last valid applied filter or issue a malformed query; show accessible localized validation. Clearing an input clears that bound.

Display: dedicated pure formatter with local timezone semantics and two-digit year, 24-hour hours, zero-padded minute. Use it for primary grouped session Inicio, nested entries Inicio, and flat/fallback Inicio only. Do not globally change `formatDateTime`. Remove Modelo header/cell from nested grouped and flat/fallback entry tables, adjust empty/loading colspan and columnCount, keep model filter and detail unchanged.

Scope: date display/filter helper with unit tests, shadcn-vue Calendar/Popover Date Picker integration for Entries, Entry status Badge, en/es/ja validation labels, focused isolated browser regression. No schema/sync/backend changes. Preserve prior uncommitted Projects sorting helper and other authorized branch changes. No commit/push/build/deploy without explicit request.

Checks: `pnpm --dir web test`, `pnpm --dir web typecheck`, `pnpm --dir web lint`, `git diff --check`, focused isolated Playwright on an exact paired :3002/:8092 or :3003/:8093 stack; no live :8090 writes.

## Tasks
- [ ] T1 — Add pure compact local timestamp formatter and strict short-date conversion with calendar/century tests. Implemented, 7 focused tests/type/lint passed; commit pending.
- [ ] T2 — Wire validated date fields, compact Inicio and remove entry-level Modelo columns with adjusted counts; add localized copy and browser regression. Implemented with text fields; superseded date-control UX before browser verification, commit pending.
- [ ] T2b1 — Stage official shadcn-vue Calendar registry assets and explicit date dependency without overwriting existing Button/Popover. Implemented and type/lint passed; commit pending.
- [ ] T2b2 — Integrate Date Picker with typed YY/MM/DD and clear action; use Badge for entry status in flat/nested tables and update browser regression. Implemented in `EntriesDateFilter.vue` and page; isolated browser 1/1 passed, integrated 483 unit tests/typecheck/lint passed; commit pending.
- [ ] T3 — Independently verify grouped/flat/fallback alignment, date picker keyboard/date filter behavior, status badge and checks. Fresh isolated browser spec passed 1/1; integrated unit/type/lint passed; commit pending.

## Progress
- Read-only map: Entries page has three Inicio render sites. Native date filters use ISO values consumed by local-day conversions. Primary grouped outer header already has no Modelo, but its nested entries table does; flat/fallback table also has one. Existing date-filter E2E in dashboard uses separate controls and is unaffected.

- T1 delegated implementation: `web/app/lib/entries-compact-date.ts` exports `formatCompactEntryDateTime(instant,timeZone?)`, `parseShortFilterDate(input)` (valid/clear/invalid), and `formatShortFilterDate(isoDay)`. Focused Vitest 7/7, typecheck passed, lint 0 errors/19 existing warnings, diff check passed.

- T2 delegated implementation: compact Inicio and removal of Modelo from entry-level tables, adjusted colspan/counts; validated text drafts and en/es/ja labels. Unit suite 482 passed/38 skipped, typecheck passed, lint 0 errors/19 existing warnings, diff check passed. Browser E2E not yet run; owner then requested shadcn-vue Date Picker and Badge for Estado.

- Registry preflight: official shadcn-vue Date Picker composes Calendar+Popover. `pnpm dlx shadcn-vue@latest add calendar --dry-run` advertises but does not support dry-run. A disposable `/tmp/kankaku-calendar-preview.dG00xn` generated 19 files: 13 Calendar, 4 NativeSelect, plus 2 Button files already present in repo; no package.json diff. The CLI invoked corepack pnpm 12 and required temporary `dangerouslyAllowAllBuilds` in the disposable preview only. Do not run it blindly in repo or overwrite existing Button. `@internationalized/date` is transitive, not a direct dependency. Copy only Calendar/NativeSelect assets into repo and add direct dependency with repo pnpm 10.

- T2b1 copied byte-identical official generated Calendar (13) and NativeSelect (4) files, except one lint-only slot return type `any`→`unknown`; no Button/Popover overwrite. Added direct `@internationalized/date` 3.12.4 via repo pnpm10 with `--ignore-scripts`, package/lock only that dependency. Typecheck passed, lint 0 errors/22 warnings (19 pre-existing, 3 generated), diff check passed. Registry source came from disposable CLI preview, not blind repo add.

- T2b2 delegated implementation: Calendar+Popover filter with editable short date and clear action, route sync, 2000–2099 selection, localized copy, Badge tones in nested/flat/fallback entries and expanded isolated E2E. Writer reported `pnpm --dir web test` 482 passed/38 skipped, typecheck passed, lint 0 errors/22 warnings, diff check passed. Browser remains unrun; no commit.

- Fresh candidate isolated stack at :3003/:8093 (separate from stale :3002/:8092) exercised the focused Entries browser spec. First run exposed only an ambiguous global alert locator; scoping to `#entries-date-start-error` with `aria-describedby` check made the spec pass 1/1. Integrated suite 483 passed/38 skipped, typecheck passed, lint 0 errors/23 warnings, diff check passed. No schema/sync change.

Next: code and focused browser checks complete; work-unit commit remains pending explicit authorization. No build/push/deploy.
