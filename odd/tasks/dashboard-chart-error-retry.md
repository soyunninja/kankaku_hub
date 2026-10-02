# Dashboard chart error and retry

Goal: Show explicit loading/error/retry states for the Time series chart and prevent retained data being displayed as current after a failed refresh.

Scope: Dashboard frontend and read-only browser regressions. Preserve chart ranking/Others, fallback caps, exports and unrelated Entries work. No backend/schema/dependency changes; only task_entries-derived totals.

## Tasks
- [x] T1 — Map chart/summary errors, fallback and generation boundaries.
- [x] T2 — Implement chart error/loading/stale suppression and current-state retry with regression tests.
- [x] T3 — Run isolated browser and focused/full checks; independent verification.

## Evidence
- Owner explicitly authorized error and retry improvement.
- Existing chart failures propagate without visible disclosure; old chart can remain on failed refresh.
- Added separate chart/summary loading/error/retry states, stale point suppression, current-filter chart retries preserving KPI/export snapshots, sticky chart-only 404 fallback and snapshot-keyed subset cache.
- Added `web/e2e/dashboard-chart-recovery.spec.ts`: repeat failure/recovery, summary separation, stale failure, fallback recovery/new-range cache isolation and no unhandled rejections.
- Parent final checks: 11 affected browser tests, 566 unit tests, typecheck, lint (0 errors/23 existing warnings), diff-check passed.
- Independent verification: no blockers; 33 focused tests and 5 browser tests passed. Temporary stack `/tmp/kankaku-export-menu.M57D3U` stopped; logs/data retained.

## Follow-ups
- Optional explicit changed-agent/unassigned retry and same-range realtime cache tests.
- Entries browse errors are separate pre-existing scope; export errors already handled.

## Boundaries
No commits, push, deployment or publishing without explicit request. Preserve unrelated work. Memory tools unavailable; this document is the durable feature record.
