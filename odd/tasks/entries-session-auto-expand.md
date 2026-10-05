# Entries session auto-expand

## Objective
When a user selects a session marker in Entries, filter to that session and show its nested entries expanded immediately in the primary grouped mode. Repeated selection of the same session keeps it open; the explicit row toggle can still collapse it.

## Scope and constraints
- Edit `web/app/pages/entries/index.vue` and focused tests under `web/e2e/entries-grouped.spec.ts` or `web/tests/` only. Preserve its existing uncommitted filter labels, client avatars and card spacing, Engram narratives, pagination, fallback and flat-mode behavior.
- Primary grouped mode: record session-selection expansion intent, refresh filtered sessions, expand matching returned row and lazily fetch entries. Avoid stale asynchronous refreshes opening a different session or publishing obsolete rows; repeated click on already-filtered session should ensure open without toggling closed.
- Flat mode and grouped fallback have no collapsible nested rows: keep filtering behavior without inventing expansion UI. Clearing session filter cancels pending intent. Do not change backend endpoints or schema.
- No E2E writes on owner's local :8090/:3000. Browser verification requires isolated stack or authenticated owner review.

## Execution and checks
- TDD: no explicit strict-TDD setting found; ordinary checks. Focused runners: `pnpm --dir web exec eslint app/pages/entries/index.vue e2e/entries-grouped.spec.ts`, `pnpm --dir web exec vitest run tests/entries-session-group.test.ts tests/entries-session-filters.test.ts`, `pnpm --dir web typecheck`, `git diff --check`. E2E only on an isolated seeded writable stack, not owner ports.
- Forecast below ~150 authored lines; ask-on-risk strategy. No commit/delivery without explicit owner request.

## Tasks
- [x] E1 — Implement filter-and-ensure-expanded in primary grouped mode with stale-refresh protection and idempotent same-session selection. Route: delegated bounded writer. Acceptance: nested entries appear after session filter, toggles still work, flat/fallback unchanged.
- [x] E2 — Add focused regression coverage and run lint/unit/typecheck; independent risk-gated check. Route: same writer self-check then verifier per native assessment.
- [x] E3 — Inspect authenticated local interaction or isolated E2E where safely available, report visual/runtime limitations. Route: parent/owner signoff.

## Progress
- Read-only mapper identified `SessionMarker` stops click propagation; `filterToSession` only set filter and `loadSessions` cleared expansion.
- E1 implemented by bounded writer: pending session intent, idempotent same-session ensure-open, filtered grouped-row expansion/lazy fetch and stale-generation guards. Flat/fallback remain filter-only.
- E2 in progress: writer reports ESLint, focused unit tests (26 passed), typecheck/diff check passing; E2E scenario added but not run against owner ports. Parent spot-checked typecheck/diff check. Native assess unassessable due unrelated untracked paths; independent verifier found no concrete implementation race defect but identified E2E defects: marker selector depends on narrative-replaceable session name, and the single-session fixture cannot prove filtering. Correct E2E to select by stable session id and include a second same-machine session before filtering. Unit harness does not mount Vue/watchers.
- E2 corrected: E2E selects by stable accessible session ID and uses two same-machine sessions to assert filtering from two rows to one; active filter and nested entries asserted. ESLint, Playwright discovery, typecheck and diff check passed. Independent review found no implementation race defect; unit harness lacks mounted Vue watchers.
- E3 isolated browser E2E passed (1 Chromium test, 10.7s) on newly seeded :3003/:8093. The isolated stack was shut down without purge; owner's :3000/:8090 and pre-existing :3002/:8092 were untouched. Disposable fixture deletion responses were not independently verified. Owner's authenticated visual signoff is still separate.
- Existing Entries labels/avatars/padding preserved. Other page/design visual signoffs remain separate.

## Next step
Ask owner to refresh `/entries` and confirm the filtered session opens as expected. Keep changes uncommitted until explicitly authorized.
