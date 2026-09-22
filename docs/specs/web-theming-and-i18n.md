# Web theming and i18n

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | none dedicated — implementation detail of [phase-3-web](../phases/phase-3-web.md) |
| Code | `web/nuxt.config.ts`, `web/app/components/app-shell/ThemeToggle.vue`, `web/app/components/app-shell/LocaleSwitcher.vue`, `web/i18n/locales/es.json`, `web/i18n/locales/en.json`, `web/i18n/locales/ja.json`, `web/i18n/GLOSSARY.md`, `web/app/lib/format.ts`, `web/app/composables/useFormatters.ts`, `web/app/assets/css/tailwind.css` |
| Tests | `web/tests/i18n.test.ts`, `web/tests/format.test.ts`, `web/tests/dark-palette.test.ts`, `web/e2e/i18n-ja.spec.ts`, `web/e2e/screenshots-ja.spec.ts`, manual Playwright verification per `ESTADO.md` |

## Purpose

Dark-by-default theming with a persisted dark/light/system switch, and a
Spanish-default UI with English and Japanese as explicit secondary
locales and no automatic browser-language detection — all owner
requirements.

## Requirements

1. `THEME-REQ-001` — The default color mode SHALL be dark, with no flash of
   the wrong theme on a fresh profile (no prior `localStorage`).
2. `THEME-REQ-002` — The theme switcher SHALL offer dark, light, and system,
   persisting the choice to `localStorage` under a dedicated key.
3. `THEME-REQ-003` — The default locale SHALL be Spanish (`es`), and
   browser-language auto-detection SHALL be disabled — only an explicit
   choice through the locale switcher changes it.
4. `THEME-REQ-004` — The locale switcher SHALL offer Spanish, English, and
   Japanese, persisting the choice.
5. `THEME-REQ-005` — Every UI string SHALL be routed through the i18n
   translation function; no literal template text.
6. `THEME-REQ-006` — The three locale files SHALL stay key-for-key
   identical in structure, with no empty values, and every `{placeholder}`
   token in a non-`es` locale's string SHALL match `es.json`'s for that
   same key exactly (same set, no missing/extra tokens).
7. `THEME-REQ-007` — `<html lang>` SHALL follow the active locale reactively
   (not just the pre-hydration default), for assistive tech and
   language-sensitive CSS.
8. `THEME-REQ-008` — Duration formatting SHALL be locale-aware: Japanese
   renders `時間`/`分`/`秒` units (e.g. `2時間30分`); Spanish/English keep
   the existing Latin `h`/`m`/`s` units. Date, time, and compact-number
   formatting SHALL use `Intl` with the active locale's BCP 47 tag
   (`es-ES`/`en-US`/`ja-JP`), not a hardcoded default — this includes
   chart axis ticks and tooltips, which reuse the same formatters. Money
   stays USD with a `$` prefix in every locale (D8 — no rates/prices, this
   is a measured cost, not a price); only the surrounding copy about that
   billing boundary is translated.
9. `THEME-REQ-009` — The page SHALL apply a CJK-aware font stack (Latin
   font first, then platform CJK fonts, no web-font download) and
   `:lang(ja)`-scoped line-breaking rules, so Japanese text never falls
   back to a mismatched font or breaks mid-word/right-before-closing-
   punctuation.
10. `THEME-REQ-010` — Every foreground/background token pair the dark
    theme renders (text on page/card, muted text on page/card, and each
    of primary/destructive/success/warning/accent/sidebar's foreground on
    its own background) SHALL meet WCAG AA contrast (>= 4.5:1), verified
    by computing the ratio from the tokens' actual OKLCH values, not by
    inspection.

## Scenarios

### Scenario: a fresh profile loads dark with no flash (`THEME-REQ-001`)

- **Given** a browser profile with no prior `localStorage` for this app
- **When** the app first loads
- **Then** the dark theme is applied on first paint, with no visible flash of a light theme first

### Scenario: locale never auto-detects from the browser (`THEME-REQ-003`)

- **Given** the browser's language is set to English
- **And** no prior locale choice is persisted
- **When** the app loads
- **Then** the UI is in Spanish, not auto-switched to English

### Scenario: the three locale files never diverge (`THEME-REQ-006`)

