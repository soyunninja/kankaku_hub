# Task detail page visual alignment

## Goal and authorization
The owner requests task detail pages match the accepted client/project detail styling. This is presentation-only authorized refinement; preserve canonical nested task URLs and compatibility redirects, all ownership guards, editing/status/session/resume/cache behavior and project/client UI.

## Exploration and decision
Read-only scout muv6kgoc-1s-hov2 found pageMode currently changes only drawer padding/title semantics (TaskDetailSheet.vue:163–171), not page hierarchy. Nested task wrapper :67–79 still uses max-w-4xl and a separate Back row; accepted client/project pages use full available width, gap-6 and an inline Back/title/context header with text-xl font-semibold tracking-tight. Session disclosures remain the task-specific content. Use the project page as the visual reference, not the client sidebar/analytics layout. No new chart, KPI, sidebar, data reads or product feature; no unresolved product decision.

## Acceptance
- Task page uses w-full min-w-0 and consistent gap-6 without max-w-4xl, mobile overflow safe.
- Inline accessible Back to actual owning project with h1 text-xl font-semibold tracking-tight, existing project context/status/actions readable and responsive.
- Page-mode sessions have clear section heading/spacing and cards matching established project task-card background/border/radius/padding language.
- Drawer callers preserve their current wrapper padding, heading size/semantics and session-row styling through pageMode conditionals.
- Project detail task cards use the same Badge success variant as active client project cards ONLY for status doing (localized En curso); every other status remains outline. No global badge or task-detail status changes.
- No changes to task/project/client identity, permission/ownership checks, live editor authorization, pending-cache retirement/completion identity, session/resume actions, metrics periods, data reads or D6.

## Constraints
One source writer, preserve unrelated dirty/untracked work and historical external artifacts. No commit/staging/deployment/backend or fixture writes/dependencies/config/process/Tailscale changes/deletion/TLS bypass. No actual Save/archive/status/favicon/resume executions. Read-only totals/auth-refresh requests allowed. Mutation-bearing E2Es must not be executed. English technical artifacts, localized UI text follows existing locales.

## Tasks
- [x] T1 (done): Align only task page-mode header, layout and session cards with applicable test-first regression checks; preserve drawer presentation and behavior.
- [x] T2 (done): Independently verify styling, responsive light/dark layout, drawer preservation and existing functional routing/ownership/session behavior.

## Allowed edit surfaces
- web/app/pages/organizacion/clientes/[id]/proyectos/[projectId]/tareas/[taskId].vue
- web/app/components/tasks/TaskDetailSheet.vue
- web/tests/task-detail-page.test.ts
- web/tests/task-detail-presentation.test.ts
- web/e2e/organization-child-details.spec.ts
- web/app/pages/organizacion/clientes/[id]/proyectos/[projectId]/index.vue
- web/tests/project-detail-page.test.ts

## Verification plan
Existing independent baseline: 268 focused tests/13 files, full 829 passed/38 skipped, typecheck and 75 trusted HTTPS Organization browser cases. Add executable presentational regressions; observe meaningful RED before source edits (computed browser/header/full-width/session-card styles or actual SFC markup semantics/classes as applicable), then GREEN. Validate desktop/mobile/long title/light/dark and unchanged drawer separately from page mode. Preserve all current tests/browser cases and role/ownership mocks; no actual backend mutation. Writer focused relevant suites including task-page/presentation/controller/project/client/organization/callers/headers/session-count tests, typecheck, full Vitest, read-only organization-tabs and organization-child-details specs with fresh external mktemp artifacts. Native ASSESS after writer, follow independent verification plan; no approval/receipt invented. RDD last observed off. Do not run generate/build/install or restart preview.

## Existing preview
https://macbook-air.tailef2f3.ts.net:8443; no preview/process/Tailscale changes. Use trusted TLS, never ignore certificate errors. Preserve all historical artifacts; no overwrite or cleanup.

## Limits
38 live-configured tests remain skipped unless their external configuration already exists. Intercepted viewer tests establish UI guards, not backend ACLs. Bounded session reads remain nontransactional. Runtime .kankaku inflight inventory can change independently; exact earlier disappearance remains unattributed and is not evidence of source damage. No byte-level integrity claim for all untracked files from Git snapshots.

## Exact verification commands — parent clarification
Worker muv6nzop-1t-y8jb stopped before any writes or RED checks because the prior exact 13-file command was not included verbatim. This is an internal forwarding omission, not a human product/scope decision. Parent supplies the already-established baseline below; preserve nav-items.test.ts (do not replace it with task-session-row.test.ts).

