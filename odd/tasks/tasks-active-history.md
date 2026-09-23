# Active tasks and completed history

Objective: Keep `/tasks` usable after months of growth: show open/doing work by default, provide a searchable/project-filtered paginated history for done tasks, and fetch every page of per-task totals.

Problem: Board/list currently render every task including done; the task totals route reads only the first 200 groups. PocketBase `getFullList(... perPage: 500)` automatically pages, so 500 is not a hard cap, but shared task state still loads all records for selectors elsewhere.

Scope: Task page UX and page-specific history query; per-task totals pagination; locale strings and focused tests. Preserve shared `useTasks` semantics, task assignment selectors, existing CRUD/detail behavior, and D6 aggregation from `task_entries` only. No schema migration or archived status.

Constraints: Default active view includes open and doing, not done. Completed history is explicitly accessible, server-paged, searchable by title and filterable by project with escaped PocketBase filters. Search changes reset the page; empty/loading/errors and viewer read-only controls remain correct. Totals load all server groups, not just first 200; 404 fallback remains bounded and visibly warns when truncated. Existing unrelated uncommitted source changes are isolated in the original worktree. Do not commit or publish without explicit user request.

Route and checks: Read-only mapping delegated (4+ files); multi-file writes delegated to one worker sequentially. TDD mode not established in this session; ordinary tests. Runners: `pnpm --dir web test`, `pnpm --dir web typecheck`, `pnpm --dir web lint`, focused Playwright if isolated target can be provisioned. Estimated authored diff ~300–400 lines. Delivery strategy ask-on-risk. Worktree `../kankaku-hub-tasks-history`, branch `feat/tasks-active-history` from main dcf01ef.

## Tasks
- [x] T1 — Add active-by-default board/list and completed history with bound search, project filter and server pagination. Focused E2E/unit/type/lint checks observed; work-unit commit `3faf18b` (cohesive scalability slice with T2).
- [x] T2 — Fetch all paginated task totals groups, preserving D6 and fallback semantics; test >200 groups and no duplicates. Empty `total_pages: 0` regression and checks observed; work-unit commit `3faf18b` (same cohesive slice).

## Progress
- Exploration: `/tasks` has board/list, project-only filter, all statuses visible. Shared `useTasks` loads all tasks for other consumers; do not narrow it. Totals response has `totalPages` and `page`, so no hook change is expected.

- T1 implemented by delegated writer: board/list exclude done, compact completion drop target, keyboard completion focuses history control, history uses server `getList` 25/page with PocketBase bound filter and current project filter, reset/race/error states, en/es/ja labels. Initial `pnpm --dir web test`: 439 passed/38 skipped; typecheck passed; lint 0 errors/19 existing warnings; `git diff --check` passed. Focused E2E later passed (see below). Shared `useTasks` remains unchanged.

- T2 implemented: `task-totals-pages.ts` accumulates all group pages before publishing maps, skips the no-task bucket, handles duplicate keys and invalid pagination, accepts PocketBase's empty `total_pages: 0` response. Bounded 404 fallback unchanged. `pnpm --dir web test`: 447 passed/38 skipped before the empty-page fix; focused post-fix test 10 passed, typecheck passed, lint 0 errors/19 existing warnings, diff check passed.
- Independent E2E on disposable :8092/Nuxt :3002 with exact changed modules synced: history search/reopen 1 passed, keyboard completion 1 passed. First independent review found empty-page bug; corrected and focused regression passed. Full E2E suite and project-filter browser coverage not run.
- Known scope limitation: shared `useTasks` and command palette still load all tasks for selectors, including done; this feature bounds history rendering/query but not global catalog transfer. Changing the shared catalog would be a separate cross-screen design.

- Independent post-fix verification: `pnpm --dir web test` 449 passed/38 skipped; typecheck passed; lint 0 errors/19 existing warnings; `git diff --check` passed. Parent spot check: task-totals-pages focused Vitest 10/10 and diff check passed. Native assess unassessable because untracked files require explicit declaration; RDD off, independent verifier used.

Next: merge feat/tasks-active-history into feat/taskless-session-details, verify combined candidate, and generate static build. Owner authorized commits and merge; push remains a separate decision. No source changes in the original worktree before merge.
