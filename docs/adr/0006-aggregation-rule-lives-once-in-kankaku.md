# 0006 — The aggregation rule exists exactly once, in kankaku

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-19 |

## Context

Task wall time is the union of intervals between the orchestrator and its
subagents, never their sum, because background children keep running after
the orchestrator settles. This rule is delicate (interval merge, tie-breaks
on pid reuse, late-settling children) and easy to get subtly wrong.

## Decision

The rule lives exactly once, in kankaku's domain layer
(`unionMs` in `src/domain/intervals.ts`, assembled by `buildTasks` in
`src/domain/task-view.ts`), covered by `tests/task-view.test.ts` and
`tests/intervals.test.ts`. Sync pushes **consolidated task rows**
(`task_entries`), not raw records to be re-aggregated elsewhere. Downstream
consumers (the web, any future export) only ever `SUM`/`GROUP BY` rows whose
overlap was already resolved before the row existed. They cannot disagree
with kankaku about this rule because they never implement it.

## Consequences

- The hub schema needs two collections instead of one — see
  [`../architecture/hub-backend.md`](../architecture/hub-backend.md#two-collections-one-summable-one-not).
- The web's aggregation module (`app/lib/aggregate.ts`) carries a guard
  comment and must never import or sum `work_records`.
- Re-implementing interval union in SQL (for the PocketBase view collection,
  for instance) would be the worst of both worlds: the most delicate logic
  in the system, rewritten in the language least suited to it, without the
  tests that already cover it. `task_entries_daily_totals` therefore is a
  plain `SUM(...) GROUP BY ...` over already-consolidated rows, nothing
  more.
- Both sides carry an independent test asserting the same kind of contract
  — see [`../architecture/aggregation.md`](../architecture/aggregation.md#the-shared-fixture-guard).

## Alternatives considered

- **Recompute totals server-side (SQL) from raw records** — rejected: see
  Consequences above; duplicates the hardest logic in a language unsuited
  to it, with no shared test coverage.
- **Let the web recompute from `work_records`** — rejected; this is
  precisely what [ADR 0007](0007-web-is-a-view-layer.md) forbids.

## Related

- Code: `kankaku/src/domain/intervals.ts`, `kankaku/src/domain/task-view.ts`
- Tests: `kankaku/tests/intervals.test.ts`, `kankaku/tests/task-view.test.ts`, `kankaku-hub/web/tests/aggregate.test.ts`
- Architecture: [`../architecture/aggregation.md`](../architecture/aggregation.md)
- Spec: [`../specs/sync-push.md`](../specs/sync-push.md), [`../specs/record-identity.md`](../specs/record-identity.md)
- Proposal: [`../proposal.md`](../proposal.md) §2 (D6), §12 ("the single most important decision in this document")