Baseline 13-file command (268 tests at prior closure):
```sh
cd web && pnpm exec vitest run tests/project-detail-page.test.ts tests/client-detail-page.test.ts tests/use-client-editor.test.ts tests/clients-page.test.ts tests/organization-tabs.test.ts tests/organization-child-routes.test.ts tests/task-detail-page.test.ts tests/use-task-detail.test.ts tests/projects-page.test.ts tests/nav-items.test.ts tests/task-session-counts.test.ts tests/task-detail-route.test.ts tests/tasks-page.test.ts
```

T1 focused command, after adding the allowed presentation test:
```sh
cd web && pnpm exec vitest run tests/project-detail-page.test.ts tests/client-detail-page.test.ts tests/use-client-editor.test.ts tests/clients-page.test.ts tests/organization-tabs.test.ts tests/organization-child-routes.test.ts tests/task-detail-page.test.ts tests/use-task-detail.test.ts tests/projects-page.test.ts tests/nav-items.test.ts tests/task-session-counts.test.ts tests/task-detail-route.test.ts tests/tasks-page.test.ts tests/task-detail-presentation.test.ts
```

Other checks:
```sh
cd web && pnpm typecheck
cd web && pnpm exec vitest run
cd web && output_dir=$(mktemp -d) && PW_BASE_URL=https://macbook-air.tailef2f3.ts.net:8443 NUXT_PUBLIC_PB_URL=https://macbook-air.tailef2f3.ts.net:8443 pnpm exec playwright test e2e/organization-tabs.spec.ts e2e/organization-child-details.spec.ts --workers=1 --output="$output_dir/results" --reporter=line
```

No authorization expansion or file changes by the stopped worker. Resume original T1 visual refinement and test-first checks under the existing five-file allowlist. All constraints and acceptance criteria unchanged.

## Additional owner-authorized status color refinement
Owner requests En curso on task cards within a project to be green like Activo on project cards within a client. Parent mapped project index task-card Badge (line349 area) currently variant outline; client index project-card Badge uses success when active. Add only conditional success variant for doing in the project task-card footer, preserving outline for all other states and all card data/navigation. No shared/global badge changes, no task status transitions, backend writes or redesign of other accepted project content. Two exact edit surfaces added: nested project index and project-detail-page.test.ts. Same sole writer receives expansion; no parallel source writer. Observe RED for the old outline appearance via executable variant test/computed browser case, then GREEN; browser should match active-project success theme in light/dark. Update existing scoped presentation/browsers without dropping prior cases. Both refinement and original page alignment remain T1; independent T2 follows.

## Final delivery authorization and queued refinements
Owner requests version0.4.0 and one commit only after all pending work is complete. Root package version observed0.3.9; web is private and unversioned. This authorizes parent-owned final staging/commit, superseding the prior prohibition only at that final step; current source writer must not stage/commit/version. No push, tag, publication or deployment requested. Client images white5px (initials explicitly unchanged) are mapped/tracked separately in odd/tasks/client-image-white-background.md with two tasks and queued behind this sole writer. Sidebar cleanup and version metadata are being mapped read-only by muv77pc0-1w-k8jv. Preserve all unrelated dirty/untracked content; final commit scope must be explicit, never git add all. T1 styling/status work remains in progress; independent T2 and final delivery pending.

## Original visual alignment GREEN; status-token correction
Worker muv6qw72-1u-wm7f implemented the original visual alignment in four allowed surfaces only: nested task page, TaskDetailSheet.vue, new task-detail-presentation.test.ts and organization-child-details.spec.ts. Executable actual-template RED: four intended failures with269 passing (268 prior focused tests retained); computed browser RED: four new cases failed16px versus20px headings, all75 prior cases passed. Final focused273 passed/14files, typecheck passed, full834 passed/38skipped (61 files passed, one skipped), browser79 passed. Initial compiler-import and intermediate theme-storage-key test issues corrected before final GREEN, not counted as behavior RED. Finalscreenshots/artifacts tmp.UDCO7y86oO/results/**/task-*.png; REDtmp.Ntkz4qH72L/results preserved.
Observedvisualmetrics: h1 20px, gap/radius24px, desktop body/container1104px and mobile358px, cardpadding20px/8px, no documentoverflow, cardlightwhite/darkoklch(0.22645 0 0). Drawercompatibility retainscompact h2/padding/sessionrowclasses viaactualtemplate tests; there is no live TaskDetailSheet drawercaller, separateEntryDetailSheet browser retained16pxh2. Four long-title desktop/mobile light/dark cases added without removing priorcases. No controller/backend/sourceoutsidefour changes.
Additionalbadge refinement remains pending because parent supplied an incorrect technical identifier: actual TaskStatus is open|doing|done, and En curso maps to doing, not in_progress. Parent corrects implementation mapping to task.status === 'doing' ? 'success' : 'outline', preserving the owner's already-authorized visual outcome and existing three states. No new human product decision or defer required. Neither project addedsurface was edited by stoppedworker. Resume same singlewriter to observe color RED/GREEN and verify real doing status; allpendingavatars/sidebar/version/finalcommit remainqueued. OriginalT1 staysin_progress untilbadge passes. Final independentT2 pending.

