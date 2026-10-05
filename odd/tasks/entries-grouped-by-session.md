# Feature: Entries screen opens grouped by session (server-side totals)

Locator: `odd/tasks/entries-grouped-by-session.md` (Engram topic
`odd/entries-grouped-by-session/tasks`, project kankaku-hub).
Branch: `feat/entries-grouped-by-session` (from `main`). Created 2026-09-22.

## Objective
"Registros" opens grouped by session and collapsed: one row per session with
client, project, task, entry count, time and cost, expandable to its entries.
The flat list stays available as a mode.

## Problem
The current "Agrupar por sesión" toggle groups client-side over the current
page of 25 rows (`web/app/lib/entries-session-group.ts`), so a session split
across pages shows as two groups with partial totals, and it is off by default.
Owner (2026-09-22): the session is how work is remembered; the entry is the
unit of measurement and audit. Today's confusion (pi `/session` total vs one
hub entry) came from the screen leading with the finer grain.

## Design
- Grouped mode reads `POST /api/kankaku/totals` with `group_by: 'session'`
  (already implemented server-side, used by the Sessions queue via
  `web/app/composables/useSessions.ts#fetchSessionTotals`). Add a sibling
  `fetchSessionTotalsForEntries(filters, sort, page, perPage)` (name at writer's
  discretion) that maps the Entries filters the totals whitelist supports
  (`client, project, task, agent, status, machine, session_id, without_task`,
  ...) and paginates by session (25/page, sort `-min_started_at`).
- Expanding a session row lazily fetches its entries through
  `useEntriesExplorer().list({ filters: { session_id }, perPage: <all or
  paginated> })`, cached per session for the page lifetime. Entries render with
  the existing flat-row cells (model, effort, status, EntryDetailSheet).
- Filters the totals contract cannot honor (model, measurement quality, free
  text) are disabled in grouped mode with a hint "available in the flat view";
  no server contract change in this feature.
- Fallback: on `TotalsRouteUnavailableError` (404) keep today's client-side
  page grouping, exactly as other screens do.
- Persistence: reuse `localStorage['kankaku-entries-group-by-session']`;
  absent → grouped (new default). Expanded set is page-lifetime only.
- i18n: new keys in en/es/ja (`web/tests/i18n.test.ts` enforces parity).
- Totals stay server-derived (D6): never sum rows client-side in grouped mode.

## Out of scope
totals-query.js whitelist changes; a sessions collection; task assignment from
the group row (EntryDetailSheet already does per-entry); persisting expansion.

## Constraints
- Strict TDD (source: global Strict TDD Mode). Runners: `pnpm --dir web test`
  (vitest), `pnpm --dir web typecheck`, `pnpm --dir web lint`; hooks untouched
  (`npm run hooks:test` must still pass). Playwright `pnpm --dir web test:e2e`
  ONLY against an isolated stack; NEVER against the owner's live :8090/:3000
  and never with `E2E_ALLOW_PB_WRITES=1` pointed at them.
- English artifacts; conventional commits; no AI attribution.
- Owner's uncommitted `.gitignore` change and `.pi/` are not ours: leave them.

## Tasks
- [x] T1 composable: session totals for the Entries filters (useSessions.ts or
      sibling) + filter mapping (which Entries filters are groupable) as a pure
      lib function. Vitest first. Route: delegated writer.
- [x] T2 page: grouped-by-session default, server-backed session rows,
      lazy expand to entries, disabled-with-hint unsupported filters, 404
      fallback, i18n en/es/ja, session pagination. Route: same writer.
- [x] T3 e2e: Playwright spec for grouped default + expand (modelled on
      `web/e2e/session-features.spec.ts`); run only if an isolated stack is
      available per web/README.md, else mark pending. Route: same writer.
      REOPENED 2026-09-22: isolated run (PB 8092 / Nuxt 3002) found a real
      regression: entry-detail.spec.ts, client-contact.spec.ts and
      session-features.spec.ts (:110, :281) assume a flat first row on
      /entries and time out under the new grouped default. Fix: shared
      `useFlatEntriesView` helper (localStorage '0' via addInitScript) in the
      per-entry specs; :110 rewritten to start flat then toggle. Route:
      delegated fix worker + re-run on isolated stack.
