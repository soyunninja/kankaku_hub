# 0019-hub-fetches-and-stores-client-favicons

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

The web app's owner-facing client management screens
(`docs/specs/web-catalog-management.md`) want to show each client's site
favicon next to its name — a small usability win when scanning a list of
clients. `clients.website` already exists
([`1758300011_clients_contact_fields.js`](../../pocketbase/pb_migrations/1758300011_clients_contact_fields.js)),
so the raw material is there, but *how* to turn a URL into a displayed
icon has real privacy and reliability consequences for a tool whose whole
purpose is to hold a confidential list of who the owner works for
(`clients.name`, `clients.website`, `clients.notes` — see the "No money"
boundary in [ADR 0018](0018-billing-boundary-enforced-in-schema.md) for
the adjacent confidentiality concern about this same table).

Two obvious approaches were rejected before landing on a third:

- **A third-party favicon service** (e.g. a `https://www.google.com/s2/favicons?domain=...`-style URL embedded directly in an `<img src>`). This sends the *domain of every client the owner works for* to that third party on every single page view of the client list — a systematic leak of confidential client relationships to an external company, for a UI convenience. Rejected outright regardless of how "standard" this pattern is elsewhere.
- **Hot-linking directly to the client's own site** (`<img src="https://client-site.com/favicon.ico">` in the browser). This still leaks "the hub owner is looking at this client's page right now" to the client's own site/CDN/analytics on every dashboard load (a smaller leak, but the client itself is not necessarily who should learn the owner's browsing patterns), and it silently breaks the moment the client's site blocks hotlinking, changes its icon path, or goes down — with no way to control or cache the failure gracefully.

## Decision

PocketBase fetches a client's favicon **once, server-side, only on an
explicit owner-triggered action** (`POST
/api/kankaku/clients/{id}/favicon/refresh` — see
[`docs/contract.md`](../contract.md) and
[`pocketbase/pb_hooks/favicon.pb.js`](../../pocketbase/pb_hooks/favicon.pb.js)),
and stores the downloaded bytes as a file on the `clients.favicon` field
(migration
[`1758300012_clients_favicon_fields.js`](../../pocketbase/pb_migrations/1758300012_clients_favicon_fields.js)).
The web app never fetches or renders anything from the client's own
origin or from any third-party favicon service — it only ever loads
`clients.favicon` from the hub's own origin, the same way it loads any
other file field.

This is a deliberate instance of a narrower rule: **any outbound request
to a third party that could reveal the owner's client list belongs on the
server, triggered explicitly, never automatic and never client-side.**
Consequences of that rule for this feature:

- The route is owner-only (`$apis.requireAuth()` plus an explicit
  `role = 'owner'` check) — the sync service account can read `clients`
  but must never trigger a fetch of a third-party site.
- It is never invoked from a `clients` create/update hook. Saving a client
  record must stay instant and must never fail because a client's website
  happens to be slow or down at that moment.
- `favicon_source` and `favicon_checked_at` are stored alongside the file
  so the web UI can show provenance and staleness, and so a client with no
  website (or the "Sin determinar" unassigned row) can be told apart from
  a client whose fetch genuinely failed (see
  [`docs/architecture/hub-backend.md`](../architecture/hub-backend.md) for
  the exact reason-code contract).
- An SSRF guard
  ([`pocketbase/pb_hooks/lib/favicon-ssrf-guard.js`](../../pocketbase/pb_hooks/lib/favicon-ssrf-guard.js))
  blocks the server from fetching loopback/private/link-local addresses
  and the `localhost`/`.local`/`.internal` hostname families before making
  any request — this server-side fetch is a real SSRF surface (an owner
  could type anything into `website`) and is treated as one. Its
  limitations are documented honestly in
  [`docs/architecture/hub-backend.md`](../architecture/hub-backend.md)
  rather than assumed away, specifically: it cannot see or re-validate the
  IP address a redirect or a DNS lookup resolves to at actual connect
  time (PocketBase's `$http.send` gives no such hook), so a
  DNS-rebinding attack against a public-looking hostname is not caught by
  this guard.

## Consequences

- A client's favicon is only ever as fresh as the last time the owner
  clicked refresh — there is no background polling. This is intentional:
  it keeps the number of outbound requests to third-party sites at
  exactly the number of times a human asked for one.
- A client with no `website`, or the "Sin determinar" unassigned row,
  never gets a favicon and never triggers a fetch (`reason: "no_website"`)
  — this also means the demo seed script
  ([`pocketbase/seed/seed.js`](../../pocketbase/seed/seed.js)) never
  touches the network to produce demo data; favicons are not seeded.
- The web app needs an owner-facing "refresh favicon" action in the UI
  (client management screen) rather than something that "just works" on
  page load — a small UX cost in exchange for the privacy property above.
- The route can return a `blocked_host` outcome for a legitimately public
  site if the guard's heuristics are ever too strict (e.g. a real
  `*.internal` company domain); this is treated as an acceptable
  false-positive rate for an SSRF guard rather than a bug to route around.

## Alternatives considered

- **Third-party favicon service** — rejected: leaks the confidential
  client list to that third party on every page view (see Context).
- **Browser-side hot-linking to the client's own site** — rejected: same
  leak in a smaller form, plus no server-side control over failures,
  caching, or content validation (a client site could serve anything
  under a `.ico` URL, including something the browser would happily try
  to render).
- **Automatic background fetch on every client save/sync** — rejected:
  couples an unrelated third-party network call to the latency and
  reliability of saving a client record (AGENTS.md's general principle
  that writes to this backend should stay fast and local), and multiplies
  outbound requests without an explicit owner action behind each one.

## Related

- ADRs: [0018 — Billing boundary enforced in schema](0018-billing-boundary-enforced-in-schema.md) (adjacent confidentiality concern on the same `clients` table)
- Specs: [`../specs/hub-schema-and-access-rules.md`](../specs/hub-schema-and-access-rules.md)
- Code: `kankaku-hub/pocketbase/pb_migrations/1758300012_clients_favicon_fields.js`, `kankaku-hub/pocketbase/pb_hooks/favicon.pb.js`, `kankaku-hub/pocketbase/pb_hooks/lib/favicon-*.js`
- Docs: [`../contract.md`](../contract.md), [`../architecture/hub-backend.md`](../architecture/hub-backend.md)
