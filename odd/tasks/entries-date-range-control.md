# Entries date-range control

## Purpose and route

Replace exterior Start/End controls with one labelled date-range trigger,
matching Dashboard's outline CalendarRange affordance without imposing its
required bounds. Parent delegated this bounded multi-file UI/browser change;
Dashboard, backend contracts and export implementation remain unchanged.

## Contract

- Entries keeps `filters.dateStart` / `filters.dateEnd` and the exact URL
  query keys `dateStart` / `dateEnd`.
- Both missing means All time; either missing remains open-ended. Calendar
  navigation may start at today but never applies today as an empty bound.
- Existing local-day-to-UTC conversion remains authoritative for flat
  filters and optional totals `from` / `to`, including inclusive day end.
- Presets use Dashboard's `resolvePreset` and synchronously update both
  models so the existing batched refresh sees no intermediate range.
- Manual edits preserve the other bound. All time clears dates only.
- Reused EntriesDateFilter retains validated compact drafts, calendar
  selection, labelled clear buttons and error ARIA inside the popover.
- EN/ES/JA label, all-time and open-bound text are localized.

## Completion

- [x] Unified, localized optional date-range control and preserved filter contract.
- [x] Range, layout, export, grouped/partial data and recovery checks passed.
- [x] Optional model defaults explicitly set to `undefined`, removing the two
  new lint warnings without changing open-bound behavior.
- [x] User-authorized Unassigned wrapper `Card py-0` matches Entries padding.
- [x] Final independent verification: PASS, no blockers.

## Final verification

Parent-provided independent evidence supersedes the earlier counts below:
581 tests passed / 38 skipped; typecheck passed; lint passed with 0 errors
and 23 pre-existing warnings; diff-check and production `npm run web:build`
passed. All 16 browser tests passed across range, layout, export, grouped,
partial and recovery specs.

Actual CSS at widths 1440 and 390 confirmed Unassigned card top/bottom
padding and all four content paddings are `0px`. Evidence:
`/tmp/kankaku-range-final.ddkPew/card-padding.json`. The owned stack is
stopped; artifacts are retained.

Nonblocking verification limits: Chromium only, English browser assertions,
and Today applied by click; other presets are resolver-tested and visibly
asserted. No implementation work remains pending. The two latest changes
have not been committed, pushed or deployed after `f2a1532`.

## Prior verification evidence

Strict TDD disabled by explicit parent choice for Vue UI/browser wiring.
RED/GREEN not active; ordinary functional checks below.

- `pnpm --dir web test`: 48 files passed, 1 skipped; 581 tests passed,
  38 skipped.
- `pnpm --dir web typecheck`: passed.
- `pnpm --dir web lint`: earlier pass with 25 warnings, including two
  optional range model-default warnings subsequently removed.
- `git diff --check`: passed.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR="$STACK_DIR/date-range-out" pnpm --dir web exec playwright test e2e/entries-date-range.spec.ts e2e/entries-filter-layout.spec.ts e2e/entries-export.spec.ts e2e/entries-grouped-filter-consistency.spec.ts e2e/entries-partial-export.spec.ts`:
  final run 10 passed. Initial harness failures corrected: preset names,
  local timezone expectations, and waiting for inner popover focus restoration
  before sending the outer Escape.

Owned stack: `/tmp/kankaku-date-range.GoqUkV`, seeded on ports 3003/8093;
terminated using isolated-stack down, preserving logs and browser output.
Browser fixtures intercept read requests only; totals POST is read-only.
No broad sidebar injection and no browser record mutation.

Tests cover four deep-link bound states, exact local UTC filter values,
optional grouped totals bounds, CSV metadata, grouped Today batching,
All time retaining agent/grouping, invalid drafts, start-only manual input,
nested calendar Escape focus, outer Escape focus, 1440/390 layout and export
separation. Existing CSV/XLSX and partial click-snapshot tests pass.
Other presets are visibly asserted but only Today is exercised by click;
localizations are authored but browser assertions use English.

No commit, push or deployment performed. Unrelated working-tree files preserved.