- **Given** `es.json`, `en.json`, and `ja.json`
- **When** `tests/i18n.test.ts` runs
- **Then** every key present in one is present in the other two, no value is
  empty, and every `{placeholder}` token matches `es.json`'s for the same key

### Scenario: switching to 日本語 updates `<html lang>` and duration units (`THEME-REQ-004`, `THEME-REQ-007`, `THEME-REQ-008`)

- **Given** the app is loaded in Spanish (the default)
- **When** the owner picks 日本語 from the header locale switcher
- **Then** `<html lang="ja">`, the nav and KPI labels render in Japanese,
  and KPI durations render with `時間`/`分` units instead of `h`/`m`
- **And** the choice survives a reload

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `nuxt.config.ts` `colorMode.preference`/`fallback` | `dark` | Default theme. |
| `nuxt.config.ts` `colorMode.storageKey` | `kankaku-color-mode` | localStorage key. |
| `nuxt.config.ts` `i18n.defaultLocale` | `es` | Default locale. |
| `nuxt.config.ts` `i18n.detectBrowserLanguage` | `false` | Disables auto-detection. |
| `nuxt.config.ts` `i18n.locales` | `es`, `en`, `ja` | Registered locales (code, `language` BCP 47 tag, display `name`, locale file). |

## Locale-aware formatting

`web/app/lib/format.ts` stays a pure module with no i18n import (it must
stay importable from plain Vitest — see its module docstring). Its
duration/date/number formatters take an optional `locale` parameter that
defaults to the pre-existing behavior (`'en'`/`'en-US'`/`'es-ES'` as
appropriate) so every existing call site and test that doesn't pass one
sees no change.

`web/app/composables/useFormatters.ts` is the one bridge between that pure
module and the app's active i18n locale: it maps the app's locale codes
(`es`/`en`/`ja`) to `Intl`-flavored BCP 47 tags and returns
locale-bound wrappers. Every component that renders a duration, date, or
compact number uses this composable instead of importing `lib/format.ts`
directly, so the active locale is never threaded through by hand.
`formatCost` is USD-only regardless of locale and is re-exported from the
composable unchanged.

## CJK typography

`web/app/assets/css/tailwind.css`:

- `--font-sans` keeps the Latin font (`Inter`) first, then adds platform
  CJK fonts in priority order across macOS (Hiragino), Windows (Yu
  Gothic/Meiryo), and Linux (Noto Sans CJK) — no web-font download, so
  this stays offline-friendly.
- `:lang(ja)` sets `line-break: strict; word-break: normal; overflow-wrap:
  anywhere;`, a slightly looser `line-height` for body copy, and disables
  italics (most CJK fonts fake-slant, which reads as broken).
- One unlayered (outside `@layer base`) rule shrinks the dashboard KPI
  card value's font size for `:lang(ja)` below the `sm` breakpoint —
  Tailwind v4's `utilities` layer always outranks `base` regardless of
  selector specificity, so overriding a utility class like `text-xl`
  requires either an unlayered rule or `@layer utilities` (documented
  in-file; this is a real gotcha worth knowing before adding a similar
  per-locale override elsewhere).

## Edge cases & failure modes

- `localStorage` unavailable (private browsing, blocked site data): the
  theme/locale choice falls back to the configured default each load,
  rather than throwing.
- A duration/count value in Japanese is measurably wider than its
  Latin-unit equivalent (full-width kanji vs. Latin letters) — this is
  what motivated the KPI-card font-size override above; any new narrow,
  fixed-width value slot should be checked against a long Japanese value
  before shipping.

## Adding a fourth language

1. Add `web/i18n/locales/<code>.json` with the exact same key set as
   `es.json` (copy it as a starting point) — build a small glossary of
   core terms first (see `web/i18n/GLOSSARY.md` for the Japanese example)
   and apply it consistently rather than translating string-by-string.
   Keep every `{placeholder}` token, product name, command syntax, and env
   var name unchanged.
2. Register the locale in `nuxt.config.ts`'s `i18n.locales` array
   (`code`, `language` BCP 47 tag, display `name`, `file`) — do this only
   after step 1's file is complete, so the app never briefly shows raw
   translation keys.
3. Add the new BCP 47 tag to `INTL_LOCALE_BY_CODE` in
   `web/app/composables/useFormatters.ts`.
