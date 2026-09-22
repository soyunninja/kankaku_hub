# Public site

| | |
|---|---|
| Status | implemented |
| Phase | [phase-site-public-website](../phases/phase-site-public-website.md) |
| Owners repos | kankaku-hub (`site/`) |
| Related ADRs | [0025](../adr/0025-public-site-is-a-separate-astro-project.md) |
| Code | `site/` |
| Tests | `site/tests/smoke.spec.ts`, `site/tests/a11y.spec.ts`, `site/scripts/check-i18n.mjs`, `site/scripts/check-links.mjs` |

## Purpose

A public, static, developer-facing website for kankaku: what it measures,
how to install and use it, a full command reference, and an overview of
the optional hub — for an audience that has not installed kankaku yet and
is not a hub owner. Deliberately separate from the hub app (`web/`), which
is an authenticated dashboard over one owner's real data (see ADR 0025).

## Requirements

1. `SITE-REQ-001` — The site SHALL be a standalone Astro project under
   `site/`, building to fully static output with no server-side runtime
   dependency.
2. `SITE-REQ-002` — The site SHALL ship exactly three pages per locale:
   Home, Guide, Commands. No other top-level or nested navigation pages.
3. `SITE-REQ-003` — The site SHALL support three locales — Spanish
   (default, unprefixed), English (`/en/`), Japanese (`/ja/`) — with a
   build-time check (`scripts/check-i18n.mjs`) that fails the build if the
   UI dictionary, docs pages, or commands data disagree on keys/slugs
   across locales.
4. `SITE-REQ-004` — The Commands page content SHALL be generated from
   `src/data/kankaku-commands.ts`, a structural port of the hub app's own
   `web/app/lib/kankaku-commands.ts`, so the two never list a command the
   other doesn't.
5. `SITE-REQ-005` — The site SHALL default to a dark theme, with an
   explicit light/dark/system switcher persisted per-visitor
   (`localStorage`) and applied before first paint (no flash of the wrong
   theme).
6. `SITE-REQ-006` — The site SHALL use a self-hosted font subset only; it
   SHALL make no request to Google Fonts or any other third-party font
   host, and SHALL work with no network access after the initial page load
   (a font, once cached).
7. `SITE-REQ-007` — Every claim of feature availability SHALL be labeled
   honestly: shipped (on npm) vs. on an unreleased branch ("coming soon")
   vs. planned. The site SHALL NOT present hub integration features
   (catalog, sync, backfill) as available today.
8. `SITE-REQ-008` — The term "wall-clock time" SHALL appear at most once
   per locale (in the Guide), used verbatim (not translated) in all three
   locales; no page SHALL use a literal Spanish/Japanese calque of it
   ("tiempo de pared", "tiempo de muro", or a Japanese 壁時計 rendering).
9. `SITE-REQ-009` — The screenshots section SHALL state, once and in every
   locale, that the hub captures show fictional demo data (the section lede,
   `home.screenshotsLine`); individual figures carry no caption.
10. `SITE-REQ-010` — The site SHALL meet WCAG AA contrast in both themes,
    verified by an automated axe-core pass with zero violations across all
    pages and both color schemes.
11. `SITE-REQ-011` — The site SHALL have no horizontal overflow at 390,
    768, or 1440px viewport widths.
12. `SITE-REQ-012` — The production origin SHALL be a single configurable
    value (`SITE_URL` environment variable, `astro.config.mjs`), defaulting
    to the production origin `https://kankaku.io`; previews on another
    origin override it through the environment variable.

## Scenarios

### Scenario: i18n completeness is enforced at build time (`SITE-REQ-003`)

- **Given** a UI string key exists in `src/i18n/ui.ts`'s `es` locale but not in `en` or `ja`
- **When** `node scripts/check-i18n.mjs` runs
- **Then** it exits non-zero and names the missing key and locale

### Scenario: commands never drift from the hub's own data (`SITE-REQ-004`)

