# Export dropdown menu

Goal: Replace separate CSV/XLS buttons in Dashboard and Entries with one export-icon button and Dropdown Menu containing CSV/XLS options.

Scope: Reuse existing dropdown primitives, download handlers and loading/export guards; accessible localized trigger and format menu items. Preserve all export/chart/Entries work. Update related browser tests for new interaction. No backend/dependencies/format changes.

## Tasks
- [x] T1 — Implement consistent export dropdown on Dashboard and Entries with localized accessible label.
- [x] T2 — Update download regressions and verify keyboard/menu/loading behavior in isolated browser.

## Evidence
Shared `web/app/components/common/ExportMenu.vue` uses existing DropdownMenu primitives and icon-only, localized, non-submit button. Dashboard and Entries preserve export guards/data/filenames. Updated four browser specs; keyboard CSV/XLS downloads passed. Parent: 11 browser tests, 566 unit tests, typecheck, lint (0 errors/23 existing warnings), diff-check passed. Independent verification: 33 focused tests and 5 browser tests passed; no blockers. Temporary stack `/tmp/kankaku-export-menu.M57D3U` stopped with logs/data retained.

## Follow-ups
Optional: Escape/focus restoration and disabling while menu open browser coverage.

## Boundaries
No commits, push, publishing or deployment without explicit request. Memory unavailable; this document is durable tracking.
