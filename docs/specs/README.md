# Specifications

Normative, per-capability specs. Each follows
[`../templates/spec-template.md`](../templates/spec-template.md): a status
header, numbered requirements with stable ids, Given/When/Then scenarios,
configuration, edge cases, out-of-scope, and a traceability table to tests.

| Spec | Area | Phase | Status | Link |
|---|---|---|---|---|
| Hub credentials and config | kankaku | phase-1 | implemented | [hub-credentials-and-config.md](hub-credentials-and-config.md) |
| Catalog cache | kankaku | phase-1 | implemented | [catalog-cache.md](catalog-cache.md) |
| Target selection | kankaku | phase-1 | implemented | [target-selection.md](target-selection.md) |
| Record identity | kankaku | phase-1 | implemented | [record-identity.md](record-identity.md) |
| Sync push | kankaku, kankaku-hub | phase-2 | implemented | [sync-push.md](sync-push.md) |
| Backfill to unassigned | kankaku, kankaku-hub | phase-2b | implemented | [backfill-unassigned.md](backfill-unassigned.md) |
| Auto-sync and locking | kankaku | phase-2 | implemented | [auto-sync-and-locking.md](auto-sync-and-locking.md) |
| kankaku commands | kankaku | phase-1/2 | implemented | [kankaku-commands.md](kankaku-commands.md) |
| Hub schema and access rules | kankaku-hub | phase-0/2 | implemented | [hub-schema-and-access-rules.md](hub-schema-and-access-rules.md) |
| Web auth and shell | kankaku-hub | phase-3 | implemented | [web-auth-and-shell.md](web-auth-and-shell.md) |
| Web dashboard | kankaku-hub | phase-3 | implemented | [web-dashboard.md](web-dashboard.md) |
| Web catalog management | kankaku-hub | phase-3 | implemented | [web-catalog-management.md](web-catalog-management.md) |
| Web tasks | kankaku-hub | phase-3 | implemented | [web-tasks.md](web-tasks.md) |
| Web unassigned queue | kankaku-hub | phase-3 | implemented | [web-unassigned-queue.md](web-unassigned-queue.md) |
| Web entries explorer | kankaku-hub | phase-3 | implemented | [web-entries-explorer.md](web-entries-explorer.md) |
| Web theming and i18n | kankaku-hub | phase-3 | implemented | [web-theming-and-i18n.md](web-theming-and-i18n.md) |
| Security and privacy | kankaku, kankaku-hub | phase-2 | implemented | [security-and-privacy.md](security-and-privacy.md) |

Planned capabilities (no implementation yet — tracked as phases, not specs
until built): task linkage from kankaku
([phase-4](../phases/phase-4-task-linkage.md)), task creation from kankaku
([phase-5](../phases/phase-5-task-creation-from-pi.md)), VPS deployment
([phase-deployment-to-vps](../phases/phase-deployment-to-vps.md)), and
publishing a kankaku release
([phase-publish-kankaku-release](../phases/phase-publish-kankaku-release.md)).
