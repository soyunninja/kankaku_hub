# Web auth and shell

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0015](../adr/0015-static-spa-served-by-pocketbase.md) |
| Code | `web/app/middleware/auth.global.ts`, `web/app/composables/useAuth.ts`, `web/app/plugins/pocketbase.client.ts`, `web/app/layouts/default.vue`, `web/app/layouts/auth.vue`, `web/app/pages/login.vue` |
| Tests | `web/e2e/smoke.spec.ts` |

## Purpose

Gates every route behind PocketBase authentication (single owner account,
no multi-tenancy) and provides the authenticated app shell (sidebar,
header, command palette).

## Requirements

1. `WEBAUTH-REQ-001` — An unauthenticated visitor to any route other than
   `/login` SHALL be redirected to `/login`, preserving the intended path
   as `?redirect=`.
2. `WEBAUTH-REQ-002` — An authenticated visitor to `/login` SHALL be
   redirected to `/` (or the `?redirect=` target if present).
3. `WEBAUTH-REQ-003` — On app boot, a persisted (localStorage) auth token
   SHALL be validated against the server once (`authRefresh`); an invalid
   token SHALL be cleared rather than retried.
4. `WEBAUTH-REQ-004` — The PocketBase client base URL SHALL resolve to
   `NUXT_PUBLIC_PB_URL` when set, else `http://127.0.0.1:8090` in `nuxt
   dev`, else `window.location.origin` in the production static build.
5. `WEBAUTH-REQ-005` — The authenticated shell SHALL provide a responsive
   sidebar (collapsing to a sheet on mobile), a header with translated
   breadcrumbs, and a command palette (Ctrl/Cmd+K) over clients, projects
   and tasks.
6. `WEBAUTH-REQ-006` — The auth guard SHALL run client-side only (the app
   is `ssr: false`).

## Scenarios

### Scenario: visiting a protected route while logged out redirects to login (`WEBAUTH-REQ-001`)

- **Given** no valid auth token
- **When** the user navigates to `/clients`
- **Then** they are redirected to `/login?redirect=/clients`

### Scenario: an expired token clears itself without an error loop (`WEBAUTH-REQ-003`)

- **Given** a persisted token that the server rejects
- **When** the app boots and calls `authRefresh()`
- **Then** the auth store is cleared and the guard sends the user to `/login`, with no retry loop

### Scenario: production build resolves the API base to same-origin (`WEBAUTH-REQ-004`)

- **Given** the app is the static build served by PocketBase, with no `NUXT_PUBLIC_PB_URL` override
- **And** the current page is `/clients` (not `/`)
- **When** the PocketBase plugin resolves its base URL
- **Then** it uses `window.location.origin`, not a relative path that would resolve against `/clients/`

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `NUXT_PUBLIC_PB_URL` | `''` (empty → resolved per `WEBAUTH-REQ-004`) | Override the PocketBase base URL. |

## Edge cases & failure modes

- PocketBase unreachable at boot: `authRefresh()` fails, token is cleared,
  user lands on `/login`; see
  [`../runbooks/troubleshooting.md`](../runbooks/troubleshooting.md) for
  the "hub unreachable" case.
- A stale `index.html`-per-route prerender output (fixed, see
  [`../architecture/hub-web.md`](../architecture/hub-web.md#the-nuxt-generate--pocketbase-static-serving-gotcha)):
  would otherwise 301-redirect `/login` to `/login/`, breaking relative API
  URL resolution.

## Out of scope

- Multiple accounts, roles beyond `owner`/`service`, or invitations (single-user tool by design).
- Password reset flow (not confirmed implemented in this documentation pass — verify in `web/app/pages/` before relying on it).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `WEBAUTH-REQ-001` | `web/e2e/smoke.spec.ts` | covered |
| `WEBAUTH-REQ-002` | `web/e2e/smoke.spec.ts` | covered |
| `WEBAUTH-REQ-003` | manual verification per `ESTADO.md` | not covered by an automated test found in this pass |
| `WEBAUTH-REQ-004` | manual verification per `ESTADO.md` (production build + `PW_BASE_URL` e2e run) | covered |
| `WEBAUTH-REQ-005` | `web/e2e/smoke.spec.ts`, `web/e2e/polish.spec.ts` | covered |
| `WEBAUTH-REQ-006` | code review (`ssr: false` in `nuxt.config.ts`) | covered |
