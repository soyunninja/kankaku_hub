# Web catalog management

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0001](../adr/0001-identity-is-an-id-not-a-name.md), [0012](../adr/0012-historical-records-to-sin-determinar.md) |
| Code | `web/app/pages/clients/index.vue`, `web/app/pages/projects/index.vue`, `web/app/pages/projects/[id].vue`, `web/app/composables/useClients.ts`, `web/app/composables/useProjects.ts` |
| Tests | `web/e2e/smoke.spec.ts` |

## Purpose

Lets the owner create and maintain the canonical catalog kankaku's picker
reads from — clients and projects, including each project's `repo_paths`
for silent auto-selection.

## Requirements

1. `CATMGMT-REQ-001` — The clients page SHALL support create, edit, and
   archive (setting `active: false`), never a hard delete from the UI.
2. `CATMGMT-REQ-002` — The "Sin determinar" client row SHALL be protected
   from edit and delete in the UI.
3. `CATMGMT-REQ-003` — The projects page SHALL support create, edit,
   archive, and editing a project's `repo_paths` array.
4. `CATMGMT-REQ-004` — Every create/update SHALL send `active` explicitly
   (PocketBase has no schema default for bools).
5. `CATMGMT-REQ-005` — The project detail page SHALL show KPIs, a trend,
   its linked tasks, its top prompts, and a breakdown by model, all derived
   only from `task_entries`.

## Scenarios

### Scenario: Sin determinar cannot be edited or archived (`CATMGMT-REQ-002`)

- **Given** the client list includes "Sin determinar"
- **When** the owner views its row
- **Then** the edit/archive/delete controls are disabled or absent for that row

### Scenario: archiving a client hides it without deleting history (`CATMGMT-REQ-001`)

- **Given** an active client with existing `task_entries`
- **When** the owner archives it
- **Then** `active` becomes `false`, the client disappears from kankaku's picker (which only lists active clients), and its historical `task_entries` remain unchanged

### Scenario: a project's repo_paths enables silent selection (`CATMGMT-REQ-003`)

- **Given** a project's `repo_paths` includes `/home/dev/repos/acme-api`
- **When** kankaku starts a session in that directory
- **Then** the target resolves silently to that project, per [`target-selection.md`](target-selection.md)

## Configuration

None beyond the shared PocketBase connection.

## Edge cases & failure modes

- Creating a client/project with a duplicate `code`: fails with
  `400 validation_not_unique` on `clients.code` (no equivalent unique
  constraint on `projects.code`, which is not marked unique in the schema —
  duplicates are possible there).

## Out of scope

- Bulk import of clients/projects.
- Task management (see [`web-tasks.md`](web-tasks.md)).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `CATMGMT-REQ-001` | `web/e2e/smoke.spec.ts` | covered |
| `CATMGMT-REQ-002` | code review (`web/app/pages/clients/index.vue`) | not covered by an automated test found in this pass |
| `CATMGMT-REQ-003` | `web/e2e/smoke.spec.ts` | covered |
| `CATMGMT-REQ-004` | `web/app/composables/useClients.ts`, `web/app/composables/useProjects.ts` (code review) | covered |
| `CATMGMT-REQ-005` | `web/e2e/smoke.spec.ts` | covered |
