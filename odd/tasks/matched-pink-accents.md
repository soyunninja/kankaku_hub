# Matched pink accents

## Intent

Match each dark brand-pink role to its corresponding existing light primitive, without changing the light block, charcoal surfaces, nonpink status/chart roles, measurement logic, or verified control geometry. Primary/sidebar-primary/rings use `oklch(0.580 0.228 1)`; chart-1 uses the distinct `oklch(0.650 0.228 1)`. Filled primary labels use the existing light white foreground. Ordinary dark text links and active navigation labels use the existing neutral foreground; active navigation icons retain pink only when rendered contrast reaches 3:1.

## Consumer audit before source edits

- CSS tokens and aliases; chart CSS/TS duplication; client-avatar mapping and actual initials foreground.
- Primary-filled buttons, generic avatar, calendar selected days, checkbox checkmarks, switch thumbs, progress/data marks, login and shell Gauge icons.
- Plain primary text: Button link variant, Settings website, EntryDetailSheet empty-prompt guide, SidebarNav active labels.
- Accent foreground: menus/comboboxes, command palette, theme/locale choices, attachment candidates, calendar today and ghost/outline hover. Dark accent pairs become charcoal/neutral rather than copying the light tint.
- Focus: existing opaque shared-control rings stay opaque. Linked badge primary hover and focus, plus focused invalid checkbox/textarea/badge states, require rendered checks before narrow fixes. Textarea scope was explicitly added only for a confirmed invalid-ring contrast failure; multiline geometry is protected.
- Skeleton/progress/chart/SVG/rings are not normal text. Task drag rings are drag feedback, not focus/invalid rings; business drag interactions are forbidden in this verification.
- Existing avatar tests are at `web/tests/client-avatar.test.ts` (read-only for this grant), not the granted nonexistent `web/app/lib/client-avatar.test.ts`. Palette guards can cover the actual near-black primitive using the existing conversion helpers without introducing a color algorithm.

## Checklist

- [x] Read proposal, design, current palette tests and sources; inspect and preserve existing dirty/untracked work.
- [x] Complete consumer audit before source edits; subsequent full focus audit yielded one approved 14-path presentation-only additive batch.
- [x] Match dark role-specific pink and synchronize chart TS.
- [x] Neutralize dark small text and preserve light nav pink/transparent selection/neutral hover/focus.
- [x] Measure real rendered normal/hover/focus/invalid states at light/dark 320/390/1280; make only confirmed indicator fixes.
- [x] Guard light hash, unrelated dark declarations, all 73 design primitives and avatar identity/foreground contrast.
- [x] Synchronize current design metadata and previews after checks; do not update archival critique scores.
- [x] Run required unit/typecheck/lint/diff/JSON and combined browser verification; stop owned stack on all outcomes.

## Verification boundaries

Visual TDD is explicitly disabled; ordinary foreground checks are mandatory. Only an owned isolated seeded :3003/:8093 stack may be used. Auth/refresh, read-only totals and realtime registration are allowed; all business writes are forbidden. Forms may be opened/filled/cancelled without saving. Only an already-active task status tab may be focused. No backend/schema/query/date/export changes, dependency mutation, publication, or terminal Git actions.

## Authorized contrast resolution

The first exact-pink candidate failed real Chromium contrast on elevated `#292929`: 2.986252:1 at all three dark widths. The human explicitly preserved both exact pink and all surfaces, authorizing the existing neutral foreground for dark focus and failing graphical contexts. No threshold was lowered or rounded, and no pseudo border pair was introduced.

`--focus-indicator` is a semantic alias outside palette declarations: light resolves to existing `--ring`, dark to existing `--foreground`. Explicit focus ring/outline/border consumers opt in; there is no global `--tw-ring-color` override. Invalid controls have full destructive paint with explicit focused-invalid priority. Dark selected calendar days use existing foreground/background neutrals; sidebar icons remain exact pink on the passing card/muted surface. Linked primary badges keep opaque hover and focus. Shared link buttons use neutral normal-text foreground in both themes, including light secondary where primary text measured only 4.352:1.

## Observed verification history

