# Taskless session details

Objective: Make a session row in `/sessions-without-task` open a right-hand detail sheet, analogous to the entries view, and enrich the existing local test row with fictional details.

Problem: The queue currently shows only a session summary and actions. A user cannot inspect its underlying entry details from that page. The local test row `cjm6jzr5x8ovvf6` has deliberately minimal metadata.

Scope: The taskless-session queue UI and focused tests; one existing record in local PocketBase `127.0.0.1:8090`. No changes to schema, aggregation, auth, public demo, or unrelated avatar/favicon work.

Constraints: Keep one row per session. For multi-entry sessions show a session summary and an explicit entry list/selection, never silently pick one. Reuse the entry detail presentation where practical, and never aggregate raw `work_records`. Preserve checkbox/menu actions, keyboard access, viewer read-only behavior, focus and error states. Test data stays fictional, visibly marked, taskless, and assigned to `Sin determinar`; metrics must be coherent and modest. Do not commit or publish without explicit user request.

Route and checks: Delegated writer for multi-file UI work (4-file mapping and multi-file write triggers). TDD mode not established in this session; ordinary focused checks via `pnpm --dir web test`, `pnpm --dir web typecheck`, `pnpm --dir web lint`, with browser interaction if feasible. Independent verification follows native assessment (RDD off). Estimated authored diff: ~250–350 lines; delivery strategy ask-on-risk.

## Tasks
- [x] T1 — Enrich the one local test row. Verified exact id/session/client/task before PATCH; updated fictional name, prompt, model, repo label and coherent 60s wall / 10s waiting / 50s work metrics, 150 input / 90 output tokens, cost 0. Readback verified unchanged client/task identity. Route: inline data operation. No repository commit: database-only operation.
- [x] T2 — Add accessible session detail sheet to the taskless queue, with explicit entry selection and detailed entry view; add focused behavioral coverage. Route: delegated writer. Focused E2E/unit/type/lint passed. Work-unit commit `0f5602f` (feature plus tests/docs); avatar support committed separately as `a198830`.

## Progress
- Exploration complete: `useEntriesExplorer` already supports listing by `session_id` and loading entry detail; `/entries` owns the existing `EntryDetailSheet`.
- Existing unrelated uncommitted avatar and public asset changes predate this feature and were left untouched.
- T2 implementation: `TasklessSessionDetail.vue` loads session entries; one entry opens existing `EntryDetailSheet` immediately, multiple entries require selection and support Back. A semantic session-name button opens it by keyboard; row click works by pointer without hijacking checkbox/menu. Localized labels in en/es/ja. No raw-record aggregation.
- Verification: writer `pnpm --dir web test` 439 passed/38 skipped; typecheck passed; lint 0 errors/19 existing warnings. Independent verifier ran focused Chromium E2E on isolated PB :8092/Nuxt :3002: 1 passed. First E2E attempt was blocked by missing `E2E_ALLOW_PB_WRITES`; opt-in set for isolated target only. The isolated server was synced with the exact changed page/component/locales before test. No E2E writes on :8090. `git diff --check` passed. Native `assess` was unassessable because unrelated untracked files require explicit declaration, so independent verification was used. Full E2E suite not run.

Next: integrate with feat/tasks-active-history, run combined checks, then build the static Nuxt app. Static PocketBase :8090 still serves the older build until generation.