- **Given** kankaku's `src/adapters/kankaku-command.ts` adds a new subcommand
- **When** the hub app's `web/app/lib/kankaku-commands.ts` is updated to list it
- **Then** `site/src/data/kankaku-commands.ts` must be updated by hand to match — there is no automatic sync; this is a documented, deliberate manual step (see `site/README.md`)

### Scenario: theme applies before first paint (`SITE-REQ-005`)

- **Given** a visitor previously chose "light" and reloads the page
- **When** the page's `<head>` inline script runs, before any CSS depending on `[data-theme]` is used for layout
- **Then** `<html data-theme="light">` is set immediately, with no visible flash of the dark default

### Scenario: unreleased features are never presented as available (`SITE-REQ-007`)

- **Given** the hub integration (catalog, sync, backfill) lives only on the `feat/pocketbase-hub` branch, not on npm
- **When** the Home page's status strip and the Guide's "Connect the hub" section render
- **Then** both are labeled "coming soon" / "unreleased branch", never presented as installable today

### Scenario: accessibility gate (`SITE-REQ-010`)

- **Given** every page, in both light and dark color schemes
- **When** `pnpm run test:a11y` (axe-core via Playwright) runs
- **Then** zero violations are reported

## Configuration

- `SITE_URL` (env var, read in `astro.config.mjs`): production origin used
  for canonical URLs, hreflang alternates, the sitemap, and OG/Twitter
  image URLs. Defaults to `https://kankaku.io`.
- No other environment configuration; the site has no secrets, no API
  calls, no server runtime.

## Edge cases & failure modes

- A visitor with JavaScript disabled: the terminal hero replay, theme
  toggle interactivity, language-switcher/TOC disclosure widgets, and copy
  buttons degrade to their static/no-op state — full page content (including
  the terminal transcript) is present in the DOM either way (verified: the
  hero's typing animation only reveals already-rendered content, never
  injects it).
- A visitor with `prefers-reduced-motion: reduce`: the terminal hero shows
  its full transcript immediately, no typing animation.
- An unknown route: a localized 404 page renders (`noindex`), with a link
  back to Home and to the Guide.
- A missing translation key: caught at build time (`SITE-REQ-003`), never
  a runtime fallback to another locale's text or a blank string.

## Out of scope

- Any authentication, any real client/project/task data — that is the hub
  app's (`web/`) domain entirely.
- A standalone blog/changelog page — the footer links to the kankaku
  repo's own `CHANGELOG.md` instead.
- Hosting/deployment automation (CI, DNS, CDN) — deliberately left to the
  owner; see `site/README.md` "Before this goes public".

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `SITE-REQ-001` | `site/astro.config.mjs` (`output` defaults to static); `pnpm build` produces `site/dist/` with no server code | covered |
| `SITE-REQ-002` | `site/src/consts.ts` (`DOC_SLUGS`), `site/src/components/Header.astro` | covered |
| `SITE-REQ-003` | `site/scripts/check-i18n.mjs` | covered |
| `SITE-REQ-004` | `site/src/data/kankaku-commands.ts` (header comment names the source) | covered |
| `SITE-REQ-005` | `site/src/components/ThemeToggle.astro`, `site/src/layouts/BaseLayout.astro` inline script | covered |
| `SITE-REQ-006` | `site/scripts/build-font.mjs`, `site/public/fonts/` | covered |
| `SITE-REQ-007` | `site/src/i18n/ui.ts` (`common.comingSoon`), Home status strip, Guide "Connect the hub" | covered |
| `SITE-REQ-008` | `site/src/content/docs/*/guide.mdx` (single mention each) | covered |
| `SITE-REQ-009` | `site/src/components/pages/HomePage.astro` (`home.screenshotsLine`, all locales) | covered |
| `SITE-REQ-010` | `site/tests/a11y.spec.ts` | covered |
| `SITE-REQ-011` | `site/tests/smoke.spec.ts` ("no horizontal overflow") | covered |
| `SITE-REQ-012` | `site/astro.config.mjs` | covered |
