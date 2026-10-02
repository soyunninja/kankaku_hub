# Data export to CSV/XLS

Goal: Add export paths for kankaku hub data without introducing pricing/invoicing concepts or summing `work_records`.

Scope: Dashboard export covers aggregate data already loaded on `/`: totals, client breakdown, project breakdown, and top expensive task_entries rows. Detailed export comes from `task_entries` and respects the Entries view filters. Use `task_entries`/totals data only (D6). No backend schema changes, no raw `work_records` export, no new billing/rate/invoice fields, and no package dependency unless a later slice proves true XLSX is required.

Working tree: Current branch is `main` with many unrelated untracked owner files under `.gga`, `.kankaku`, `.pi`, and existing `odd/` notes. Preserve them. Do not commit, push, publish, or deploy without explicit user request.

Checks: focused Vitest for export formatting/helpers; focused Playwright for affected export UI; `pnpm --dir web test`; `pnpm --dir web typecheck`; `pnpm --dir web lint`; `git diff --check` if implementation proceeds.

## Tasks
- [x] T1 — Map current dashboard data shapes and implement pure CSV/Excel-compatible export helpers with unit tests.
- [x] T2 — Wire dashboard export buttons to the current visible dashboard state and add i18n labels.
- [x] T3 — Run focused/full checks and verify the export files contain only visible aggregate/dashboard rows.
- [x] T4 — Add regression coverage for failed dashboard reload preserving export snapshot metadata.
- [x] T5 — Add export metadata and completeness indicators to the dashboard export.
- [x] T6 — Map Entries filters and implement detailed task_entries export respecting the Entries view filters.
- [x] T7 — Fix quoted-value escaping for Entries model and machine filters.
- [x] T8 — Add Entries download E2E coverage for filters, pagination, and file contents.
- [x] T9 — Keep unsupported Entries filters active by enforcing flat browse and explaining grouping eligibility.

## Progress
- Read-only recovery found no existing export implementation or export feature note. Initial slice implemented `/` dashboard export; detailed Entries export followed as T6.
- T1 added `web/app/lib/export.ts` and `web/tests/export.test.ts`: dependency-free CSV serializer with UTF-8 BOM/CRLF/escaping/formula guarding, Excel-openable HTML `.xls`, and dashboard export table mapping.
- T2 wired `/` dashboard export buttons, Blob downloads, localized labels/toasts in `web/i18n/locales/{en,es,ja}.json`, and no extra fetching or `work_records` access.
- Independent verification found a stale-filter blocker: failed reloads could export retained data with newer live filter metadata. Fixed in `web/app/pages/index.vue` by storing export metadata from the last successfully replaced load snapshot and disabling export before a successful snapshot exists.
- T4 added Playwright regression coverage in `web/e2e/dashboard-latest-load.spec.ts`: after a current-period totals request returns 500, CSV export remains enabled and downloads the retained successful snapshot filename, period metadata, and cost.
- T5 added metadata/completeness rows to the dashboard export: export kind, generated time, source path, period/filter metadata, dashboard limits, and truncation/completeness indicators for server and fallback paths. Independent read-only verification found no blockers.
- T6 added filtered, sorted detailed export from `/entries`: bounded paginated `task_entries` export capped at 5000 rows, prompt text excluded, metadata/truncation disclosure, CSV/XLS buttons and localized toasts. Independent read-only verification found no definite blocker.
- Final validation for T6: `pnpm --dir web exec vitest run tests/export.test.ts tests/use-entries-explorer.test.ts` passed (18 tests); `pnpm --dir web typecheck` passed; `pnpm --dir web lint` passed with 0 errors and 23 existing warnings; `pnpm --dir web test` passed (542 passed, 38 skipped); `pnpm --dir web exec playwright test e2e/dashboard-latest-load.spec.ts` passed (2 tests); `git diff --check` passed.
- T7 completed: model/machine now share JSON-based literal escaping with session/search. Independent verification caught the original helper's backslash gap; follow-up tests and JSON serialization resolved it. Verified plain values, quotes, backslash-before-quote, trailing backslashes, literal sequences, and controls for browse/export. Independent rerun: 26 focused tests and diff-check passed. Parent validation: full suite 550 passed/38 skipped; typecheck passed. Writer lint: 0 errors/23 warnings. Live PocketBase parsing remains untested.

- T8 completed: added `web/e2e/entries-export.spec.ts` covering CSV-flat and XLS-grouped downloads from synthetic 1001-row responses, exact ordered identities, three 500-row pages, filter/sort propagation, metadata, name escaping, active-markup rejection, and prompt exclusion. Fresh isolated stack `/tmp/kankaku-export-e2e.mQ6qvX` used :3003/:8093; parent and independent browser runs passed (1 test each). Typecheck, lint (0 errors/23 warnings), full Vitest (550 passed/38 skipped), and diff-check passed. Stack stopped; logs/data retained. No record mutations by the spec. Mock coverage proves request propagation, not live PocketBase filter/projection semantics.

- T9 completed: active model/quality/search enforce flat browse without clearing values, grouping is disabled with localized explanation until filters are cleared, and storage restoration respects quality deep links. Added pure eligibility coverage and `web/e2e/entries-grouped-filter-consistency.spec.ts`. Independent static review found no concrete blocker; focused 45 tests and diff-check independently passed. Parent full suite: 559 passed/38 skipped; typecheck passed; writer lint: 0 errors/23 warnings. Isolated consistency/export/dashboard browser specs: 4 passed. Narrow E2E counter excludes the sidebar queue-count request, not Entries grouped browse. Stack `/tmp/kankaku-grouped-e2e.BNvTGu` stopped; logs retained.
- Separate owner request: dashboard chart defaults now `metric = work`, `stackBy = project` in `web/app/pages/index.vue`; typecheck and diff-check passed. Existing chart scope remains top five cost-ranked projects, not all-project work totals.

## Remaining follow-ups
- Optional: Entries export UI-race, failure and partial-export browser coverage; live PocketBase filter/projection validation.
- Optional: mounted pagination/race and same-component query-navigation coverage. Grouped totals still exclude ignored sessions while detail export does not; expanded session details retain the existing 200-row cap.
- Optional: add fallback-loader metadata wiring tests and forced server-pagination export metadata tests.
- Optional: disclose the fallback scan cap value explicitly.
