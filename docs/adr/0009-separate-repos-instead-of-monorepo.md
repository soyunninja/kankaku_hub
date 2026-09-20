# 0009 — Separate repos instead of a monorepo

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

kankaku is a published (or publishable) npm package: a pi extension with
zero runtime dependencies, versioned and installed independently by pi
users. kankaku-hub is a deployed application (PocketBase + a Nuxt SPA) with
its own dependency tree, its own release cadence, and no reason to ship as
an npm package at all. The proposal does not address repo layout explicitly
— this was decided once implementation started.

## Decision

Two separate repositories: `kankaku` (the extension, npm-publishable,
zero runtime deps) and `kankaku-hub` (the PocketBase backend + Nuxt web
app, deployed, never published to npm). They are linked only by
[`docs/contract.md`](../contract.md) — the real integration contract is the
PocketBase schema, not a shared package or shared code.

## Consequences

- Each repo can release on its own schedule: kankaku follows semver for an
  npm package; kankaku-hub deploys whenever its owner chooses.
- kankaku keeps its zero-runtime-dependency property (a load-bearing
  constraint for a pi extension) uncontaminated by the web's dependency
  tree (Nuxt, Vue, Tailwind, reka-ui, ...).
- The two repos can have conflicting conventions (e.g. commit style, test
  runner) without friction, since neither shares tooling config with the
  other.
- The contract between them must be documented explicitly rather than
  enforced by a shared TypeScript type — this is what
  [`docs/contract.md`](../contract.md) is for, and what the opt-in e2e test
  (`kankaku/scripts/e2e-hub.ts`, run against a real PocketBase instance
  built from `kankaku-hub/pocketbase/`) exists to verify end-to-end.
- Cross-repo changes (e.g. a schema change) require coordinating two PRs
  instead of one; there is no tooling enforcing that they land together.

## Alternatives considered

- **A monorepo with both packages** — rejected: different release cadence
  (published npm package vs. deployed app), a zero-runtime-deps constraint
  that a monorepo's shared tooling would be easy to accidentally violate,
  and conflicting conventions between an npm library and a Nuxt app.

## Related

- Contract: [`../contract.md`](../contract.md)
- Evidence: `kankaku/scripts/e2e-hub.ts` (hardcodes the sibling `kankaku-hub` repo path to run a real integration test)
- Runbook: [`../runbooks/local-development.md`](../runbooks/local-development.md)
