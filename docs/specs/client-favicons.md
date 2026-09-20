# Client favicons

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0019](../adr/0019-hub-fetches-and-stores-client-favicons.md), [0018](../adr/0018-billing-boundary-enforced-in-schema.md) |
| Code | `pocketbase/pb_migrations/1758300012_clients_favicon_fields.js`, `pocketbase/pb_hooks/favicon.pb.js`, `pocketbase/pb_hooks/lib/favicon-html.js`, `pocketbase/pb_hooks/lib/favicon-sniff.js`, `pocketbase/pb_hooks/lib/favicon-ssrf-guard.js`, `web/app/lib/client-avatar.ts`, `web/app/components/clients/ClientAvatar.vue`, `web/app/components/clients/ClientName.vue`, `web/app/composables/useClients.ts`, `web/app/pages/clients/index.vue` |
| Tests | `pocketbase/pb_hooks/lib/*.test.js` (`node --test`, backend), `web/tests/client-avatar.test.ts`, `web/e2e/client-avatars.spec.ts` |

## Purpose

Shows each client's site favicon next to its name across the web app, so
the owner can visually scan a client list instead of reading every name.
The backend half (fetching, validating and storing the icon) was built
and documented first — see
[ADR 0019](../adr/0019-hub-fetches-and-stores-client-favicons.md) and
[`docs/contract.md`](../contract.md) (search "favicon") for the full
backend contract, cited here rather than re-derived. This spec covers
that backend contract's requirements briefly (`FAVICON-REQ-001`–`003`)
and the frontend requirements built on top of it in full
(`FAVICON-REQ-004` onward).

## Requirements

1. `FAVICON-REQ-001` — The `clients` collection SHALL carry three
   optional fields — `favicon` (file), `favicon_source` (text),
   `favicon_checked_at` (date) — populated only by the refresh route,
   never by the regular `clients` create/update endpoints. See
   [ADR 0019](../adr/0019-hub-fetches-and-stores-client-favicons.md).
2. `FAVICON-REQ-002` — `POST /api/kankaku/clients/{id}/favicon/refresh`
   SHALL be owner-only, SHALL always return `200` with a stable `{ ok,
   reason? }` body for any outcome its own business logic reaches (never
   `500` for a fetch failure), and SHALL clear all three favicon fields
   when the client has no website. See `docs/contract.md`.
3. `FAVICON-REQ-003` — An SSRF guard SHALL block the route from fetching
   loopback/private/link-local/unique-local hosts, overridable only via
   the `KANKAKU_FAVICON_ALLOW_PRIVATE` env var (test/dev use only). See
   `docs/architecture/hub-backend.md`.
4. `FAVICON-REQ-004` — Every screen that displays a client's name SHALL
   render it via a shared `ClientName`/`ClientAvatar` pair: the fetched
   favicon when present, otherwise a deterministic initials fallback (up
   to two letters derived from the client's name, a background color
   deterministically derived from the client's `id`) — never a
   third-party avatar/favicon service, never hot-linking to the client's
   own site from the browser (both ruled out for the same reason as the
   backend fetch itself — see ADR 0019).
5. `FAVICON-REQ-005` — The initials fallback SHALL require no network
   request and SHALL never flash a broken-image icon: a client with no
   `favicon` renders no `<img>` at all, and a favicon image that fails to
   load client-side falls back to the initials via the image's `error`
   event.
6. `FAVICON-REQ-006` — The initials fallback's background/foreground
   color pairing SHALL meet WCAG AA contrast (4.5:1) in both the light
   and dark themes, computed (not merely asserted) against the app's
   existing `--chart-1`..`--chart-5` design tokens.
7. `FAVICON-REQ-007` — The favicon image URL SHALL be built via the
   PocketBase SDK (`pb.files.getURL`) and cache-busted from the record's
   `updated` timestamp, so a freshly refreshed icon is reflected without
   a hard reload.
8. `FAVICON-REQ-008` — The client detail sheet (`web/app/pages/clients/index.vue`)
   SHALL offer an owner-only "refresh icon" action that calls the refresh
   route, shows an in-flight spinner, and shows a toast explaining the
   outcome in plain language (in both `es` and `en`) once it completes —
   including the `no_website`/`fetch_failed`/`no_icon_found`/
   `unsupported_type`/`too_large`/`blocked_host` reason codes.
9. `FAVICON-REQ-009` — Editing a client (create or update) SHALL trigger
   the refresh route in the background — never awaited before the
   dialog closes — exactly when `website` actually changed, and never
   for the protected unassigned client.
10. `FAVICON-REQ-010` — The client detail sheet's initial focus-on-open
    SHALL land on the sheet's own title (not the first focusable
    descendant), and the website link SHALL be `inline-flex` so its
    focus ring hugs its text — normal manual Tab-order keyboard
    navigation SHALL still reach every focusable element in the sheet.

## Scenarios

### Scenario: a client with no favicon shows initials, not a broken image (`FAVICON-REQ-004`, `FAVICON-REQ-005`)

- **Given** a client has never had a favicon fetched (or every fetch has failed)
- **When** any screen renders that client's `ClientName`/`ClientAvatar`
- **Then** up to two initials render on a colored circle, no `<img>` tag is present, and no network request for a favicon is attempted

### Scenario: a broken favicon image falls back to initials (`FAVICON-REQ-005`)

- **Given** a client has a `favicon` on record, but the browser's request for that image fails
- **When** the `<img>`'s `error` event fires
- **Then** the avatar swaps to the initials fallback, with no lingering broken-image icon

