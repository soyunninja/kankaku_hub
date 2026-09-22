# Architecture Decision Records

Load-bearing decisions for the kankaku ↔ kankaku-hub system. `0001`–`0008`
are the proposal's numbered "guiding decisions" (D1–D8,
[`../proposal.md`](../proposal.md) §2); `0009` onward are decisions made
during implementation that the proposal does not number explicitly.

| id | title | status | date |
|---|---|---|---|
| [0001](0001-identity-is-an-id-not-a-name.md) | Identity is an id, not a name | accepted | 2026-09-19 |
| [0002](0002-selection-is-a-pick-from-a-list.md) | Selection is a pick from a list, never free text | accepted | 2026-09-19 |
| [0003](0003-jsonl-log-source-of-truth-outbox-sync.md) | The JSONL log stays source of truth; sync is a separate, idempotent outbox push | accepted | 2026-09-19 |
| [0004](0004-kankaku-does-not-invent-tasks.md) | kankaku does not invent tasks | accepted | 2026-09-19 |
| [0005](0005-reads-cached-writes-queued.md) | Reads are cached, writes are queued | accepted | 2026-09-19 |
| [0006](0006-aggregation-rule-lives-once-in-kankaku.md) | The aggregation rule exists exactly once, in kankaku | accepted | 2026-09-19 |
| [0007](0007-web-is-a-view-layer.md) | The web is a view layer, not a second brain | accepted | 2026-09-19 |
| [0008](0008-no-money-in-the-database.md) | No money in the database | accepted | 2026-09-19 |
| [0009](0009-separate-repos-instead-of-monorepo.md) | Separate repos instead of a monorepo | accepted | 2026-09-20 |
| [0010](0010-everything-local-for-now.md) | Everything local for now | accepted | 2026-09-20 |
| [0011](0011-create-only-assignment-fields.md) | Assignment fields are create-only in sync | accepted | 2026-09-20 |
| [0012](0012-historical-records-to-sin-determinar.md) | Historical records go to a real "Sin determinar" client row | accepted | 2026-09-20 |
| [0013](0013-no-standalone-cli-yet.md) | No standalone CLI yet | accepted | 2026-09-20 |
| [0014](0014-dependency-free-charts.md) | Charts are a dependency-free SVG component | accepted | 2026-09-20 |
| [0015](0015-static-spa-served-by-pocketbase.md) | The web is a static SPA served from PocketBase's publicDir | accepted | 2026-09-20 |
| [0016](0016-throttled-auto-sync.md) | Auto-sync is throttled and short-circuits on an unchanged log | accepted | 2026-09-20 |
| [0017](0017-prompt-upload-defaults-to-none.md) | Prompt upload defaults to `none` | accepted | 2026-09-20 |
| [0018](0018-billing-boundary-enforced-in-schema.md) | Billing boundary enforced in schema (confirms 0008) | accepted | 2026-09-20 |
| [0019](0019-hub-fetches-and-stores-client-favicons.md) | The hub fetches and stores client favicons server-side, once, on an explicit owner action | accepted | 2026-09-20 |
| [0020](0020-subagent-profiles-gentle-pi-first-class.md) | Subagent detection is profile-based, with gentle-pi first-class | proposed | 2026-09-20 |
| [0021](0021-join-by-explicit-id-then-ancestry.md) | Join by explicit id, then pid ancestry; project is a hint, never a filter; time alone never joins | proposed | 2026-09-20 |
| [0022](0022-uncertain-children-never-become-orchestrators.md) | An unproven process never defaults to orchestrator (the safe default, inverted) | proposed | 2026-09-20 |
| [0023](0023-cross-worktree-children-reunited-locally-first.md) | Cross-worktree/cross-repo children are reunited locally first, via a machine-wide registry; the hub never sums two independent unions | proposed | 2026-09-20 |
| [0024](0024-sessions-link-to-tasks-by-explicit-action.md) | A session links to a task only by explicit owner action; ignoring one is a durable, non-task decision | accepted | 2026-09-20 |
| [0025](0025-public-site-is-a-separate-astro-project.md) | The public site is a separate Astro project, not part of the hub app | accepted | 2026-09-20 |
| [0026](0026-day-boundaries-are-local.md) | Day boundaries are the viewer's local day everywhere except the UTC-bucketed daily-totals view | accepted | 2026-09-21 |
| [0027](0027-totals-computed-server-side.md) | Totals are computed server-side over `task_entries` with client-supplied local-day boundaries | accepted | 2026-09-21 |
| [0028](0028-engram-narrative-read-only-proxy.md) | Session narratives come from Engram through a read-only, server-side proxy | accepted | 2026-09-22 |

See [`../templates/adr-template.md`](../templates/adr-template.md) for the
format, and [`../contributing-to-docs.md`](../contributing-to-docs.md) for
when to write a new one.
