# Web sessions

| | |
|---|---|
| Status | implemented |
| Phase | [phase-3-web](../phases/phase-3-web.md) |
| Owners repos | kankaku-hub |
| Related ADRs | [0004](../adr/0004-kankaku-does-not-invent-tasks.md), [0024](../adr/0024-sessions-link-to-tasks-by-explicit-action.md) |
| Code | `web/app/lib/session-aggregate.ts`, `web/app/lib/session-resume.ts`, `web/app/lib/agents.ts`, `web/app/composables/useSessions.ts`, `web/app/composables/useSessionsQueue.ts`, `web/app/composables/useSessionsQueueCount.ts`, `web/app/pages/sessions-without-task/index.vue`, `web/app/components/tasks/TaskDetailSheet.vue`, `web/app/components/entries/EntryDetailSheet.vue` (resume block), `web/app/components/agents/AgentIcon.vue`, `web/app/components/agents/AgentBadge.vue`, `web/app/components/app-shell/SidebarNav.vue`, `web/app/components/app-shell/CommandPalette.vue`, `pocketbase/pb_migrations/1758300014_ignored_sessions_collection.js` |
| Tests | `web/tests/session-aggregate.test.ts`, `web/tests/session-resume.test.ts`, `web/tests/agents.test.ts`, `web/e2e/session-resume.spec.ts`, `web/e2e/sessions-queue.spec.ts` |

## Purpose

A "session" is every `task_entries` row that shares a `session_id` — one
kankaku coding-agent run, possibly spanning several consolidated rows
(e.g. across restarts). This spec covers the session-centric surfaces
built on top of that grouping: deriving a copy/paste command to resume a
session on the machine that ran it, showing sessions on entry and task
detail, and the "sessions without a task" queue that lets the owner
explicitly convert, attach, or ignore every session that has not yet been
linked to a task. See
[ADR 0024](../adr/0024-sessions-link-to-tasks-by-explicit-action.md) for
why linking is always an explicit action and why nothing here is stored
beyond one `ignored_sessions` row per dismissed session.

The Playwright specs cited below (`web/e2e/session-resume.spec.ts`,
`web/e2e/sessions-queue.spec.ts`, `web/e2e/agent-quality.spec.ts` — the
last one covers [`web-entries-explorer.md`](web-entries-explorer.md) and
[`web-dashboard.md`](web-dashboard.md) rather than this spec directly)
landed from a parallel e2e-coverage work unit; as of this writing they
exist in the working tree but had not yet been committed.

## Requirements

1. `SESSIONS-REQ-001` — Session grouping SHALL bucket `task_entries` rows
   by `session_id` into one summary per session, sorted most-recent-first
   by last activity.
2. `SESSIONS-REQ-002` — For fields that describe assignment (`client`,
   `project`, `task`, `agent`), a session summary SHALL report the value
   **unanimous** across its entries, or the `MIXED` sentinel when they
   disagree; empty/undefined values SHALL normalize to `''` before the
   comparison, so a session where every entry is empty for a field counts
   as unanimous, not mixed.
3. `SESSIONS-REQ-003` — `machine` and `repoProject` SHALL be derived from
   a best-effort single-entry pick (first entry with a value) rather than
   unanimous/mixed detection, and `sessionName` SHALL be the most
   frequent non-empty `session_name` across the session's entries, ties
   broken by first-appearance order.
4. `SESSIONS-REQ-004` — A resume command SHALL be derived at render time
   from `session_id` + `repo_project` + `agent` via a per-agent builder
   table (`RESUME_BUILDERS`); no resume command, and no conversation
   content, SHALL ever be stored server-side ([ADR
   0024](../adr/0024-sessions-link-to-tasks-by-explicit-action.md)).
5. `SESSIONS-REQ-005` — Only the `pi` agent (or an empty/legacy `agent`
   value, treated as `pi`) SHALL produce a resume command today; any
   other reported `agent` with no registered builder SHALL report
   `unsupported-agent` rather than guessing a syntax.
6. `SESSIONS-REQ-006` — The entry detail sheet SHALL show a "resume
   session" block (session name, the resume command with a copy button,
   machine) whenever the entry has a `session_id`, and SHALL show an
   explanatory unsupported-agent message instead when no command can be
   derived.
