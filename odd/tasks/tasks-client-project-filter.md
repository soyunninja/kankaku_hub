# Tasks client and project filters

Goal: On `/tasks`, provide separate Client and Project selectors. Project choices narrow to the selected client's projects; clearing client restores all. If client changes, clear an incompatible selected project. Both filters constrain active board/list and completed server-paged history consistently. Preserve history search, pagination, totals and CRUD behavior.

Context: The existing project selector is incorrectly labelled with `projects.filterByClient` despite listing project names. A task relates to a project; that project relates to a client. History currently accepts a project ID in `listCompletedTasks`; client filtering must stay server-side so history page counts are correct.

Scope: tasks page, history query builder and focused tests/browser regression. No schema/sync/other-page change. Work on current dirty `feat/cache-hit-display` branch without overwriting pending Entries and cache-hit changes. No commit/push/deploy without request. Use bound PocketBase filter parameters; verify supported relation filter or explicitly scoped project IDs before implementation.

Checks: `pnpm --dir web test`, `pnpm --dir web typecheck`, `pnpm --dir web lint`, `git diff --check`, isolated browser :3002/:8092. Never write to :8090.

## Tasks
- [ ] T1 — Add dependent client/project selectors and consistent active/history filter with stale-project reset. Implemented and verified; work-unit commit pending explicit request.
- [ ] T2 — Add regression tests for history filter binding and UI behavior; run independent checks. Unit and isolated browser tests passed; work-unit commit pending explicit request.

## Progress
- Read-only mapping: `TaskRecord.project` is sole relation; `ProjectRecord.client` identifies client. Current active views filter by project; history is server-paged and filters by project/search. User selected Client + Project, not task-title selector.

- Read-only isolated PB :8092 check: bound `project.client = {:client}` returned HTTP 200 and 4 completed tasks matching sum across 3 client projects; no DB writes.
- Delegated implementation: two selectors in Tasks, client narrows project choices and active board/list, incompatible project is cleared before client update; history query includes bound relation filter with search/project, page reset and stale request guard; form defaults to available project.
- Independent checks: `pnpm --dir web test` 472 passed/38 skipped, typecheck passed, lint 0 errors/19 existing warnings, diff check passed. Isolated Playwright read-only Tasks filter spec 1/1 passed on :3002/:8092. Low-severity gap: E2E checks active row counts, not identities; race/create defaults not directly tested.

Next: owner review and explicit commit decision. No commit requested.
