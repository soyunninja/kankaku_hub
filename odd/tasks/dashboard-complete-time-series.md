# Complete dashboard time series

Goal: Rank the five highlighted projects by the selected metric (work time or token cost) and include remaining/projectless measurements in an Others series so stacked charts do not silently omit measured totals.

Scope: Dashboard frontend/chart helpers and regression tests; use server task_entries totals, never work_records. Preserve current work/project defaults and existing export work. Avoid backend/schema/dependency changes and unbounded fetches.

## Tasks
- [x] T1 — Map ranking, bounded day-total queries, fallback parity, and chart race handling.
- [x] T2 — Implement metric-aware ranking and complete Others series with focused tests.
- [x] T3 — Independently verify source/server chart totals and metric/range transitions; run checks. Fallback browser coverage remains a follow-up.

## Evidence
- Authorized by owner after recommendation to improve Time series.
- Existing chart selects five projects from cost-sorted breakdowns and discards projectless/remaining projects.
- Global metric-ranked project query is bounded to six groups (discard blank project then highlight five); overall daily totals plus highlighted project days permit at most seven chart requests.
- Others includes remaining/projectless measurements. Pure helper validates residuals, including selected-only buckets missing from overall; material inconsistencies throw, float noise clamps. Fallback reuses capped task_entries subset and discloses partial chart.
- Keys/data commit together with metric/generation guards; default work/project and client/unstacked behavior preserved. Sixth color and en/es/ja labels added.
- Independent verifier initially found missing-overall-bucket validation gap. Strict TDD follow-up resolved it; final independent verification found no blockers.
- Parent checks: full Vitest 566 passed/38 skipped, typecheck passed, diff-check passed; writer lint 0 errors/23 existing warnings. Browser chart + dashboard regression specs 5 passed on fresh isolated :3003/:8093 stack.
- Independent reruns: helper/export 13 tests passed, project browser 3 passed, diff-check passed.
- Temporary stack `/tmp/kankaku-project-chart.cEn7XJ` stopped; logs/data retained.

## Follow-ups
- Chart failures currently propagate without visible failure/stale-data disclosure; add explicit error/retry UX.
- Add fallback-cache/truncation and client/unstacked browser regression coverage. Multi-request server totals are not a transactional snapshot.

## Repository boundary
Preserve unrelated uncommitted work. No commit, push, deployment, or publish without explicit owner request. Memory tools are unavailable; this file is the durable feature record.
