# Organization catalog creation actions

## Authorization and scope
Owner requests a creation button to the right of List/Grid controls in Organization's Clients and Projects tabs, matching Tasks. After focused clarification, owner selected **New project** for Projects; Clients uses **New client**. Preserve standalone catalogs, existing editors/handlers, localized labels, permissions, filter/view state, accessibility, and responsive layouts. No actual backend record creation, saving, status/archive/favicon/resume actions in verification.

Owner explicitly requests version **0.4.1**, commit and push. Include the previously authorized 83-file publication scope; do not publish its intermediate 0.4.0 candidate first. Existing main is `d030f860ffdc0197283bad534064c267b068ddb7`.

## Tasks
- [x] T1 (done): Add embedded catalog actions matching Tasks; observe focused GREEN and meaningful post-implementation old-page regression sensitivity (not historical test-first RED).
- [x] T2 (done): Align root/public version at 0.4.1 without changing other metadata or private-preview settings.
- [x] T3 (functional release done): Independently verify the combined candidate, commit with normal hooks, and push main safely. Documentation checkpoint publication and primary synchronization were completed at `344d645fa39d8b6ff92d6aeb87bde57a6f900911`.

## Allowed implementation surfaces
- `web/app/pages/clients/index.vue`
- `web/app/pages/projects/index.vue`
- `web/tests/clients-page.test.ts`
- `web/tests/projects-page.test.ts`
- `web/tests/organization-create-actions.test.ts` (new mounted renderer regression if needed)
Parent owns version/bookkeeping; no additional source areas without evidence.

## Baseline already observed, not final verification
Verifier `muvdpb3i-2d-05gx` completed old 83-file baseline: typecheck0, focused324, full851/38skip, manifest12 (three loopback cases), hooks155, seed19; twelve Dashboard browser cases, one card structural case, six alternative HTTPS card cases, one health check. All source/cache/index invariants held. The authored six isolated card browser cases remained unrun because ports3003/8093 were unavailable; alternative owner-authenticated read-only coverage is distinct from VIEWER fixtures.

The hash incident was a unit mismatch: staged entry stream afb16881... versus binary index8d569db6...; both independently reproduced. No candidate content drift. Earlier external harness setup errors were not application RED. New buttons/version still require fresh checks.

## Execution discipline
One bounded writer on primary feature branch; all unrelated audited local changes preserved. TDD execution uses fresh external source/dependency copies with direct Node entrypoints, unset NODE_PATH/JITI_FS_CACHE=false, Nuxt type preparation before collection, and no cache writes through original dependencies. No install, original process/preview/Tailscale reconfiguration, real backend fixtures/mutations, renderer executions, reset/stash/delete/prune/force, hooks bypass, tag, npm publication, or deployment. Parent transfers only observed changed surfaces to the isolated publication candidate after writer completion.

## Partial implementation and verification routing correction

Worker `muvezcl2-2e-jcr1` changed only Clients/Projects templates and new `organization-create-actions.test.ts` with eight mounted actual-SFC cases. Embedded creation actions follow the List/Grid controls in a wrapping row, standalone header actions remain standalone-only, and existing `openCreate`/dialogs/save handlers, localization, Plus styling, and `canWrite` guards are retained. Whitespace/index/ref checks passed; primary index stayed empty at release8857.

**No test command ran. Neither historical RED nor GREEN was observed.** Tests were authored first but application changes followed without executing them because the writer's higher-priority exact-source restriction prohibited external test setup writes. This is a test-first workflow shortfall, not completed TDD. T1 remains in progress and the eight cases remain unverified.

Parent routes executable checks to the independent verifier role, which permits external test artifacts without application writes. A pre-change two-page fixture can establish regression sensitivity after the fact, then the same tests run against current pages. This is explicitly post-implementation RED/GREEN evidence, not a claim that RED preceded implementation. Setup/collection errors are not meaningful RED. Any failing current behavior or test harness requires a bounded correction before completion.

Native ASSESS remained unassessable due undeclared untracked scope, RDD off/unknown, runtime small profile; its plan requires independent verification. No native approval, version bump, commit, or push has occurred for this new unit.

## Observed regression-run blockers and bounded correction

Verifier `muvf6hnw-2f-78pt` executed prepared external fixtures. Pre-change: 31 passed/8 failed; current:30 passed/9 failed. All eight new cases failed inside the renderer before mounting, with `SyntaxError: Arg string terminates parameters early` at line32. The helper spreads the entire Vue namespace into generated function parameter names; selecting only valid required auto-import globals is necessary. These eight failures are harness failures, **not meaningful behavior RED**.

Current source also invalidated `projects-page.test.ts:164`'s brittle count of literal `v-if="canWrite"`: the creation guards now additionally contain embedded conditions. Replace the literal count with explicit creation/menu permission coverage, retaining the permission invariant rather than merely lowering a count.

Retained logs: `/var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/kankaku-organization-regression-v5d0q4to/`. Pre-change source blobs and current test/source identities were proved; primary source/cache/index/refs were unchanged by testing. No current GREEN or historical test-first evidence exists yet.