## T1 status refinement GREEN
Writer muv7mzn7-1x-pmtk changed only the nested project index conditional Badge, project-detail-page.test.ts and Organization child browser spec. Executable doing RED: one failed/275 passed (open/done stayed outline); final focused276 passed/14 files, typecheck passed, full837 passed/38skipped (61 files passed, one skipped), browser83 passed with all79 priorcases retained. Doing uses success, open/done outline; labels/wrapping/navigation/project analytics untouched. Four desktop/mobile light/dark color comparisons matched active client-project badge: lightbackgroundoklch(0.53 0.14 150)/foregroundoklch(0.98 0 0), darkbackgroundoklch(0.884 0.068 157)/foregroundoklch(0.113 0.011 316). Originalpage20pxh1/24pxgap/radius/fullwidth/overflow/drawerchecks remainedGREEN.
Fresh preserved artifacts tmp.IUnvyA9aRW/results/**/badge-*.png and task-*.png. ParentnativeASSESSunassessable/RDDoff, independentVerifier=true. T1 complete by observed writerchecks, T2 independentverification retainedpending until all queued UIunits stop writing, so browser/source snapshot staysstable. Client images unit next under solewriter; sidebar/version/finalcommit pending. No staging/commit/deployment performed.

## Joint independent verification transition
Sidebar sourcewriter finishedGREEN316focused851full38skip/typecheck89browser, allsourcewriters stopped. Jointreadonly independent verification nowinprogress across taskpage/greenbadges/clientimages/sidebar/routing/controller regressions; metadata remains0.3.9 and finalcommitpending. Parent also corrected TASKS-REQ-007 in docs/specs/web-tasks.md to actualnestedroute/ownership/owningprojectBack/legacyqueryhashredirect. Passive documentation correction has no meaningful behaviorRED; verify structurally and againstfunctionalroute tests.

## T2 independently verified completion
Independent joint verifier muv96d79-23-b1l7 executed316focused18files/typecheck/851full38skip(63suitespass1skip)/89of89readonlyOrganizationbrowser6.5min/diffchecktwice/health200/HTTPS200TLS0; nofeatureblocker found. All10same-routeownershiprestoration/cacheidentityregressions passed, guards/editorauthorization/resume/status preserved. Nestedownership/legacyqueryhash/projectBack/specTASKSREQ007 match. Page20pxh1/fullwidth24pxgap/radius/20-8cardpadding/mobilelongtitlesboth themes; actualtask/avatar/badge screenshots inspected, wrappedtitlesno horizontalclipping/fullwidthroundedcards/whiteavatar darkbacking. Additional elementcaptures show below-internalscroll doinggreen/mint badges in390lightdark.
Freshsuite tmp.hhpsEctd4y/results, extra /var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/joint-t2-badge-toceSO/doing-390-{light,dark}.png; historicalartifactsretained. Parentreadlast-runpassed/no failedTests. Sharedimage callers structurallycovered notexhaustiveimage-mode screenshots; sm24unitclassonly, reactiveURLrecoveryunit/browserreload. TaskDetailSheetdrawercompatibilitytemplateonly(no livecaller), separateentrydrawerbrowserdoesnotproveitsliveusage. RoleinterceptionnotbackendACL;38liveconfiguredskipmissingTOTALS_LIVE_PB_URL, noactualmutation/build/formala11y/phone/reboot/deployment; boundedreadsnontransactional. HistoricalREDrecordednotindependentlyreplayed. Source/testinventoriesstable, indexempty/rootversion0.3.9duringverification, parentdocbookkeepingseparate; runtime75019inflightdisappearanceunattributednotapp-sourceharm/byteproof. NativeASSESSunassessableRDDoff independentfallbackonly, no nativeapprovalreceipt. UIfeaturetasksdone, finaluserauthorized0.4.0metadata/snapshotchecks/singlecommit next; no stage/version/commitbyverifier.
