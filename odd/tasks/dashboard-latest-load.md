# Keep dashboard results aligned with the latest selection

Goal: A slower dashboard fetch for an older date range, agent, or unassigned filter must never overwrite the results for a newer selection. Chart series and loading state must follow the same latest-request rule. Preserve server totals, documented 404 fallback, and realtime refresh semantics. No schema or sync changes.

Scope: `web/app/pages/index.vue` and a focused, fixture-free dashboard browser regression (`web/e2e/dashboard-latest-load.spec.ts`); add a small pure helper/test only if it simplifies the control flow. Preserve all unrelated dirty work, including staged Claude Code SVG. Use only an explicitly isolated stack and output directory; never the personal PocketBase. No screenshots, build, commit, push or deployment without explicit request.

## Tasks
- [ ] T1 — Reproduce an out-of-order response in a deterministic, fixture-free dashboard regression. Implemented; isolated browser RED observed: after releasing the older 30-day response, Cost changed from Today's `$0.1124` to stale `$9,876,543.21` (exit 1). Commit pending.
- [ ] T2 — Make dashboard loads latest-wins across server, fallback, chart and loading, retaining existing filter semantics. Implemented with immutable filter/range snapshots and request generations; same isolated browser scenario GREEN 1/1 after older response released. Commit pending.
- [ ] T3 — Independent focused browser and integrated checks, report skipped checks and commit status. Focused isolated Chromium GREEN 1/1; unit 483 passed/38 skipped; typecheck and diff check passed; lint 0 errors/23 warnings; active LSP clean on both changed paths. Commit pending.

Verification notes: RED before implementation: old 30d response changed Today's cost KPI `$0.1124` to stale `$9,876,543.21`; GREEN afterward kept the Today value after old response completed. No fixture writes or screenshots. Independent readback found request generations and snapshots protect both server/fallback and chart updates. Fallback/stacking/realtime/unmount branches were not browser-tested here; an existing 2,000-row fallback truncation notice gap and a mount-to-subscription realtime gap are separate follow-ups, not newly fixed. The isolated :3003/:8093 stack was stopped without purging its evidence.

Commit: pending explicit authorization, so no task checkbox closes as a committed work unit. Rollback boundary: only the new race regression and the scoped dashboard loader changes. No build/push/deploy.
