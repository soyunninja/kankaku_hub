# kankaku ↔ kankaku-hub documentation

This is the documentation system for two repos that together track AI agent
work time and cost, per project, with a real dashboard: **kankaku** (a pi
extension) and **kankaku-hub** (PocketBase + a Nuxt web app), which this
`docs/` directory lives in.

## Status legend

Used throughout this system (spec headers, phase tables, ADR statuses):

| Status | Meaning |
|---|---|
| **implemented** | Built, tested, and verified against real code — see the file's Code/Tests/Evidence fields. |
| **partial** | Some but not all requirements/acceptance criteria are met — the file says which. |
| **planned** | Designed (at least at a proposal level) but not built. No code evidence exists. |
| **accepted** (ADR) | The decision is in effect and has not been superseded. |
| **superseded by NNNN** (ADR) | A later ADR replaces this one — follow the link. |

## How to use these docs

- **New here?** Read [`vision.md`](vision.md), then
  [`architecture/overview.md`](architecture/overview.md).
- **"Why does X work this way?"** → [`adr/README.md`](adr/README.md).
- **"What exactly does X do, normatively?"** → [`specs/README.md`](specs/README.md).
- **"What's built vs. planned?"** → [`phases/README.md`](phases/README.md).
- **"How do I run this locally / connect kankaku to the hub / deploy it?"**
  → [`runbooks/`](runbooks/).
- **"I'm building the next feature."** →
  [`contributing-to-docs.md`](contributing-to-docs.md).
- **Un resumen en español para el dueño del proyecto** →
  [`RESUMEN.es.md`](RESUMEN.es.md).

Every claim about behaviour in this system is checked against code or
tests as of this writing (2026-09-20, kankaku branch
`feat/pocketbase-hub`, kankaku-hub branch `main`). Where something is
designed but not built, it is explicitly marked **planned** — never
presented as done.

## Map of the system

```
docs/
  README.md                 you are here
  RESUMEN.es.md              Spanish executive summary for the owner
  vision.md                  problem, goals, non-goals, the billing boundary
  glossary.md                shared vocabulary across both repos
  architecture/
    overview.md               components, data flow, trust boundaries, diagrams
    kankaku-extension.md       kankaku's hexagonal layout
    hub-backend.md             PocketBase collections, rules, migrations
    hub-web.md                 the Nuxt SPA
    aggregation.md             the interval-union rule (D6) in detail
  adr/                        18 architecture decision records (D1-D8 + 10 later decisions)
  specs/                      17 normative capability specs
  phases/                     9 roadmap phases (5 done, 4 planned)
  runbooks/                   local dev, connecting kankaku, deploy (planned), release (planned), troubleshooting
  templates/                  spec/ADR/phase templates for the next feature
  contributing-to-docs.md     the workflow for adding to this system
  contract.md                 (pre-existing, untouched) the normative API contract
  proposal.md                 (pre-existing, untouched) the original design proposal
```

`contract.md` and `proposal.md` predate this documentation pass and are
kept as-is: `proposal.md` is the historical design record (its D1–D8
decisions are formalized as ADRs 0001–0008 here, with the exact original
wording preserved in the proposal itself); `contract.md` is the normative
API contract for anyone building a sync client, captured from real
requests against a local instance.

## Related

- Repos: `kankaku` (the pi extension), `kankaku-hub` (this repo — PocketBase
  backend + `web/` + the public site, `site/`).
- Root-level status notes: [`../ESTADO.md`](../ESTADO.md) (Spanish,
  informal, most recently updated), [`../README.md`](../README.md),
  [`../AGENTS.md`](../AGENTS.md).
