# Available client cost shares and inline header

## Authorization
Owner requests horizontal project cost bars using available data and ignoring incomplete/unknown values, instead of rejecting the entire share. Owner also requests the client header match project detail: back arrow to the left of title, not above. Supersedes strict completeness gates recorded in organization-child-details.md; preserve that historical document.

## Constraints and acceptance
One writer; preserve unrelated dirty work. No commits, staging, deployment, backend/fixture writes, dependency/config/process/Tailscale changes. D6: only consolidated task_entries/totals, never sum work_records. Same selected-client calendar-month card window; available known finite nonnegative costs only. Include known unassigned-project entries in denominator. Incomplete/estimated/capped quality alone does not block useful known subtotals; label shares as based on available costs, never imply full totals. No invented zero from absent/unknown/failed reads. Maintain filter/stale/request/cache guards and bounded reads. Inline icon-only back control left of existing client avatar/title, accessible localized label/title, same clients-tab destination; preserve badges, protection, loading/error states and sidebar actions.

## Tasks
- [x] T1 (done): Test-first implementation of available-cost shares and inline client header, with focused tests, localized labels and readonly browser cases.
- [x] T2 (done): Independent verification and final record.

## Evidence
Readonly scout muuw881a-15-cp4u mapped client share gates at route61-81/269-297, totals-map known subtotal/count at71-83/116-131, share tests362-473/browser500-577 and inline project header155-170 versus client338-358. Writer must verify server-produced known subtotal semantics before using it.

## Next step
Delegate single bounded writer with six exact surfaces; RED before implementation, GREEN focused/full/typecheck and private HTTPS read-only browser checks. Native RDD off; assess returned writer diff and follow plan. No commit due explicit owner prohibition.

## Contract finding and pending decision
Writer muuwchvl-16-lt1n stopped before any edits/tests. Server known subtotals exclude unknown quality but include negative costs (pocketbase/pb_hooks/lib/totals-query.js:338-339; schema cost has no nonnegative minimum at migration1758300005:61). A positive subtotal cannot prove constituent validity. No observed production negative row is claimed. Backend edits remain prohibited. Human choice requested: use existing bounded selected-client card-window task_entries rows as exclusive validated share basis (same six surfaces, label retrieved available subset), or defer T1 pending separately authorized server correction. No RED/GREEN/typecheck/browser checks run for this correction yet. Header implementation remains pending with T1.

## Human decision
User explicitly selected available_rows: calculate shares exclusively from the existing bounded selected-client card-window task_entries scan, excluding unknown/invalid rows, label retrieved subset as available data. Same six allowed source surfaces, no backend changes. Resume T1 including inline header. No use of server known subtotals as share authority.

## Visual refinement
Owner additionally requests the cost-share bar background use var(--background). Apply to the track (bg-background utility if same token), preserving primary proportional illuminated fill and accessible share semantics. Include in T1 tests/browser checks.

## Client chart control refinement
Owner says the project selector on the same client chart is redundant because all series are projects. Remove only the client's grouping selector and fix grouping to project; retain work-time/cost metric selector, chart panel, bounded top-five/remainder project series and existing chart-window/filter/stale/error guards. Update same unit/browser surfaces; no dashboard or shared chart controls edits.

## Initial implementation evidence
Writer muuwgluz-17-875z completed available-row shares, inline header and bg-background tracks in six permitted surfaces. RED 10 failed/147 passed; background refinement RED 1 failed/162 passed. GREEN focused163/163 (9 suites), typecheck passed, full724 passed/38 skipped (56 suites passed/one skipped), private HTTPS browser44/44. Initial43/44 stale no-row-request expectation fixed to distinguish card reads from chart fallback; both artifacts retained: final tmp.ZAqXisZi2k/results, failure tmp.sZCUQobi0E/results under /var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/. Estimated finite nonnegative known row costs included; unknown/negative/missing/nonfinite excluded, unassigned included; max2000 rows, subset explicitly labeled available. T1 remains in progress: project-selector refinement arrived after writer settled; steering failed with not-running and continuation is required before final verification. No commits/staging/backend/config/dependency/deployment changes.

## KPI spacing refinement
Owner additionally requests gap-6 on the four top KPI cards at desktop sizes, with equal horizontal and vertical spacing whether cards share a row or wrap into multiple rows. Apply both row-gap and column-gap at existing desktop breakpoint; preserve mobile spacing. Verify computed gaps and actual geometric neighbor separation at desktop one-row and wrapped grid widths using the same bounded client route/unit/E2E surfaces.

## Final writer evidence
Continuation muux1cps-18-noed completed fixed-project chart grouping (client selector removed, metric control retained) and KPI gap-3 md:gap-6 refinement in route/unit/E2E. New spacing RED1 failed/162 passed before source, final focused163 passed/9suites, typecheck passed, full724 passed/38 skipped (56suites pass/one skip), HTTPS readonly browser46/46. Artifacts tmp.jd5PJaOp2Z/results under /var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/. Desktop1440/900 four-column actual horizontal24px and computed row/column24px; mobile740/390 naturally two-row actual both12px, preserved. No natural desktop two-row grid exists with current md:grid-cols-4; do not claim geometric wrapped24px live layout evidence. Parent spot-check confirms md:gap-6 both-axis class and project-only ranking. No commits/stage/backend/deploy/dependency/config/process changes.

## Assessment and next step
Native ASSESS again unassessable due intended-untracked declaration; RDD off, returned independentVerifier=true and high-risk fallback. T1 outcome self-verified; T2 independent read-only verification now in progress across all accepted adjustments. Native review approval/receipt not claimed.

## Independent final closure
T2 verifier muuxlu6j-19-ijr0 independently observed focused163/163 across9suites, typecheck successful, full724passed38skipped (56suites passed/one skipped), privateHTTPSbrowser46/46 without exclusions, health200 and Organization200/TLSverify0. No severe caused defect in six scoped surfaces. Final independent artifacts: /var/folders/fs/pmybks3s0hq1dvxxfzt_r5_m0000gp/T/tmp.AS6FPWjwe1/results/.last-run.json; parent read passed/no failedTests and git diff --check exit0. Gitstatus/diffstat beforeafter matched28trackedfiles+272/-1010; stageddiffempty, not byte-level proof of untracked/ignored identity. Prior failure/writer artifacts preserved.

## Limits and next step
All requested refinements complete. Available shares intentionally represent at most2000 retrieved selected-client card-window rows, not full client totals. Server negative-cost subtotal contract remains unchanged; validated rows avoid it for shares. Desktop1440/900 four-column KPIs: computed row/column gap24px and actual horizontal24px; mobile740/390 two-row gaps12px. No natural desktop wrapped configuration exists, so no actual wrapped24px geometry claim. No synthetic wrap probe performed. ViewerACL and backend writes remain unverified live; existing38live-configured tests/one suite skipped. Nativeassessmentunassessable/RDDoff, no reviewapproval/receipt. No productionbuild/comprehensiveaccessibility/deployment/physicalphone/reboot checks. No commits/stage/backend/config/process/dependency/deploy mutations. Owner can review updated client pages through https://macbook-air.tailef2f3.ts.net:8443/organizacion; Mac must remain awake. Both tasks done.