Parent routes a bounded test-only correction plus the authorized root/public version 0.4.1 metadata update to one writer. Application button templates stay unchanged. Then independent execution repeats the same pre-change/current tests and version guard; T1 and T2 remain incomplete until observed checks pass.

## Observed focused GREEN, version check, and runtime scope

Verifier `muvfjbff-2h-xobg` prepared a fresh independent fixture. Pre-change source: **37 passed / 3 failed**; current source: **40/40 passed**, no skips. Two mounted embedded-writer assertions rejected the old pages because the creation button was not the List/Grid group's next sibling; the third failure was explicit creation-guard coverage. All eight mounted action cases reached their assertions and passed on current source. This is meaningful **post-implementation regression sensitivity**, not historical test-first execution.

Current typecheck passed. Root/public versions are both **0.4.1**, with other metadata/private preview configuration preserved. Tests prove mocked writer/viewer and embedded/standalone behavior, uniqueness, enabled action, wrapping classes, dialog opening and no premature mocked creation. Real saves/backend ACLs and rendered mobile geometry are not established by these mounted tests; final browser checks follow.

Artifacts: `/var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/kankaku-organization-regression-corrected-3rfulvqw/`. Source, metadata, index/refs, original caches and earlier artifacts were unchanged by verification. The only status inventory change was excluded `.kankaku/inflight/75019.json`.

Parent separately reconciled that runtime observation read-only against prior diagnosis (Engram4080) and `docs/architecture/kankaku-extension.md:48,66`: inflight records are crash-recovery/lifecycle state. The same path previously appeared/disappeared. Exact removal cause remains unattributed; no byte-level guarantee for all private dynamic runtime files is claimed. No restoration, deletion, cleanup or original runtime change is performed. This outside-candidate inventory fluctuation is retained as a limitation, not treated as evidence of source damage; verified source/metadata/cache identities remain intact.

T1 and T2 are complete. At this historical checkpoint, T3 still required exact combined-candidate transfer, fresh final checks, normal commits and guarded main push, while preserving the runtime uncertainty above.

## Final functional closure — Organization actions in 0.4.1

**T1–T3 functional work is complete.** Root/public **0.4.1** and the embedded New client/New project actions shipped with all 89 authorized project paths in work unit **`2e0a6edae5cc794bba1a4cff9eff3fea5bc48aff`** (`feat: release dashboard and catalog updates in 0.4.1`). Parent observed a successful guarded normal fast-forward push and fresh local main = origin/main = GitHub main at that commit. Full publication/integrity/incident evidence is canonical in [Publish all remaining local project changes](publish-all-local-changes.md#final-functional-closure--041-published-to-git-main).

Final independent verifier `muvk3cki-2j-siub` observed preparation/typecheck exit 0, focused 332 across 21 files, full 859 passed / 38 live-configured skipped across 64 files (one skipped file), manifest 12, hooks 155 and seed 19. Earlier corrected mounted coverage passed **40/40**; old pages produced **37 pass / 3 meaningful failures** after implementation. Historical renderer failures and the missing pre-implementation RED remain recorded above; this is not a retroactive TDD claim.

Twelve rendered Organization checks covered light/dark at 320/390/1280 widths, embedded/standalone writer/viewer UI interception, immediate List/Grid-group DOM sibling placement, actual desktop rightward/mobile wrapping rectangles and overflow, unique enabled writer action, existing dialog opening/Escape, unchanged search/view/client filters and standalone heading/header actions. No Save or business-record creation was invoked; viewer UI checks do not establish backend ACLs. An initial external driver had 6 pass / 6 fail from the wrong nearest-DIV/H1 assumption; retained traces and a separate header-ancestor driver document all 12 passing without repository test weakening.

Together with Dashboard 12, alternative HTTPS Card 6, health 1 and original card structure 1, there were **32 distinct browser checks**. The six authored isolated Card cases remain unrun because 3003/8093 were unavailable, with guards unchanged. Live PocketBase cases lacked the configured URL; no backend fixtures were written. Exact 89-path hashes/modes and 683 indexed identities matched. The original final-proof exit 1 remains preserved; separate read-only telemetry diagnosis cleared its worklog-protection blocker without rerun, rebaseline or private runtime repair. Dynamic private-runtime byte immutability and exact old inflight-removal attribution are not claimed.

Normal GGA 2.10.1 Codex hook passed for three static TypeScript files, not Vue/tests. RDD was off; native ASSESS was unassessable and independent high fallback verification was satisfied, not native approval. No build/pack/npm publication/tag/deployment, real Save/backend viewer ACL, physical-phone/accessibility audit or reboot is claimed; production integration remains separately blocked.

**Observed delivery complete:** functional main publication at `2e0a6edae5cc794bba1a4cff9eff3fea5bc48aff` was followed by normal documentation checkpoint commit/push `344d645fa39d8b6ff92d6aeb87bde57a6f900911`, confirmed on fresh GitHub main. Parent verified 683 tracked blobs/executable modes and 90 source-compatible staged paths, then successfully switched primary normally to main at that checkpoint with clean index and tracked working tree. Excluded private runtime files remain preserved and dynamic. Publication of this subsequent passive status update is not claimed here.
