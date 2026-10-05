# Recover the Unassigned queue from load failures

Goal: The Sin determinar queue must not spin forever or show a false empty result when catalog loading, server group loading, or the 404 fallback fails. Show a localized, accessible error with retry. Page changes and refreshes after assignment must not present stale groups as the requested page. Keep the existing totals-404 fallback and D6 aggregation boundary.

Scope: `web/app/pages/unassigned/index.vue`, localized messages in `web/i18n/locales/{en,es,ja}.json`, and a fixture-free focused browser regression in `web/e2e/unassigned-load-recovery.spec.ts`. Preserve all unrelated dirty changes and the staged Claude SVG. Use only an isolated stack; no personal PocketBase, schema/sync changes, screenshots, build, commit, push or deployment without explicit request.

## Tasks
- [ ] T1 — Add a deterministic browser regression for a failed queue fetch, visible retry, and successful recovery. Implemented; isolated browser RED: targeted totals 503 left three skeletons and no error alert after 5 s, with unhandled ClientResponseError. Commit pending.
- [ ] T2 — Add robust loading/error/retry state for catalog, totals and fallback; make page navigation coherent on errors and protect assignment refresh. Implemented. The first GREEN attempt exposed an ambiguous E2E alert locator, which was scoped to the message; focused isolated Chromium now passes both 503 general and 404→503 fallback/retry cases (2/2). Commit pending.
- [ ] T3 — Independently verify focused browser and integrated tests, record limitations and commit status. Isolated Chromium 2/2 recovery plus Spanish queue regression 1/1; unit 483 passed/38 skipped; typecheck/diff/LSP clean; lint 0 errors/23 warnings. Commit pending.

Verification notes: RED before implementation: targeted totals 503 left three skeletons and no error/retry. Initial GREEN run failed because an E2E alert locator also matched an empty live region; after narrowing it to the actual message, both general 503 and totals 404→fallback GET 503/retry scenarios passed. No fixture writes/screenshots. Catalog failure, pagination failure, assignment refresh and expansion loading were not browser-tested. An existing last-page-underflow after assigning all rows on the last page and expansion/assignment-progress failure paths remain separate follow-ups. The isolated :3003/:8093 stack was stopped without purging evidence.

Commit: pending explicit authorization; checkboxes remain open until reviewable work unit committed. Rollback boundary: only queue page failure handling, locale messages, and focused regression. No build/push/deploy.
