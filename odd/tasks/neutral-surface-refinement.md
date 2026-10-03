# Flat neutral surfaces and pink active navigation

Apply the latest incremental visual approval in both themes: retain the light
`#F9F9F9` canvas and white cards, remove decorative shadows throughout the
application, and show the same strong pink on the active sidebar icon and label. This is a
refinement of [neutral charcoal surfaces](dark-neutral-charcoal-surfaces.md),
not a replacement of that historical task's time-bound light-block guard.

## Intent and boundaries

| Surface | Current decision |
|---|---|
| Light canvas / cards | `#F9F9F9` / `#FFFFFF`, already approved and implemented |
| Dark canvas / cards / elevated tone | `#141414` / `#1C1C1C` / `#292929`, preserved |
| Shared Card | No outer border and no decorative shadow |
| Entries filter Card | No desktop border or shadow override |
| Controls and overlays | Remove individual shadow utilities, retain semantic borders |
| Active tabs | Remove active shadow only; preserve tab semantics and rings |
| Sidebar selection | Transparent resting fill, matching strong pink icon and label |
| Catalog cards | Remove Clients/Projects grid borders and Clients mini-box outer borders |
| Sidebar hover | Neutral muted fill; no pink selection fill |
| Keyboard focus | Preserve control rings; explicit two-pixel sidebar ring and offset |

Strong navigation pink uses existing `sidebar-primary`: approximately `#DA1272`
in light and `#F095C8` in dark. No new color primitives are introduced. The
existing charcoal input/placeholder and dark outline hover contrast corrections
remain intact. All 73 documented primitives and chart/avatar identity are
unchanged in this refinement.

Geometry, radii, padding, table dividers, input/button borders, invalid-state
indicators, localized labels, authentication, and data/API behavior are outside
the visual change. No version bump, commit, push, build-for-publication, or
release is authorized. Historical generated previews and critique images are
not regenerated or edited.

## Implementation and review path

1. Inspect shared Card and the Entries filter override; preserve inner dividers.
2. Inspect individual control/overlay shadow removals, including active tabs.
3. Inspect shared SidebarNav: matching active icon/label pink, transparent rest,
   neutral hover, explicit keyboard ring, and matching-route `aria-current`.
4. Inspect DESIGN.md and the sidecar's eight retained static previews. Only
   decorative preview shadows disappear; focus/invalid spread indicators remain.
5. Inspect the read-only surface regression alongside existing Entries suites.

## Tasks

- [x] T1 — Source: finish catalog border removal and the latest active-icon approval;
  synchronize the existing design documentation without changing palette or behavior.
- [x] T2 — Surface verification: read-only Dashboard, Entries, Clients, and Projects
  checks at 390px/1280px in both themes, with keyboard and overlay evidence.
- [x] T3 — Final proof: run every required validation, inspect captures, report
  detector findings and limitations, and stop the owned stack before handoff.

Forecast: approximately 250–400 authored changed lines, excluding generated
artifacts; one focused source/test/documentation work unit. Delivery strategy is
ask-on-risk, with no terminal Git action requested. Strict TDD is disabled by
the parent visual-wiring policy: these checks are ordinary functional evidence,
not a fabricated RED/GREEN lifecycle. Final test/task documents total 311 lines
before this sizing note; tracked allowed-path diffs also include pre-existing
palette work. The combined review surface exceeds 400 lines, so any later PR
needs parent sizing review; no commit or split is authorized in this phase.

## Acceptance and verification

- [x] Individual decorative shadow utilities removed without global suppression.
- [x] Desktop Entries filter outer border removed; row dividers remain.
- [x] Shared desktop/mobile navigation uses matching pink active icons and labels.
- [x] Clients/Projects grid cards and Clients mini-boxes have no decorative borders.
- [x] Current-route semantics and explicit keyboard navigation focus preserved.
- [x] Documentation describes flat surfaces and preserves all color primitives.
- [x] Required palette, unit, typecheck, lint, diff, and sidecar checks observed.
- [x] Required read-only browser regression observed on the owned seeded stack.
- [x] Batched desktop/mobile Dashboard, Entries, Clients, and Projects captures inspected in both themes.
- [x] Owned stack stopped; evidence and limitations recorded below.

