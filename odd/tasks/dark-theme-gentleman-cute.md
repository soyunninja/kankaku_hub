# Feature: hub dark mode uses the Gentleman-Cute palette

Locator: `odd/tasks/dark-theme-gentleman-cute.md` (Engram topic
`odd/dark-theme-gentleman-cute/tasks`, project kankaku-hub).
Branch: `feat/entries-grouped-by-session` (owner works locally; separate
work-unit commit). Created 2026-09-22.

## Objective
The hub's dark mode uses the colors of the owner's gentle-pi theme
"Gentleman-Cute" (`~/.local/src/gentle-pi-main/themes/Gentleman-Cute.json`).
Light mode and the Astro site are untouched.

## Token mapping (source hex → written as oklch in tailwind.css `.dark`)
background #060407 (bg) · foreground #F6EFF3 (text) · card #100A0F (bgPanel) ·
popover #151316 · primary #F095C8 (accent) · primary-foreground #060407 ·
secondary #241822 · muted #1A1218 · muted-foreground #A78E9B (muted) ·
accent #28121E (selection) · accent-foreground #FFB1DD (activePink) ·
destructive #FF718F (error) · destructive-foreground #060407 ·
success #B4E7C7 (mint) · warning #F2B86D (peach), both with #060407 text ·
border #563040 at ~55% alpha · input #563040 at ~75% · ring #F095C8 ·
chart-1..5 #F095C8, #E0C27A (champagne), #A9C7EE (powderBlue), #B4E7C7 (mint),
#F2B86D (peach) · sidebar #100A0F · sidebar-primary #F095C8 ·
sidebar-primary-foreground #060407 · sidebar-accent #28121E ·
sidebar-accent-foreground #FFB1DD · sidebar-border #2A1720 (borderSubtle) ·
sidebar-ring #F095C8 · avatar-foreground unchanged (near-black).

## Coupling
`web/app/lib/client-avatar.ts#CHART_OKLCH_BY_THEME.dark` duplicates the chart
triples ("kept in sync manually") and `tests/client-avatar.test.ts` asserts
AA contrast of `--avatar-foreground` against each. Must be updated together.

## Tasks
- [x] T1 guard tests first (vitest): (a) `.dark --chart-N` parsed from
      tailwind.css equals `CHART_OKLCH_BY_THEME.dark`; (b) WCAG contrast ≥ 4.5
      for foreground/background, foreground/card, muted-foreground/background,
      muted-foreground/card, primary-foreground/primary, destructive-fg/
      destructive, success-fg/success, warning-fg/warning, accent-fg/accent,
      sidebar-fg/sidebar, using the exported oklch/luminance helpers.
      Route: delegated writer.
- [x] T2 tailwind.css `.dark` block rewritten per the mapping (oklch, 3
      decimals, hex + theme var name in a trailing comment per line);
      `CHART_OKLCH_BY_THEME.dark` synced. Same writer.
- [x] T3 docs: `docs/specs/web-theming-and-i18n.md` gets a short "Dark palette"
      subsection naming the source theme and the sync rule. Same writer.
- [x] T4 verify (`pnpm --dir web test`, typecheck, lint) + one commit
      `style(web): ...`. Route: parent.

## Acceptance
All vitest green incl. the two new guards; typecheck/lint clean; owner sees
the new palette on the live Nuxt dev (hot reload) and approves visually.

## Delivery
~150-200 authored lines; one commit; RDD off → unmanaged.

## Progress / evidence
- Writer (sonnet) TDD: chart-sync test GREEN→RED after CSS rewrite→GREEN after
  TS sync; WCAG guard RED on the OLD palette (destructive pair 3.29) → GREEN
  on the new one (all 10 pairs ≥ 4.5; destructive 7.79, lowest muted/card 6.51).
- Conversions round-tripped hex→oklch→hex with client-avatar.ts's inverse.
- Parent spot check: vitest 396 passed / 38 skipped, typecheck ok.
- Commit 52beb56 style(web): dark mode takes the Gentleman-Cute palette
  (4 files, +90/-45 plus new tests/dark-palette.test.ts).
- Not run: Playwright/visual. Owner sees it via live Nuxt dev hot reload.

## Next step
Owner approves visually; report any component with hardcoded colors that
ignores the tokens.

## Part 2 — light mode accent from Gentleman-Sexy (owner request 2026-09-22)
Replace every teal (hue 192) token in `:root` with the Gentleman-Sexy pink
(`#F43888` accent; `#BF0F50` deepPink; `#FF4F9A` activePink). Neutral greys,
success/warning/destructive and the other chart hues stay.
- primary / ring / sidebar-primary / sidebar-ring / chart-1: #F43888.
- primary-foreground / sidebar-primary-foreground: white only if ≥ 4.5:1 on
  #F43888 (expected to FAIL ≈3.3), else the light foreground near-black.
- accent / sidebar-accent: very light pink tint (same lightness/chroma pattern
  as the old `oklch(0.94 0.03 192)`, pink hue); accent-foreground /
  sidebar-accent-foreground: dark pink text derived from #BF0F50, ≥ 4.5:1.
- chart-5 (was `oklch(0.65 0.18 350)`, a pink that would collide with the new
  chart-1) → champagne gold (`#E0C27A`-like hue ≈ 88, lightness tuned so
  `--avatar-foreground` keeps ≥ 4.5:1).
- Sync `CHART_OKLCH_BY_THEME.light`; extend tests/dark-palette.test.ts to
  check the light chart sync and the light text/background pairs (same 10
  pair list) — rename the describe to "palette guards", keep the filename.
- Docs: spec "Dark palette" subsection becomes "Palette" and names both
  source themes.
- [x] L1 tests first (light sync + light pairs) — writer
- [x] L2 `:root` rewrite + TS sync — writer
- [x] L3 docs — writer
- [x] L4 verify + commit `style(web): ...` — parent

### Part 2 evidence
- Light guard on the OLD palette: primary-fg/primary 4.25, destructive 4.498,
  success 3.50 all below AA. After: primary 5.44 (dark text; white would be
  3.64), accent 5.13, destructive 4.63 (L 0.577→0.567), success 4.68
  (L 0.6→0.53), hue/chroma kept. chart-1 → #F43888, chart-5 → champagne.
- vitest 398 passed / 38 skipped; typecheck ok; lint 0 errors.
- Commit f074411 style(web): light mode takes the Gentleman-Sexy pink as
  brand accent. Feature complete (both parts).

### Part 2b — white text on light buttons/avatar (owner request)
- Owner: primary buttons and the header user Avatar (both `bg-primary
  text-primary-foreground`) must have white text in light mode.
- Theme white oklch(0.98 0 0) on exact #F43888 = ~3.5:1 → primary/ring/
  sidebar-primary/sidebar-ring lowered in L only to oklch(0.580 0.228 1)
  (#DA1272), theme white ~4.6:1 (L 0.59 gave 4.39 with the theme white and
  failed the guard). chart-1 keeps exact #F43888 (near-black text there).
- Route: parent inline (mechanical token edit + spec sentence).
- vitest 398 passed / 38 skipped; typecheck ok. Commit e56e8dc.
