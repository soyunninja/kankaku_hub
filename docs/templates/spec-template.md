# Capability name

| | |
|---|---|
| Status | implemented / partial / planned |
| Phase | phase-N (link) |
| Owners repos | kankaku / kankaku-hub / both |
| Related ADRs | links |
| Code | paths |
| Tests | paths |

## Purpose

One or two paragraphs: what this capability does and why it exists.

## Requirements

Numbered, normative statements using SHALL/SHOULD/MAY, with a stable id
prefix unique to this spec (e.g. `SYNC-REQ-001`). Requirement ids must never
be reused or renumbered once published — a removed requirement is marked
`retired`, not deleted.

1. `PREFIX-REQ-001` — The system SHALL ...
2. `PREFIX-REQ-002` — The system SHOULD ...

## Scenarios

Given/When/Then. Each scenario references the requirement id(s) it exercises.

### Scenario: descriptive name (`PREFIX-REQ-001`)

- **Given** ...
- **When** ...
- **Then** ...

## Configuration

Env vars, config files, defaults — exact names, exact paths.

## Edge cases & failure modes

What happens when things go wrong: network errors, invalid input, races.

## Out of scope

What this capability deliberately does not do.

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `PREFIX-REQ-001` | `path/to/test.ts::describe > it` | covered |
| `PREFIX-REQ-002` | — | not covered |
