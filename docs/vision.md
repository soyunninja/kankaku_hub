# Vision

## Problem

kankaku already measures, per prompt, how long a pi agent worked (excluding
waits for the user) and what it cost in tokens. That data lands in a local,
append-only `.kankaku/worklog.jsonl` and never leaves the machine. Two gaps
motivated this system:

1. **No canonical identity.** The billing client was a free-text label
   (`/kankaku client <name>`, `KANKAKU_CLIENT`). Free text drifts —
   `cajamar`, `Cajamar`, `Caja Mar`, `cjamar` are four different clients as
   far as any report is concerned — and there was no project dimension at
   all.
2. **No aggregation across projects.** Time and cost per client lived in as
   many JSONL files as there were repositories, with no shared view.

See [`docs/proposal.md`](proposal.md) §1 for the original problem statement.

## Goals

- Clients and projects come **from a shared catalog** (PocketBase), are
  chosen from a list — never typed — and are stored in kankaku's records
  **by id**.
- Completed, already-consolidated task rows are pushed to that catalog so a
  human can see real AI time and cost per project without touching a JSONL
  file.
- The aggregation logic (union of overlapping orchestrator/subagent
  intervals) exists in exactly one place, so downstream consumers never
  have to re-derive it and can never disagree with kankaku about it.
- Historical data is not discarded: pre-migration records are routed to a
  real "unassigned" client row and keep their original free-text label for
  later bulk reassignment.
- The whole system stays a measurement tool, not invoicing software.

## Non-goals

- **Not a task manager.** kankaku never invents tasks from prompts; task
  creation and editing belong to a human (or, later, an explicit
  `/kankaku task new` command) — see [ADR 0004](adr/0004-kankaku-does-not-invent-tasks.md).
- **Not multi-tenant.** The hub is a single-owner tool with one human
  account and one service account, not a SaaS product with organizations,
  roles or invitations.
- **Not invoicing software.** See "The billing boundary" below.
- **Not a second aggregation engine.** The web reads and sums
  `task_entries`; it never recomputes time totals from raw records — see
  [ADR 0007](adr/0007-web-is-a-view-layer.md).
- **Not currently deployed anywhere.** Both repos are local-only as of this
  writing — see [ADR 0010](adr/0010-everything-local-for-now.md) and
  [runbooks/deploy-to-vps.md](runbooks/deploy-to-vps.md) for the (planned,
  not executed) path to changing that.

## The billing boundary

Clients, projects, tasks, time and token cost are stored. Hourly rates,
prices, margins and invoice numbers are not, and are not planned to be —
see [`docs/proposal.md`](proposal.md) §9.4 and
[ADR 0008](adr/0008-no-money-in-the-database.md) /
[ADR 0018](adr/0018-billing-boundary-enforced-in-schema.md).

Two reasons converge on the same line:

1. **Product scope.** Storing a price per hour is the moment this stops
   being a measurement tool and becomes billing software — a much larger,
   much more regulated problem. Export the numbers (CSV) and let a
   dedicated invoicing tool invoice.
2. **A regulatory reason, explicitly unverified.** In Spain, software that
   issues invoices falls under the invoicing-software regulation
   (Verifactu, RD 1007/2023), with integrity and traceability
   requirements. This is cited in the proposal as a reason to stay on this
   side of the line, **not as legal advice** — it has not been confirmed
   with an accountant. Keep this caveat whenever the boundary is discussed;
   do not upgrade it to a settled fact.

## Where to go next

- [`architecture/overview.md`](architecture/overview.md) for how the pieces
  fit together.
- [`adr/README.md`](adr/README.md) for why each load-bearing decision was
  made.
- [`specs/README.md`](specs/README.md) for what each capability normatively
  does today.
- [`phases/README.md`](phases/README.md) for what is built versus planned.
