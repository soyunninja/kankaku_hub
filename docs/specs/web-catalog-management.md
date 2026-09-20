# Web catalog management

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0001](../adr/0001-identity-is-an-id-not-a-name.md), [0008](../adr/0008-no-money-in-the-database.md), [0012](../adr/0012-historical-records-to-sin-determinar.md), [0018](../adr/0018-billing-boundary-enforced-in-schema.md) |
| Code | `web/app/pages/clients/index.vue`, `web/app/pages/projects/index.vue`, `web/app/pages/projects/[id].vue`, `web/app/composables/useClients.ts`, `web/app/composables/useProjects.ts`, `web/app/lib/client-contact.ts`, `web/app/components/clients/ClientAvatar.vue`, `web/app/components/clients/ClientName.vue`, `pocketbase/pb_migrations/1758300011_clients_contact_fields.js` |
| Tests | `web/e2e/smoke.spec.ts`, `web/e2e/client-contact.spec.ts`, `web/e2e/client-avatars.spec.ts`, `web/tests/client-contact.test.ts` |

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
6. `CATMGMT-REQ-006` — A client SHALL support four optional contact
   fields — `website`, `contact_email`, `contact_phone`, `notes` — with
   client-side validation mirroring PocketBase (a normalized `http(s)`
   URL, a plausible email, free-form trimmed phone) and inline errors,
   including errors PocketBase itself returns, mapped to the right field.
   None of the four SHALL ever be treated as billing/money data (no rate,
   price, or invoice field — see [ADR 0018](../adr/0018-billing-boundary-enforced-in-schema.md)).
7. `CATMGMT-REQ-007` — The clients list SHALL render `website` as an
   external link (scheme stripped, `target="_blank"`,
   `rel="noopener noreferrer"`), `contact_email` as a `mailto:` link, and
   `contact_phone` as a `tel:` link; only a syntactically valid `http:`/
   `https:` URL SHALL ever become a clickable `website` link. `notes`
   SHALL NOT be shown in the table — only a small indicator when a client
   has notes.
   (Reversed on 2026-09-20 at the owner's request: the `website` and
   `contact_email`/`contact_phone` columns no longer render in the
   clients table at all — that information now lives only in the client
   detail sheet and the create/edit dialog, per `CATMGMT-REQ-012`. The
   `notes`-indicator half of this requirement is unaffected and still
   holds. The id is kept so history stays traceable.)
8. `CATMGMT-REQ-008` — A client detail view SHALL be reachable from the
   clients list, showing every field (notes rendered as plain text with
   line breaks preserved, never `v-html`), the client's totals, and its
   projects.
9. `CATMGMT-REQ-009` — The clients list and its create/edit dialog SHALL
   degrade gracefully against a PocketBase instance that has not yet
   applied the contact-fields migration: missing fields read as empty
   rather than crashing, and a save that silently drops them SHALL surface
   a clear error instead of a false "saved" confirmation.
