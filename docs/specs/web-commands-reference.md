# Web commands reference

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | — |
| Code | `web/app/pages/commands/index.vue`, `web/app/lib/kankaku-commands.ts`, `web/app/components/commands/CommandRow.vue`, `web/app/components/commands/CopyButton.vue`, `web/app/components/app-shell/SidebarNav.vue`, `web/app/components/app-shell/CommandPalette.vue`, `web/app/components/app-shell/Header.vue` |
| Tests | `web/tests/kankaku-commands.test.ts`, `web/tests/i18n.test.ts`, `web/e2e/commands.spec.ts` |

## Purpose

A reference screen (`/commands`) documenting every `/kankaku` subcommand the
pi extension implements — exact syntax, what it does, when to use it, and
(where relevant) a link to the screen of this web app it relates to — plus
a "Configuration" block for connecting kankaku to this hub. It documents
kankaku (a separate repo/process); this screen never runs a kankaku
command itself.

## Requirements

1. `CMDREF-REQ-001` — The screen SHALL list every `/kankaku` subcommand
   implemented by kankaku's command handler
   (`kankaku/src/adapters/kankaku-command.ts`), each with its exact syntax,
   a description, and guidance on when to use it.
2. `CMDREF-REQ-002` — Every command gated behind a configured hub in
   kankaku (`HUB_COMMAND_TOKENS`/`TARGET_TOKENS`/`SYNC_TOKENS`) SHALL be
   visually flagged with a "requires hub" badge.
3. `CMDREF-REQ-003` — The screen SHALL provide a client-side text filter
   that narrows the command list by matching the command syntax or its
   localized description/when-to-use text, and SHALL show an empty state
   when no command matches.
4. `CMDREF-REQ-004` — Every command's syntax SHALL be copyable to the
   clipboard via a labeled, accessible button that shows visible
   confirmation after a successful copy.
5. `CMDREF-REQ-005` — A command related to another screen of this web app
   (e.g. `backfill` → unassigned queue, `projects`/`projects all` →
   Projects, `sync`/`sync all` → dashboard) SHALL link to that screen with
   an in-app navigation link.
6. `CMDREF-REQ-006` — The screen SHALL render a "Configuration" section
   listing every `KANKAKU_*` environment variable kankaku reads (name,
   default, meaning) and the shape of `~/.kankaku/credentials.json`,
   matching kankaku's `src/config.ts` exactly — no invented flag or
   variable.
7. `CMDREF-REQ-007` — The screen SHALL provide a ready-to-copy snippet to
   point kankaku at this hub, using the browser's current origin
   (`window.location.origin`) as `KANKAKU_PB_URL`, with a placeholder
   (never a real value) for the service-account password, and a note that
   the service account — not the owner account — is the one to use.
8. `CMDREF-REQ-008` — All command and configuration copy SHALL be
   available in both Spanish (default) and English, with no missing or
   empty translation key.
9. `CMDREF-REQ-009` — The screen SHALL be reachable from the sidebar
   navigation and from the Ctrl/Cmd+K command palette.
10. `CMDREF-REQ-010` — The screen SHALL render without horizontal page
    overflow at a 390px viewport width, with long command syntax wrapping
    or scrolling inside its own box rather than the page.

## Scenarios

### Scenario: hub-gated commands are flagged (`CMDREF-REQ-002`)

- **Given** the commands reference is open
- **When** the owner looks at `/kankaku backfill` (hub-only in kankaku)
- **Then** it carries a visible "requires hub" badge, and `/kankaku tasks` (always available) does not

### Scenario: filtering narrows the list (`CMDREF-REQ-003`)

- **Given** the commands reference lists all 22 commands
- **When** the owner types "backfill" into the filter box
- **Then** only the `/kankaku backfill` command remains visible
- **And** typing a query that matches nothing shows the empty state instead of a blank list

### Scenario: copying a command syntax (`CMDREF-REQ-004`)

- **Given** the `/kankaku sync status` row
- **When** the owner clicks its copy button
- **Then** `/kankaku sync status` is on the clipboard and the button shows a visible "copied" confirmation

### Scenario: backfill links to the unassigned queue (`CMDREF-REQ-005`)

- **Given** the `/kankaku backfill` row
- **When** the owner clicks its related-screen link
- **Then** they land on `/unassigned` ("Sin determinar")

### Scenario: connect snippet uses this hub's own origin (`CMDREF-REQ-007`)

- **Given** the web app is served from `https://hub.example.com`
- **When** the owner opens the "Point kankaku at this hub" snippet
- **Then** `KANKAKU_PB_URL` in the snippet is `https://hub.example.com`, and the password field is a placeholder, never a real credential

### Scenario: no horizontal overflow on a narrow phone (`CMDREF-REQ-010`)

- **Given** a 390px-wide viewport
- **When** the commands reference is rendered, including the longest command (`/kankaku export [csv|json] [all]`) and the environment-variable table
- **Then** `document.documentElement.scrollWidth` does not exceed `clientWidth`

## Configuration

This screen displays kankaku's own configuration; it does not add any
configuration of its own. The full list of `KANKAKU_*` variables it
documents (name, default, meaning) lives as typed data in
`web/app/lib/kankaku-commands.ts` (`KANKAKU_ENV_VARS`), sourced from
kankaku's `src/config.ts` and `README.md` "Environment variables" — see
that module's own comment for the verification note.

## Edge cases & failure modes

- The browser's Clipboard API is unavailable (very old browser, insecure
  context): the copy button disables itself (`useClipboard`'s
  `isSupported`) rather than silently failing.
- A command with no `relatedRoute` (e.g. `sessions`, `sync status`) simply
  omits the in-app link — this is expected for commands with no obvious
  screen counterpart, not a bug.
- The filter matches on already-localized text, so a query typed in one
  locale still works after a locale switch (it re-filters against the new
  locale's strings, since the match happens against `t(...)` output).

## Out of scope

- Actually running a `/kankaku` command from the web app — this is a
  read-only reference; kankaku commands only ever run inside pi.
- Editing kankaku's own configuration from this web app.

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `CMDREF-REQ-001` | `web/tests/kankaku-commands.test.ts` (ids/descriptions), `web/e2e/commands.spec.ts` | covered |
| `CMDREF-REQ-002` | `web/e2e/commands.spec.ts` ("a requires hub badge is present") | covered |
| `CMDREF-REQ-003` | `web/tests/kankaku-commands.test.ts` (`filterCommands`), `web/e2e/commands.spec.ts` (filter narrows / empty state) | covered |
| `CMDREF-REQ-004` | `web/e2e/commands.spec.ts` ("copy button copies…") | covered |
| `CMDREF-REQ-005` | `web/e2e/commands.spec.ts` ("the backfill command links to the unassigned queue") | covered |
| `CMDREF-REQ-006` | `web/tests/kankaku-commands.test.ts` (env var meaning strings) | covered |
| `CMDREF-REQ-007` | code review (`app/pages/commands/index.vue#hubUrl`/`connectSnippet`) | not covered by an automated test found in this pass |
| `CMDREF-REQ-008` | `web/tests/kankaku-commands.test.ts`, `web/tests/i18n.test.ts` | covered |
| `CMDREF-REQ-009` | `web/e2e/commands.spec.ts` ("reachable from the sidebar") | covered (sidebar only — the palette entry is not separately exercised by an automated test) |
| `CMDREF-REQ-010` | `web/e2e/commands.spec.ts` ("no horizontal overflow at 390px") | covered |
