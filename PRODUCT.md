# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** one developer-owner who organizes and reviews their own
  agents' work time and token cost across clients, projects, and tasks.
- **Secondary:** optional read-only viewers who inspect measurements without
  changing the catalog or assignments.
- kankaku's service integration is a machine client, not a human audience.

## Product Purpose

kankaku-hub is the backend and dashboard for agent-work measurement. It
provides canonical clients, projects, and tasks and makes synced time and
token cost inspectable across work contexts.

Success means the owner can understand what work was measured, where it
belongs, and how trustworthy its measurements are without double-counting
or confusing measurement with billing.

## Positioning

The hub stores and presents measurements consolidated by the companion
kankaku measurement/sync client. It is not a general collaborative task
manager, an agent conversation host, or an invoicing application.

Its defining mechanism is the separation of local measurement, canonical
identity, and downstream reporting: the dashboard does not become a second
implementation of kankaku's interval-union rule.

## Operating Context

- Local and self-hosted use: the owner controls the instance. This records
  an operating context, not a claim of an existing remote deployment or
  a currently published npm release.
- PocketBase supplies the backend; the existing Nuxt 4 SPA is generated as
  a static web app served by PocketBase, without an SSR application server.
- kankaku's append-only local JSONL remains the source of truth for local
  work records. Separate queued, idempotent sync lets measurement continue
  independently of hub availability.
- Backend migrations in `pocketbase/pb_migrations/` are authoritative for
  the schema; the API contract documents the resulting client interface.

## Capabilities and Constraints

- Review dashboard measurements by metric, date range, client, and project;
  drill into consolidated task entries and their raw process detail.
- Filter and browse entries; export the selected reporting context as CSV
  or genuine XLSX workbooks, not CSV renamed with an Excel extension.
- Manage the canonical catalog and tasks. Explicitly convert a session to
  a task, attach it to an existing task, or ignore it; do not infer task
  assignment from prompt text or silently link sessions.
- **D6:** `task_entries` rows are pre-consolidated by kankaku's `buildTasks`
  using the union of orchestrator and subagent time intervals, never their
  sum. These rows are safe to `SUM(...) GROUP BY ...`. `work_records` are
  overlapping raw per-process detail carrying `rollup: false` and must
  **NEVER** be used for totals. The aggregation rule lives only in kankaku.
- Preserve quality distinctions: measured versus estimated or unknown cost,
  and measured versus unavailable waiting time. Missing measurements are
  not proof of zero; unavailable waiting can make work time an upper bound.
- Token cost measurement is permitted. Hourly rates, prices, margins, and
  invoice numbers do not belong in the database or product scope.
- Team collaboration and a public hosted service are not assumed product
  requirements. Read-only viewing does not establish multi-tenant scope.

## Brand Commitments

Preserve the established names **kankaku-hub** and **kankaku** and their
backend/dashboard versus companion-client distinction. No new brand voice,
identity assets, aesthetic direction, or promotional claims are approved
by this record.

## Evidence on Hand

- [README](README.md), [vision](docs/vision.md), and
  [proposal](docs/proposal.md): product context and durable boundaries.
  The proposal is historical design intent, not current implementation proof.
- [Architecture](docs/architecture/overview.md),
  [API contract](docs/contract.md), and [spec index](docs/specs/README.md):
  system boundaries, schema-facing behavior, and implementation traceability.
- [Dashboard](docs/specs/web-dashboard.md),
  [entries explorer](docs/specs/web-entries-explorer.md),
  [sessions](docs/specs/web-sessions.md), and
  [tasks](docs/specs/web-tasks.md): reporting and explicit organization flows.
- [Static SPA decision](docs/adr/0015-static-spa-served-by-pocketbase.md) and
  [local development](docs/runbooks/local-development.md): operating model
  and fictional seed/demo data, not customer evidence.
- [Theming and localization](docs/specs/web-theming-and-i18n.md): locale
  support and bounded contrast-check evidence;
  [export writer](web/app/lib/export.ts): CSV and real XLSX generation.
- No customer testimonials, real-customer case studies, or performance proof
  are supplied for this record. Do not turn synthetic data into such claims.

## Product Principles

1. **Protect measurement integrity.** Report consolidated measurements, never
   raw overlapping totals; keep token cost separate from invoicing.
2. **Keep the owner in control.** Preserve owner-controlled operation and
   explicit catalog and session assignment rather than guessed intent.
3. **Keep reporting context consistent.** Filters, drill-down, and exports
   must describe the same selected work, without silently dropping filters.
4. **Tell the truth about quality and privacy.** Surface uncertainty and
   unavailable data; respect prompt-sync choices without implying that all
   content is uploaded or that privacy is comprehensively certified.

## Accessibility & Inclusion

The UI supports Spanish (`es`), English (`en`), and Japanese (`ja`), with
Spanish as the default and explicit locale selection. Locale-aware
formatting and the active document language support comprehension.

Preserve keyboard-operable controls, meaningful ARIA labels and disclosure
semantics, and the existing WCAG AA foreground/background contrast checks.
These are specific requirements and checks, not blanket WCAG compliance or
formal accessibility certification. Full accessibility certification is
not established; native-speaker review of Japanese copy remains unverified.
