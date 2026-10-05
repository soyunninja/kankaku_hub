# Merge hub 0.4.0 into main

## Authorization and acceptance
Owner requested merging branches into main and pushing. After inspection, owner explicitly selected the three pending functional branches: `feat/card-contained-form-backgrounds`, `feat/tasks-active-history`, and `feat/taskless-session-details`. Exclude `backup/feat-cache-hit-pre-npm-rebase-20260926` and all other branches. Preserve all primary-worktree dirty/untracked files and existing worktree metadata; no cleanup, reset, force-push, history rewrite, tag, npm publication, or deployment.

The verified release commit is `8857e811405c5b146b7e42eaad815a30fda0adb6`; current main is `237fee20db9ad989263118d906987fe965aee9c3`. Final main must contain all three selected branch tips without regressing root/public version 0.4.0 or the verified Organization ownership/routing/UI behavior.

## Tasks
- [x] T1 (done): Map selected branch ancestry, genuinely additional changes, conflicts, remote/worktree state, and narrow implementation surfaces.
- [ ] T2 (in_progress): Integrate selected branches sequentially in an isolated same-clone worktree; resolve only mapped conflicts and preserve verified release behavior.
- [ ] T3 (pending): Independently verify the integrated candidate and normal commit hooks; record actual results, skips, and integration commits.
- [ ] T4 (pending): Advance main safely and push origin/main without force; verify remote identity and preserve unrelated local work.

## Execution safeguards
Single source writer. Main-primary worktree stays untouched except orchestrator task bookkeeping. Read-only mapping first; parent derives exact allowed edit surfaces before a worker. Do not prune stale worktree registrations or touch their directories. Inspect/fetch remote state before updating main; stop on unknown remote changes rather than overwriting them. Integrate on a feature branch rooted at main, not by changing dirty current files. Worktree isolation is sequential, not parallel write authorization.

Existing 0.4.0 evidence: isolated typecheck exit 0, 317 focused and 844 full tests passed, 38 live-backend tests skipped; earlier 89 UI browser checks passed. These are not evidence for yet-unexamined older-branch additions. Re-run proportionate integrated checks after source changes. Native review follows the user-owned switch, currently off; do not invent approval or bypass normal Git hooks. No test weakening, backend mutations/fixtures, private preview restart/reconfiguration, or dependency installation.

## T1 mapping and adopted integration strategy

Read-only verifier `muvb3qwg-28-lfb0` established that historical task tip `8c9343cfd76517a6e6b94fc9e442d5a2b3bd11fc` is an ancestor of taskless tip `87c91ec42bf3ef803de01a6f68e5862cb7b36bf3`. All seven older non-merge changes have patch-equivalent commits already in main. All 20 paths in the old taskless feature delta have identical blobs at its original tip and rebased equivalent `f8bdcab`, which is already an ancestor of main. No additional behavior or tests were identified.

Parent adopts an ancestry-only `ours` strategy merge of taskless after fast-forwarding the isolated integration branch to verified release `8857e81`. This deliberately records already-integrated history; it is not permission to discard unknown changes or a blanket conflict resolution. Before staging bookkeeping, its tree must equal the verified release exactly. All three selected tips must become ancestors. Final source/test/configuration blobs must remain identical to the verified release; any allowed additional files are task bookkeeping only.

Fetch succeeded from configured origin `github.com:soyunninja/kankaku_hub`. Remote FETCH_HEAD, origin/main, and local main all remained `237fee20db9ad989263118d906987fe965aee9c3`. Parent created sequential same-clone worktree `/var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/kankaku-hub-main-integration.vn8bk5hw/worktree` on `feat/merge-hub-0.4.0-to-main`, rooted at main. Primary dirty/untracked files and stale historical worktree records are untouched.

No behavior change means no meaningful new behavioral RED; proportionate integration verification is structural identity/ancestry proof plus retained functional evidence for identical source. Normal commit hooks still execute without bypass. Main/push remain pending.

## Prepared integration and hook configuration

The isolated branch fast-forwarded to `8857e811405c5b146b7e42eaad815a30fda0adb6`. The explicit `git merge --no-ff --no-commit -s ours 87c91ec42bf3ef803de01a6f68e5862cb7b36bf3` completed without conflicts. Before adding task records, its index tree equalled the verified release tree exactly and its working/index source diff was empty. MERGE_HEAD is the selected taskless tip and contains the selected history tip.

Final integration differences from release are limited to two parent-owned ODD records: this integration ledger and the previously observed release-commit closure. No application, test, schema, packaging, or public/private configuration blob changes. The retained release checks therefore apply to identical functional inputs; independent post-commit structural verification will prove this and selected-tip ancestry.

Installed `/opt/homebrew/bin/gga` discovers the project config from CWD-relative `.gga` (lines 295–299) and validates provider configuration before reviewing files (lines 785–793). Parent copies the already-used primary config byte-for-byte into the isolated worktree as an **untracked** runtime file so the ordinary hook uses the same provider/settings; the original is not changed and neither copy is staged. This is not a hook bypass or a new provider configuration.
