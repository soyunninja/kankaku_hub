# Record identity

| | |
|---|---|
| Status | implemented |
| Phase | [phase-1-catalog-and-selection](../phases/phase-1-catalog-and-selection.md) |
| Owners repos | kankaku |
| Related ADRs | [0001](../adr/0001-identity-is-an-id-not-a-name.md), [0006](../adr/0006-aggregation-rule-lives-once-in-kankaku.md) |
| Code | `kankaku/src/domain/work-record.ts`, `kankaku/src/domain/work-target.ts` |
| Tests | `kankaku/tests/work-record.test.ts`, `kankaku/tests/work-target.test.ts` |

## Purpose

Defines the optional hub-identity metadata a `WorkRecord` carries, and the
schema-versioning rule that lets it be added without breaking existing
consumers.

## Requirements

1. `RECID-REQ-001` — `WorkRecordMetadata` SHALL support optional fields
   `clientId`, `clientName`, `projectId`, `projectName`, `machine`, in
   addition to the pre-existing `client` (free-text label) and
   `sessionName`.
2. `RECID-REQ-002` — Adding these optional fields SHALL NOT require a
   `WORK_RECORD_SCHEMA` version bump (`WORK_RECORD_SCHEMA` stays `1`).
3. `RECID-REQ-003` — The pre-existing free-text `client` field SHALL
   continue to be populated (with the canonical client name when a hub
   target is resolved), so records/exports predating the hub feature keep
   working unchanged.
4. `RECID-REQ-004` — `isWorkRecord` SHALL validate each hub metadata field
   as an optional string, rejecting a record where a present field is not a
   string.
5. `RECID-REQ-005` — `machine` SHALL only be set when a hub target is
   configured (not on every record regardless of hub usage).

## Scenarios

### Scenario: a hub-enabled record carries both id and name (`RECID-REQ-001`, `RECID-REQ-003`)

- **Given** a session resolved `clientId`/`clientName`/`projectId`/`projectName`
- **When** a `WorkRecord` is written for that session
- **Then** the record includes both the ids and the denormalised names, and `client` holds the canonical name

### Scenario: schema version does not change (`RECID-REQ-002`)

- **Given** the hub metadata fields were added in this branch
- **When** `WORK_RECORD_SCHEMA` is inspected
- **Then** it is unchanged from the pre-hub baseline

### Scenario: a record with no hub target has no hub metadata (`RECID-REQ-001`)

- **Given** a session with no hub configured (or the user skipped the picker)
- **When** a `WorkRecord` is written
- **Then** `clientId`/`projectId`/`machine` are absent, and the record remains valid per `isWorkRecord`

## Configuration

None — this is a pure domain data-shape spec, not independently configurable.

## Edge cases & failure modes

- A record written before this feature (no hub fields at all): still valid,
  still readable; `isWorkRecord` treats every hub field as optional.
- A malformed hub field (e.g. `clientId` is a number): the record fails
  `isWorkRecord` validation, same as any other malformed field.

## Out of scope

- Task id linkage (`taskId`) — planned, see
  [phase-4-task-linkage](../phases/phase-4-task-linkage.md).
- Validating that `clientId`/`projectId` actually exist in the hub at write
  time (that happens at sync time — see [`sync-push.md`](sync-push.md)).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `RECID-REQ-001` | `kankaku/tests/work-record.test.ts` | covered |
| `RECID-REQ-002` | `kankaku/tests/work-record.test.ts` | covered |
| `RECID-REQ-003` | `kankaku/tests/work-target.test.ts` | covered |
| `RECID-REQ-004` | `kankaku/tests/work-record.test.ts` | covered |
| `RECID-REQ-005` | `kankaku/tests/work-target.test.ts` | covered |
