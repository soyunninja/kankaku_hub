# 0015 — The web is a static SPA served from PocketBase's publicDir (one process)

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

PocketBase already provides REST, auth and realtime subscriptions, so the
web app is mostly views (proposal §9.1). Running a separate Node server for
Nuxt SSR would mean a second process, a second thing to deploy/restart, and
a genuine question of where the PocketBase auth token should live when two
servers are both in the request path.

## Decision

Build the web statically (`nuxt generate`, `ssr: false`) and serve it from
PocketBase's own static file serving via `--publicDir` pointed at
`web/.output/public` (`scripts/dev.sh`). One binary on the machine, no Node
server, same-origin API calls with no CORS configuration needed.

## Consequences

- Production is a single process to run, restart and monitor.
- The PocketBase client resolves its base URL to `window.location.origin`
  in production (see
  [`../architecture/hub-web.md`](../architecture/hub-web.md#data-access))
  rather than relying on relative-URL resolution, specifically because a
  client-routed SPA can be viewed from a deep path.
- Nitro's default per-route prerendering is incompatible with PocketBase's
  static file server (a directory-vs-file 301 redirect that breaks relative
  API calls) — fixed by prerendering only `/` and relying on PocketBase's
  own SPA fallback. See
  [`../runbooks/troubleshooting.md`](../runbooks/troubleshooting.md).
- Deploying a web-only change requires a full `nuxt generate` + restarting
  (or hot-swapping `--publicDir`'s contents on) the PocketBase process —
  there is no independent web deploy path.
- No SSR means no server-rendered first paint; acceptable for an
  authenticated internal dashboard, not necessarily for a public-facing
  product.

## Alternatives considered

- **Nuxt SSR behind a separate Node process** — rejected: two processes to
  deploy and keep in sync, and an awkward split of where the auth token
  lives (server-side vs. client-side).
- **Nuxt SSR with PocketBase as a pure API backend on another origin** —
  rejected: adds CORS configuration and a second deployable, for no
  benefit this single-owner internal tool needs.

## Related

- Code: `kankaku-hub/web/nuxt.config.ts` (`ssr: false`, `nitro.prerender`), `kankaku-hub/scripts/dev.sh`
- Architecture: [`../architecture/hub-web.md`](../architecture/hub-web.md)
- Runbook: [`../runbooks/local-development.md`](../runbooks/local-development.md), [`../runbooks/troubleshooting.md`](../runbooks/troubleshooting.md)
- Proposal: [`../proposal.md`](../proposal.md) §9.1