- [x] T4 verify + commits (one per work unit: T1, then T2+T3). Route: parent.

## Acceptance
- Fresh browser: Entries shows session rows, collapsed, totals equal to the
  totals endpoint's `groups` for the same filters; a session spanning >25
  entries is ONE row.
- Expanding shows every entry of that session; collapsing hides them.
- Flat mode still shows all filters and per-entry rows.
- vitest, typecheck, lint green; hooks tests green.

## Delivery
Forecast ~450-550 authored changed lines across web/. Two work-unit commits.
Strategy: `single-pr` (owner works locally, no PR/push in this workflow).
RDD: off (global), unmanaged.

## Progress / evidence
- T1 committed: 5056e0d feat(entries): server-side session totals for the
  entries screen's filters. Writer RED observed (10 + 2 failing), GREEN;
  parent spot check vitest 394 passed / 38 skipped, typecheck 0, hooks 101.
- T2 code review (parent): single `refresh()`; 404-only fallback; per-session
  cache cleared on reload; column headers consistent in all three modes.
  Minor: a stored flat preference causes one extra fetch on mount (toggle
  watcher). Not fixed.
- T3 first isolated run: entries-grouped.spec.ts PASSED; regression found in
  3 pre-existing specs (see reopen note). Full suite aborted at ~12 min due
  to those systematic timeouts. Owner's :8090/:3000 PIDs unchanged.
  Incident: `shoot()` overwrote 19 tracked web/docs/screenshots PNGs when
  Playwright ran from the repo's web/; reverted with git checkout.
- Unrelated work unit on this branch: df0a898 docs(site) "Better with
  Engram" upcoming section (site/ only).
- Native assess (before fixes): medium, 768 lines, RDD off → unmanaged.
- T3 closed: fix worker added `useFlatEntriesView` (web/e2e/helpers.ts) to
  entry-detail, client-contact, session-resume (same regression class, found
  by the full run) and session-features :281; :110 rewritten to start flat
  (page.evaluate, not addInitScript, which would re-force flat on reload) and
  filter by Máquina (server-groupable). Subset 36/36. Full suite on isolated
  stack: 98 passed, 3 failed, 13 skipped; the 3 failures are pre-existing
  data-only (agent-quality.spec.ts:36/:85 need seed.js opencode rows;
  polish.spec.ts:51 needs a populated unassigned queue) — verified via API on
  the copied pb_data, unrelated to this branch. Screenshots restored after
  each run; owner's :8090/:3000 PIDs unchanged.
- T4: parent spot check vitest 394/38 skipped, typecheck ok, site i18n ok.
  Commit e5095b6 feat(entries): open grouped by session, with server-side
  session rows (10 files).

## Next step
Owner reviews the grouped view on the live hub (no PocketBase restart needed:
the totals route already exists; Nuxt dev picks the page up). Then the
approved follow-up: Engram session narrative (backlog/engram-session-narrative).
Feature complete; no open task.

## Follow-up 2026-09-22 (owner screenshot): grouped layout unreadable
Reopened T2 (layout only): the grouped mode kept the flat header while session
rows were one run-on cell ("3 entradas Tiempo: 3m Coste: $0.87"), columns did
not align and the client avatar rendered as an empty circle. Fix: grouped mode
gets its own header (Inicio | Sesión | Cliente | Proyecto | Tarea | Entradas |
Tiempo | Coste | chevron) with right-aligned tabular numbers; expanded entries
render in a nested table (Inicio | Estado | Agente | Modelo | Tiempo | Coste)
inside a full-width row. Flat mode and fallback unchanged. Route: delegated
writer, then isolated-stack Playwright, then commit.
- [x] T2b grouped layout rework — commit 341f0f8. Owner follow-up folded in:
      Agent column on the session row (a session has one agent; "N agentes"
      otherwise), removed from the nested table. Isolated e2e: first run 35/36
      (session-features :110 asserted the old colgroup markup → adapted to
      session-group-row / session-entries-count testids); final run
      entries-grouped + session-features + smoke 10/10. Screenshots reviewed
      by the parent: columns aligned, nested table readable; the "empty
      circle" client avatar is the client's own white round favicon, not a
      defect. vitest 398 / typecheck ok / lint 0 errors.