### Scenario: the initials fallback passes WCAG AA in both themes (`FAVICON-REQ-006`)

- **Given** the five `--chart-1`..`--chart-5` background colors (their light and dark values)
- **When** the fixed `--avatar-foreground` initials color is checked against each
- **Then** every pairing computes to a contrast ratio of at least 4.5:1

### Scenario: editing a client's website triggers a background refresh (`FAVICON-REQ-009`)

- **Given** the owner edits a client and changes `website` from empty to a real URL
- **When** the save succeeds
- **Then** the edit dialog closes immediately (the refresh is never awaited), and the client's avatar updates once the background fetch completes, without a page reload

### Scenario: clearing the website clears the shown icon (`FAVICON-REQ-002`, `FAVICON-REQ-009`)

- **Given** a client currently has a favicon
- **When** the owner clears `website` and saves
- **Then** the background refresh call reaches the route's `no_website` outcome, which clears all three favicon fields server-side, and the client's avatar falls back to initials without a page reload

### Scenario: the manual refresh button reports every outcome in plain language (`FAVICON-REQ-008`)

- **Given** the owner opens a client's detail sheet and presses the refresh-icon button
- **When** the request is in flight
- **Then** the button shows a spinner and is disabled
- **When** the request completes
- **Then** a toast names the outcome in the active locale (success, or one of the six failure reasons), and the sheet's avatar reflects the resulting record

### Scenario: the refresh button is unavailable for the protected client (`FAVICON-REQ-008`)

- **Given** the owner opens the "Sin determinar" client's detail sheet
- **When** the sheet renders
- **Then** no refresh-icon button is shown (it has no website field in the UI at all)

### Scenario: initial focus lands on the sheet title, not the website link (`FAVICON-REQ-010`)

- **Given** the owner opens a client's detail sheet
- **When** the sheet's open animation completes
- **Then** `document.activeElement` is the sheet's own title (`tabindex="-1"`), not the website link, and the website link's own bounding box hugs its text rather than spanning the sheet

## Configuration

- `KANKAKU_FAVICON_ALLOW_PRIVATE` (backend, PocketBase process env) — see
  `docs/architecture/hub-backend.md`; unrelated to the web app.
- `NUXT_PUBLIC_PB_URL` (web) — unrelated to this feature specifically, but
  the base the favicon file URL and the refresh route are both built
  against; see `web/app/plugins/pocketbase.client.ts`.

## Edge cases & failure modes

- **PocketBase instance predates the favicon migration** (the owner
  hasn't restarted yet — see `ESTADO.md`): `favicon`/`favicon_source`/
  `favicon_checked_at` come back `undefined`, not `''`, on every
  `ClientRecord`. `ClientAvatar` treats a falsy `favicon` the same as an
  empty string (initials fallback, no crash, no error toast), and the
  background refresh call's own failure (route not found) is swallowed
  silently — see `web/app/pages/clients/index.vue`.
- **A client's `id`/`updated` are unusual** (e.g. very short/long ids):
  the color-index hash and the cache-bust param are pure string
  operations with no assumptions about id shape or length.
- **Rapid repeated manual refresh clicks**: the button disables itself
  (`faviconRefreshing`) for the duration of one in-flight request.

## Out of scope

- Editing/removing a favicon directly (only a fetch-and-replace via the
  refresh route).
- Any favicon fetch for `work_records`/`task_entries`-only contexts —
  the sync client never touches these fields (`docs/contract.md`).
- A custom `<select>`'s option rows showing an avatar: the app's
  hand-written `web/app/components/ui/select/Select.vue` renders native
  `<option>` elements, which cannot contain an `<img>`/colored span in
  any browser — every native-select client picker in the app (entries
  filters, the unassigned assignment dialog, the project form, the entry
  detail assignment) stays text-only by necessity, not oversight.

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `FAVICON-REQ-001` | `pocketbase/pb_migrations/1758300012_clients_favicon_fields.js` (backend, already committed) | covered |
| `FAVICON-REQ-002` | `pocketbase/pb_hooks/favicon.pb.js` (backend, already committed); manual verification recorded in `ESTADO.md` | covered |
| `FAVICON-REQ-003` | `pocketbase/pb_hooks/lib/favicon-ssrf-guard.test.js` (backend, already committed) | covered |
| `FAVICON-REQ-004` | `web/tests/client-avatar.test.ts`, `web/e2e/client-avatars.spec.ts` ("client avatars render across the app") | covered |
| `FAVICON-REQ-005` | `web/e2e/client-avatars.spec.ts` ("falls back to initials when the favicon image request is blocked") | covered |
| `FAVICON-REQ-006` | `web/tests/client-avatar.test.ts` ("avatarForegroundContrast") | covered |
| `FAVICON-REQ-007` | `web/tests/client-avatar.test.ts` ("withCacheBust") | covered |
| `FAVICON-REQ-008` | `web/e2e/client-avatars.spec.ts` ("favicon refresh button") | covered |
| `FAVICON-REQ-009` | `web/app/pages/clients/index.vue` (`onSubmit`'s `websiteChanged` guard) — no dedicated e2e assertion (needs a real or fixture website reachable from the isolated stack at save time — the refresh-button tests cover the same route/outcome mapping directly) | partially covered |
| `FAVICON-REQ-010` | `web/e2e/client-avatars.spec.ts` ("client detail sheet focus") | covered |
