# 0028-engram-narrative-read-only-proxy

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-22 |

## Context

kankaku-hub's entries table and sessions-without-task queue show a
session as an anonymous marker (its id plus, when present, pi's own
session name) — the hub has no idea WHAT the session was about.
[Engram](https://github.com/soyunninja/engram) (gentle-ai's persistent
memory) already holds that answer for any operator who runs it: its
session id is the same pi session id kankaku already stores on every
`task_entries` row (`session_id`), and Engram keeps a per-session
summary (a "Goal" line plus body) or, failing that, the session's first
prompt.

Three constraints rule out the obvious ways to read that data from the
web app directly:

- **Engram's local daemon (`engram serve`, default `127.0.0.1:7437`)
  sends no CORS headers and binds loopback only.** A browser tab open on
  the hub's own origin cannot call it — this is true even when the hub
  and the daemon run on the same machine as the operator's browser,
  because CORS is enforced by the browser regardless of same-machine
  reachability.
- **The hub is a static SPA** (see [ADR
  0015](0015-static-spa-served-by-pocketbase.md)) with no server process
  of its own other than PocketBase — there is nowhere to run a Node-side
  proxy except inside PocketBase itself.
- **Engram's cloud server has no per-session JSON read API.** There is
  no hosted endpoint this feature could call instead of an
  operator-run daemon; the daemon is the only thing that has this data
  at all, and it is optional (an operator who never runs `engram serve`
  simply has no narratives).

Engram's session id equals kankaku's `task_entries.session_id`
one-for-one (both come from the same pi session), so no id-mapping step
is needed once the data can be reached at all — the only real problem is
transport and privacy.

## Decision

Session narratives are read from an operator-run Engram daemon through a
**read-only, server-side proxy inside PocketBase**, never from the
browser and never written back to Engram.

Two auth-gated routes (`pocketbase/pb_hooks/engram.pb.js`) mirror the
pattern `pb_hooks/favicon.pb.js` already established for outbound HTTP
from a hook (`$http.send`, same goja constraints, same nested-`require`
workaround):

- `GET /api/kankaku/engram/status` reports whether the daemon is
  configured, reachable, and (new for this feature) whether it rejected
  the health check as unauthenticated.
- `POST /api/kankaku/engram/sessions` takes a batch of up to 50 session
  ids and returns a narrative (title, goal, summary or first prompt) for
  every id Engram actually has data for.

The daemon's base URL, request timeout, and an optional bearer token are
read from PocketBase-process env vars (`KANKAKU_ENGRAM_URL`,
`KANKAKU_ENGRAM_TIMEOUT_SECONDS`, `KANKAKU_ENGRAM_TOKEN`) — never from
anything the static SPA build could bake in, since the daemon is
per-operator and may not exist at all. Both routes use
`$apis.requireAuth()`, the same check `pb_hooks/totals.pb.js` already
uses: any authenticated hub user, no new privilege beyond what
`task_entries` already grants.

## Consequences

- **Opt-in by construction.** No `KANKAKU_ENGRAM_URL` means both routes
  answer `404 {code: "engram_not_configured"}` and the web layer disables
  itself for the rest of the page's lifetime — an operator who never
  configures Engram sees byte-for-byte the same UI as before this
  feature (enforced by `web/e2e/engram-narrative.spec.ts`'s "without
  Engram" spec).
- **Never a 500, regardless of the daemon's state.** Both handlers wrap
  their entire body in try/catch; an unreachable daemon, a timeout, a
  malformed response, or a 401/403 (an `ENGRAM_HTTP_TOKEN`-protected
  daemon with no matching `KANKAKU_ENGRAM_TOKEN`) all degrade to a safe
  fallback (`reachable: false`, an empty `sessions` map, or that one
  session id being skipped) rather than surfacing as a hub-side error.
- **No writes to Engram, ever.** Every request the hub makes to the
  daemon is a `GET`; this proxy cannot create, edit, or delete anything
  in Engram's own store. kankaku-hub stays a read-only consumer of a data
  source it does not own.
- **The hub stays measurement-only.** This feature adds no money, no
  rate, and no new persisted field to `task_entries`/`work_records` — it
  only reads and displays free-form context that already exists
  elsewhere. It does add a new confidentiality surface: a session's
  summary or first prompt can contain client-confidential text, read
  back to the same authenticated hub user who could already see that
  session's time and cost (`task_entries`' own access rule), never
  persisted by the proxy itself.
- **The feature is only as good as the operator's own Engram setup.**
  Narratives are missing entirely for any session Engram never captured
  (no daemon running, an older session predating Engram, or a session in
  a different Engram project than the one the daemon reports) — this is
  treated as "no narrative today," the same as Engram being unconfigured
  altogether, not an error state.

## Alternatives considered

- **Browser-side fetch directly to the daemon.** Rejected outright: the
  daemon sends no CORS headers, so this simply does not work from a page
  served on a different origin (`http://127.0.0.1:8090` vs.
  `http://127.0.0.1:7437`) — same-machine reachability does not bypass
  CORS. It would also mean every browser that opens the hub needs
  network access to the operator's own machine, which does not hold for
  a deployed (non-local) hub.
- **A hosted Engram cloud API.** Rejected: no such per-session JSON read
  API exists today. Building one would move confidential session
  content through a third-party service for a purely local convenience
  feature, the same privacy objection [ADR
  0019](0019-hub-fetches-and-stores-client-favicons.md) raised for a
  third-party favicon service.
- **Writing Engram summaries into PocketBase** (e.g. a sync step that
  copies each session's Goal into `task_entries` at write time).
  Rejected: it would duplicate data that already lives in, and is kept
  current by, Engram itself — a summary that Engram later revises (a
  resumed session gets a newer Goal) would go stale in PocketBase with no
  update path, and it would turn a purely-additive, revocable read
  ("configure this env var to see narratives") into a one-way copy that
  outlives the operator's Engram setup. A live read-through proxy keeps
  Engram as the single source of truth for its own data.

## Related

- ADRs: [0015 — Static SPA served by PocketBase](0015-static-spa-served-by-pocketbase.md),
  [0019 — Hub fetches and stores client favicons](0019-hub-fetches-and-stores-client-favicons.md)
  (the earlier precedent for "outbound third-party requests are
  server-side, explicit, and never client-side"),
  [0007 — The web is a view layer](0007-web-is-a-view-layer.md)
- Specs: [`../specs/engram-narrative.md`](../specs/engram-narrative.md)
- Code: `pocketbase/pb_hooks/engram.pb.js`, `pocketbase/pb_hooks/lib/engram-narrative.js`,
  `web/app/composables/useEngramNarrative.ts`, `web/app/lib/session-title.ts`,
  `web/app/lib/narrative-format.ts`
- Task/evidence: `odd/tasks/engram-narrative.md`
