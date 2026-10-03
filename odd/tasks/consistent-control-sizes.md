# Consistent control sizes

## Intent

Normalize equivalent controls across the whole app through shared opt-in utilities and components: ordinary controls are 44px tall, radius 16px, horizontal padding 12px, text-base/md:text-sm. Filled fields and period triggers use the existing muted palette without a physical border. Focus and invalid indicators remain opaque rings. Segmented groups are one 44px control with 4px padding and 36px, 12px-radius children.

No palette values, period defaults, query timing, domain arithmetic, schema, export/cache/detail guards or business record mutations belong to this change.

## Honest chronology

The writer inspected proposal.md and the dirty working tree, requested and received additional grants for attachment search and Command Palette, then wrote source and tests **before creating this document**. That ordering missed the requested durable pre-write tracking. This document was created after the third browser run, following the parent's progress reminder; it does not claim retrospective pre-write compliance.

## Independent defect correction — pre-source record

The independent verifier handoff `/tmp/kankaku-controls-independent.eE0xRn/handoff.json` reports eight confirmed defect groups despite 586 unit and 81 browser passes. This correction is restricted to: Tasks toolbar internal-shell overflow; explicit compact Button sizes; shared segmented Tabs geometry; 44px overlay Close buttons with header clearance; standalone sidebar Search; semantic checkbox/switch/textarea boundaries and opaque focus; primary hover opacity contrast; localized native date names and theme-aware picker color scheme. Existing dirty/untracked work is preserved. Palette tokens and business persistence remain untouched.

Strict TDD is explicitly disabled. Required unit/type/lint/whitespace/sidecar checks and the owned 3003/8093 read-only browser matrix will be recorded as observed, not retrospective RED/GREEN. Status-tab verification focuses only the active tab: inactive focus activates persistence and is forbidden. Native icon evidence must use actual Chromium paint, with platform limits stated.

Correction checklist (not a replacement for earlier completed work):
- [x] Correct and regress all eight independently confirmed groups.
- [x] Run every required foreground validation and report counts/failures.
- [x] Stop the owned stack on every outcome.

## Explicit exceptions

- Calendar day cells (32px), navigation (28px), month/year selectors (32px) stay compact.
- Dense table actions, variable-height mobile ledger links and sort buttons retain intentional local compact/wrapping geometry.
- Checkbox/radio/switch and multiline textarea geometry are not ordinary fields.
- Embedded combobox popup search remains an internal command affordance.
- Attachment and Command Palette embedded inputs are transparent; their 44px muted composite wrappers own visible focus-within rings.
- Primary/destructive/secondary action colors retain their meanings; ordinary action geometry is shared, not global wildcard CSS.

## Implementation checklist

- [x] Audit remaining local overrides before writes; obtain two additional path grants.
- [x] Add opt-in size, field and group utilities outside palette declarations.
- [x] Normalize shared Button, Input, NativeSelect and Select.
- [x] Use explicit segment size and remove conflicting local radius/mobile minimum-height overrides.
- [x] Match both period triggers; normalize Dashboard native date inputs without changing logic.
- [x] Restore composite search surface/focus ownership.
- [x] Update DESIGN.md and actual sidecar preview CSS without palette metadata changes.
- [x] Preserve text/semantic-widget guards; clarify retained textarea border measurements.
- [x] Add actual light/dark 320/390/1280 route geometry/screenshots.
- [x] Complete passing final browser validation and final unit/type/lint checks; whitespace/JSON checks reported in handoff.
- [ ] Complete required broader focus/invalid/semantic exception visual coverage; report factual limits.

## Validation history

Strict TDD disabled. RED/GREEN lifecycle evidence is not active.

- Initial unit run: 585 passed, one obsolete Input source expectation failed. After clarifying retained textarea boundaries: 586 passed, 38 skipped.
- Initial typecheck passed. Lint passed with 23 warnings, zero errors. Diff whitespace and sidecar JSON parse passed.
- Browser run 1, /tmp/kankaku-control-consistency.zZZzDg: foreground timeout at 600 seconds; failures exposed radius aliases and stale border/index assertions. Owned stack stopped.
- Browser run 2, /tmp/kankaku-control-consistency.FDrMNo: 75 passed, 6 geometry failures. Found Entries mobile minimum-height override and Button base rounded-md overriding semantic geometry. Fixed both. Owned stack stopped.
- Browser run 3, /tmp/kankaku-control-consistency.G1Soht: 79 passed, 2 old mobile touch-target guard failures because approved segmented children are 36px. All six new geometry tests passed. Corrected the guard to assert segment=36px plus outer group=44px, while retaining ordinary >=44px targets.
- Browser run 4 on the same final source snapshot: **81 passed (9.5 minutes)**. Evidence: /tmp/kankaku-control-consistency.G1Soht/control-out. Owned stack stopped; previous two stacks also stopped.
- Final unit run: 586 passed, 38 skipped. Final typecheck passed. Final lint: 23 warnings, zero errors.
- select-combobox.spec.ts was audited: its dialog case selects without saving; no mutating cases require exclusion. Requested bulk assignment exclusion retained.