4. If the language needs non-Latin duration units (like Japanese's
   `時間`/`分`/`秒`) or its own compact-number convention, extend
   `DURATION_UNITS` in `web/app/lib/format.ts`; `formatTokensCompact`
   already works for any locale via `Intl.NumberFormat`'s `compact`
   notation with no extra code.
5. If the script needs its own font stack or line-breaking rules (as
   Japanese does), add a `:lang(<code>)`-scoped block in
   `app/assets/css/tailwind.css` — remember utility classes live in a
   higher-priority cascade layer than `@layer base`, so an override of a
   Tailwind utility must itself be unlayered.
6. Extend `tests/i18n.test.ts`'s locale list and placeholder-consistency
   check; add locale-aware formatter assertions to `tests/format.test.ts`
   if step 4 applied.
7. Do a layout pass at 390/768/1440px in dark and light — the new
   language's labels may be a different length or wrap differently than
   the existing ones; fix truncation/overflow before shipping, not after.
8. Capture doc screenshots (see `web/docs/screenshots/`) and look at them
   for mismatched fonts, tofu, or awkward wraps before calling it done.

## Dark palette

The dark theme's colors (`app/assets/css/tailwind.css`'s `.dark` block)
come from the owner's gentle-pi theme "Gentleman-Cute"
(`~/.local/src/gentle-pi-main/themes/Gentleman-Cute.json`). Light mode
(`:root`) and the Astro marketing site are unchanged — this only affects
the Nuxt dashboard's dark theme. Each `.dark` line carries a trailing
comment naming its source hex and gentle-pi theme var, and the block has
a header comment pointing back at the source file.

Sync rule: `--chart-1..5` in the `.dark` block are duplicated in
`app/lib/client-avatar.ts`'s `CHART_OKLCH_BY_THEME.dark` (used to derive
`ClientAvatar`'s deterministic background colors and to verify
`--avatar-foreground`'s contrast against them). The two must always carry
the exact same five OKLCH triples; `tests/dark-palette.test.ts` parses
both and fails if they diverge.

WCAG guard: `tests/dark-palette.test.ts` also parses the `.dark` block
directly and computes (via `client-avatar.ts`'s exported
`oklchToLinearSrgb`/`relativeLuminance`/`contrastRatio` helpers) the
contrast ratio for every foreground/background pair the dark theme
renders — see `THEME-REQ-010`.

## Out of scope

- Locales beyond es/en/ja.
- Per-user (server-persisted) preference — this is a client-only, per-browser choice.
- Native-speaker review of the Japanese copy — see the honesty note below.

## A note on the Japanese copy

`ja.json` was machine-authored (translated by an AI agent, not a human
Japanese speaker) and has **not** been reviewed by a native speaker. The
translation follows a documented glossary (`web/i18n/GLOSSARY.md`,
including a short list of terms the glossary itself flags as uncertain)
and passes an automated parity/placeholder/non-empty/"looks translated"
test suite, but none of that substitutes for native review. Treat it as a
solid first draft, not a finished, owner-approved translation.

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `THEME-REQ-001` | manual Playwright verification per `ESTADO.md` | not covered by an automated test found in this pass |
| `THEME-REQ-002` | `web/e2e/polish.spec.ts` | covered |
| `THEME-REQ-003` | manual Playwright verification per `ESTADO.md` | not covered by an automated test found in this pass |
| `THEME-REQ-004` | `web/e2e/polish.spec.ts` (es/en), `web/e2e/i18n-ja.spec.ts` (ja) | covered |
| `THEME-REQ-005` | `web/tests/i18n.test.ts`, `web/e2e/polish.spec.ts` (Spanish header strings) | covered |
| `THEME-REQ-006` | `web/tests/i18n.test.ts` | covered |
| `THEME-REQ-007` | `web/e2e/i18n-ja.spec.ts` | covered |
| `THEME-REQ-008` | `web/tests/format.test.ts`, `web/e2e/i18n-ja.spec.ts` (KPI duration units) | covered |
| `THEME-REQ-009` | manual screenshot review per `ESTADO.md` | not covered by an automated test found in this pass |
| `THEME-REQ-010` | `web/tests/dark-palette.test.ts` | covered |
