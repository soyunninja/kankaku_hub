# 0008 — No money in the database

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-19 |

## Context

Client + project + time + cost is most of an invoice already. Without an
explicit boundary, the temptation to add "just a rate field" to make
reporting more useful is natural — and would quietly turn a measurement
tool into invoicing software, a much larger and more regulated problem.

## Decision

Clients, projects, tasks, time and token cost are stored. Hourly rates,
prices, margins and invoice numbers are not, and never will be. `cost` in
the schema is the measured token cost from the provider (presumably USD),
not a billable amount.

There is also a regulatory reason cited for staying on this side of the
line: in Spain, software that issues invoices falls under the
invoicing-software regulation (Verifactu, RD 1007/2023), with integrity and
traceability requirements. **This has not been confirmed with an
accountant** — it is recorded here as a reason to keep the boundary, not as
legal advice, and must keep that caveat wherever it is repeated.

## Consequences

- Reporting stops at "AI time and cost per project"; invoicing is exported
  (CSV) and done by a dedicated tool.
- No collection, migration or seed row may ever carry a rate/price/margin
  field — enforced by convention and review (`kankaku-hub/AGENTS.md`), not
  by a database constraint. See
  [ADR 0018](0018-billing-boundary-enforced-in-schema.md) for the concrete,
  code-verified confirmation that this holds today.
- The web labels `cost` explicitly as a measured amount, not a price.

## Alternatives considered

- **Add an hourly-rate field, let the web compute invoice-ready totals** —
  rejected: this is precisely the scope creep the boundary exists to
  prevent, and pulls in the Verifactu-shaped regulatory question with no
  corresponding investment in compliance.

## Related

- Code: every migration in `kankaku-hub/pocketbase/pb_migrations/` (absence is the evidence)
- ADR: [0018 — billing boundary enforced in schema](0018-billing-boundary-enforced-in-schema.md)
- Spec: [`../specs/security-and-privacy.md`](../specs/security-and-privacy.md)
- Vision: [`../vision.md`](../vision.md#the-billing-boundary)
- Proposal: [`../proposal.md`](../proposal.md) §2 (D8), §9.4
