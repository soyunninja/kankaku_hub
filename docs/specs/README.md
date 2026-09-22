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
| Client favicons | kankaku-hub | phase-3 | implemented | [client-favicons.md](client-favicons.md) |
| Web tasks | kankaku-hub | phase-3 | implemented | [web-tasks.md](web-tasks.md) |
| Web unassigned queue | kankaku-hub | phase-3 | implemented | [web-unassigned-queue.md](web-unassigned-queue.md) |
| Web entries explorer | kankaku-hub | phase-3 | implemented | [web-entries-explorer.md](web-entries-explorer.md) |
| Web sessions | kankaku-hub | phase-3 | implemented | [web-sessions.md](web-sessions.md) |
| Web theming and i18n | kankaku-hub | phase-3 | implemented | [web-theming-and-i18n.md](web-theming-and-i18n.md) |
| Web commands reference | kankaku-hub | phase-3 | implemented | [web-commands-reference.md](web-commands-reference.md) |
| Security and privacy | kankaku, kankaku-hub | phase-2 | implemented | [security-and-privacy.md](security-and-privacy.md) |
| Public site | kankaku-hub | phase-site-public-website | implemented | [public-site.md](public-site.md) |
| Engram session narrative | kankaku-hub | phase-3 | implemented | [engram-narrative.md](engram-narrative.md) |

| Subagent detection | kankaku | phase-6 | planned | [subagent-detection.md](subagent-detection.md) |

Planned capabilities (no implementation yet — tracked as phases, not specs
until built): a `/kankaku task` picker inside kankaku itself
([phase-4](../phases/phase-4-task-linkage.md), superseded in practice — see
that phase file), task creation from kankaku
([phase-5](../phases/phase-5-task-creation-from-pi.md)), VPS deployment
([phase-deployment-to-vps](../phases/phase-deployment-to-vps.md)), and
publishing a kankaku release
([phase-publish-kankaku-release](../phases/phase-publish-kankaku-release.md)).
Generic subagent detection
([phase-6](../phases/phase-6-generic-subagent-support.md)) has a spec
already written (`subagent-detection.md`, status `planned`) since it is a
design-level proposal awaiting implementation, unlike the other planned
phases above which have no spec yet.
