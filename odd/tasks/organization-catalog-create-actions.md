# Organization catalog creation actions

## Authorization and scope
Owner requests a creation button to the right of List/Grid controls in Organization's Clients and Projects tabs, matching Tasks. After focused clarification, owner selected **New project** for Projects; Clients uses **New client**. Preserve standalone catalogs, existing editors/handlers, localized labels, permissions, filter/view state, accessibility, and responsive layouts. No actual backend record creation, saving, status/archive/favicon/resume actions in verification.

Owner explicitly requests version **0.4.1**, commit and push. Include the previously authorized 83-file publication scope; do not publish its intermediate 0.4.0 candidate first. Existing main is `d030f860ffdc0197283bad534064c267b068ddb7`.

## Tasks
- [x] T1 (done): Observe meaningful tests RED, add embedded catalog actions matching Tasks, and observe focused GREEN.
- [x] T2 (done): Align root/public version at 0.4.1 without changing other metadata or private-preview settings.
- [ ] T3 (in_progress): Independently verify the combined candidate, commit with normal hooks, and push main safely; publish final closure.

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

T1 and T2 are complete. T3 transfers the exact combined candidate, performs fresh final checks, normal commits and guarded main push, while preserving the runtime uncertainty above.
