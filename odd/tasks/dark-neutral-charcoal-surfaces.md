# Neutral charcoal dark surfaces

Use the approved charcoal background/card hierarchy without adopting the
reference application's lime accent, layout, or content. Preserve Gentleman-Cute
pink interactions and existing data/status identity. Closed: the parent reports
current-candidate independent PASS (`taskmurmobcm-7-eek6`); all known source
blockers are fixed. This request authorizes only the charcoal change, not a
version bump, commit, push, or npm release.

## Scope and intent

- Only `.dark` surface primitives and neutral secondary text change in CSS.
- Preserve the entire light `:root` block byte-for-byte, including comments.
- Preserve existing off-white text `oklch(0.959 0.009 342)` and near-black
  primary/status foregrounds `oklch(0.113 0.011 316)`. Those foregrounds no
  longer mirror the canvas; their existing contrast is unchanged.
- Preserve pink primary/ring/selection, sidebar active selection, chart tokens,
  avatar duplication, Others-series color, statuses, layout, typography,
  radii, behavior, other-page implementations, and measurement data flows.
- Synchronize DESIGN.md and only matching sidecar color metadata/ramps;
  retain all eight static component previews and engineering metadata.

Forecast: approximately 150 authored lines before implementation, one bounded
multi-file theme/test/documentation work unit. TDD is disabled by the parent's
visual/theme-wiring policy; these are ordinary functional checks, not RED/GREEN.

## Exact token replacement map

Every value below is inside `oklch(...)`. All new primitives have C=0, H=0
and are opaque. Rounded OKLCH conversion reproduces the listed sRGB hex values.

| Dark token | Previous value | New value | Approximate new hex |
|---|---|---|---|
| background | 0.113 0.011 316 | 0.191251 0 0 | #141414 |
| card | 0.155 0.014 332 | 0.226450 0 0 | #1C1C1C |
| popover | 0.190 0.007 315 | 0.280940 0 0 | #292929 |
| secondary | 0.229 0.026 332 | 0.280940 0 0 | #292929 |
| muted | 0.195 0.017 335 | 0.226450 0 0 | #1C1C1C |
| muted-foreground | 0.673 0.035 345 | 0.810 0 0 | #C1C1C1 |
| border | 0.362 0.060 354 / 55% | 0.340697 0 0 | #383838 |
| input | 0.362 0.060 354 / 75% | 0.680 0 0 | #989898 |
| sidebar | 0.155 0.014 332 | 0.226450 0 0 | #1C1C1C |
| sidebar-border | 0.234 0.034 350 | 0.340697 0 0 | #383838 |

Canvas/card/elevated hex values are explicit visual estimates from the approved
brief, not sampled screenshot pixels. PIL was unavailable; no package was
installed, no reference image was copied, and no private reference content was
transcribed. Input/text/divider grays are implementation choices, not reference
matches. Subtle dividers are not claimed to meet control-boundary contrast.

Opaque input strokes remain visible on the source's existing 30%-input fills;
neutral secondary text is lighter to preserve placeholder contrast on these
fills. The approved correction changes only outline's dark hover background
from input/50 to the existing semantic accent. No new token, component selector,
runtime conversion helper, layout change, or light-mode override is introduced.

## Acceptance checklist

- [x] Neutral charcoal canvas, cards/sidebar, and elevated surface hierarchy.
- [x] Pink primary, focus, and selection preserved; no lime accent introduced.
- [x] Light block exact comparison and immutable SHA256 guard.
- [x] Exact neutral tokens and unchanged remaining dark block guarded.
- [x] Both chart/avatar palettes remain synchronized without editing avatars.
- [x] Existing ten AA pairs pass in both themes; elevated text and input-fill
  boundary/placeholder alternate cases also pass.
- [x] DESIGN.md primitives match the sidecar; all eight component previews
  compare exactly with HEAD.
- [x] Initial visual inspection captured Dashboard and Entries in both themes.
  Independent verification subsequently required the bounded correction below.
- [x] Browser keyboard/detail/filter/export/load-recovery checks pass.
- [x] Owned isolated stack stopped; screenshots/logs retained in temporary storage.
- [x] Parent-owned independent final verification and disposition: current-candidate PASS.

## Observed validation

The results below are writer-observed; current-candidate full unit (585 passed,
38 skipped), lint (0 errors, 23 warnings), and focused browser (35 passed)
results belong to `taskmurmdcyt-6-chm1`. They were not rerun by the independent
verifier; its separate bounded results are recorded under Final closure.

| Command | Result |
|---|---|
| `pnpm --dir web exec vitest run tests/dark-palette.test.ts` | 8 tests passed |
| `pnpm --dir web test` | 585 passed, 38 skipped; 48 files passed, 1 skipped |
| `pnpm --dir web typecheck` | Passed |
| `pnpm --dir web lint` | Exit 0; 23 warnings in unchanged components |
| `git diff --check` | Passed |
| `node -e "JSON.parse(require('fs').readFileSync('.impeccable/design.json','utf8')); console.log('Design sidecar parses')"` | Parses |

The exact parent-authorized Playwright invocation covering
`entries-mobile-ledger`, `entries-desktop-filters`, `entries-accessibility`,
`entries-export`, `entries-load-recovery`, and `dashboard-latest-load` passed
all 35 tests on ports 3003/8093. The isolated setup seeded fictional data;
no record CRUD was performed by the custom capture script. Its allowlist blocked
realtime subscription POSTs. Initial custom capture attempts stopped on that
POST and then a network-idle timeout; the successful capture used settled theme
flags, visible main content, and a post-render delay instead of waiting for SSE.

The one authorized Impeccable detector invocation returned `[]` for the CSS
file. This is a bounded static result, not a substitute for browser evidence or
an accessibility certification.

