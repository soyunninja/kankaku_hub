# Entries filter layout

Goal: Show visible Start/End labels above Entries date controls and separate the export action on the far right of the filter bar.

Scope: EntriesDateFilter label styling and Entries filter-bar responsive layout only; preserve filtering, calendars, export behavior and existing changes.

## Tasks
- [x] T1 — Add visible date labels and distinct right-aligned export action region with responsive wrapping.
- [x] T2 — Verify date/export accessibility, desktop/mobile alignment, and existing download regressions.

## Evidence
Visible associated date labels now use concise Start/End, Inicio/Fin, 開始/終了. Wrapping controls occupy flexible region, with export in DOM-last right-aligned action region and desktop/mobile separators. Parser/calendar/export behavior unchanged.

Independent static review found no blockers; 13 focused date/export tests independently passed. New browser guard corrected to read-only exact paired URL check (does not require write permission). Parent isolated desktop 1440px/mobile 390px geometry + Entries export/filter consistency: 4 tests passed. Full Vitest 566 passed/38 skipped, typecheck, lint (0 errors/23 existing warnings), diff-check passed. Isolated stack `/tmp/kankaku-filter-layout.SalSO4` stopped; logs/data retained.

## Boundaries
No commits/push/deployment. Preserve all prior uncommitted work. Memory unavailable; file is durable tracking.
