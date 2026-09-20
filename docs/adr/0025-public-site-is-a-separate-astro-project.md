# 0025-public-site-is-a-separate-astro-project

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

kankaku needed a public, developer-facing website: what it is, how to
install it, a command reference, an overview of the hub, screenshots. The
existing `web/` app (Nuxt) is the **hub** — a private, self-hosted
dashboard over real client/project/task data, authenticated, meant for one
owner's own instance. The new site is the opposite in every dimension that
matters: public, unauthenticated, static, meant to be the same for every
visitor, and — per the owner's own framing (see `docs/vision.md`) — about
the *product*, not about any one hub's data.

## Decision

The public site lives in a new, standalone Astro project at `site/`, with
its own `package.json`, its own `pnpm-workspace.yaml` (so it never gets
pulled into a workspace by an ancestor), and its own toolchain — not a
route added to `web/`, and not a shared monorepo package between the two.

It reuses the app's design tokens (`web/app/assets/css/tailwind.css`,
ported as plain CSS custom properties — see `site/src/styles/tokens.css`)
and the app's curated command/i18n data
(`web/app/lib/kankaku-commands.ts`, `web/i18n/locales/*.json`) by copying
the relevant subset in, not by importing across the project boundary at
build time (consistent with `0009-separate-repos-instead-of-monorepo.md`'s
reasoning, one level down).

## Consequences

**Easier:**

- The site can ship a completely different rendering strategy (fully
  static, zero-JS-by-default, Astro) optimized for a public, anonymous,
  SEO-sensitive audience, without that choice constraining or being
  constrained by the hub app's own stack (Nuxt SPA served from
  PocketBase's `publicDir`, per `0015-static-spa-served-by-pocketbase.md`).
- The site's build, tests, and deploy target are independent of the hub's.
  A change to one cannot accidentally break or slow down the other's CI.
- No authentication surface, no PocketBase client, no real client data
  anywhere in this project — the site is safe to make genuinely public
  (a different trust boundary than the hub, enforced structurally, not
  just by convention).
- Two concurrent writers (this site, the hub app) can work without
  touching each other's files, beyond the few explicitly shared
  read-derived data files this ADR names above.

**Harder:**

- Command/i18n data can drift between the two projects if one is updated
  without the other; there is no compiler enforcing they match. Mitigated
  today by keeping the copies small, commented with their source of
  truth, and re-syncable via a documented script
  (`site/scripts/refresh-screenshots.mjs` for screenshots; the command/env
  data is small enough to re-copy by hand when it changes, which is rare —
  kankaku's own command surface is stable).
- Two `package.json`/lockfile pairs, two sets of dependencies to keep
  patched, two places a contributor needs to know to look.

## Alternatives considered

- **A route inside `web/`** — rejected: different audience (public vs.
  authenticated owner), different rendering needs (static/SEO vs. an
  authenticated SPA), and it would put the hub's private-data trust
  boundary and the site's public one in the same build.
- **A shared monorepo package for tokens/command data** — rejected for
  now as more machinery than three small, rarely-changing data files
  justify; revisit if the data actually starts drifting in practice.

## Related

- ADRs: `0009-separate-repos-instead-of-monorepo.md`,
  `0015-static-spa-served-by-pocketbase.md`
- Specs: `docs/specs/public-site.md`
- Phases: `docs/phases/phase-site-public-website.md`
- Code: `site/`
