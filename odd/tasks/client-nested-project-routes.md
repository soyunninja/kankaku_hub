# Client-nested project detail routes

## Goal and authorization
Owner explicitly requests project URLs live within their client: /organizacion/clientes/:id/proyectos/:projectId. Preserve canonical client/task details and standalone catalogs, previous project URLs and all accepted client visual refinements. No product clarification needed: project.client is a required relation and protected unassigned client has a real ID.

## Constraints
Preserve unrelated dirty/untracked work, private HTTPS preview and all existing processes/config. One source writer, no backend/schema/fixture/record writes, dependencies, staging, commits, deployment or destructive changes. No deletion of historical artifacts. D6 totals remain consolidated task_entries only. No testing actual Save/archive/status/favicon/resume mutations. English technical artifacts, localized native UI strings.

## Architecture and acceptance
Keep organizacion.vue outlet/index semantics. Convert clientes/[id].vue into NuxtPage-only parent and preserve existing client detail in clientes/[id]/index.vue. Add clientes/[id]/proyectos/[projectId].vue reusing project detail behavior with distinct client/project params. Load/validate actual project.client and existing client; missing/mismatched pair must not render another client's project. Direct/reload/stale-route behavior safe; back navigates to actual client detail. Update all project links: client cards, project catalog/cards/table, command palette and entry detail relation. Central route helper optional if reduces duplication. Both /organizacion/proyectos/:id and /projects/:id resolve project.client and redirect preserving repeated query/hash. Keep unknown/missing project error states clear without inventing client IDs. Sidebar Organization active, breadcrumbs handle nested client/project chain.

## Tasks
- [x] T1 (done): Test-first route nesting, link migration and old-route compatibility, preserving prior detail behavior.
- [x] T2 (done): Independent functional verification and closure.

## Exploration evidence
Scout muuy25f8-1a-pond: required relation migration1758300003:22-29; real unassigned row migration1758300008:23-27; project.client useProjects:32-34/46-48. Existing client leaf and project leaf under Organization outlet. Link callers clientsdetail:433/projectsindex:242/278/palette:69/EntryDetailSheet:368. Legacy projects/[id].vue preserves query/hash; current project back goes tabprojects and should now go owningclient. nav-items centralized breadcrumb labels and sidebar prefix behavior.

## Pending tiny style check
Parent removed client-projects border-t/border-border and set title font-bold, preserving pt-4/space-y-2. Include actual browser computed border0/titleweight700 in route verification after client page moves.

## Verification policy
Runnable deterministic route/link/controller tests -> RED before source edits, focused GREEN/typecheck/full Vitest, readonly private HTTPS browser specs with fresh external artifacts. No mutation-bearing broader E2Es. RDD off; ASSESS after writer and follow independent risk plan. No commits per owner's explicit prohibition. Existing 38 live-configured tests remain potentially skipped and must be reported.

## Additional client project heading spacing
Owner requests more vertical space between the bold Proyectos heading and project cards. Increase section child spacing from space-y-2 to space-y-4 (16px) in the client detail index after relocation; preserve no top divider, pt-4 and card-to-card grid gaps. Include browser header-to-grid geometry check with pending font/border checks.

## Current partial implementation and scope stop
Writer muuy6ux8-1b-p8ax applied nested route/outlet/index, caller links and two compatibility redirects. Initial meaningful RED89failed74passed (163); latest focused3failed161passed (164): heading spacing, breadcrumb dynamic-ID collision and clients-page harness still targeting wrapper. No GREEN/typecheck/full/browserproof yet. Source space-y-3 still needs authorized16pxspace-y-4, localizednotfound/negative-stalebehavior/E2Emigration pending. Worker requests adding web/tests/clients-page.test.ts only for detail source-path migration from clientwrapper to nestedindex. Await explicit human approve/decline before continuing. No commits/stage/backend/process/config/dependency/deploy changes. InitialRED log /var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/pi-bash-6835d84b8a776e7a.log retained. Projecttaskcard/chartredesign is separately authorized nextphase, read-only scout muuyo53i-1c-5cqc running; no secondwriter.

## Scope approval
User explicitly selected approve_test_path: web/tests/clients-page.test.ts authorized solely to update the client detail source reference to clientes/[id]/index.vue. All previous allowed surfaces/constraints remain; resume single writer to finish three failures and remaining functional/browser checks before next project UI phase.

## Routing writer GREEN
Continuation muuyyr2b-1d-kb4i completed T1 across19permittedfiles. Additional behavior/localization RED2failed177passed: denied analytics read precedence over concurrent unavailableendpoint and missingtranslations. GREENfocused179passed9files, typecheckpassed, full740passed38skipped56filespass1skip, readonlyprivateHTTPSbrowser55passed; gitdiffcheckpassed. Firstbrowser54/55 incorrectRegistrosselector fixedtoEntradas; failures retainedtmp.fi2OLhqbPM/results, finaltmp.sfxQlRssnT/results in /var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/. Browser actualaddressbar proofcatalogcards/table/clientcards/palette/EntryDetailSheet/botholdURLs settled nestedactualclientpath, directreload/backownclient/repeatedqueryhash verified. Protectedclientandasyncfencing deterministicunitonly. Clientstylebrowserborder0/font700/padding16/titlegrid16 verified. No futureprojectUIchanges yet, no actualwrites/commits/stage/deploy/config/dependencies/process/deletes.

## T2 independent check
Native ASSESS remains unassessable due intended-untracked declaration; RDDoff=>highfallback independentVerifier=true. Separate readonly routeverification nowinprogress, before nextprojecttaskcards/chartimplementation. No native reviewreceipt/approvalclaim.

## Independent closure
T2 muuzl9l3-1e-ql1s independently GREEN179focused9files/typecheck0/full740passed38skipped56filespassed1skipped/browser55passed; APIhealthy200/Organization200TLSverify0. No severe causedroutingbug. Allcalleractualnestedaddressbars/bothredirectqueryhash/directreload/backownclient and clientheadingborder0/font700/pt16/headergrid16 verified. Parent artifactread passed/no failedTests, gitdiffcheck0. Freshresults /var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/tmp.QQirWDsZwB/results. Beforeaftergitstatus/diffstatmatched29trackedfiles+313/-999/stagedempty; notbyteproofuntrackedignored. Protectedclient/stale/deniedcasesunit/interception, actualmutation/viewerACL/build/a11y/phone/reboot unverified. 38liveconfiguredtestsskipped; no nativeapprovalreceipt/RDDoff. No commits/stage/backendrecords/config/process/dependencies/deploy/deletes. Routingfeature bothtaskscomplete; nextauthorizedprojectUIfeature followsseparately.
