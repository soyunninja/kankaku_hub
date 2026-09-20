# 0007 — The web is a view layer, not a second brain

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-19 |

## Context

Given [ADR 0006](0006-aggregation-rule-lives-once-in-kankaku.md), the web
app must never be tempted to "just compute it here" — the whole point of
consolidating rows before they reach the hub is that consumers don't have
to.

## Decision

The Nuxt app reads PocketBase and writes task/project metadata. It never
computes time or cost aggregations from raw records, and it never holds a
rule that kankaku also holds. In code: `app/lib/aggregate.ts` is the single
module allowed to sum `task_entries` fields, and it never imports
`work_records`.

## Consequences

- Every dashboard/project-detail/breakdown total in the web is a plain
  `SUM`/`GROUP BY` over `task_entries` — see
  [`../architecture/hub-web.md`](../architecture/hub-web.md#the-d6-guard).
- `work_records` only ever appears as read-only drill-down detail (the
  entries explorer's drawer), always labelled as never summed.
- A future feature that "needs" a new total should ask whether
  `task_entries` (or a new view collection derived only from it) already
  carries what it needs, before writing any client-side aggregation code.

## Alternatives considered

- **Compute totals client-side from `work_records`** — rejected; this is
  exactly the re-implementation [ADR 0006](0006-aggregation-rule-lives-once-in-kankaku.md)
  forbids, and would silently double-count overlapping subagent time.

## Related

- Code: `kankaku-hub/web/app/lib/aggregate.ts`
- Tests: `kankaku-hub/web/tests/aggregate.test.ts`
- Architecture: [`../architecture/hub-web.md`](../architecture/hub-web.md), [`../architecture/aggregation.md`](../architecture/aggregation.md)
- Spec: [`../specs/web-dashboard.md`](../specs/web-dashboard.md)
- Proposal: [`../proposal.md`](../proposal.md) §2 (D7), §9.3
