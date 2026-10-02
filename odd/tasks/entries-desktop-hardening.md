# Entries desktop hardening

## Intent and boundaries

Continue the authorized desktop work without replacing the measurement ledger. Preserve desktop B filter relocation, focus, session mode, counts, export labeling and sticky expanders. D6 remains unchanged: raw work records are drill-down only.

Delegated route 2 implementation spans nontrivial Vue and browser wiring. Strict TDD is disabled by explicit parent choice; functional verification is required. Advisory forecast: 250–500 lines across two coherent slices, not a limit. No commits, deployment, version bumps or PR creation. Discuss delivery strategy and ask on risk before any future commit request.

## Checklist

- [x] Slice 1: keyboard entry-detail controls in existing cells; sortable flat headers with direction semantics.
- [x] Slice 1: stable dialog name/description, initial and restored focus, loading, retry, and stale-request guards.
- [x] Slice 1: read-only browser verification and desktop light/dark inspection.
- [x] Slice 2: honest zero-result pagination and contextual localized clear-all recovery, preserving mode, sort, disclosure, unrelated query parameters and hash.
- [x] Slice 2: read-only browser coverage for query/state reset, fresh empty data, advanced filters, export metadata, late responses, keyboard focus and EN/ES/JA 390px regressions.
- [x] Final desktop verification and independent combined review (PASS, task `muraczge-r-80fd`).

Mobile visual redesign remains pending and excluded. Japanese native-speaker copy review remains unverified.

## Verification

Run the parent-authorized unit tests, typecheck, lint, diff whitespace check, and focused accessibility/desktop-filter/compact-date/date-range/export/load-recovery browser suite on the owned isolated :3003/:8093 stack. Inspect real desktop light/dark states, report detector counts, and stop the owned stack on every outcome. Mark completed work only after observed passing checks.

Observed: 581 unit tests passed (38 skipped), typecheck passed, lint passed with 23 existing warnings, and 29 Chromium browser tests passed. Dialog ARIA references resolve during loading and success; keyboard origin restoration, unchanged session filtering, and late entry/raw-record rejection are covered. Detector returned `[]` (zero findings/codes). Desktop light/dark screenshots were inspected under `/tmp/kankaku-desktop-hardening.LhL2zo/accessibility-out`; no redesign correction was needed. Other browser engines and Japanese native-speaker review remain untested.

Slice 2 observed: 581 unit tests passed (38 skipped), typecheck passed, lint passed with 23 existing warnings, and 37 Chromium browser tests passed across empty-recovery/accessibility/desktop-filters/date-range/export/partial-export/load-recovery. Initial unit extraction and lint failures were corrected within the page; an initial cold accessibility timeout passed on subsequent full runs. A CSV assertion was corrected to match quoted, formula-safe metadata before the final full passing run.

The reset removes only canonical EntriesExplorerFilters query keys, catches router replacement failures with localized recovery text, and clears the same reactive object after source navigation. Existing request-generation checks reject late pre-reset responses. New export clicks see clean filters; captured in-flight and pending export snapshots are untouched. Sessions eligibility returns without enabling Sessions automatically. No aggregation, raw-record totals, API counts, assignment permissions, or invoice fields changed.

Batched desktop empty-before/after screenshots and reset-context JSON are retained under `/tmp/kankaku-desktop-empty.6ICA18/empty-out`; inspected flat and grouped dark states required no cosmetic correction. Detector returned `[]`: zero findings/codes. Forecast remains advisory, not a cosmetic code-shrink target. Mobile visual work remains pending; final independent combined review is recorded below.

### Final desktop verification

Independent combined review: **PASS** (`muraczge-r-80fd`). Final independent checks: 581 unit tests passed, 38 skipped (48 files passed, 1 skipped); all 43 Chromium tests passed with one worker and no retries. Typecheck, production build and diff whitespace check passed; lint reported 0 errors and 23 existing warnings. Four static routes were generated, not deployed.

Verified desktop contracts: keyboard detail controls, header `aria-sort` and a single detail GET; stable SheetTitle/Description references through loading/error, initial focus, Escape/origin restoration, Retry and generation guards; zero-result pagination and clear-all of all 12 canonical filter keys while preserving unrelated query/hash, mode, sort, disclosure and focus, rejecting old fetches and preserving export snapshots. B filter focus/sticky expanders, column data and D6 remain unchanged; other sheets retain their default title behavior.

The owned stack at `/tmp/kankaku-desktop-hardening-verify.HXh0KZ` is stopped; logs are retained. The actual `detail-dark` screenshot captured a mixed-theme transition, not proof of settled dark rendering. Router-replacement failure recovery and close-button focus were source-reviewed only, without fault injection. Other browser engines, full screen-reader/full WCAG coverage and Japanese native-speaker review are not certified. Mobile visual redesign remains pending and out of scope. No automatic critique rescore was performed: the latest 25/40 remains historical, not updated. No commit, push or version bump.
