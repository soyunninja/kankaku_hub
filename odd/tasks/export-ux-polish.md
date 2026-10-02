# Export and browse UX improvements

Goal: Complete owner-approved improvements: Entries error/retry, confirmation before capped exports, persistent filter labels, saved dashboard preferences, and genuine XLSX downloads.

## Scope and boundaries
Preserve all earlier chart/export/Entries work. Read only task_entries and server totals (D6); no rates/prices/invoices. No commits, push, deployment or publish. Execute reviewable sequential slices; no concurrent source writers. Memory unavailable; this file is the durable feature record.

## Tasks
- [x] T1 — Entries browse errors/retry, stale data disclosure and contained initialization/watch rejections.
- [x] T2 — Visible associated Model/Machine/Prompt search labels on desktop/mobile.
- [x] T3 — Confirm capped export count before download; cancel downloads nothing; keep click-time filters/sort.
- [x] T4 — Save Dashboard metric/group preferences with validated storage and work/project defaults.
- [x] T5 — Replace HTML XLS with genuine XLSX, matching label/MIME/filename and workbook tests.
- [x] T6 — Independent final verification and focused/full isolated regression checks.

## Acceptance and checks
- Error/retry uses current filters/page/mode, never marks stale rows current, and superseded errors cannot overwrite newer success.
- Labels stay visible even for grouped-disabled filters; no date/filter semantic changes.
- Export cap stays 5000; consent is separate from loading and captured output cannot be relabeled by changing controls.
- Valid preferences restored; invalid/corrupt/storage failure uses defaults safely.
- CSV preserved. Genuine XLSX retains Unicode, IDs as text, numbers as numbers, formula strings as literal text, metadata, and prompt-field exclusion.
- Focused unit/browser tests, typecheck, lint, full Vitest, diff-check; inspect package impact and verify real workbook content.

## Mapping evidence
Read-only mapper inspected proposal and exact source paths. Existing Entries refresh/mount reject without recovery; model/machine/search labels absent; capped export downloads immediately; dashboard prefs absent; XLS is HTML and no writer dependency found in committed lockfile/local inspected caches. Registry metadata checked for write-excel-file 4.1.1: browser/universal entrypoints, Node >=18, sole direct dependency fflate ^0.8.2, registry modified 2026-06-08. README API inspected: universal writeExcelFile(sheetData).toBlob(); explicit String/Number/Boolean cells and Formula opt-in. No package installed yet.

## Progress
- T1 browser recovery/export: 7 passed on fresh seeded isolated :3003/:8093 stack `/tmp/kankaku-ux-polish.2Gqk9q`. Narrowed initial broad failure mocks to exclude sidebar/shared initialization and corrected silent 404 retry sequence; no Entries source bug in those failures. Unit45/typecheck/lint/diff checks passed.
- T2 visible Model/Machine/Prompt search labels with unique associated IDs and unchanged placeholders/grouped restrictions. Layout/export browser: 3 passed (1440/390px), typecheck/lint/diff-check passed.
- T3 completed: accessible consent dialog for capped >5000 result with captured pending export state; cancel/Escape/outside discard, confirmed download guarded against repetition and preserved click-time metadata. Partial/ordinary export browser 3 passed; typecheck/lint/diff-check passed.
- T4 completed: versioned dashboard preference parser validates full shape/enums, restores before requests, synchronous watcher guards prevent duplicate initialization, storage exceptions contained. Strict TDD parser RED/GREEN; focused28 and browser12 passed including project/recovery regressions; typecheck/lint/diff-check passed.
- T5 completed: write-excel-file4.1.1 runtime/lazy universal import, fflate0.8.3 dev-only ZIP assertions; typed OOXML Measurements worksheet, literal formula strings, preserved leading-zero IDs/numbers/metadata/privacy, CSV unchanged, menu/filename/MIME switched to XLSX. Focused33 and browser5 passed, typecheck/lint/diff-check passed.
- Final parent affected browser suite: 26 passed across nine specs. Production `npm run web:build` passed (static output generated, nothing deployed); only existing tooling warning. Full suite initially exposed missing recovery mocks in function-extraction harness; test-only fix added browseError/initializer and correct stale-request microtask timing, preserving assertions. Full suite after fix: 581 passed/38 skipped; typecheck/lint (0 errors/23 warnings)/diff-check passed.
- Independent review found no blockers; focused48 and browser14 passed. Review cleanup replaced a vacuous `date_start` check with a `dateStart` metadata assertion, normalized omitted trailing blank OOXML cells in the test parser (CSV/XLSX partial export rerun: 2 passed), and added an explicit numeric-cell `t` absent/`n` assertion (full rerun: 581 passed/38 skipped). Removed the inaccurate worker-free comment: fflate may use Blob workers.
- Remaining nonblocking limits: production strict-CSP Blob worker compatibility and Spanish/Japanese layouts were not browser-tested; no explicit double-submit E2E (source synchronously consumes pending state and sets the guard). All isolated stack processes stopped; artifacts retained at `/tmp/kankaku-ux-polish.2Gqk9q`. No commits, publication, deployment or test record mutations.