10. `CATMGMT-REQ-010` — Every place a client's name is displayed across
    the app (the clients list, its detail sheet, the dashboard's client
    breakdown and stacked-chart legend, projects list/detail, entries
    list, the unassigned queue's suggestion hint, and the command
    palette's client results) SHALL render it through the shared
    `ClientName`/`ClientAvatar` pair — see
    [`client-favicons.md`](client-favicons.md) for the avatar's own
    requirements. A native `<select>`'s option rows are the one
    documented exception (see that spec's "Out of scope").
11. `CATMGMT-REQ-011` — The client detail sheet's header SHALL show the
    active/inactive status badge on the same line as the client's name
    (to the right of it, vertically centered, never wrapping under the
    name or colliding with the sheet's close button), with the client's
    `code` on the line below.
12. `CATMGMT-REQ-012` — The clients list table SHALL NOT render `website`,
    `contact_email`, or `contact_phone` as columns. That information
    SHALL be shown only in the client detail sheet (`website` as a
    safe-scheme external link, `contact_email` as a `mailto:` link,
    `contact_phone` as a `tel:` link, same rules as `CATMGMT-REQ-007`)
    and in the create/edit dialog's form fields. The table SHALL
    continue to show a small indicator next to the client's name when it
    has notes.

## Amendments (client favicons)

Requirements `CATMGMT-REQ-010`/`011` were added when
[`client-favicons.md`](client-favicons.md) landed — that spec owns the
avatar/favicon-refresh behavior itself; this one only owns *where* a
client name is shown and the detail sheet's header layout.

## Amendments (clients table simplification)

`CATMGMT-REQ-012` was added on 2026-09-20 when the owner asked to drop
the `website` and `contact_email`/`contact_phone` columns from the
clients table (see the reversal note on `CATMGMT-REQ-007`). The
information itself was never removed from the product — it remains one
click away in the detail sheet and in the edit dialog.

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

### Scenario: a bare domain is normalized to an https URL on blur (`CATMGMT-REQ-006`)

- **Given** the owner types `example.com` into the website field
- **When** the field loses focus
- **Then** it is rewritten to `https://example.com` before validation runs

### Scenario: an invalid email or website blocks submit with an inline error (`CATMGMT-REQ-006`)

- **Given** the owner enters `not-an-email` or a non-`http(s)` scheme (e.g. `javascript:alert(1)`) in the create/edit dialog
- **When** the owner submits the form
- **Then** the dialog stays open and an inline, field-scoped error message is shown next to the offending field

### Scenario: only a safe URL scheme ever becomes a clickable link (`CATMGMT-REQ-012`)

- **Given** a client's `website` value is not a syntactically valid `http:`/`https:` URL (e.g. it was written directly to the database)
- **When** the client detail view renders that client
- **Then** the value is shown as plain text, never as an `<a href>`

### Scenario: the clients table never overflows the page (`CATMGMT-REQ-012`)

- **Given** the clients screen is viewed at 390px width
- **When** the page renders
- **Then** the document does not scroll horizontally (the table has no `website`/`contact_email`/`contact_phone` columns to begin with — only Name, Code, Status, Total time, Total cost and Actions render — and long values in those columns truncate rather than widening the table at any width)

### Scenario: website and contact info live in the detail sheet, not the table (`CATMGMT-REQ-012`)

- **Given** a client has a `website`, `contact_email`, and `contact_phone`
- **When** the owner views that client's row in the clients table
- **Then** none of those three values (nor any link for them) appears in the row
- **And** opening the row's detail sheet shows the website as an external link, the email as a `mailto:` link, and the phone as a `tel:` link

### Scenario: notes preserve line breaks as plain text (`CATMGMT-REQ-008`)

- **Given** a client's `notes` contains multiple lines
- **When** the owner opens that client's detail view
- **Then** the line breaks are visually preserved via CSS (`white-space: pre-wrap`) on a plain-text interpolation, never through `v-html` or any HTML the notes value could inject

### Scenario: a save against a pre-migration schema surfaces an error, not a false success (`CATMGMT-REQ-009`)

- **Given** the connected PocketBase instance has not yet applied `1758300011_clients_contact_fields.js`
- **When** the owner fills in any of the four contact fields and saves
- **Then** PocketBase accepts the request and silently drops the unknown fields (verified against a real pre-migration instance), and the UI detects the drop and shows an error toast instead of the normal "saved" confirmation

### Scenario: the status badge sits beside the name in the detail sheet (`CATMGMT-REQ-011`)

- **Given** the owner opens any client's detail sheet
- **When** the header renders
- **Then** the avatar, name and status badge share one line (the name truncating rather than pushing the badge off-screen or under the sheet's close button), with the client's code on the line below

## Configuration

None beyond the shared PocketBase connection.

## Edge cases & failure modes

- Creating a client/project with a duplicate `code`: fails with
  `400 validation_not_unique` on `clients.code` (no equivalent unique
  constraint on `projects.code`, which is not marked unique in the schema —
  duplicates are possible there).
- Reading a client from a PocketBase instance that has not applied the
  contact-fields migration: `website`/`contact_email`/`contact_phone`/
  `notes` come back as `undefined`, not `''` — every read site falls back
  to `?? ''` rather than crashing.

## Out of scope

- Bulk import of clients/projects.
- Task management (see [`web-tasks.md`](web-tasks.md)).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `CATMGMT-REQ-001` | `web/e2e/smoke.spec.ts` | covered |
| `CATMGMT-REQ-002` | `web/e2e/client-contact.spec.ts` ("Sin determinar stays protected") | covered |
| `CATMGMT-REQ-003` | `web/e2e/smoke.spec.ts` | covered |
| `CATMGMT-REQ-004` | `web/app/composables/useClients.ts`, `web/app/composables/useProjects.ts` (code review) | covered |
| `CATMGMT-REQ-005` | `web/e2e/smoke.spec.ts` | covered |
| `CATMGMT-REQ-006` | `web/tests/client-contact.test.ts`, `web/e2e/client-contact.spec.ts` ("creating...", "editing...", "invalid email and invalid website...") | covered |
| `CATMGMT-REQ-007` | reversed 2026-09-20 — see the note on the requirement and `CATMGMT-REQ-012` | reversed |
| `CATMGMT-REQ-008` | `web/e2e/client-contact.spec.ts` ("creating..." — notes line-break assertion) | covered |
| `CATMGMT-REQ-009` | manual verification against a genuinely pre-migration PocketBase instance (recorded in `ESTADO.md`); no automated test (would require serving two schema states in one Playwright run) | partially covered |
| `CATMGMT-REQ-010` | `web/e2e/client-avatars.spec.ts` ("client avatars render across the app") | covered |
| `CATMGMT-REQ-011` | `web/e2e/client-avatars.spec.ts` ("client detail sheet header layout") | covered |
| `CATMGMT-REQ-012` | `web/tests/client-contact.test.ts` (`isSafeLinkUrl`), `web/e2e/client-contact.spec.ts` ("creating...", "editing...", "no horizontal page overflow") | covered |