## Independent correction validation history

- Initial required static checks: 586 unit passes, 38 skips; typecheck passes; lint 0 errors/23 warnings; whitespace check and sidecar parse pass.
- Owned stack `/tmp/kankaku-controls-fixes.bianU3`, browser run 1: 81 passes/6 failures. New tests sampled Close opacity during its transition. Added an auto-retrying opacity=1 assertion before contrast sampling, without weakening geometry/contrast thresholds.
- Run 2: 81 passes/6 failures. TooltipTrigger owns the final button data-slot, so the RowActions test locator was incorrect. Changed it to the actual table Edit button by accessible role/name; retained exact 32x32 checks.
- Extended owned/tmp focused harness executed the exact six new regression bodies. Initial result 3 passes/3 dark failures from switch transition sampling; auto-retrying real contrast assertions then passed all six. No injected DOM/prototype styling was used.
- Read-only destructive hover probe: light 4.698:1 passes unchanged; dark 3.090:1 fails because hover changes the existing 60% fill to 90% beneath white text. Preserved the existing dark resting fill on hover (`dark:hover:bg-destructive/60`), not a new palette or foreground. Primary hover now preserves its original opaque resting color. Both primary and destructive hover >=4.5:1 are asserted in the six-case regression.
- Stopped first owned stack; started final source snapshot at `/tmp/kankaku-controls-fixes.H9eGqE`. Extended focused harness: six passes.
- Full run 3: 86 passes/1 failure, the existing footer breakpoint test raced pending Sheet teardown/focus restoration. Test now waits for Sheet removal and restored desktop Search focus before deliberately blurring/resizing; body-focus=true, zero Sheet and zero extra reads remain required.
- Full run 4: **87 passes (10.6 minutes)**, including all six eight-group regressions. Evidence: `/tmp/kankaku-controls-fixes.H9eGqE/fix-out`; focused/hover evidence and read-only API log: `/tmp/kankaku-controls-fixes.bianU3`.
- Both owned stacks stopped with the authorized down command; evidence/data retained. Final static checks: 588 unit passes/38 skips, typecheck pass, lint 0 errors/23 warnings, git diff whitespace pass, sidecar JSON parse pass. API guard log contains no denied business request attempts.

The new regression matrix checks main and toolbar scrollWidth (not just document width), toolbar bounds/New task reachability, RowActions 32px/calendar day32/nav28, Tabs44/36/padding/radius/type and ACTIVE-only focus, Close44/opaque focus/header clearance/Escape restoration, Search44/radius16/padding12/type, actual semantic boundaries/checked focus/multiline textarea and checked/unchecked switch thumb contrast, filled hover text >=4.5, and associated localized Dashboard date labels with native picker pixels >=3:1. Every case guards against business write attempts.

## Key Learnings

1. TooltipTrigger can replace a child Button's data-slot; accessible role/name selects the actual row action reliably.
2. Contrast and opacity observations must wait for CSS transitions to settle while retaining the same thresholds; immediate samples can measure an intermediate paint rather than the final state.
3. Dark destructive hover can reduce white text contrast by increasing fill alpha, even when the existing lower-alpha resting fill is valid.
4. A responsive internally scrolling main requires its own scrollWidth guard: zero document overflow can hide off-screen controls.
5. Reka status tabs activate on focus; read-only visual tests must focus only the active tab and forbid PATCH attempts.
6. Native picker contrast can be asserted from real Chromium screenshot pixels independently of the input's computed foreground.

## Factual limits

Automated geometry evidence covers Clients/Projects/Tasks/Entries and the eight defect groups in both themes at 320/390/1280. Native picker glyph pixels are verified in current-host Chromium only; Safari/Firefox/iOS and OS popup chrome are not verified. Calendar month/year selects are not mounted by current routes: scoped compact CSS/source guards preserve their 32px contract, but no fabricated runtime claim is made. No valid business submissions, status changes, bulk assignment or profile saves were performed. Existing suites exercise keyboard/detail/export/query preservation and semantic control behavior. This is not a claim that every form and every focus/invalid/checkbox/switch/textarea state has been visually examined at every width. Palette values and contrast thresholds remain unchanged. Sidecar overrides use explicit preview selectors, not runtime wildcard styling.
