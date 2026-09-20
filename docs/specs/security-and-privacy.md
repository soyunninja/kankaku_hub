# Security and privacy

| | |
|---|---|
| Status | implemented |
| Phase | [phase-2-sync-push](../phases/phase-2-sync-push.md) |
| Owners repos | kankaku, kankaku-hub |
| Related ADRs | [0008](../adr/0008-no-money-in-the-database.md), [0017](../adr/0017-prompt-upload-defaults-to-none.md), [0018](../adr/0018-billing-boundary-enforced-in-schema.md) |
| Code | `kankaku/src/config.ts`, `kankaku/src/adapters/hub-credentials.ts`, `kankaku/src/adapters/pocketbase-client.ts`, `kankaku-hub/pocketbase/pb_migrations/*.js` |
| Tests | `kankaku/tests/config.test.ts`, `kankaku/tests/hub-credentials.test.ts`, `kankaku/tests/pocketbase-client.test.ts` |

## Purpose

Defines the trust boundaries and data-minimization defaults that keep this
a measurement tool: prompts stay local unless explicitly opted in,
credentials never live in a project repo, the connection is encrypted
end-to-end (or explicitly local), and the schema itself cannot hold money.

## Requirements

1. `SEC-REQ-001` — Prompts SHALL leave the machine only per
   `KANKAKU_SYNC_PROMPT`, defaulting to `none` (see
   [ADR 0017](../adr/0017-prompt-upload-defaults-to-none.md)).
2. `SEC-REQ-002` — Hub credentials SHALL never be required to live inside a
   project repository; `<KANKAKU_DIR>/config.json` (frequently committed)
   SHALL hold only ids, never a password/token.
3. `SEC-REQ-003` — The PocketBase URL SHALL be rejected unless it is
   `https:`, or `http:` with a local host (`localhost`/`127.0.0.1`/`::1`).
4. `SEC-REQ-004` — Sync SHALL use a dedicated service account
   (`role: "service"`), distinct from the human owner account, with write
   access limited to `task_entries`/`work_records` and read access to
   `clients`/`projects`/`tasks` only — never write access to the catalog.
5. `SEC-REQ-005` — On a `401` response, the client SHALL re-authenticate
   once with stored credentials and retry; a second failure SHALL stop and
   surface the error rather than looping.
6. `SEC-REQ-006` — No collection in the hub schema SHALL define a
   rate/price/margin/invoice field, ever (see
   [ADR 0018](../adr/0018-billing-boundary-enforced-in-schema.md)).
7. `SEC-REQ-007` — Public self-registration on the hub's `users` collection
   SHALL be disabled; accounts are provisioned only via the superuser
   CLI/API.

## Scenarios

### Scenario: default install never uploads prompt text (`SEC-REQ-001`)

- **Given** `KANKAKU_SYNC_PROMPT` is unset
- **When** a task is synced
- **Then** the `prompt` field sent to the hub is empty/absent

### Scenario: a plain-HTTP production URL is rejected (`SEC-REQ-003`)

- **Given** `KANKAKU_PB_URL=http://hub.example.com`
- **When** the URL is validated
- **Then** it is rejected, with the reason stated (not silently downgraded to a no-op)

### Scenario: the service account cannot write the catalog (`SEC-REQ-004`)

- **Given** the sync client is authenticated as `role: "service"`
- **When** it attempts to create a missing project referenced by a task
- **Then** the request is rejected by the hub's access rules, and the sync client surfaces this to the user rather than silently dropping the row

### Scenario: a second consecutive 401 stops instead of looping (`SEC-REQ-005`)

- **Given** stored credentials are actually invalid (e.g. rotated password not updated locally)
- **When** a request returns `401` twice in a row
- **Then** the sync pass stops and reports an authentication error, with no further retry loop

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `KANKAKU_SYNC_PROMPT` | `none` | `none` / `truncated` (~120 chars) / `full`. |
| `~/.kankaku/credentials.json` | — | `chmod 600` recommended; holds `url`/`email`/`password`. |
| `KANKAKU_PB_URL`/`_EMAIL`/`_PASSWORD` | — | Env override, takes precedence over the file. |

## Edge cases & failure modes

- A committed `<KANKAKU_DIR>/config.json` containing only ids leaking to a
  public repo: not a credential leak by design (ids are not secrets), but
  reveals which client/project a repo is associated with — acceptable per
  the proposal's threat model, not called out as sensitive.
- A `credentials.json` with looser-than-600 permissions: not currently
  enforced/checked by kankaku (the `chmod 600` recommendation is
  documentation, not an enforced check) — verify before treating this as
  guaranteed.

## Out of scope

- Encryption at rest for `credentials.json` (relies on filesystem
  permissions only).
- Rate limiting / abuse protection on the PocketBase instance itself
  (delegated to PocketBase's own defaults and, when deployed, the reverse
  proxy — see [`../runbooks/deploy-to-vps.md`](../runbooks/deploy-to-vps.md)).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `SEC-REQ-001` | `kankaku/tests/config.test.ts`, `kankaku/tests/hub-entry.test.ts` | covered |
| `SEC-REQ-002` | `kankaku/tests/project-config.test.ts` | covered |
| `SEC-REQ-003` | `kankaku/tests/config.test.ts` | covered |
| `SEC-REQ-004` | manual verification per `kankaku-hub/ESTADO.md` (service role write attempt on `clients`) | covered |
| `SEC-REQ-005` | `kankaku/tests/pocketbase-client.test.ts` | covered |
| `SEC-REQ-006` | absence across all migrations (grep) | covered |
| `SEC-REQ-007` | migration `1758300007_users_rules.js` | covered |
