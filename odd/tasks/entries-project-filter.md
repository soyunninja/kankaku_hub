# Entries project filter by client

Goal: In Entries, selecting a client narrows the project selector to that client's projects; clearing the client restores all projects. If the selected project no longer belongs to the chosen client, clear it before fetching the next result set. Preserve both grouped and flat views.

Scope: Entries page and focused browser regression test only. No backend, schema, sync, other page filter, or catalog behavior change. Project relation is `ProjectRecord.client` and `useProjects().projects` contains the loaded catalog. Native Select does not clear an invalid model when options change.

Working tree: Continue on `feat/cache-hit-display`, already holding unrelated uncommitted cache-hit UI and owner files. Preserve them; no commit, push or deployment without explicit request. No new branch while that candidate remains dirty.

Checks: isolated browser on :3002/:8092 only, no live :8090 writes; `pnpm --dir web test`, `pnpm --dir web typecheck`, `pnpm --dir web lint`, `git diff --check`.

## Tasks
- [ ] T1 — Narrow project choices and clear incompatible selected project on client change, with browser regression for client switch/reset. Implementation and checks observed; commit pending explicit request.
- [ ] T2 — Independently verify filters in grouped/flat modes and run checks. Isolated browser and unit/type/lint checks observed; commit pending explicit request.

## Progress
- Read-only map completed: Entries page owns both filters; project selector currently lists all projects. Catalog records have `client` relation. A deep watcher on filters refreshes results; client/project selection is not URL-synced.

- Writer changed `web/app/pages/entries/index.vue` and added read-only `web/e2e/entries-project-filter.spec.ts`. `pnpm --dir web test` 471 passed/38 skipped; typecheck passed; lint 0 errors/19 existing warnings; diff check passed.
- Isolated browser :3002/:8092: first run timed out because the test selected a disabled empty-value placeholder rather than enabled All; fixed test selection to enabled option. Rerun grouped and flat 2/2 passed. No record mutations in spec; database state not separately audited.

Next: owner review and commit decision. No commit requested.
