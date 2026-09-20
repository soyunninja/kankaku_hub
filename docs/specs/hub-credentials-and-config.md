# Hub credentials and config

| | |
|---|---|
| Status | implemented |
| Phase | [phase-1-catalog-and-selection](../phases/phase-1-catalog-and-selection.md) |
| Owners repos | kankaku |
| Related ADRs | [0001](../adr/0001-identity-is-an-id-not-a-name.md), [0010](../adr/0010-everything-local-for-now.md) |
| Code | `kankaku/src/adapters/hub-credentials.ts`, `kankaku/src/adapters/project-config.ts`, `kankaku/src/config.ts` |
| Tests | `kankaku/tests/hub-credentials.test.ts`, `kankaku/tests/project-config.test.ts`, `kankaku/tests/config.test.ts` |

## Purpose

Resolves where kankaku's hub-related credentials and per-project target ids
come from, so the rest of the system (catalog, sync) can assume a single,
already-validated source.

## Requirements

1. `CRED-REQ-001` — The system SHALL resolve the PocketBase URL, email and
   password from environment variables (`KANKAKU_PB_URL`,
   `KANKAKU_PB_EMAIL`, `KANKAKU_PB_PASSWORD`) when set, taking precedence
   over `~/.kankaku/credentials.json`.
2. `CRED-REQ-002` — The system SHALL fall back to `~/.kankaku/credentials.json`
   (`{ "url": ..., "email": ..., "password": ... }`) per field when the
   corresponding env var is not set.
3. `CRED-REQ-003` — The system SHALL treat a missing, malformed, or
   non-object `credentials.json` as "no credentials from file" rather than
   raising an error.
4. `CRED-REQ-004` — The system SHALL treat a home-directory resolver that
   throws as "no home directory available" rather than crashing extension
   load (`safeHomeDir`).
5. `CRED-REQ-005` — The system SHALL reject a hub URL that is not `https:`
   unless the host is `localhost`, `127.0.0.1`, `::1`, or `[::1]`.
6. `CRED-REQ-006` — The system SHALL read/write per-project target ids
   (`clientId`, `projectId`) in `<KANKAKU_DIR>/config.json`, preserving
   every other existing key in that file (including the legacy `client`
   field) on write.
7. `CRED-REQ-007` — Config file writes SHALL be atomic (write to a temp
   file, then rename).

## Scenarios

### Scenario: env vars take precedence over the credentials file (`CRED-REQ-001`)

- **Given** `KANKAKU_PB_URL`, `KANKAKU_PB_EMAIL`, `KANKAKU_PB_PASSWORD` are all set
- **And** `~/.kankaku/credentials.json` holds different values
- **When** kankaku resolves hub credentials
- **Then** the env var values are used for every field they cover

### Scenario: a throwing home-dir resolver does not crash the extension (`CRED-REQ-004`)

- **Given** the home-directory provider throws (e.g. no `HOME`, a sandboxed environment)
- **When** `resolveHubCredentials` runs
- **Then** it resolves as if no credentials file exists, without throwing

### Scenario: a plain-HTTP non-local URL is rejected (`CRED-REQ-005`)

- **Given** `KANKAKU_PB_URL=http://pb.example.com`
- **When** the URL is validated
- **Then** it is rejected with an explanation, and HTTPS or a local host is required

### Scenario: writing target ids preserves the legacy `client` field (`CRED-REQ-006`)

- **Given** `<KANKAKU_DIR>/config.json` contains `{ "client": "acme" }`
- **When** `writeProjectTargetIds` is called with `{ clientId, projectId }`
- **Then** the resulting file contains `{ "client": "acme", "clientId": ..., "projectId": ... }`

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `KANKAKU_PB_URL` | — | Hub base URL. |
| `KANKAKU_PB_EMAIL` | — | Service account email. |
| `KANKAKU_PB_PASSWORD` | — | Service account password. |
| `~/.kankaku/credentials.json` | — | File fallback: `{ "url", "email", "password" }`, `chmod 600` recommended. |
| `<KANKAKU_DIR>/config.json` | — | Per-project: `{ "client"?, "clientId"?, "projectId"? }`. `KANKAKU_DIR` defaults to `.kankaku`. |

## Edge cases & failure modes

- No credentials anywhere (no env, no file): the catalog/sync adapters treat
  the hub as unconfigured and fall back to local-only behaviour (see
  [`catalog-cache.md`](catalog-cache.md)).
- A URL with no scheme, or an unparseable URL: rejected, same as a
  non-HTTPS URL.
- `config.json` with a non-string `projectId`: dropped while `clientId` is
  kept, if `clientId` itself is a valid string.

## Out of scope

- Credential rotation or expiry handling beyond PocketBase's own token
  `exp` (see [`sync-push.md`](sync-push.md) for 401 retry behaviour).
- Multi-hub configuration (one hub target per machine/project only).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `CRED-REQ-001` | `kankaku/tests/hub-credentials.test.ts` | covered |
| `CRED-REQ-002` | `kankaku/tests/hub-credentials.test.ts` | covered |
| `CRED-REQ-003` | `kankaku/tests/hub-credentials.test.ts` | covered |
| `CRED-REQ-004` | `kankaku/tests/hub-credentials.test.ts` | covered |
| `CRED-REQ-005` | `kankaku/tests/config.test.ts` | covered |
| `CRED-REQ-006` | `kankaku/tests/project-config.test.ts` | covered |
| `CRED-REQ-007` | `kankaku/tests/project-config.test.ts` | covered |
