# 0012 — Historical records go to a real "Sin determinar" client row

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

Records written before this feature (or with no resolvable `clientId`) have
no canonical client id, and some carry the exact free-text spelling drift
[ADR 0001](0001-identity-is-an-id-not-a-name.md) exists to remove. The
proposal describes this destination in §5.3 but it is not one of the
numbered D1–D8 decisions, so it is recorded here as its own ADR.

## Decision

Create one real `clients` row named "Sin determinar", with `unassigned:
true` (seeded idempotently by migration `1758300008_seed_unassigned_client.js`).
It is a row like any other, with a real id, so every aggregation keeps
working with no `NULL` special case. Every row routed there keeps its
original free-text label in `legacy_client_label`
(`kankaku/src/domain/hub-entry.ts#resolveTaskAssignment`), turning "all the
history is a grey blob" into "everything that said `cjamar` goes to
Cajamar" — a single bulk update, not a data-recovery project.

## Consequences

- The picker hides "Sin determinar" or lists it last — it is a migration
  destination, not a choice a user makes.
- The web's unassigned queue
  ([`../specs/web-unassigned-queue.md`](../specs/web-unassigned-queue.md))
  exists specifically to pay off this design: group by
  `(legacy_client_label, repo_project)`, bulk-reassign via the batch API.
- `/kankaku backfill` (`kankaku/src/adapters/kankaku-command.ts`) is
  re-runnable and reports what it routed to "Sin determinar", by label.
- Reports must explicitly filter out "Sin determinar" if they want to
  exclude unassigned work — it is real data in the same shape as everything
  else, not absent data.

## Alternatives considered

- **Store `NULL` for an unresolved client** — rejected: `client` is a
  required relation on `task_entries` (see
  [`../architecture/hub-backend.md`](../architecture/hub-backend.md)), and
  a `NULL` special case would have to be handled by every consumer,
  forever.

## Related

- Code: `kankaku-hub/pocketbase/pb_migrations/1758300008_seed_unassigned_client.js`, `kankaku/src/domain/hub-entry.ts#resolveTaskAssignment`
- Spec: [`../specs/backfill-unassigned.md`](../specs/backfill-unassigned.md), [`../specs/web-unassigned-queue.md`](../specs/web-unassigned-queue.md)
- Proposal: [`../proposal.md`](../proposal.md) §5.3
