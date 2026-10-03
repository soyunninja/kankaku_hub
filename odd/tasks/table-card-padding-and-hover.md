# Consistent padded table surfaces

Restore the Dashboard by-client Card's standard spacing on the Tasks list,
Unassigned queue, Sessions without task queue, and Entries results. Remove
purely decorative table hover effects while keeping controls functional and
keyboard focus visible. This supersedes the earlier full-bleed table intent.

## Decisions

| Surface | Decision |
| --- | --- |
| Four table cards | Shared Card `py-6`; CardContent `px-6`, without zero-padding overrides |
| Entries filter layer | Plain transparent grid with no Card skin, padding, border or radius; flatten More panel frame |
| Shared table rows | Keep dividers and selected-state fill; remove hover fill and color transition |
| Table buttons | Optional `noHover`, default false; strip hover utilities without replacing resting colors |
| Shared row actions | Forward the opt-out only from table instances; retain grid hover and tooltips |
| Clients and Projects titles | Use `text-xl`; retain semibold, tracking and translations; move total counts into localized search placeholders |
| Catalog search and scoped filters | Borderless muted fields; retain accessible names and focus rings; do not alter shared control defaults |
| Tasks help | Remove only the toolbar keyboard-help button; preserve board keyboard handlers |
| Entries modes | Match catalog List/Grid button-group shape with secondary active state and unchanged mode guards |
| Dashboard spacing | Both KPI grid and client/project breakdown grid use 24px gaps at every breakpoint |
| Tasks modes | Match catalog button-group shape; preserve board/list/history values and board keyboard behavior |
| Dashboard greeting | Safe localized auth-name interpolation at 24px/800 above a 20px/600 prefix; generic fallback; no personalized export metadata |
| Action-button borders | Borderless shared/native actions; exclude semantic field widgets and preserve focus/invalid rings |
| Responsive layout | Scroll tables internally; retain all measurements and sticky Entries disclosure |

No palette, period default, dataset, query, aggregation, density, export,
assignment, headerless shell, release, or dependency changes are included.

## Acceptance checklist

- [x] Four target Cards match reference 24px vertical and horizontal gutters in both themes.
- [x] Table rows, headers, cells, links and action/sort controls retain their resting appearance on hover.
- [x] Keyboard focus, selected states, invalid indicators, dividers, sorting, disclosure and SessionMarker filtering are preserved by source guards and focused browser cases.
- [x] Desktop Entries preserves 10/4/8 columns and its visible sticky disclosure.
- [x] Mobile identity, work and full cost values remain reachable at 320/390/430px without document overflow.
- [x] Clients and Projects titles match Entries at 20px.
- [x] Legacy viewport test explicitly selects catalog table views, retaining real table coverage.
- [x] Required unit, type, lint, diff, sidecar and read-only browser checks pass.
- [x] Scoped muted controls reach sampled text/placeholder contrast of at least 4.5:1; unchanged input-boundary guards retain 3:1.
- [x] Action buttons have zero physical border; semantic field boundaries and focus/invalid rings remain.
- [x] Named greeting is safe, localized, 24px/800; prefix and generic fallback remain 20px/600 with no overflow at 320px.

## Verification and handoff

The parent subsequently authorized the three locale files for dedicated counted
search keys and Dashboard's two specified grid-gap changes. All these refinements
belong to the same visual consistency unit; period and palette work remain deferred.

Strict TDD is disabled by the parent visual Vue/browser-wiring policy.
Use the parent's exact foreground verification commands and isolated
`:3003/:8093` seeded stack. Browser tests permit only reads, authentication,
read-only totals and subscriptions; exclude bulk assignment end-to-end.
Capture actual rendered light/dark evidence and stop the owned stack.
The parent owns independent review and all terminal Git actions.

## Observed validation history

- First source pass: 586 unit tests passed, 38 skipped; typecheck passed;
  lint passed with 23 warnings; diff and sidecar parse checks passed.
- First browser pass: 63/66 passed. The genuine catalog table viewport
  regression passed after explicitly selecting List. The desktop-filter
  breakpoint BODY-focus assertion failed. Both new desktop hover cases
  stopped at asynchronous queue checkbox selection: Playwright `check()`
  verified before the existing group-ID read completed. The test now uses
  click followed by a retrying checked-state assertion, without source
  selection changes or any record writes.
- The first owned stack was stopped; actual artifacts remain under
  `/tmp/kankaku-table-surfaces.hibPPQ/table-out`.

- Count-contract updates restored 586/586 active unit tests; all required
  source checks passed again.
- Second browser pass: 62/68 passed. Footer breakpoint synchronization
  passed with its original focus/body/closed-sheet assertions. Six failures:
  the initial accessibility case read the cold initial frame before loaded
  flat controls; both desktop hover cases assumed ascending rather than the
  existing descending first cost sort; both catalog cases assumed the seed
  summary's five clients rather than the actual migration-inclusive catalog;
  the dark multi-route mobile case exhausted a 30-second suite budget.
- Corrections preserve behavior: wait for the actual loaded accessibility
  control, assert descending then ascending plus matching read parameters,
  derive the count from the complete catalog response, and give only the
  intentional multi-route cases a bounded 90-second budget.
- Both previous owned stacks were stopped. No record writes occurred during
  browser verification; setup alone seeded fictional records.

The parent also authorized mode-selector test updates, greeting coverage and
borderless action-button policy, including the superseded palette-test button
border assertion. Input-boundary and text-contrast thresholds are unchanged.
- Third browser pass: all 69 tests passed, including every previously failing
  case, both table hover/focus themes, full narrow-screen measurements,
  safe localized greeting/fallback, and unchanged headerless shell behavior.
- The user then strengthened only the greeting name to 24px/800. Its
  regression now checks full literal-name wrapping at 320px. Desktop Entries
  captures explicitly await the detail Sheet closing before recording the
  padded table; task captures wait for functional tooltips to close.

## Final confirmation

- `pnpm --dir web test`: 586 passed, 38 skipped (48 passing files, one skipped).
- `pnpm --dir web typecheck`: passed.
- `pnpm --dir web lint`: passed with 23 pre-existing-style warnings and no errors.
- `git diff --check`: passed.
- Design sidecar JSON parse: passed; color values and all eight previews retained,
  with only supported outline-button border and table-padding guidance updates.
- Exact authorized browser suite, excluding bulk assignment end-to-end:
  **69/69 passed in 9.1 minutes** after the final 24px/800 greeting change.
  The earlier all-green 69-case pass is also retained; failure history above
  is not overwritten or represented as a first-pass success.
- Final artifacts: `/tmp/kankaku-table-surfaces.9vIZKK/table-out`, including
  both-theme padded Entries/Tasks captures, narrow ledger/filter-layer captures,
  safe greeting at 320px, and computed table-surface JSON.
- Final owned PocketBase and Nuxt processes stopped; all four owned stacks
  from this task are stopped. No commits, releases, dependency changes,
  date-default changes or palette-value changes were made.

The parent owns independent review and the separately queued period/palette
phases. No independent review outcome or blanket accessibility certification
is asserted here.
