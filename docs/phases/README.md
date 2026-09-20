# Phases — roadmap

Each phase is independently useful and independently shippable (proposal
§10). Status is truthfully assessed against code, tests, and manual
verification recorded in `ESTADO.md` — see each phase file's Evidence
section.

| Phase | Goal | Status | Evidence |
|---|---|---|---|
| [0 — Foundation](phase-0-foundation.md) | kankaku 0.4.6 baseline, hexagonal split | done | `45415ce` (kankaku `main`) |
| [1 — Catalog and selection](phase-1-catalog-and-selection.md) | Read-only catalog, cached; session pickers; ids in records | done | 7 kankaku commits + hub schema/scaffold commits |
| [2 — Sync push](phase-2-sync-push.md) | Idempotent upsert of consolidated tasks to the hub | done | 12 kankaku commits incl. hardening; opt-in e2e |
| [2b — Backfill](phase-2b-backfill.md) | "Sin determinar" routing + `/kankaku backfill` | done | shipped with phase 2 |
| [3 — Web](phase-3-web.md) | Dashboard, catalog mgmt, tasks, unassigned queue, entries, settings | done | 12 kankaku-hub `web/` commits; 59 unit + 11 e2e specs green |
| [4 — Task linkage](phase-4-task-linkage.md) | Originally `/kankaku task`; delivered instead as a session-centric web flow (queue, resume, agent/quality) | **superseded** — kankaku-hub side delivered incl. e2e (not yet committed); original CLI picker not started | 7 kankaku-hub commits + 3 uncommitted e2e specs (see phase file) |
| [5 — Task creation from pi](phase-5-task-creation-from-pi.md) | `/kankaku task new` | **planned**, conditional on phase 4 | none |
| [Deployment to VPS](phase-deployment-to-vps.md) | Run the hub on a real server over HTTPS | **planned**, operational | none |
| [Publish kankaku release](phase-publish-kankaku-release.md) | Merge branch, version bump, npm publish | **planned**, operational | none |
| [6 — Generic subagent support](phase-6-generic-subagent-support.md) | Recognise subagent processes beyond gentle-pi's `subagent_run`, with gentle-pi first-class; fix phantom-orchestrator double count and gentle-pi cross-worktree orphan | **planned** | none |

## Related

- [`../vision.md`](../vision.md), [`../architecture/overview.md`](../architecture/overview.md)
- [`../specs/README.md`](../specs/README.md) — what each phase's capabilities normatively do
- [`../adr/README.md`](../adr/README.md) — why each phase is shaped this way
- [`../templates/phase-template.md`](../templates/phase-template.md)
