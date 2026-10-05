# Canonical organization tabs

## Intent
Keep `/organizacion` as the sole combined Organization page, using the Clients/Projects/Tasks tab implementation previously shown in `/prueba`. Remove the experimental `/prueba` page and navigation. The owner explicitly requested this consolidation and deferred hierarchical/all-in-one exploration.

## Scope and constraints
Reuse route-independent tab/query helpers and existing embedded catalog SFCs; preserve keyboard behavior, lazy mounting, retained local filters, valid deep links, unrelated query parameters and standalone catalog routes. Organization title/navigation remain localized through nav.organization. Remove experiment/stacked-overview copy and obsolete tests only after migrating meaningful coverage. Remove incidental active prototype URL fixtures where mapped; preserve historical ODD documents and prior failure artifacts.

Deletion authorization is narrow: obsolete prototype page and superseded organization-specific tests. No destructive Git operations, commits, staging, backend data writes, schema changes, deployment, process restarts or Tailscale changes. Keep all unrelated dirty work and same-origin/private-preview infrastructure. Current branch feat/card-contained-form-backgrounds; both page SFCs and their feature tests are currently untracked. Existing tailnet URL stays on HTTPS8443.

## Tasks
- [x] T1 (done): Move tab behavior to Organization, remove prototype/overview-only product assets, migrate tests to canonical organization-tabs coverage, and self-verify test-first.
- [x] T2 (done): Follow native assessment and independently verify private HTTPS canonical tabs, mobile/keyboard/filter/deep-link behavior, removed prototype navigation/route and preserved standalone pages.

## Acceptance and checks
`/organizacion` renders Clients/Projects/Tasks tabs with Organization heading/document title, no experimental badge. Filters survive tab changes; only the active panel is visible; invalid tab values fall back to Clients; reload/deep-link/unrelated query state is preserved. Navigation, palette and breadcrumbs expose Organization and no Prueba. Old `/prueba` is no longer a functioning route. Original clients/projects/tasks URLs remain usable. No active nonhistorical prototype/overview references remain after mapped cleanup.

Use meaningful deterministic RED/GREEN before page/nav implementation. Focused unit tests include canonical tabs, navigation and PocketBase URL resolution; typecheck; Node bridge regression if its generic URL fixture changes. Browser cases include desktop/mobile, keyboard, query/reload/filter retention, old-route removal and standalone pages. Use actual trusted private HTTPS origin, read-only existing fixture login only. Commands use pnpm exec directly; new temporary --output and --reporter=line preserve old Playwright evidence. No database create/update/delete or broad suites.

## Evidence and progress
Explorer mapped all active page/nav/icon/locale/test references and incidental /prueba generic URL fixtures. Parent confirmed feature branch and untracked feature assets. Shared tab helper needs no behavior changes. Initial writer stopped before changes because its runtime forbids file deletions; no RED/GREEN or source writes occurred. Parent will perform only the five exact user-authorized obsolete-file removals after the writer migrates their implementation and coverage. Writer continues all edits/new canonical tests without deleting files; obsolete originals remain read-only until parent cleanup. Writer migrated canonical page/nav/icons/locales and generic fixtures, added canonical unit/E2E coverage. Meaningful RED:5 assertion failures19passes, no importfailures; GREEN24/24units, typecheck,3/3Nodebridge,8/8positivebrowsercases (onecleanupnegative excluded). Initialpanelrace corrected withawaitedselectedtab/namedpanel; previousfailuretraces retained. Passing artifacts /tmp/organization-tabs.uw3M3i/results. Parent confirmed canonical assets exist and fiveobsolete paths are regular untracked files, then removed exactly those five files after coverage migration. No unrelated deletion occurred. NativeASSESSunassessableuntracked,RDDoff=>high independentverificationrequired; task document is mirrored in Engram. No commits authorized; commit evidence intentionally absent.

## Final verification
Independent GREEN: bridge3/3, focusedunits24/24, typecheck passed, all9/9canonical privateHTTPS browser cases passed including removed prototype route (Nuxt404, no tabs). FullVitest608passed38skipped,51filespassed1skipped. TrustedHTTPS /organizacion200 TLSverify0 and healthyAPIJSON. Desktop/mobilekeyboard/filterretention/lazymount/queryreload/invalidfallback/nav/palette/title/formsappearance/standaloneheadings covered. Fiveobsoletefiles absent; activeprototype references exist only in intentionalnegative assertions. Before/afterGitstatus/stat unchanged duringverification, allunrelateddirtywork preserved. Finalartifacts /tmp/organization-tabs-t2.V4nGmZ/results/.last-run.json statuspassed. No causeddefect/blocker observed.

## Limits
Fullsuite38skipped tests/onefile notexecuted. Breadcrumbs unit-only because defaultlayout doesn'tmountHeader; viewerrole runtimefixture unavailable, permissionguards structurallyinspected. SupplementarycoldGET/duplicateDOM-ID probes notrerunforcanonicaltabs; historicalODDdocuments retained intentionally. No productionbuild/broadE2E/accessibilitysuite/native review (RDDoff). Priorwriterpanelrace fixed withawaitedassertions; failedartifacts retained. No backendwrites/processconfigchanges/commits/deployments; sharedhelperandcataloginterfaces unchanged.

## Next step
Owner opens https://macbook-air.tailef2f3.ts.net:8443/organizacion with Tailscale enabled. This is now the canonicaltabpage; /prueba is removed. Hierarchicalintegration remains deferred. Macmustremainawake withpreviewprocessesrunning.
