# 0001 — Identity is an id, not a name

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-19 |

## Context

The billing client was a free-text label (`/kankaku client <name>`,
`KANKAKU_CLIENT`, `.kankaku/config.json`). Free text drifts: `cajamar`,
`Cajamar`, `Caja Mar`, `cjamar` are four different clients as far as any
report is concerned, and there was no project dimension at all. See
[`../proposal.md`](../proposal.md) §1 ("Problem") and §2 D1.

## Decision

A record stores `clientId` and `projectId` (PocketBase record ids). Names
are denormalised alongside for readability (`clientName`, `projectName` in
`WorkRecordMetadata`), but no aggregation ever keys on a name. The id is the
truth; the user never types either.

## Consequences

- Fixes the `Cajamar`/`cjamar` problem at the source: there is exactly one
  row per real client, referenced by id everywhere.
- Requires a picker (see [ADR 0002](0002-selection-is-a-pick-from-a-list.md))
  and a catalog to pick from (see
  [`../specs/catalog-cache.md`](../specs/catalog-cache.md)).
- Historical records with no id need a migration path — see
  [ADR 0012](0012-historical-records-to-sin-determinar.md).
- The existing free-text `client` field is kept, populated with the
  canonical name, so old reports/exports keep working untouched.

## Alternatives considered

- **Keep free-text labels and normalize them with fuzzy matching** —
  rejected; see [ADR 0002](0002-selection-is-a-pick-from-a-list.md) §5.4:
  fuzzy matching reintroduces the exact class of error it would try to fix,
  with a confidence score attached instead of a definite answer.

## Related

- Code: `kankaku/src/domain/work-target.ts`, `kankaku/src/domain/work-record.ts`
- Spec: [`../specs/record-identity.md`](../specs/record-identity.md), [`../specs/target-selection.md`](../specs/target-selection.md)
- Proposal: [`../proposal.md`](../proposal.md) §1, §2 (D1)
