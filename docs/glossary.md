# Glossary

Terms used across both repos, in the sense this system uses them — several
overlap with everyday words but mean something specific here.

| Term | Meaning |
|---|---|
| **prompt** | One instruction from the user to the agent. kankaku measures work time and cost per prompt, not per session. |
| **record / `WorkRecord`** | One row in kankaku's local `.kankaku/worklog.jsonl`: one prompt handled by one process (orchestrator or subagent), with timing, usage and status fields. Never rewritten once appended. |
| **orchestrator** | The top-level pi process handling a user prompt directly. Has `role: "orchestrator"` in a `WorkRecord`. |
| **subagent** | A child process spawned by the orchestrator (or by another subagent) to do part of the work. Has `role: "subagent"` and a `parent_pid` link. Can keep running, and settle, after its parent has already finished. |
| **wall time** | Elapsed clock time for a record, from start to settle — includes both work and waiting. |
| **work time** | The portion of wall time the agent was actually doing something, i.e. wall time minus waiting time. This is the number kankaku bills as "AI time". |
| **waiting time** | The portion of wall time spent waiting for the user to respond (approvals, follow-up input). Explicitly excluded from work time. |
| **segment** | One contiguous span of work or waiting inside a record, used to compute work/waiting time without double counting. |
| **task (kankaku sense)** | One orchestrator run plus every subagent it (transitively) spawned, after their time intervals have been merged. Not the same as a `tasks` row in the hub — see `task_entries` vs `tasks` below. |
| **task (hub sense) / `tasks` collection** | A row created by a human in the hub (or, later, from kankaku) representing a unit of work in a project — title, status, optional external ref. Never auto-created from prompts (D4). |
| **`task_entries`** | The hub collection kankaku's sync client writes to: one row per kankaku task (see above), already consolidated. Always safe to `SUM(...) GROUP BY ...`. |
| **`work_records` (hub collection)** | Optional raw per-process detail mirrored to the hub, one row per kankaku `WorkRecord`. Flagged `rollup: false`; overlaps other rows in the same task and must never be summed. |
| **interval-union rule / the union of intervals** | The rule that a task's wall time is the union of the orchestrator's and its subagents' time intervals, not their sum — because a subagent can run concurrently with (or after) its orchestrator. Lives exactly once, in kankaku's `buildTasks` (`src/domain/task-view.ts`). See [architecture/aggregation.md](architecture/aggregation.md) and [ADR 0006](adr/0006-aggregation-rule-lives-once-in-kankaku.md). |
| **target (client/project target)** | The `{ clientId, projectId }` pair a session is working against, resolved at session start and attached to every record written during that session. |
| **catalog** | The list of clients and projects kankaku reads from the hub to populate the session-start picker. Cached locally so a session never blocks on the network to start. |
| **hub** | Informal name for the kankaku-hub repo/service: the PocketBase backend plus its Nuxt web dashboard. |
| **unassigned / "Sin determinar"** | The one real `clients` row (`code: sin-determinar`, `unassigned: true`) that historical and unmapped records are routed to, instead of a `NULL` client. Hidden or listed last in the picker. |
| **legacy label / `legacy_client_label`** | The original free-text client label (e.g. `"cjamar"`) preserved on a `task_entries` row that was routed to "Sin determinar", so it can later be bulk-reassigned to the correct real client. |
| **revisit window** | The trailing time window (default 24h, configurable) that every sync pass re-scans and re-upserts, in addition to records past the watermark — because a subagent can settle after its orchestrator was already synced, changing an already-pushed task's totals. |
| **watermark** | The byte offset into `worklog.jsonl` up to which sync has already read, stored in `sync-state.json`. Advances forward only; a record that fails validation is logged and skipped rather than blocking it forever. |
| **create-only (assignment fields)** | The rule that `client`, `project`, `task` and `legacy_client_label` on a `task_entries` row are set only when the row is first created by sync, and never overwritten on a later re-sync/update — so a reassignment made in the web survives the orchestrator/subagent settling later and the row being re-upserted. |
| **outbox pattern** | The design where local writes (the JSONL log) never wait on the network; a separate, idempotent sync step uploads what is pending. See [ADR 0003](adr/0003-jsonl-log-source-of-truth-outbox-sync.md). |
| **idempotency key** | The field a collection's unique index is built on, used to make retried uploads safe: `task_id` on `task_entries`, `kankaku_id` on `work_records`. A duplicate create fails with `400 validation_not_unique`, which the sync client treats as "already synced" and falls back to update. |