- Initial candidate: unit 589 passed / 38 skipped / 2 failed; browser 71 passed / 9 failed. Three dark control cases confirmed 2.986252:1 focus on elevated surfaces. Badge focus measured 1.537:1; textarea invalid focus 2.094:1; checkbox invalid focus 2.088:1. New-spec lint import ordering also failed. These failures are retained as history, not claimed as environmental failures.
- Authorized correction, before final metadata/test-evidence synchronization: unit 592 passed / 38 skipped; full authorized browser list 80 passed in 11.0 minutes, including all six light/dark 320/390/1280 matched-pink cases, guide/menu checks, and existing date-route/export/geometry regressions. No business writes were attempted by the guarded palette harness.
- Corrected captures before the final painted-shadow strengthening: `/tmp/kankaku-matched-pink.fozldY/pink-out`.
- Final implementation/test/docs checks: `pnpm --dir web test` passed 593 tests (38 skipped, 48 files passed / 1 skipped); `pnpm --dir web typecheck` passed; `pnpm --dir web lint` passed with the existing 23 warnings and zero errors; `git diff --check` passed; the authorized JSON parse command printed `Design sidecar parses`.
- Final foreground browser command passed all 80 tests in 11.1 minutes against a fresh isolated seeded :3003/:8093 stack. The palette harness waits for actual CSS transitions to finish and extracts the painted nonzero-spread shadow color, rather than treating the declared ring color as painted evidence. All six palette matrix cases passed, including normal/hover/focus/invalid controls, selected calendar graphics, menu text and guide links.
- Final evidence root: `/tmp/kankaku-matched-pink.XqDqxB/pink-out`. Each of the six `matched-pink-accents-*` directories contains `matched-pink-evidence.json`, `navigation.png`, `settings-and-variants.png`, `form.png`, `calendar.png`, and `guide.png`. JSON contains colors/contrast/shadows only, not authentication or record dumps. All owned stacks were stopped with the authorized down command; temporary evidence is retained, not purged.

### Actual Chromium samples

| Consumer | Painted foreground / surface | Contrast |
| --- | --- | --- |
| Filled primary label, normal and hover, both themes | `#F8F8F8` / `#DA1272` | 4.587:1 |
| Dark active sidebar icon, normal and hover | `#DA1272` / `#1C1C1C` | 3.498:1 |
| Dark active sidebar label | `#F6EFF3` / `#1C1C1C` | 15.061:1 |
| Dark elevated focus / calendar graphic / menu text | `#F6EFF3` / `#292929` | 12.857:1 |
| Dark invalid textarea focus | `#FF718F` / `#141414` | 7.027:1 |
| Dark invalid checkbox focus | `#FF718F` / `#1C1C1C` | 6.501:1 |
| Dark invalid linked badge focus | `#FF718F` / `#292929` | 5.550:1 |
| Chart-1 avatar initials, both themes | `#0A0A0A` / `#F43887` | 5.432:1 |
| Light shared link on secondary | `#0A0A0A` / `#F2F2F2` | 17.685:1 |
| Light Settings website | `#DA1272` / `#FFFFFF` | 4.872:1 |
| Light entry guide | `#DA1272` / `#F9F9F9` | 4.627:1 |

These sampled chart pixels are `#F43887`, not the historical comment's nominal `#F43888`; the normative OKLCH primitive is unchanged in light and exactly matched in dark. Light canvas/card pixels remain `#F9F9F9` / `#FFFFFF`; dark canvas/card/elevated pixels remain `#141414` / `#1C1C1C` / `#292929`. Light block SHA256 remains `2f2e795af397435fa726d9c5dfb0f1273806ab5639fdb4ef78e048a023fa3ecc`.

Parent retains independent combined final build/matrix and native review authority; no review disposition is claimed here. Chromium is the verified renderer; other browser/platform rasterization remains outside this delegated verification.

## Settled light navigation correction

Independent combined verification (`/tmp/kankaku-final-combined.H5Ej3W/handoff.json`) confirmed one defect at light 320/390/1280: the explicit child pink label overrides ancestor hover text, leaving `#DA1272` on settled `#F2F2F2` at 4.352:1, including hover plus keyboard focus. Previous passing hover receipts sampled intermediate `#FAFAFA` (4.667:1); they do not establish settled hover acceptance. The approved correction is a child group-hover neutral foreground, preserving resting light pink, dark neutral text, pink icons, transparent selection, neutral hover and focus semantics. Browser coverage will await actual finite ancestor/child CSS transitions and animations before contrast checks and assert settled hover and hover-focus colors at all three widths in both themes. No palette or background changes are authorized.

