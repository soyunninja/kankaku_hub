# Entries desktop filters — approved B

Status: completed after independent scoped PASS. Only approved desktop B
layout and filter-pane explanation landed; other critique scopes remain pending.

## Intent and authority

Implement only the owner's explicitly selected desktop B preview: period,
client, and project lead to Sessions/Entries mode and the dense measurement
ledger. Export is a separate labelled action; six advanced dimensions live
in an inline More filters disclosure. Preserve existing component styling,
semantic radii, Inter/pink themes, table markup, and zero-padding density.

Single-writer delegated route 2 applies because this spans multiple nontrivial
files. The parent explicitly disabled strict TDD for Vue UI/browser wiring;
functional checks are the evidence, not invented RED/GREEN receipts.
Advisory forecast: approximately 150–300 authored lines including tests;
400 lines is not a limit. No commit, version bump, deployment, or delivery
is authorized or recorded. No Engram mirror is available.

## Constraints

- Preserve D6: totals come only from consolidated task entries, never raw
  overlapping work records. No aggregation or schema changes.
- Retain session grouping defaults, persistence/storage guards, unsupported
  filter enforcement, quality deep links, and session marker banners.
- Collapsing the panel must not reset filters, pages, or fetch data. Count
  the actual truthy values of model, quality, search, agent, status, machine;
  exclude dates, client/project, and external session_id.
- Keep export click snapshots, privacy projection, cap consent, and shared
  handlers unchanged. Optional shared ExportMenu label preserves its icon-only
  default for all other callers.
- At md (768px), relocate existing controls rather than cloning inputs. Keep
  desktop DOM/focus order aligned with visual order and restore the original
  mobile filter order, grouping switch, date controls, and table overflow.

## Tasks and observed evidence

- [x] Read proposal, PRODUCT, DESIGN, approved B previews, source, and craft floor.
- [x] Implement labelled desktop modes, inline advanced disclosure/count, and
  optional shared Export label with EN/ES/JA copy.
- [x] Adapt authorized desktop browser selectors; retain mobile switch checks.
- [x] Add read-only desktop/mobile/localized regression and screenshot coverage.
- [x] Unit checks: 48 files passed, 1 skipped; 581 tests passed, 38 skipped.
- [x] Typecheck passed; lint passed with 23 pre-existing warnings, no errors.
- [x] Isolated browser regressions: final 24/24 passed; Dashboard smoke 2/2
  passed. Initial 24/24 passed; adding a stricter expander visibility assertion
  exposed two harness failures, resolved by explicitly scrolling the existing
  horizontal table container with one-pixel fractional-layout tolerance.
- [x] Actual render inspection: ES light/dark at 1280/1440, EN/JA at 1280,
  and original EN mobile controls at 390; no page overflow. All session
  expanders remain reachable by horizontal scrolling. One bounded visual
  correction clarified selected modes and removed an empty desktop banner gap.
- [x] Mechanical detector: exit 0, `[]`, zero rules/locations; not browser proof.
  Whitespace check passed.
