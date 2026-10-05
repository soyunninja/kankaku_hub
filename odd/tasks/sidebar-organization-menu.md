# Organization sidebar cleanup

## Goal and authorization
Owner requests removing sidebar Clients, Projects and Tasks links and the nonlinked Organization group heading. Keep the linked Organization item, its tabs, all standalone catalog routes, compatibility links, breadcrumbs and Command Palette pages/dynamic entity results.

## Exploration and decision
Scout muv77pc0-1w-k8jv mapped NAV_ITEMS/SEGMENT_LABELS (nav-items.ts:17–22,41–47) shared by sidebar, palette and breadcrumbs. SidebarNav.vue:48–54 maps registry entries locally; :63–65 renders section headings. Filter only the sidebar's local catalog entries and suppress the redundant Organization heading. Do not remove routes, registry items, translations or palette results.

## Tasks
- [x] T1 (done): Test-first local sidebar filtering and redundant heading removal.
- [x] T2 (done): Independently verify desktop/mobile sidebar, linked Organization active states, unchanged tabs/catalog routes/palette/breadcrumbs.

## Allowed edit surfaces
web/app/components/app-shell/SidebarNav.vue
web/tests/sidebar-nav.test.ts
web/e2e/organization-tabs.spec.ts

## Verification
Meaningful executable RED: sidebar renders no /clients,/projects,/tasks entries or nonlinked Organization heading, but retains linked /organizacion and other entries. Existing organization-tabs E2E sidebar expectation :70–84 must change to absent for requested entries while palette/search checks and standalone routes :94–100 remain. Existing registry/nav-items and Organization catalog-tab assertions remain GREEN, not rewritten to delete catalogs. New dedicated SFC sidebar test is allowed; other existing test files remain read-only. Browser checks must be read-only and mutation-blocked; inspect each selected scenario, do not execute a write-bearing test. Preserve previous safe Organization cases, updating only requested sidebar assertions. Full Vitest/typecheck and independent verification before final commit.

## Constraints and queue
Queued behind current sole writer muv6qw72-1u-wm7f (task page presentation and project task-card En curso success badge), then client-image white background unit. No parallel source writer. Preserve unrelated dirty/untracked and historical artifacts; no backend/fixture writes/config/process/Tailscale/dependencies/install/build/generate/deletion/TLS bypass. Parent owns tracking/version/staging/final commit, which user authorizes only after all pending work verifies. No push/tag/publication/deployment. Writer must not stage/commit. Scoped sources only, shared registry/palette/breadcrumb functions unchanged.

## Implementation transition
Avatar writer completed GREEN311focused846full38skip/typecheck87browser. No competingwriter; sidebar unit starts next with exact three-surface scope. Add dedicated sidebar-nav.test.ts to prior17focusedfiles, preserve global nav-item/tab/catalog/palette assertions; update only obsolete sidebar-visible expectations in organization-tabs.spec.ts. Final jointindependentUIverification pending after this lastsourceunit. Parentfinalcommit explicitly approved for accumulatedOrganization/UIslice plusrequestedrefinements, excludingunrelated/runtime/generatedwork; writerstillmustnotstage/commit/version/publish/deploy.

## T1 GREEN and independent T2 transition
Writer muv8omq2-20-f9ky completedexactthree-surface localSidebarNavprojection andheading suppression, fiveactualSFCrenderer cases andtwo newread-onlydesktop/mobilebrowsercases. REDtwo intendedfailures(unwantedthreecataloglinks/redundantheading),314passes; final316focused18files/typecheck/851full38skip(63filespassedone skipped)/89browser6.7min(all87previousretained), diffcheckpassed/stagedempty. Globalregistry/palette/breadcrumbs/routes/translations/tabs/otherentries/queuedbadges/loading/callbacks preserved. BothOrganizationbrowser specs inspected andbackendmutations blockedafterlogin whiletotals/authrefreshPOSTallowed; no actualfixtures/writes or silentexclusions. Freshexternalartifacts tmp.RyiVIP0wGo/results, oldallretained. Runtimeinflightfilenametransition attributableonlyasdynamicstate—notbytelevelintegrityproof; no cleanup performed. ParentnativeASSESSunassessableRDDoff=>independentVerifiertrue. All UIwriters stopped; jointindependentT2 nowinprogress, finalversion/commitstillpending.

## T2 independently verified completion
Independent joint verifier muv96d79-23-b1l7 executed316focused18files/typecheck/851full38skip(63suitespass1skip)/89of89readonlyOrganizationbrowser6.5min/diffchecktwice/health200/HTTPS200TLS0; nofeatureblocker found. All10same-routeownershiprestoration/cacheidentityregressions passed, guards/editorauthorization/resume/status preserved. Nestedownership/legacyqueryhash/projectBack/specTASKSREQ007 match. Page20pxh1/fullwidth24pxgap/radius/20-8cardpadding/mobilelongtitlesboth themes; actualtask/avatar/badge screenshots inspected, wrappedtitlesno horizontalclipping/fullwidthroundedcards/whiteavatar darkbacking. Additional elementcaptures show below-internalscroll doinggreen/mint badges in390lightdark.
Freshsuite tmp.hhpsEctd4y/results, extra /var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/joint-t2-badge-toceSO/doing-390-{light,dark}.png; historicalartifactsretained. Parentreadlast-runpassed/no failedTests. Sharedimage callers structurallycovered notexhaustiveimage-mode screenshots; sm24unitclassonly, reactiveURLrecoveryunit/browserreload. TaskDetailSheetdrawercompatibilitytemplateonly(no livecaller), separateentrydrawerbrowserdoesnotproveitsliveusage. RoleinterceptionnotbackendACL;38liveconfiguredskipmissingTOTALS_LIVE_PB_URL, noactualmutation/build/formala11y/phone/reboot/deployment; boundedreadsnontransactional. HistoricalREDrecordednotindependentlyreplayed. Source/testinventoriesstable, indexempty/rootversion0.3.9duringverification, parentdocbookkeepingseparate; runtime75019inflightdisappearanceunattributednotapp-sourceharm/byteproof. NativeASSESSunassessableRDDoff independentfallbackonly, no nativeapprovalreceipt. UIfeaturetasksdone, finaluserauthorized0.4.0metadata/snapshotchecks/singlecommit next; no stage/version/commitbyverifier.
