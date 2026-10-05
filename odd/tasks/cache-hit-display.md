# Cache hit display

Objective: Show the share of input tokens served from cache in the Nuxt hub dashboard and entry detail, using existing `input`, `cache_read`, `cache_write` counts.

Definition: `cacheRead / (input + cacheRead + cacheWrite)`. On a range, use the already-consolidated totals row (ratio of summed counts), never average entry percentages. Output tokens do not enter the denominator.

Scope: Dashboard input-token KPI secondary line and more precise label; entry detail token breakdown contextual percentage; localized labels/formula help and focused tests. No schema, sync, hooks, raw `work_records` aggregation, or local `/kankaku` change.

Constraints: Show an em dash when denominator is zero or directly supplied counts are missing/non-finite; dashboard totals are already numeric and normalize absent source counts to zero upstream, so missing provenance cannot be recovered here. Do not infer cost savings. One decimal, locale-aware via existing `formatPercent`. Remain legible in the existing eight-card dashboard grid. Preserve unrelated untracked files and personal/demo deployments. Branch `feat/cache-hit-display` from `87c91ec` (stacked on prior integrated branch). No commit/push/deploy without explicit request.

Route: 4-file exploration delegated; multi-file writer mandatory. TDD mode not established in this session; ordinary focused checks `pnpm --dir web test`, `pnpm --dir web typecheck`, `pnpm --dir web lint`, and targeted E2E if available. Estimated authored diff ~100–180 lines, delivery strategy ask-on-risk.

## Tasks
- [ ] T1 — Add pure ratio helper with zero/missing/invalid-count guards and unit tests proving ratio of aggregate counts (not mean of percentages). Implementation and checks observed; work-unit commit pending explicit request.
- [ ] T2 — Display localized ratio in dashboard and entry detail without adding a ninth KPI; check labels, formula explanation, UI and regression suites. Unit/type/lint and isolated browser checks observed; work-unit commit pending explicit request.

## Progress
- Read-only map: dashboard has server-summed TotalsRow and 8 KPI cards; entry detail already lists the three input-token components; formatPercent formats ratios with one decimal but maps non-finite to 0, so guard before calling.

- T1 implemented by delegated writer: `web/app/lib/cache-hit.ts` returns null for missing, negative, non-finite or zero denominator; tests cover aggregated ratio versus mean, 0%, 100% and edge cases. Focused Vitest 20/20, typecheck passed, lint 0 errors/19 existing warnings, diff check passed. No commit.

- T2 implemented by delegated writer: dashboard input KPI secondary cache-hit line and corrected uncached-input label; entry detail ratio with accessible formula tooltip; en/es/ja labels. `pnpm --dir web test` 471 passed/38 skipped; typecheck passed; lint 0 errors/19 existing warnings; diff check passed. No dedicated E2E spec was added; isolated browser spot check passed later. No commit.

- Independent verification: 471 unit tests passed/38 skipped, typecheck passed, lint 0 errors/19 existing warnings, diff check passed. Initial missing-count concern was retracted: server/fallback normalization predates this feature and TotalsRow is numeric; the ratio cannot recover unknown source provenance without separate contract work.
- Browser spot check on isolated PB :8092/Nuxt :3002 (synced exact changed modules): dashboard displayed 62,1 %, seeded entry detail 80,4 %, tooltip accessible on hover/focus. No fixture writes. Unrelated Engram status GET returned 404. Other locales/entries not visually verified. Parent spot check focused Vitest 20/20 and diff check passed.

Next: owner review and explicit commit/build/deploy decision. No commits requested; live personal/demo instances unchanged.