7. `SESSIONS-REQ-007` — The task detail sheet SHALL list every session
   that touched the task (grouped from that task's `task_entries` rows —
   D6, never `work_records`) with per-session totals (work/wall/waiting
   time, cost, entry count, machine, agent) and its resume command.
8. `SESSIONS-REQ-008` — When a task-detail session's `agent` is `MIXED`,
   resume derivation SHALL treat it as unset (the legacy `pi` default)
   rather than reporting `unsupported-agent`, so a session that merely
   disagrees on agent still gets a best-effort resume command.
9. `SESSIONS-REQ-009` — The "sessions without a task" queue SHALL list
   only sessions whose entries are **all** unassigned (`task = ""`); a
   session with even one assigned entry SHALL be excluded entirely
   (never shown with just its unassigned entries), and a session present
   in `ignored_sessions` SHALL also be excluded.
10. `SESSIONS-REQ-010` — The queue SHALL offer exactly three actions —
    convert to a new task, attach to an existing task, and ignore — none
    of which SHALL run without explicit owner confirmation; kankaku/the
    hub SHALL NOT link a session to a task on its own ([ADR
    0024](../adr/0024-sessions-link-to-tasks-by-explicit-action.md)).
11. `SESSIONS-REQ-011` — Convert/attach reassignment SHALL reuse the
    unassigned queue's batch mechanism (chunks of 50 via `/api/batch`,
    per-row status check, progress reporting) and SHALL treat a partial
    success (some but not all of a session's entries moved) distinctly
    from full success, re-fetching rather than guessing the session's now
    -mixed client-side state.
12. `SESSIONS-REQ-012` — Ignoring a session SHALL create one
    `ignored_sessions` row keyed by `session_id`, and a unique-constraint
    violation on that create (a race between two tabs/machines ignoring
    the same session) SHALL be treated as a no-op success, not an error.
13. `SESSIONS-REQ-013` — The bundled agent icon registry
    (`app/lib/agents.ts`) SHALL resolve a lowercase agent slug to a
    label/icon/background definition, and every consumer (`AgentIcon`,
    `AgentBadge`) SHALL render a neutral fallback glyph — never a broken
    image or an empty gap — for an unresolved slug or a failed image
    load.
14. `SESSIONS-REQ-014` — The sidebar nav and the command palette SHALL
    each show a "sessions without a task" entry with a live badge count
    of the queue, sourced from one shared cached fetch
    (`useSessionsQueueCount`) rather than each surface issuing its own
    round-trip.

## Scenarios

### Scenario: disagreeing clients report MIXED (`SESSIONS-REQ-002`)

- **Given** two `task_entries` rows share a `session_id` but have
  different `client` ids
- **When** they are grouped by `groupBySession`
- **Then** the summary's `client` field is the `MIXED` sentinel, not
  either individual value

### Scenario: an all-empty field counts as unanimous, not mixed (`SESSIONS-REQ-002`)

- **Given** every entry in a session has an empty `task`
- **When** the session is grouped
- **Then** the summary's `task` field is `''` (unanimous empty), never
  `MIXED`

### Scenario: pi resumes with a shell command (`SESSIONS-REQ-004`, `SESSIONS-REQ-005`)

- **Given** a session's `agent` is `"pi"` and `repo_project` is set
- **When** `buildResumeCommand` runs
- **Then** it returns `{ ok: true, command: "cd '<repo>' && pi --session '<id>'" }`

### Scenario: an unrecognised agent reports unsupported instead of guessing (`SESSIONS-REQ-005`)

- **Given** a session's `agent` is `"opencode"` (no resume builder
  registered for it yet)
- **When** `buildResumeCommand` runs
- **Then** it returns `{ ok: false, reason: 'unsupported-agent' }`, never
  a fabricated command

### Scenario: a mixed-agent task session still gets a best-effort resume command (`SESSIONS-REQ-008`)

- **Given** one of a task's linked sessions has entries that disagree on
  `agent` (`MIXED`)
- **When** the task detail sheet computes that session's resume command
- **Then** it is built as if `agent` were unset (the legacy `pi`
  default), not reported as `unsupported-agent`

### Scenario: a partially-assigned session never appears in the queue (`SESSIONS-REQ-009`)

- **Given** a session has 3 entries, one of which already has `task` set
- **When** `fetchUnassignedSessions` runs
- **Then** that session is excluded entirely, not shown with only its 2
  unassigned entries

### Scenario: converting a session that partially fails is reported as partial (`SESSIONS-REQ-011`)