### Contrast and identity evidence

Computed with the unchanged `client-avatar.ts` conversion/contrast helpers:

- Minimum of the ten light pairs: primary foreground / primary **4.5818:1**.
- Minimum of the ten dark pairs: destructive foreground / destructive
  **7.7869:1**. Its token pair did not change.
- Superseded initial calculations interpolated opaque OKLab lightness instead
  of compositing translucent input over the surface. Independent browser
  evidence found placeholder **4.4890:1** and outline hover **3.8222:1** failures;
  resting boundary **3.0438:1** passed. Initial token checks were not rendered proof.
- Corrected candidate browser pixels at both 390px and 1280px: date input fill
  `[74,74,74]`, stroke `[152,152,152]`, placeholder `[193,193,193]`;
  placeholder **4.9231:1**, resting boundary **3.0722:1**.
- Corrected outline hover uses existing semantic accent `[40,18,30]`, unchanged
  pink foreground `[255,177,221]`: text **10.5270:1**, border **6.0893:1**.
- Tests now composite encoded sRGB and quantize pixels, guarding actual source
  input classes and outline variant. Conservative rounded math initially failed
  the old input stroke (2.9962:1); input was raised slightly rather than weakening
  the 3:1 requirement.
- Extra foreground and secondary-text checks cover canvas, card, popover,
  secondary, muted, and sidebar surfaces.
- Light raw-block SHA256:
  `78c2d230822b36228e309e807434083fb644030ba42affe2e0002726320b48e1`.
- Remaining dark raw lines SHA256, excluding the ten changed tokens:
  `c9bd320f5bb895f3e56653a50aa12e97538682579cdc809d2a7c8c6ee7cc5597`.
- Direct comparison of the current light block with HEAD returned true.
- Computed browser dark body background is `oklch(0.191251 0 0)`; card/sidebar
  are `oklch(0.22645 0 0)` and dividers `oklch(0.340697 0 0)`.
- Light browser body remains `oklch(1 0 0)` with unchanged pink and chart tokens.

These checks protect the specified pairs and existing fills, not every possible
opacity combination, disabled state, chart label, or formal WCAG conformance.

## Corrective verification

All six required commands passed again: focused 8 tests; full 585 passed and
38 skipped; typecheck passed; lint had the same 23 warnings and no errors;
diff check passed; sidecar parsed. The exact six-spec browser command passed
35 tests. Two custom capture attempts failed (module resolution, then hidden
mobile date filter); the successful capture opened More filters first.

Corrective owned stack: `/tmp/kankaku-charcoal-contrast-fix.CnsxAi`.
`actual-contrast.json`, `rest-390.png`, `hover-390.png`, `rest-1280.png`, and
`hover-1280.png` record settled real popover controls. Dashboard and mobile
Entries captures are also retained. Browser confirmation here covers Chromium,
not Safari. Typed-date and active search states were not separately sampled
in this corrective run; the later independent run below covers them.

## Final closure

Parent-reported independent verification (`taskmurmobcm-7-eek6`) passed the
current candidate: palette 8 tests, typecheck, build, diff check, sidecar checks,
and 26 bounded browser tests covering mobile ledger, desktop filters, and date
range. All 73 documented colors match source/sidecar; all eight static previews
remain unchanged. The light `:root` is byte-exact with HEAD; pink, statuses,
chart/avatar identity, and layout remain unchanged. The only outline variant
class change is `dark:hover:bg-input/50` → `dark:hover:bg-accent`.

The independent run measured 42 samples at 390px and 1280px across card search,
canvas command search, and popover date/input controls: rest, hover, focus,
typed text, and valid dates applied with an actual GET. Current minima:
placeholder **4.9231:1**, typed text **7.8324:1**, resting control boundary
**3.0722:1**, pink outline hover text **10.5270:1**, hover boundary **6.0893:1**.
No application errors were observed. A capture timezone-predicate timeout was
corrected in the read-only harness, not in the application.

Current English-generated evidence:
`/tmp/kankaku-charcoal-final.OJF8ym/{actual-controls.json,dashboard-dark-1280.png,entries-dark-390.png}`.
The parent archived current-fix captures at
`.impeccable/previews/dark-neutral-charcoal/implemented-dashboard-dark.png` and
`.impeccable/previews/dark-neutral-charcoal/implemented-entries-dark.png`, not
old screenshots. All owned stacks are confirmed stopped.

This closes the corrective chain, not an all-pass-first-time claim. Source and
encoded-sRGB/actual-alpha tests remain authoritative over superseded estimates.
Coverage is bounded Chromium evidence, not real-device, Safari/other-engine,
screen-reader, or WCAG certification. Native Japanese layout is unchanged;
no fresh native-Japanese certification is claimed. Private reference imagery
was never copied; reference colors remain estimates, not sampled pixels.

## Runtime evidence (initial candidate)

Owned temporary stack: `/tmp/kankaku-charcoal-dark.FTrKNw`.

- `dashboard-dark-1280.png`: actual Spanish read-only Dashboard.
- `entries-dark-390.png`: actual Spanish grouped mobile Entries.
- `dashboard-light-1280.png`: actual Spanish light Dashboard confirmation.
- `computed-tokens.json`: settled theme flags and computed semantic primitives.
- `visual-out/`: all 35 browser tests' captures and geometry evidence, including
  mobile cost/detail and keyboard focus scenarios.
- `nuxt.log` and `pocketbase.log`: retained stack logs.

No source screenshot output, commit, tag, version bump, push, package build,
publication, memory write, or unrelated-file modification was performed.

## Key learnings

1. Transparent color mixing preserves input color; painting composites encoded sRGB.
2. Charcoal elevation requires checking placeholders on blended input fills.
3. Browser network-idle waits can stall on persistent realtime subscriptions.
