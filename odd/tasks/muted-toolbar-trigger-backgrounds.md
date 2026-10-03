# Muted toolbar trigger backgrounds

## Intent

Make Dashboard period, Tasks Completed history, Unassigned Assign group, Entries period/More filters, and shared Dashboard/Entries Export triggers use opaque semantic muted backgrounds at rest and after pointer-hover transitions in both themes. Preserve foreground, focus/invalid priority, disabled semantics, functional behavior and all palette primitives. No redesign or business writes.

## Bounded readiness correction intent — before test edit

Parent-provided read-only trace diagnosis (`/tmp/kankaku-toolbar-trace-diagnosis/sanitized-summary.json`) records a 320x844 main frame, goto load at 836502, ledger assertion failure at 841545, auth refresh completion at 841570, layout module at 841475, and first browse at 841812. This supports a pre-mount/auth timing failure, not a demonstrated viewport defect; persistent mobile failure remains possible until post-mount verification.

Only in the `mobile padded cards preserve full measurements` loop, immediately after Entries navigation, await visible `page.getByTestId('mobile-menu-trigger')` using the existing five-second default. Then retain the visible ledger and first session-group row assertions and every geometry/full-measurement guard. No timeout increase, viewport reset, mocks, production change, retry-until-pass, or ignored error. If this gate fails, stop and report evidence rather than invent another fix. Fresh unit/type/lint/whitespace and full seven-spec browser verification are required; owned stack cleanup is mandatory.

## Planned changes

- Add a narrowly scoped toolbar Button variant; preserve all existing variants.
- Opt in only the six named call sites. Shared Export uses ordinary 44px geometry rather than compact icon sizing. Assign group retains no-hover.
- Add read-only browser color/geometry/focus regression for light/dark at 320/390/1280.
- Update only focused design role notes.

## Checklist

- [x] Implement variant and call sites.
- [x] Add painted-color and functional regression.
- [x] Run required foreground static and browser checks.
- [x] Stop owned seeded stack and report evidence.
- [x] Obtain a fully passing required browser command; bounded readiness correction passed 47/47.

## History

Created before source edits. Existing dirty/untracked work is preserved. Strict TDD is disabled for visual wiring; RED/GREEN are not active. Only owned 3003/8093 runtime is authorized.

## Observed verification

- Final implementation static checks: 593 unit passes/38 skips; typecheck passes; lint zero errors/23 warnings; whitespace passes.
- Browser run 1: six new cases timed out because the harness read Export's identity after opening its modal menu; stopped at command timeout, then explicitly stopped the stack. Corrected the identity lookup before opening, without application changes.
- Run 2: 44 passes/3 missing-page-content failures. Run 3: 46 passes/1 first-case Entries readiness failure. Updated only the new helper's initial visibility wait to 30 seconds, preserving all assertions.
- Final run: 46 passes/1 failure, existing `mobile padded cards preserve full measurements: dark` at entries-mobile-ledger visibility (5 seconds). No test skipped or weakened to hide this failure. Status remains partial.
- All six new matrix cases passed on final source: seven triggers each, 42 enabled trigger checks at rest/settled hover/focus; height44, radius16, border0, mobile16/desktop14 font. Actual sRGB fill is light [242,242,242,255], dark [28,28,28,255], equal to computed muted and opacity1. Focus indicator alpha1 and contrast >=3; period/export Escape restoration and Completed history open/close focus pass. API mutation arrays are empty.
- Evidence: `/tmp/kankaku-muted-toolbar.ZviK0A/toolbar-out`, including six muted-toolbar-colors.json files and captures. All four owned stacks stopped; data retained.

## Bounded readiness correction receipt

Only two files were authored in this resumed correction: this task record and `web/e2e/table-surface-consistency.spec.ts`. The test delta is exactly one assertion after Entries navigation in the mobile padded-card loop: `await expect(page.getByTestId('mobile-menu-trigger')).toBeVisible()`. It uses the existing five-second default. All ledger, first-row, gutter, overflow and full-measurement assertions remain unchanged; no production file was modified.

Fresh ordinary verification:
- `pnpm --dir web test`: 593 passed, 38 skipped (48 files passed, one skipped).
- `pnpm --dir web typecheck`: passed.
- `pnpm --dir web lint`: zero errors, 23 warnings.
- `git diff --check`: passed.
- Exact required seven-spec command, correct 127.0.0.1 paired URLs: **47 passed, zero failed (12.3 minutes)** on fresh seeded `/tmp/kankaku-toolbar-readiness.CdbBYO`.
- Both mobile padded-card theme tests pass at 320/390/430, including the unchanged post-readiness ledger and full-measurement assertions. This resolves the observed pre-mount race in this run; it is not a cross-browser certification.
- Durable reporter receipt: `/tmp/kankaku-toolbar-readiness.CdbBYO/browser.log`. Evidence/captures/color JSON: `/tmp/kankaku-toolbar-readiness.CdbBYO/toolbar-out`. Six color JSON files record empty mutation arrays; the passing guarded suite and reporter contain no forbidden/denied business request failure. No business CRUD/status/assignment was performed.
- Cleanup receipt: `/tmp/kankaku-toolbar-readiness.CdbBYO/teardown.log`, records stopping owned PIDs 66505 and 66885 and retaining data. No other stack was touched.
- Strict TDD remains disabled; no RED/GREEN lifecycle is claimed. Parent independent verification remains required; no native review closure is claimed.

## Scope clarification and limits

The mapped per-row Assign group action is already enabled without checkbox selection; the separate selected-row action is not this call site. Existing disabled semantics were preserved, and no assignment action was submitted. Geometry uses canonical icon size for icon-only Export (44px with zero internal padding), not compact icon-sm. No palette/sidecar, primary/destructive style, state/query or unrelated file was authored here. Chromium computed-color canvas conversion is the evidence; this is not cross-browser certification or a claim that every previous baseline suite was rerun.

## Key Learnings

1. Modal menu opening can remove background buttons from accessible-role lookup; capture trigger identity before opening.
2. First-route dev compilation can exceed a five-second readiness assertion; wait for actual visibility without weakening surface thresholds.
3. The mapped per-row Assign group action has different selection semantics from selected-row assignment; preserve the actual call site's behavior.
4. A successful navigation load and login URL change do not prove SPA layout/auth readiness; the mounted mobile layout trigger supplies a bounded semantic gate before asserting the ledger without changing its own timeout.
