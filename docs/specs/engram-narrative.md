# Engram session narrative

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0028](../adr/0028-engram-narrative-read-only-proxy.md), [0019](../adr/0019-hub-fetches-and-stores-client-favicons.md), [0007](../adr/0007-web-is-a-view-layer.md) |
| Code | `pocketbase/pb_hooks/engram.pb.js`, `pocketbase/pb_hooks/lib/engram-narrative.js`, `web/app/composables/useEngramNarrative.ts`, `web/app/lib/session-title.ts`, `web/app/lib/narrative-format.ts`, `web/app/pages/entries/index.vue`, `web/app/pages/sessions-without-task/index.vue`, `web/app/pages/settings/index.vue`, `web/app/components/entries/SessionMarker.vue` |
| Tests | `pocketbase/pb_hooks/lib/engram-narrative.test.js` (`node --test`, `npm run hooks:test`), `web/tests/{session-title,narrative-format,use-engram-narrative}.test.ts` (Vitest), `web/e2e/engram-narrative.spec.ts` (Playwright) |

## Purpose

Shows WHAT a session was about — the Goal from its [Engram](https://github.com/soyunninja/engram)
(gentle-ai's persistent memory) session summary, or the session's first
user prompt when no summary exists — next to kankaku's time and cost on
the entries table and the sessions-without-task queue. Engram's session
id is exactly pi's own session id, which is exactly
`task_entries.session_id`, so no id-mapping step exists: the id used
to look a session up in Engram is the same id already stored on every
`task_entries` row.

This is entirely optional for the operator: without an Engram daemon
configured, every screen renders byte-for-byte as it did before this
feature (`ENGRAM-REQ-009`). See [ADR
0028](../adr/0028-engram-narrative-read-only-proxy.md) for why this is a
read-only, server-side proxy rather than a browser-side fetch, a cloud
API, or a copy of Engram's data into PocketBase.

## Requirements

1. `ENGRAM-REQ-001` — `GET /api/kankaku/engram/status` SHALL return `200
   {configured: false, reachable: false}` when `KANKAKU_ENGRAM_URL` is
   unset, and `200 {configured: true, reachable: bool, unauthorized?:
   true}` when it is set, where `reachable` reflects a `GET
   {url}/health` call succeeding (2xx) within the configured timeout.
2. `ENGRAM-REQ-002` — `POST /api/kankaku/engram/sessions` SHALL accept a
   body `{ids: string[]}` with 1–50 trimmed, non-empty, deduped string
   ids, SHALL reject any other shape with `400
   {code: "invalid_body", error: <reason>}`, and SHALL return `200
   {sessions: {[id]: Narrative}}` containing only ids Engram actually has
   data for. Both routes SHALL return `404 {code: "engram_not_configured"}`
   instead when `KANKAKU_ENGRAM_URL` is unset.
3. `ENGRAM-REQ-003` — Both routes SHALL require an authenticated hub user
   (`$apis.requireAuth()`), the same access level `task_entries`
   list/view already grants — no new privilege.
4. `ENGRAM-REQ-004` — The daemon's base URL, request timeout, and an
   optional bearer token SHALL be configured via PocketBase-process env
   vars only (`KANKAKU_ENGRAM_URL`, `KANKAKU_ENGRAM_TIMEOUT_SECONDS`,
   `KANKAKU_ENGRAM_TOKEN`), never baked into the static SPA build. When a
   token is configured, it SHALL be sent as `Authorization: Bearer
   <token>` on every request the proxy makes to the daemon (`/health`,
   `/sessions/{id}`, `/observations`, `/prompts/recent`).
5. `ENGRAM-REQ-005` — For each requested session id, the proxy SHALL
   resolve its project via `GET {url}/sessions/{id}`, then prefer the
   newest `session_summary` observation for that session
   (`GET {url}/observations?project=…&type=session_summary&limit=200`,
   filtered client-side by `session_id` since the daemon's `?project=`
   filter does not filter by session), and SHALL fall back to the
   earliest prompt for that session
   (`GET {url}/prompts/recent?project=…&limit=200`, same client-side
   filtering) only when no summary was found.
6. `ENGRAM-REQ-006` — A narrative's `title` SHALL be the parsed Goal line
   from a summary's content (`"## Goal"`, `"Goal: "`, or `"**Goal**"` /
   `"**Goal:**"` heading formats, any heading level), and, when no Goal
   line is present, the first prompt collapsed to a single line and
   truncated to 120 characters with a trailing ellipsis; `title` SHALL be
   `''` when neither is usable.
7. `ENGRAM-REQ-007` — A session with neither a summary nor a prompt
   SHALL be absent from the `sessions` response map entirely — never
   present with an empty/null narrative.
8. `ENGRAM-REQ-008` — Any failure while talking to the daemon (unreachable,
   timeout, malformed response, 401/403) SHALL degrade gracefully — the
   affected session id is skipped from the batch, or the status route
   reports `reachable: false` — and SHALL NOT surface as a `5xx` response
   from either route.
9. `ENGRAM-REQ-009` — Without `KANKAKU_ENGRAM_URL` configured, every
   screen that would otherwise show a narrative SHALL render identically,
   byte-for-byte, to how it rendered before this feature existed —
   `sessionTitle(...)` SHALL return exactly `sessionMarkerLabel(...)`
   whenever no narrative title is available.
10. `ENGRAM-REQ-010` — The web app SHALL call `GET
    /api/kankaku/engram/status` at most once per page load (cached for
    the rest of that page's lifetime, with concurrent callers sharing one
    in-flight request), and SHALL stop calling either route for the rest
    of the page's lifetime once either route has answered `404`.
11. `ENGRAM-REQ-011` — The web app SHALL request narratives for a set of
    session ids in batches of at most 50 ids per `POST` call, SHALL never
    re-request an id already cached from an earlier call on the same
    page, and SHALL swallow any per-batch failure (returning whatever is
    already cached) rather than throwing to its caller.
12. `ENGRAM-REQ-012` — When the daemon rejects the health check as
    unauthenticated (401/403), the status route SHALL report `{configured:
    true, reachable: false, unauthorized: true}`, and the Settings
    "Engram" card SHALL show a distinct "not authorized" state rather
    than the generic "unreachable" state.
13. `ENGRAM-REQ-013` — When rendering an expanded narrative's body text,
    the goal line already shown separately SHALL be stripped from the
    body, and every remaining markdown heading or bold label line SHALL
    be flattened to a plain `"Label:"` line so the block reads as text,
    not raw markdown.
14. `ENGRAM-REQ-014` — The proxy SHALL only ever issue `GET` requests to
    the daemon and SHALL never persist any narrative content it fetches
    — it is a read-through cache for exactly the lifetime of one request
    (server-side) or one page load (client-side), never a write path to
    Engram and never a durable copy in PocketBase.

## Scenarios

### Scenario: Engram not configured reports a stable, typed unavailable state (`ENGRAM-REQ-001`, `ENGRAM-REQ-002`)

- **Given** `KANKAKU_ENGRAM_URL` is unset on the PocketBase process
- **When** the web app calls `GET /api/kankaku/engram/status` or `POST /api/kankaku/engram/sessions`
- **Then** both answer `404 {code: "engram_not_configured"}`

### Scenario: a configured, healthy daemon reports reachable (`ENGRAM-REQ-001`)

- **Given** `KANKAKU_ENGRAM_URL` points at a running daemon that answers `/health` with 2xx
- **When** the web app calls `GET /api/kankaku/engram/status`
- **Then** it answers `200 {configured: true, reachable: true}`

### Scenario: an unauthenticated request to a token-protected daemon reports unauthorized (`ENGRAM-REQ-004`, `ENGRAM-REQ-012`)

- **Given** the daemon runs with `ENGRAM_HTTP_TOKEN` set and no matching `KANKAKU_ENGRAM_TOKEN` is configured on the PocketBase process
- **When** `GET /api/kankaku/engram/status` calls the daemon's `/health`
- **Then** the daemon answers 401/403 and the route reports `200 {configured: true, reachable: false, unauthorized: true}`

### Scenario: the sessions route rejects a batch over the id cap (`ENGRAM-REQ-002`)

- **Given** a request body with 51 session ids
- **When** `POST /api/kankaku/engram/sessions` is called
- **Then** it answers `400 {code: "invalid_body", error: "ids must not exceed 50 entries"}`

### Scenario: a session with a summary shows its Goal as the title (`ENGRAM-REQ-005`, `ENGRAM-REQ-006`)

- **Given** Engram has a `session_summary` observation for session `s1` whose content starts with `"## Goal\nShip it.\n\nDetails."`
- **When** `POST /api/kankaku/engram/sessions {ids: ["s1"]}` is called
- **Then** the response includes `sessions.s1 = {title: "Ship it.", goal: "Ship it.", summary: "...", source: "summary", ...}`

### Scenario: a session with no summary falls back to its first prompt (`ENGRAM-REQ-005`, `ENGRAM-REQ-006`)

- **Given** Engram has no `session_summary` observation for session `s2`, but has prompts for it
- **When** `POST /api/kankaku/engram/sessions {ids: ["s2"]}` is called
- **Then** the response includes `sessions.s2` with `source: "prompt"` and `title` derived from the earliest prompt

### Scenario: a resumed session's newest summary wins (`ENGRAM-REQ-005`)

- **Given** a pi session was resumed across two topics, producing two `session_summary` observations for the same session id at different times
- **When** the sessions route resolves that session's narrative
- **Then** it picks the observation with the newest `created_at` (ties broken by `id` desc), so the title reflects the latest Goal

### Scenario: an unknown session id is silently dropped, not an error (`ENGRAM-REQ-007`, `ENGRAM-REQ-008`)

- **Given** a session id the daemon has never heard of
- **When** it is included in a `POST /api/kankaku/engram/sessions` batch
- **Then** that id is simply absent from the response `sessions` map, and every other id in the same batch is still resolved

### Scenario: the daemon is down and every request degrades gracefully (`ENGRAM-REQ-008`)

- **Given** `KANKAKU_ENGRAM_URL` is configured but the daemon process is not running
- **When** the web app calls either route
- **Then** `GET .../status` answers `200 {configured: true, reachable: false}` and `POST .../sessions` answers `200 {sessions: {}}` — neither ever answers `5xx`

### Scenario: without Engram, the UI is byte-for-byte unchanged (`ENGRAM-REQ-009`)

- **Given** `KANKAKU_ENGRAM_URL` is unset
- **When** the entries table, the sessions-without-task queue, and Settings render
- **Then** every session shows exactly its marker label (id/name), with no narrative title, block, or "configured" state — identical to the screens before this feature existed

### Scenario: one status call per page, disabled after a 404 (`ENGRAM-REQ-010`)

- **Given** a page mounts two components that both call `useEngramNarrative().ensureStatus()`
- **When** both calls happen before the first response arrives
- **Then** exactly one `GET /api/kankaku/engram/status` request is made, and if it answers 404 no further status or sessions request is made for the rest of that page's lifetime

### Scenario: narratives are requested in batches of at most 50, with per-id caching (`ENGRAM-REQ-011`)

- **Given** a page needs narratives for 120 session ids, 10 of which were already fetched earlier on the same page
- **When** `forSessions(ids)` is called
- **Then** only the 110 uncached ids are requested, split into 3 batches of at most 50 ids each, and the previously cached 10 are returned from the in-memory cache with no new request

### Scenario: the narrative body hides the repeated goal and flattens markdown (`ENGRAM-REQ-013`)

- **Given** a summary's content is `"## Goal\nShip it.\n\n**Accomplished:**\n- did the thing"`
- **When** the entries table renders the expanded narrative block
- **Then** the Goal line (shown separately above the block) is not repeated in the body, and `"**Accomplished:**"` renders as the plain line `"Accomplished:"`

## Configuration

| Env var (PocketBase process) | Required | Default | Notes |
|---|---|---|---|
| `KANKAKU_ENGRAM_URL` | No — feature is disabled without it | unset | Base URL of the operator's `engram serve` daemon, e.g. `http://127.0.0.1:7437`. Trailing slashes are stripped. |
| `KANKAKU_ENGRAM_TIMEOUT_SECONDS` | No | `2` | Per-request timeout for every call the proxy makes to the daemon. Falls back to the default for blank, non-numeric, or non-positive values. |
| `KANKAKU_ENGRAM_TOKEN` | No | unset | Sent as `Authorization: Bearer <token>` on every daemon request when set — matches the daemon's own optional `ENGRAM_HTTP_TOKEN`. |

No web-side (`NUXT_PUBLIC_*`) configuration exists or is needed — the
static SPA never talks to the daemon directly (see [ADR
0028](../adr/0028-engram-narrative-read-only-proxy.md)).

## Edge cases & failure modes

- **A resumed pi session spans topics.** Engram may hold more than one
  `session_summary` observation for the same session id; the newest by
  `created_at` (ties by `id` desc) always wins, so the title reflects the
  latest Goal even if an earlier summary exists for the same session.
- **The daemon is unreachable or times out.** Reported as `reachable:
  false` (status route) or that session id simply missing from the
  response (sessions route) — never a hub-side error.
- **The daemon rejects a request as unauthenticated (401/403).** The
  status route sets `unauthorized: true`; the sessions route treats it
  like any other per-id failure (skip that id).
- **An unknown session id.** Silently dropped from the response map.
- **More than 50 ids in one request.** Rejected with `400 invalid_body`
  — the caller (web composable) is responsible for chunking; the hooks
  layer enforces the cap as a hard limit, not a soft truncation.
- **A malformed or empty request body.** Rejected with `400
  invalid_body` naming the reason (not an object, missing/non-array
  `ids`, empty array, non-string element, or an array of only blank
  strings).
- **A summary with no parseable Goal line.** The narrative is still
  returned (`source: "summary"`), just with `title: ''` and no `goal`
  field — never falls back to a prompt when a summary exists.

## Out of scope

- A hosted/cloud Engram read API — none exists; see [ADR
  0028](../adr/0028-engram-narrative-read-only-proxy.md) "Alternatives
  considered."
- Any write path from kankaku-hub back into Engram (creating,
  editing, or annotating observations/prompts).
- Per-user Engram URLs or tokens — configuration is one daemon per
  PocketBase process, shared by every hub user, matching the fact that
  Engram itself is operator-run, not per-user.

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `ENGRAM-REQ-001` | `pocketbase/pb_hooks/lib/engram-narrative.test.js` (`"buildStatus: configured and healthy"`, `"buildStatus: configured but unreachable"`, `"buildStatus: not configured is always unreachable..."`); `web/tests/use-engram-narrative.test.ts` (`"ensureStatus: calls the status route once and caches the result across repeated calls"`) | covered |
| `ENGRAM-REQ-002` | `pocketbase/pb_hooks/lib/engram-narrative.test.js` (`"validateSessionIdsBody: ..."` suite, incl. `"enforces the max of 50 ids"`) | covered |
| `ENGRAM-REQ-003` | Not covered by `node --test` (the goja `$apis.requireAuth()` wiring in `engram.pb.js` cannot run outside a live PocketBase instance); manually verified against a running isolated instance — unauthenticated request returns 401 (`odd/tasks/engram-narrative.md` T1 evidence) | partially covered |
| `ENGRAM-REQ-004` | `pocketbase/pb_hooks/lib/engram-narrative.test.js` (`"readConfig: ..."` suite, `"authHeaders: ..."` suite) | covered |
| `ENGRAM-REQ-005` | `pocketbase/pb_hooks/lib/engram-narrative.test.js` (`"pickSummaryForSession: ..."` suite, `"pickFirstPromptForSession: ..."` suite) | covered |
| `ENGRAM-REQ-006` | `pocketbase/pb_hooks/lib/engram-narrative.test.js` (`"parseGoal: ..."` suite, `"titleFrom: ..."` suite) | covered |
| `ENGRAM-REQ-007` | `pocketbase/pb_hooks/lib/engram-narrative.test.js` (`"buildNarrative: returns null when neither summary nor prompt exists"`) | covered |
| `ENGRAM-REQ-008` | `pocketbase/pb_hooks/lib/engram-narrative.test.js` (`"readConfig: never throws when getenv itself throws"`, `buildStatus` suite); manually verified against a stopped daemon — status `reachable:false` and `sessions {}` in ~15ms (`odd/tasks/engram-narrative.md` T1 evidence) — no automated test drives the real `$http.send` failure path inside `engram.pb.js` itself | partially covered |
| `ENGRAM-REQ-009` | `web/tests/session-title.test.ts` (`"is byte-for-byte equal to sessionMarkerLabel for a variety of inputs when there is no narrative"`); `web/e2e/engram-narrative.spec.ts` (`"engram narrative: without Engram configured"` › `"grouped entries rows and the sessions-without-task queue are unchanged; Settings shows not-configured"`) | covered |
| `ENGRAM-REQ-010` | `web/tests/use-engram-narrative.test.ts` (`"ensureStatus: calls the status route once and caches the result across repeated calls"`, `"ensureStatus: a 404 disables the composable — no further status or sessions calls are made"`) | covered |
| `ENGRAM-REQ-011` | `web/tests/use-engram-narrative.test.ts` (`"forSessions: batches ids into chunks of at most 50 per request"`, `"forSessions: skips ids already cached from a previous call — no request for them"`, `"forSessions: a 404 from the sessions route also disables the composable"`) | covered |
| `ENGRAM-REQ-012` | `pocketbase/pb_hooks/lib/engram-narrative.test.js` (`"buildStatus: configured and unauthorized (401/403 from the daemon) reports unauthorized, never reachable"`); `web/tests/use-engram-narrative.test.ts` (`"ensureStatus: exposes the unauthorized flag reported by the status route"`); Settings card state manually verified against a 401 stub (`odd/tasks/engram-narrative.md` T6 RUN C evidence) — no dedicated e2e assertion for the Settings copy itself | partially covered |
| `ENGRAM-REQ-013` | `web/tests/narrative-format.test.ts` (`"strips the \"## Goal\" heading + its text, converts remaining headings to plain labels, keeps list dashes"`, `"converts a \"**Title**\" bold heading line to \"Title:\""`, `"converts a \"**Title:** rest\" bold inline line to \"Title: rest\""`) | covered |
| `ENGRAM-REQ-014` | Not covered by an automated test asserting request methods; verified by code review — `engram.pb.js`/`lib/engram-narrative.js` only ever call `$http.send({method: "GET", ...})`, and no code path writes to the daemon or persists fetched content beyond the in-request/in-page cache | not covered |