- [x] Parent independent verification/disposition: scoped PASS; confirmation
  evidence is recorded below (not this writer's review authority).

## Render evidence

Owned stack: `/tmp/kankaku-desktop-b.lykTL0`; stopped after verification
(`down` stopped both recorded processes without purge). Runtime outputs are retained,
not committed. Screenshot directory: `/tmp/kankaku-desktop-b.lykTL0/b-out`.
Each `entries-desktop-filters-real-ledger-{locale}-{theme}-{width}-chromium`
folder contains `collapsed.png` and `expanded.png`; EN light 390 instead
contains `mobile.png`. The browser run authenticates seeded users and reads
measurements only, with record-CRUD forbidden. Seeding was setup-only.

The initial delegated verification did not run desktop-switch consumers
`web/e2e/entries-compact-dates.spec.ts` or `web/e2e/entries-grouped.spec.ts`.
The later authorized compact-date correction and read-only coverage are recorded
below; the mutation-oriented grouped spec remains excluded.

## Explicitly pending, not completed

Other critique issues remain out of scope: keyboard entry detail and dialog
ARIA, sorting ARIA, mobile context/redesign proposal, and empty 0 × 1/0 or
reset behavior. Unapproved chips, clear-all controls, KPI/cards, marketing,
and re-theming are not added. Existing untracked artifacts remain untouched.

## Approved verifier corrections — follow-up

The parent authorized exactly three corrections after independent verification.
The earlier scroll-to-expander evidence above is historical and is superseded
by default-visible geometry below; it is not the current acceptance method.

- [x] Preserve filter focus across 767↔768 relocation, including CSS-induced
  blur before the media event. Restore the same connected, enabled, visible
  element after Vue updates; reveal advanced controls before restoring incoming
  mobile focus. Hidden desktop modes/More fall back to the mobile switch.
  Deliberate BODY focus and focus outside filters are not stolen.
- [x] Make only the primary grouped outer expander header/body cells sticky-right
  at md+. Opaque card-backed muted surfaces preserve grouped hover/selection
  semantics and prevent text bleed. This changes table presentation only:
  all ten columns, zero card/content padding, horizontal overflow, mobile
  presentation, nested/flat shapes, and D6 aggregation remain unchanged.
- [x] Compact-date regression now opens the unified popover and uses associated
  Inicio/Fin names (including calendar/clear names), closes it for table checks,
  and reopens it for date checks. Account for existing deep-link auto-expansion
  instead of clicking an already-expanded group closed. Preserve ISO/date,
  status, detail, and 10 outer / 4 nested / 8 flat column assertions. Browser
  record requests are explicitly GET-only; no fixture record CRUD.

### Follow-up verification of record

Strict TDD remains explicitly disabled: no RED/GREEN lifecycle claim.
Read the injected craft floor before UI edits; incumbent DESIGN identity wins.

- `pnpm --dir web test`: 48 files passed, 1 skipped; 581 tests passed,
  38 skipped (rerun after final source changes).
- `pnpm --dir web typecheck`: passed after final source changes.
- `pnpm --dir web lint`: passed, 0 errors and 23 existing warnings.
- `git diff --check`: passed.
- `PW_BASE_URL=http://127.0.0.1:3003 NUXT_PUBLIC_PB_URL=http://127.0.0.1:8093 PW_OUTPUT_DIR="$STACK_DIR/fix-out" pnpm --dir web exec playwright test e2e/entries-desktop-filters.spec.ts e2e/entries-filter-layout.spec.ts e2e/entries-export.spec.ts e2e/entries-date-range.spec.ts e2e/entries-grouped-filter-consistency.spec.ts e2e/entries-load-recovery.spec.ts e2e/entries-partial-export.spec.ts e2e/entries-compact-dates.spec.ts e2e/dashboard-latest-load.spec.ts`:
  final **32/32 passed**. Earlier runs honestly failed: stale preset name,
  clicking an auto-expanded group closed, breakpoint CSS blur, and attempting
  focus before the desktop disclosure was visible. These were repaired within
  the authorized surfaces; two consecutive final browser runs passed 32/32.
- Focus assertions pass for machine and date trigger in both directions, with
  values preserved, advanced pane revealed, and no resize-triggered reads.
  Sessions and More fallbacks pass, as do outside-filter/BODY non-interference
  and original mobile control order.
- Default `scrollLeft: 0` geometry passes for header plus all 25 grouped row
  expanders across standard and read-only long-name response fixtures, both
  themes at 1280/1440. Header width 36px; every button is fully visible, 20px.
  At 1280: container x=265–1255, header x=1219–1255, buttons x=1227–1247.
  At 1440: container x=265–1415, header x=1379–1415, buttons x=1387–1407.
  Backgrounds are opaque theme card/muted mixtures, not transparent overlays.
- One batched screenshot inspection covered standard light1440/dark1280,
  rich light1280/dark1440, and mobile390. Expanders are visible without manual
  scrolling; underlying wide columns remain in DOM and horizontally reachable.
  No aesthetic changes or detector reruns were introduced.

Owned follow-up stack: `/tmp/kankaku-desktop-b-fixes.1VIr7u`.
Setup: `STACK_DIR=$(mktemp -d /tmp/kankaku-desktop-b-fixes.XXXXXX)` then
`scripts/isolated-stack.sh up "$STACK_DIR" --pb-port 8093 --web-port 3003 --seed`.
Only the allowed changed page source was copied into its web mirror for reruns.
Rich geometry uses GET catalog-response projection, not database mutations.
`entries-grouped.spec.ts` was intentionally excluded because it creates records;
the read-only compact-date spec proves the three existing column shapes instead.

Screenshots/JSON are retained under `$STACK_DIR/fix-out/`:
`entries-desktop-filters-real-ledger-{locale}-{theme}-{width}[-rich]-chromium/`
contains `collapsed.png`, `expanded.png`, and `default-visible-geometry.json`
(desktop); EN390 contains `mobile.png`. The breakpoint test folder
`entries-desktop-filters-br-08cd5--focus-and-preserves-values-chromium/`
contains `focus-desktop.png` and `focus-mobile.png`.

Teardown: `scripts/isolated-stack.sh down "$STACK_DIR"` stopped both recorded
processes (93186/93248); no leftover-listener warning. Data and logs retained.
Unrelated stacks and files remain untouched. No commit/push/version action.
## Final independent confirmation

Parent-reported independent scoped PASS confirms `git diff --check`, the native
production build, and **14/14 browser tests** covering only the new desktop and
compact-date specs. This is narrower than the writer's prior 32/32 browser run
and full unit/typecheck/lint evidence above; it does not recertify those suites.

Confirmation covered breakpoint focus/value preservation without capturing
unrelated or deliberate BODY focus; opaque sticky-right expander header/cells
with all 25 expanders default-visible inside table bounds in standard/rich
fixtures, light/dark at 1280/1440; and the unified Inicio/Fin date popover with
10 outer / 4 nested / 8 flat column checks. Wide tables still scroll horizontally
for other columns: sticky buttons do not mean every column fits by default.
Hover/selected styles were source-reviewed, not independently interaction-tested.
The mutation-oriented `entries-grouped.spec.ts` was excluded; read-only probes
verify column shape, not mock or record-mutation certification.

Final owned runtime `/tmp/kankaku-desktop-b-confirm.6ibaPP` was stopped with no
leftover-listener warning. The native build generated `web/.output`; no default
server changes were made. The parent copied real final screenshots to
`.impeccable/previews/entries-desktop/implemented-light.png` and
`.impeccable/previews/entries-desktop/implemented-dark.png`; the main capture is
accessible. No source app or prototype UI changes accompanied this finalization.

Branch: `feat/entries-desktop-filters`. PRODUCT/DESIGN, previews, critique, and
other unrelated untracked artifacts remain preserved. No automatic commit is
needed or authorized; no commit, push, or version bump was performed.