- **Given** a session of 60 entries (two batch chunks) is converted into
  a new task
- **And** one entry in the second chunk fails to update
- **When** the operation completes
- **Then** the task is still created, 59 entries are reported moved, and
  the queue re-fetches instead of assuming the session's now-mixed state

### Scenario: re-ignoring an already-ignored session is a no-op (`SESSIONS-REQ-012`)

- **Given** a `session_id` already has an `ignored_sessions` row
- **When** `ignoreSession` is called again for the same session
- **Then** the unique-constraint violation is swallowed and the call
  resolves successfully, without creating a duplicate row

### Scenario: nav and palette badges share one fetch (`SESSIONS-REQ-014`)

- **Given** the sidebar nav has already loaded the sessions-queue count
  during this session
- **When** the command palette opens and also needs that count
- **Then** it reads the cached `useState` value instead of issuing a
  second fetch

## Configuration

None beyond the shared PocketBase connection. The per-agent resume table
(`RESUME_BUILDERS` in `app/lib/session-resume.ts`) currently has exactly
one entry, `pi`; adding a new agent's resume syntax means adding one more
entry to that table, not branching `buildResumeCommand` itself.

## Edge cases & failure modes

- A session with no entry carrying a `repo_project`: the resume command
  still builds, just without the `cd '<repo>' &&` prefix.
- More than `UNASSIGNED_SCAN_LIMIT` (500) candidate unassigned entries:
  the queue's fetch is bounded, and the page shows a truncation notice
  rather than silently hiding older unassigned sessions.
- An agent icon file failing to load client-side (`@error` on the
  `<img>`): falls back to the same neutral generic glyph as an
  unresolved slug, without a broken-image icon or layout shift.
- A group of 60 sessions is ignored via bulk-select and one create fails
  mid-batch: the failed session is restored to the list (not silently
  dropped) so the owner can retry it.

## Out of scope

- Automatic/fuzzy session-to-task linking by matching `repo_project`,
  timing, or title similarity — deliberately rejected, see [ADR
  0024](../adr/0024-sessions-link-to-tasks-by-explicit-action.md).
- Storing a resume command or any conversation content server-side.
- Resuming any agent beyond `pi` today — the table is designed to grow,
  not yet populated for other agents (see
  [`web/public/agents/README.md`](../../web/public/agents/README.md) for
  the matching icon registry, which already supports `opencode` for
  display even though it has no resume builder yet).

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `SESSIONS-REQ-001` | `web/tests/session-aggregate.test.ts` | covered |
| `SESSIONS-REQ-002` | `web/tests/session-aggregate.test.ts` | covered |
| `SESSIONS-REQ-003` | `web/tests/session-aggregate.test.ts` | covered |
| `SESSIONS-REQ-004` | `web/tests/session-resume.test.ts` | covered |
| `SESSIONS-REQ-005` | `web/tests/session-resume.test.ts` | covered |
| `SESSIONS-REQ-006` | `web/e2e/session-resume.spec.ts` ("resume session block on the entry detail sheet") | covered |
| `SESSIONS-REQ-007` | `web/e2e/session-resume.spec.ts` ("task detail sheet lists its sessions") | covered |
| `SESSIONS-REQ-008` | code review (`TaskDetailSheet.vue#sessionRows`); not exercised by the mixed-agent case in this pass | not covered by an automated test found in this pass |
| `SESSIONS-REQ-009` | `web/e2e/sessions-queue.spec.ts` (queue lists only fully-unassigned sessions) | covered |
| `SESSIONS-REQ-010` | `web/e2e/sessions-queue.spec.ts` (convert/attach/ignore, each requiring explicit confirmation) | covered |
| `SESSIONS-REQ-011` | `web/e2e/sessions-queue.spec.ts` (convert/attach reassignment); the partial-batch-failure path specifically is not exercised in this pass | partial |
| `SESSIONS-REQ-012` | `web/e2e/sessions-queue.spec.ts` ("ignoring a session removes it from the queue permanently"); the concurrent-duplicate-ignore race is not separately exercised | partial |
| `SESSIONS-REQ-013` | `web/tests/agents.test.ts` | covered |
| `SESSIONS-REQ-014` | code review (`useSessionsQueueCount.ts`, `SidebarNav.vue`, `CommandPalette.vue`) | not covered by an automated test found in this pass |