Correction validation history: the first unit run hit an exact source-string guard; retaining the original conditional class pair and adding the hover class as a separate conditional key restored 593 passing tests. The first focused browser run passed 13 tests but all six palette cases failed when the overbroad ancestor-subtree animation wait encountered an unrelated closing popup's cancelled animation. The wait now follows only the sampled element and ancestor paint, and rechecks finite replacement transitions after cancellation rather than accepting intermediate paint.

The corrected focused run (`/tmp/kankaku-sidebar-final-fix.LLvruc/browser-result.txt`, exit 1) passed 13 tests and failed six palette cases later at the existing chart-1 initials-avatar visibility assertion on the fresh standard seed. All six cases had already passed settled navigation hover and hover-focus contrast and exact-color assertions: light foreground `#0A0A0A` on `#F2F2F2`, dark `#F6EFF3` on `#1C1C1C`; pink icons remained unchanged. Navigation PNGs and failure traces are retained in `fix-out/`. No avatar assertion, fixture identity, palette or seed was changed to bypass the failure. Closure remains partial, not a passing full suite. Both owned stacks were stopped; unrelated processes were not touched.

## Deterministic chart-1 browser fixture

Diagnosis used a read-only immutable SQLite query of the failed owned standard seed and the actual exported `avatarColorVar` helper. IDs `1pkw6asgnlkvvqi`, `chossa64czwcbzl`, `98806ic7esiu8sm`, `x1v7zcpm1fhjtog`, `7hu1vit4qj66tzu`, `213thz6ufviali8` map to chart slots 2/3/4/5/5/2 respectively; all have empty favicon and therefore initials state. Standard seed creation sends no record IDs, so natural-key determinism does not guarantee palette-slot coverage. The first ordinary read-only SQLite open failed; immutable read-only access succeeded without filesystem writes.

Before the test correction: parent authorized replacing only one list-response identity with valid 15-character `pinkclient00001`, which the existing exported helper proves maps to `var(--chart-1)`. The test will fetch the actual seeded GET response, preserve every other record field and list/count field, render the real ClientAvatar component, retain the chart-1 contrast assertion, and remove the response route before real form checks. No backend record, avatar algorithm, styling or unit test changes.

Fixture validation: `/tmp/kankaku-sidebar-final-fix.FD0xA9` completed all six palette cases and wrote their JSON; the overall command passed 18 tests and failed the unchanged headerless breakpoint no-extra-reads assertion with 17 initial dashboard requests. Without changing that test or application code, a fresh foreground rerun at `/tmp/kankaku-sidebar-final-fix.LF4f9r` passed all 19 tests in 3.0 minutes (durable `browser-result.txt`: `browser=0`). Both owned stacks were stopped. Final six JSON files show settled light hover and hover-focus `#0A0A0A` on `#F2F2F2` at 17.68489386009229:1, unchanged pink icon at 4.3517169872232335:1, and resting pink label at 4.667452210704284:1. Dark labels remain 15.061437646255992:1. Actual chart-1 avatar initials measure `#0A0A0A` on `#F43887` at 5.432368517802937:1; identity-only fixtures preserve the actual skipTotal count sentinel (`totalItems: -1`). Later guide/menu/widget checks complete and no business mutation is attempted by the guarded palette cases. The transient headerless failure is retained as evidence, not classified as a known base failure.

## Key Learnings

1. Primary and chart pink are separate existing light roles; matching themes must preserve that distinction.
2. Client avatar initials already inherit a fixed near-black primitive, not dark body white; changing chart-1 does not require changing deterministic identity mapping or introducing a foreground-selection algorithm.
3. Exact primary pink is below 3:1 on `#292929` even fully opaque; matching brand primitives must not imply using them indiscriminately for focus or selected-state graphics.
4. Focus paint can be a semantic alias without adding a primitive or changing error semantics; combined focused-invalid variants protect destructive priority.
5. Playwright's list reporter does not preserve in-memory JSON attachments as durable files in this run; the final palette harness explicitly writes its color-only evidence JSON inside the owned output directory.
6. A declared focus color can be opaque while a CSS transition still paints zero spread; settled, nonzero-spread shadow colors are the meaningful rendered focus evidence.
7. Hover contrast must wait for ancestor background transitions, not merely the label or first passing color; a passing intermediate surface can hide a failing final surface.
8. Animation waits should follow the sampled paint chain, not all sibling subtrees; cancelled transitions require checking replacement animations.
9. Seed natural keys can be deterministic while generated record IDs are not; palette-slot browser coverage needs an explicit identity verified by the production helper.
