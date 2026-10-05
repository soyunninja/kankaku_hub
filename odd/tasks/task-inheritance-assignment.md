# Keep inherited task entries in their task's client and project

Goal: On `task_entries` create, when an entry inherits its session's one unambiguous task and currently points to the `clients.unassigned` row, also set `project` to the inherited task's project and `client` to that project's client. An entry with its own non-unassigned client keeps its client/project unchanged; explicit tasks, ambiguous sessions and updates retain their current behavior. A failed lookup must not block measurement writes or undo task inheritance.

Scope: `pocketbase/pb_hooks/task-inheritance.pb.js` and a focused Node hook test under `pocketbase/pb_hooks/lib/`. Do not change migrations, sync, other hooks, or unrelated dirty files. No commit, build, pack, push or deployment. Preserve the staged Claude SVG.

## Tasks
- [x] T1 — Add a hook-level regression for unassigned client/project inheritance and explicit-client preservation. Node VM hook test RED (1 failed/3 passed): inherited `task1`, but project remained `''` instead of `project1`; client assertion not reached. Committed with T2 in `83431d2`.
- [x] T2 — Resolve task→project→client only on inherited-task creation with unassigned client, preserving failure behavior. Independent focused VM hook/rule GREEN 8/8, own-client/project unchanged and failed lookups retain inherited task. Committed in `83431d2`.
- [x] T3 — Independently run focused/full hook tests and relevant checks, read back the scoped diff. Full hook suite 155/155 passed (5 VM tests, 8 cases); both syntax checks and scoped whitespace checks passed. Real PocketBase/Goja integration not run. Commit `83431d2` contains exactly the hook and its test.

Verification notes: RED before implementation inherited `task1` but left `project: ''` (1 failed/3 passed). GREEN after implementation passed 8/8 focused rule/hook tests, then 155/155 full hook tests after adding explicit-task and failed-client lookup cases. No migrations or other hooks modified. The separate staged Claude SVG and unrelated untracked migration remain untouched. A real PocketBase/Goja integration test was not run.

Commit explicitly authorized in the follow-up: `83431d253fc0dda7287a5d8b4b9b59586a4f8139` (`fix(hub): inherit task project and client for unassigned entries`). It includes only the hook and focused test. This tracking note remains untracked; the previously staged Claude SVG and other dirty changes were excluded. Rollback boundary: this one commit (hook and focused test).
