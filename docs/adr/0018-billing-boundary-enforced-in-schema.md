# 0018 — Billing boundary enforced in schema: no rates, prices or margins anywhere

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

[ADR 0008](0008-no-money-in-the-database.md) is the design-time decision.
This ADR records the implementation-time confirmation: as of the ten
migrations in `pocketbase/pb_migrations/`, no collection defines a rate,
price, margin, or invoice-number field of any kind. `cost` exists only on
`task_entries`/`work_records`, as a measured token-cost number, not a
billable amount.

## Decision

Keep enforcing the boundary by review, per `kankaku-hub/AGENTS.md`: "If a
change introduces a rate/price/invoice field, it is out of scope for this
repo — reject it or take it to an external invoicing tool." No schema
change may add such a field; no seed or demo data may include one.

The regulatory caveat from [ADR 0008](0008-no-money-in-the-database.md)
carries forward unchanged: the Verifactu (RD 1007/2023) citation is a
reason to keep this boundary, **not confirmed legal advice** — do not
present it as settled without an accountant's review.

## Consequences

- Exporting to an external invoicing tool (CSV) remains the supported path
  for anyone who needs an actual invoice.
- A future contributor proposing a rate/price field has a documented,
  citable reason to be redirected, rather than relying on institutional
  memory.

## Alternatives considered

See [ADR 0008](0008-no-money-in-the-database.md) — this ADR does not
revisit that decision, only confirms it holds in the implemented schema.

## Related

- ADR: [0008 — no money in the database](0008-no-money-in-the-database.md)
- Code: `kankaku-hub/pocketbase/pb_migrations/*.js` (absence of any rate/price/margin field is the evidence)
- Docs: `kankaku-hub/AGENTS.md` ("No money in the database")
- Vision: [`../vision.md`](../vision.md#the-billing-boundary)
