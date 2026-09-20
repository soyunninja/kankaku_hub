# 0024 — A session links to a task only by explicit owner action; ignoring one is a durable, non-task decision

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

`task_entries.session_id` groups entries into "sessions" (one coding-agent
session can produce several `task_entries` rows, e.g. across restarts). A
"sessions without a task" queue surfaces every session whose entries have
no linked `task`, so the owner can decide what to do with each one. Two
questions follow directly from that queue, and both need a decision before
the queue can be built:

1. **How does a session become linked to a task?** [ADR 0004](0004-kankaku-does-not-invent-tasks.md)
   already decided kankaku never invents a `tasks` row from a prompt. A
   session queue is a second surface where the same temptation exists —
   auto-linking a session to a task by matching titles, timing, or
   `repo_project` would reintroduce exactly the guesswork D4 rejected, one
   layer up (grouping instead of creating).
2. **What does "ignore" mean?** The owner needs to be able to say "this
   session is not going into a task, stop showing it in the queue" without
   that decision either being lost (if kept client-side) or polluting the
   `tasks` collection (if faked as a task).

Each session also has a "resume handle" — the `pi --session <id>` command
that lets the owner drop back into that coding-agent session — derivable
from `session_id` and `repo_project`, both already stored per entry
(`docs/contract.md` "`task_entries` — what the sync client writes"). No new
storage exists for this today; whether it needs any is part of this
decision.

## Decision

**Linking is always an explicit owner action, never automatic.** The hub
offers exactly two ways to link a session to a task — convert the session
into a new task, or attach it to an existing one — and both write a real
`task` relation on the session's `task_entries` rows. There is no
background job, sync-time heuristic, or "smart" suggestion that performs
the link on the owner's behalf; the queue's only job is to make the two
explicit actions easy to reach.

**A session's resume handle is derived at render time, never stored.** The
`pi --session <id>` command is built in the web layer from `session_id` +
`repo_project` on demand. No new field stores it, and no conversation
content is ever uploaded or stored anywhere in the hub — the session
queue works entirely from the metadata `task_entries` already carries.

**Ignoring a session is recorded in a dedicated `ignored_sessions`
collection, not a fake task.** Migration `1758300014` adds a minimal base
collection (`session_id` unique, `machine`, `ignored_at` autodate, an
optional `note`) with owner-only writes, same rule shape as `tasks`. A
session in this collection is permanently removed from the "without a
task" queue without ever touching `tasks` or `task_entries.task`.

## Consequences

- The queue stays trustworthy: every `task` relation it shows was chosen by
  a human, so `tasks` never fills with guessed groupings the way D4 already
  ruled out for individual prompts.
- Ignoring a session is durable across the owner's machines, because it
  lives in PocketBase — the hub's single source of truth for owner
  decisions — instead of browser `localStorage`, which would silently
  reset on a new device or a cleared profile and make the queue lie about
  what was already reviewed.
- `ignored_sessions` is deliberately not a soft-delete flag on some other
  row: there is no session-level row to flag (a session is a grouping of
  `task_entries`, not a record of its own), and a dedicated collection
  keeps "ignored" from ever being confused with "linked to a real task".
- No new field is needed to support resuming a session — one more thing
  that stays derived instead of stored, so there is nothing to keep in
  sync or migrate later if the resume-command shape changes.
- Re-ignoring an already-ignored `session_id` is a no-op from the UI's
  perspective; the unique index on `session_id` makes that enforceable at
  the schema level, but how a duplicate attempt is handled (silently,
  or surfaced) is left to the composable layer that calls this
  collection, not this ADR.

## Alternatives considered

- **Auto-link a session to a task by matching `repo_project`, timing, or
  title similarity** — rejected for the same reason as D4: guesswork with
  no reliable ground truth, now applied to a group of entries instead of
  one.
- **Store "ignored" as a client-side flag (`localStorage`)** — rejected:
  not durable across the owner's machines/devices, and PocketBase is
  already the hub's single source of truth for every other owner decision
  (tasks, client assignment, favicons).
- **Represent "ignored" as a real `tasks` row with a special status (e.g.
  `ignored`)** — rejected: `tasks` is a human-curated list of real work
  (D4); an ignored session is explicitly *not* work, and mixing the two
  would force every task consumer (lists, counts, reports) to filter out
  fake rows forever.
- **Store the conversation transcript or a resolved resume command on the
  session** — rejected: no requirement needs it, it would be stored,
  private data with no consumer, and the resume handle is fully derivable
  from fields the hub already has.

## Related

- ADRs: [0004](0004-kankaku-does-not-invent-tasks.md),
  [0006](0006-aggregation-rule-lives-once-in-kankaku.md)
- Contract: [`../contract.md`](../contract.md) "`task_entries` — what the
  sync client writes", "Agent and measurement quality"
- Code: `pocketbase/pb_migrations/1758300014_ignored_sessions_collection.js`,
  `pocketbase/pb_migrations/1758300005_task_entries_collection.js`
