# Feature: read-only `viewer` role and tightened write rules

Locator: `odd/tasks/viewer-role.md` (Engram topic `odd/viewer-role/tasks`,
project kankaku-hub). Branch: `feat/viewer-role` (from main cb4f5b2).
Created 2026-09-22. Owner: "fusiona y haz la migración del rol viewer".

## Objective
A `viewer` account can log into the hub and read everything but write
nothing, so a public demo instance (rich fictional seed) can be exposed
safely. Writes to `task_entries`/`work_records` are limited to `owner` and
`service` (kankaku's sync account); every other collection already limits
writes to `owner`.

## Facts
- `users.role` select values today: `owner`, `service` (1758300001); own role
  not self-editable (1758300017).
- `task_entries` (1758300005) and `work_records` (1758300006): createRule and
  updateRule are `@request.auth.id != ''` → ANY authenticated user can write.
  clients/projects/tasks/ignored_sessions: writes `role = 'owner'`.
- Hooks: totals + engram routes require auth only (viewer may read); favicon
  refresh is owner-only. task-inheritance / task-auto-doing are server-side.
- Web gates owner actions only in clients/index.vue (`isOwner`); projects,
  tasks, entries (assignment), sessions-without-task, unassigned expose write
  actions to any logged-in user (server would now 403 for a viewer).
- kankaku's sync client authenticates as the `service` account (docs/contract.md)
  and must keep create/update on task_entries + work_records.

## Tasks
- [x] T1 migration `1758300021_viewer_role_and_write_rules.js`: add `viewer`
      to `users.role`; task_entries + work_records createRule/updateRule →
      `@request.auth.role = 'owner' || @request.auth.role = 'service'`;
      reversible down(). Update docs/contract.md (service keeps write access;
      viewer read-only), README roles section if any, ADR 0029 (viewer role,
      why writes are owner|service), runbook "Demo instance" section (fresh
      dir + rich seed + viewer account + served web build), ESTADO.md (es).
      `scripts/isolated-stack.sh`: also create a `viewer` account
      (demo@kankaku.local / kankaku-demo-viewer) and print it. Writer A.
- [x] T2 web: `useAuth` exposes `isOwner`/`canWrite`; hide or disable every
      write action for non-owners: clients (already), projects (new/edit/
      archive), tasks (new/edit/status/board actions), entries
      (EntryDetailSheet assignment + task select), sessions-without-task
      (convert/attach/ignore), unassigned queue actions, settings actions if
      any; header shows a small "Solo lectura" badge for viewer (i18n es/en/
      ja). Pure helper `web/app/lib/roles.ts` with vitest. Playwright
      `web/e2e/viewer-role.spec.ts`: viewer logs in, sees data, sees no write
      controls, API create of a task_entry returns 403; owner still can.
      Writer B (after T1).
- [x] T3 verify on a fresh isolated stack (migration applied): API matrix
      viewer/owner/service × list/create task_entries + work_records + clients;
      web e2e incl. the new spec; hooks:test, vitest, typecheck, lint. Worker.
- [x] T4 commits (migration+docs; web) — parent. Merge is the owner's call.

## Constraints
Migrations are the contract (AGENTS.md); never hand-edit collections. Never
touch the owner's :8090/:3000/pb_data. Strict TDD for pure helpers. English
artifacts; ESTADO.md Spanish.

## Progress / evidence
- T1 5159b14. Fresh isolated PB 8092: migration applied (users.role values
  owner|service|viewer). API matrix: viewer GET task_entries 200; viewer POST
  task_entries 400 (rule mismatch shape); viewer PATCH entry 404 (PocketBase's
  updateRule-mismatch behaviour); viewer POST clients 400; service POST
  task_entries 200; owner PATCH 200; viewer POST /api/kankaku/totals 200.
  Accounts by isolated-stack.sh: owner, service, viewer (demo@kankaku.local).
  ADR 0029, contract.md, runbook "Demo instance", ESTADO.md updated.
- T2 5f81532: lib/roles.ts (9 tests), useAuth canWrite/isOwner, gating on
  clients/projects/tasks(+TaskDetailSheet)/entries(EntryDetailSheet)/
  sessions-without-task/unassigned, header "Solo lectura" badge, e2e
  viewer-role.spec.ts + VIEWER_* helpers. vitest 437 / typecheck / lint ok.
- T3 fresh isolated stack (rich seed, migration applied, 3 accounts): full web
  suite 132 tests → 116 passed, 2 failed (data-only: agent-quality.spec.ts:85
  hardcodes the standard seed's count; palette.spec.ts:47 types "Cajamar",
  which only the standard profile has), 14 skipped (favicon SSRF opt-in,
  Engram opt-in). viewer-role.spec.ts 15/15. Screenshot reviewed: viewer sees
  clients with no actions column, "Solo lectura" badge in the header.
  Owner's 8090/3000 untouched.
- Also on this branch: 95c4916 site analytics snippet (owner request).
- Follow-up idea (not done): make agent-quality/palette specs seed-profile
  agnostic (create their own fixtures) so the rich stack runs fully green.
- Branch feat/viewer-role: 3 commits over main cb4f5b2. Merge = owner's call.