The new browser spec refuses any stack other than paired `:3003/:8093`. It
permits only GET requests, authentication POSTs, and the read-only totals POST;
record CRUD, assignment, saved-state writes, and deletion are not exercised.
Setup seeding is explicitly authorized only in the owned temporary stack.
Success export and simulated GET failure exercise real local toast rendering
without API writes. Runtime rings are separated from decorative elevation:
zero-offset, zero-blur spread remains valid and must not be globally disabled.

## Observed evidence

The source scan before editing found active tabs in addition to the original
bounded list; the parent explicitly added that exact component. The subsequent
catalog expansion authorized both grid pages and Clients detail mini-boxes.
The final source scan has only intentional `shadow-none`, transition-property
references, and a comment; no decorative shadow or drop-shadow utility remains.

| Required command | Observed result |
|---|---|
| `pnpm --dir web exec vitest run tests/dark-palette.test.ts` | 9 passed |
| `pnpm --dir web test` | 586 passed, 38 skipped; 48 files passed, 1 skipped |
| `pnpm --dir web typecheck` | Passed |
| `pnpm --dir web lint` | Passed; 23 warnings, zero errors |
| `git diff --check` | Passed |
| Sidecar JSON parse command | Passed |

The exact authorized eight-spec browser command finally passed **44/44**.
Earlier runs were **40 passed / 4 failed** twice, then **42 passed / 2 failed**:
first the new harness rejected auth-refresh, then realtime registration, then
it selected desktop table rows on mobile. Auth refresh is now permitted as
authentication; realtime POST registration is aborted rather than forwarded.
The mobile assertion now checks its actual ledger border-top. No application
source was changed to work around these harness failures. Existing 39 browser
tests passed on every run; the source shadow audit also passed on every run.

New runtime cases cover all four routes, both themes, and both widths:
zero card borders, no blurred/offset shadows, painted canvas/card pixels,
Clients detail boxes and retained section dividers, shared mobile navigation
sheet, matching active label/icon pink, neutral hover, semantic current page,
keyboard navigation/outline-button/input rings, combobox and date popover,
export menu, real success/error toasts, desktop command dialog, and ledger
row dividers. Other control invalid states and less-used overlays have source
coverage, not a claim of exhaustive rendered-state coverage. No record CRUD
or API assignment was performed.

Owned stack: `/tmp/kankaku-flat-surfaces.8SDT7i`, now stopped. Its `surface-out/`
contains 16 English Dashboard/Entries/Clients/Projects captures plus four
navigation captures and attached semantic pixel evidence. All 16 route captures
and mobile dark navigation were inspected: flat cards, retained control/divider
boundaries, unchanged density and radii, and visible pink icon/label selection.
The Nuxt debug pill remains in some PNGs because its capture-only hiding style
was lost on full navigation; it is an external development overlay, not an
application elevation defect. Historical preview assets were not altered.

The one authorized detector invocation on SidebarNav.vue and Entries returned
`[]`. This bounded static result is not a certification. Source semantics remain
`sidebar-primary`, with intermediate approximately `#DA1272` light / `#F095C8`
dark pink. Parent-owned upcoming all-dark-pink synchronization and header/account
relocation are separate phases; this closes only shadow/catalog/navigation work,
not the whole evolving visual feature. Tests compare rendered semantic colors,
not a hardcoded dark pink that would obstruct that next phase.

Coverage is bounded Chromium evidence, not device, screen-reader, Safari, or
formal accessibility certification. This phase never edits the light canvas
hash guard, CSS primitives, avatars, chart identity, version, or release metadata.

## Key learnings

1. Tailwind keyboard rings share box-shadow, so elevation tests must allow spread.
2. Read-only browser guards need authentication refresh without permitting record writes.
3. Mobile ledger dividers use border-top rather than desktop table row borders.
