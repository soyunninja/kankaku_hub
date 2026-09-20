# Phase — Public website

| | |
|---|---|
| Status | done |
| Repos | kankaku-hub (`site/`) |
| Depends on | none (reads kankaku's README/config/commands and the hub app's design tokens/command data as sources of truth, but has no runtime dependency on either) |

## Goal

Give kankaku a public, developer-facing website — what it is, how to
install it, a command reference, an honest status of what's shipped vs.
planned — separate from the hub app's private, authenticated dashboard.

## Scope

### In

- A standalone Astro project (`site/`), static output, three locales
  (es/en/ja), dark-by-default console aesthetic matching the hub app's own
  design tokens, self-hosted Nerd Font subset.
- Exactly three pages per locale: Home, Guide, Commands (reference
  generated from the same curated data the hub app uses).
- Build-time i18n completeness check, a static link/anchor checker,
  Playwright smoke tests (theme, language switch, copy button, no
  horizontal overflow), and an axe-core accessibility pass — all green.

### Out

- Any authentication or real client/project/task data (stays in `web/`).
- Hosting/deployment automation — the owner picks a host and a domain
  later (see "Next steps").
- A public repo for the hub itself — `kankaku-hub` is still private, so the
  site cannot link to one yet.

## Deliverables

- `site/` — the Astro project.
- `docs/adr/0025-public-site-is-a-separate-astro-project.md`.
- `docs/specs/public-site.md`.
- This phase file + a roadmap row in `docs/phases/README.md`.

## Acceptance criteria

- [x] `pnpm build` (in `site/`) completes with no errors.
- [x] `node scripts/check-i18n.mjs` passes (es/en/ja key parity).
- [x] `node scripts/check-links.mjs` (over `dist/`) reports zero broken
      internal links/anchors.
- [x] `npx playwright test` (37 tests: smoke + axe-core, both themes, all
      three locales) passes with zero failures.
- [x] Lighthouse: 98-100 across performance/accessibility/best-practices/SEO
      on the pages sampled (Home, Commands).
- [x] No feature that lives only on the unreleased `feat/pocketbase-hub`
      branch is presented as available today.

## Evidence

- Code: `site/` (this commit).
- Tests: `site/tests/smoke.spec.ts` (23 cases), `site/tests/a11y.spec.ts`
  (14 cases) — 37/37 passing.
- Lighthouse: performance 98-100, accessibility 100, best-practices 100,
  seo 100 (Home and Commands pages, local `astro preview`).
- Bundle: ~728 KB total static output across 12 pages; 0 bytes of
  page-level JS bundles (zero-JS-by-default, only small inlined
  component scripts); 16 KB shared CSS; ~88 KB font subset (Regular +
  Bold).

## Known gaps

- Command/env-var data is a manually-synced copy of the hub app's own
  `web/app/lib/kankaku-commands.ts` (see ADR 0025) — no compiler enforces
  they match; a future command addition to kankaku needs a matching manual
  edit in `site/src/data/kankaku-commands.ts`.
- Screenshots (`site/src/assets/screenshots/`) were copied from the hub
  app's current `web/docs/screenshots/` at the time of writing. The other
  writer is actively changing the sessions queue, entries explorer, and
  dashboard agent icons — those screenshots (and the site's landing page
  captures) should be refreshed once that work lands (see
  `site/scripts/refresh-screenshots.mjs`).
- No CI wiring yet for the site's own test suite (i18n check, link check,
  Playwright, axe) — they run locally via `pnpm run site:check`/`site:test`
  from the repo root, or directly in `site/`.

## Next steps

- Provide a real `SITE_URL` and deploy `site/dist/` somewhere static.
- Publish `kankaku-hub` (or at least `site/`) to a public repo, and update
  the site's roadmap/status strip to link to it.
- Native review of the Japanese copy (currently flagged in the footer as
  machine-authored).
- Once the hub integration (phases 1-4) ships on npm, update the Home
  status strip and Guide's "Connect the hub" section from "coming soon" to
  available.
