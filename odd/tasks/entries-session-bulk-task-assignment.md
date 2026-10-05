# Entries session bulk task assignment

## Objective
When Entries is filtered to a session, let the owner select all visible/session entries or a subset and assign them to an existing task, or create a new task and assign them in one bulk action.

## Scope and constraints
- Primary surface: `web/app/pages/entries/index.vue`.
- Reuse existing task creation and task-entry assignment mechanisms where possible; do not change schema or backend contract unless exploration proves the existing `/api/batch` path is insufficient.
- Preserve existing single-entry detail assignment, session auto-expand behavior, flat/fallback behavior, filters, pagination, viewer role gating, and protected owner data.
- Bulk controls should appear only when a session filter is active and the user can write. Selection must not mutate hidden entries accidentally; if selecting all session entries requires fetching all matching ids, the UI must say so and do it deliberately.
- Technical artifacts and i18n keys in English/locales. No commit, push, or deployment without explicit owner request.

## Checks
- Focused lint for touched files.
- Focused unit/source tests for bulk selection/action contracts.
- Typecheck and `git diff --check`.
- Browser signoff over the running Tailscale dev server remains owner-observed unless safe automated auth is available.

## Tasks
- [ ] B1 — Complete read-only mapping of existing selection/bulk-assignment patterns and finalize exact UX/implementation scope.
- [ ] B2 — Implement session-filtered row selection and selected-count/action bar without breaking row open/toggle behavior.
- [ ] B3 — Implement bulk assign to existing task and create-new-task-and-assign flow, reusing batch/chunk behavior and refreshing entries/tasks.
- [ ] B4 — Add i18n strings and focused tests, then run lint/typecheck/diff checks.
- [ ] B5 — Verify or request owner visual/runtime signoff on `/entries` with an active session filter.

## Progress
- Owner requested bulk assignment from Entries after filtering by session, including selecting all or some rows and assigning to an existing/new task.
- Parent initial exploration found single-entry assignment in `entries/index.vue`, row-level `updateAssignment` in `useEntriesExplorer`, batch patterns in `useUnassignedQueue`/`useSessionsQueue`, and existing selection UX in unassigned and sessions-without-task pages.
- Read-only scout launched to map exact minimal edit surfaces and risks.

## Progress update
- Fixed verifier-blocking duplicate-task retry defect: `useTasks.create` now returns/preserves the created record if post-create catalog refresh fails, so bulk create-and-assign can keep/reuse the task id instead of creating duplicates.
- Parent validation passed: `pnpm --dir web exec vitest run tests/entries-session-auto-expand.test.ts tests/use-entries-explorer.test.ts tests/i18n.test.ts` (24 passed), focused ESLint + `git diff --check`, and `pnpm --dir web typecheck`.
- The worker command that included nonexistent `tests/tasks-page.test.ts` failed by path only; rerun used existing focused tests.

## UX refinement
- Owner found the inline bulk toolbar confusing. Refine to a simpler toolbar with selection/count plus primary actions opening focused dialogs: assign to existing task, create task and assign. Keep select visible/all-session/clear actions clear and secondary.
- Implemented focused assignment/create dialogs with selected counts, labeled fields, cancel and count-specific confirmation. Removed inline fields and redundant clear-visible control.
- Partial results switch to the assignment dialog with only failed IDs and the created task retained; complete success closes the dialog. Filter/write-permission changes close stale dialogs.
- Strict TDD: new toolbar/dialog contract failed on inline `<Select>` before implementation; all 25 focused tests passed afterward. Focused ESLint and Nuxt typecheck passed. Browser layout, focus and live authenticated interaction still require owner signoff; existing checklist preserved.
