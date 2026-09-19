# Proposal — kankaku ↔ PocketBase: canonical client/project selection and time sync

Status: draft for discussion. Nothing implemented.
Date: 2026-09-20
Scope: kankaku 0.4.6 (pi extension) + a PocketBase instance on a VPS.

## 1. Problem

kankaku already measures, per prompt, how long an agent worked, excluding
waits for the user, and what it cost in tokens. That data lands in
`.kankaku/worklog.jsonl` and never leaves the machine. Two gaps:

1. **No canonical identity.** The billing client today is a free-text label
   (`/kankaku client <name>`, `KANKAKU_CLIENT`, `.kankaku/config.json`).
   Free text drifts: `cajamar`, `Cajamar`, `Caja Mar`, `cjamar` are four
   clients as far as any report is concerned. There is no project dimension
   at all.
2. **No aggregation across projects.** Time and cost per client live in as
   many JSONL files as there are repositories.

Goal: clients and projects come **from PocketBase**, are chosen from a list
(never typed), are stored in records **by id**, and completed records are
pushed to PocketBase so a task/project manager can report real AI time and
cost per project.

## 2. Guiding decisions

These are the load-bearing choices. Everything else follows from them.

### D1 — Identity is an id, not a name

A record stores `clientId` and `projectId` (PocketBase record ids). Names
are denormalised alongside for readability, but no aggregation ever keys on
a name. This is the actual fix for the `Cajamar`/`cjamar` problem: the name
is display data, the id is the truth, and the user never types either.

### D2 — Selection is a pick from a list, never free text

At session start kankaku shows `ctx.ui.select(...)` with the catalog pulled
from PocketBase. `/kankaku client <name>` stays as a compatibility path but
is no longer the recommended flow, and it validates against the catalog.

### D3 — The JSONL log stays the source of truth; sync is a separate,
### idempotent push (outbox pattern)

Nothing in a pi event handler waits on the network. Records are appended
locally exactly as today; a separate sync step uploads what is pending. If
the VPS is down, work continues and nothing is lost.

### D4 — kankaku does not invent tasks

A `WorkRecord` is one prompt, not one task. Auto-creating a task per prompt
produces hundreds of junk rows per week, and inferring task boundaries from
prompt text is guesswork. Tasks are created in the manager; kankaku *links*
to them. Explicit creation (`/kankaku task new "<title>"`) is a later,
optional step.

### D5 — Reads are cached, writes are queued

The catalog is cached on disk so startup never blocks on the network, and
a stale cache still lets you pick. Unsynced records queue behind a
watermark.

### D6 — The aggregation rule exists exactly once, in kankaku

Task wall time is the **union of intervals** between the orchestrator and
its subagents, never their sum, because background children keep running
after the orchestrator settles (`src/domain/task-view.ts:5-10`). That rule
lives in `buildTasks` and is covered by `tests/task-view.test.ts`.

Therefore sync pushes **consolidated task rows**, not raw records to be
re-aggregated elsewhere. Downstream consumers (the web, any export) only
ever `SUM`/`GROUP BY` rows whose overlap was already resolved. They cannot
disagree with kankaku because they never apply the rule.

Re-implementing interval union in SQL would be the worst of both worlds:
the most delicate logic in the system, rewritten in the language least
suited to it, without the tests that already cover it.

### D7 — The web is a view layer, not a second brain

The Nuxt app reads PocketBase and writes task/project metadata. It never
computes time or cost aggregations from raw records, and it never holds a
rule that kankaku also holds.

### D8 — No money in the database

Clients, projects, tasks, time and token cost: yes. Hourly rates, prices,
margins, invoice numbers: no. That boundary is what keeps this a
measurement tool rather than invoicing software (see §9.4).

## 3. What pi actually allows (verified against v0.85.1)

Checked in `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts`
and `docs/extensions.md`:

- **Interactive prompts exist.** `ctx.ui.select(title, options, opts?)`,
  `ctx.ui.input(...)`, `ctx.ui.confirm(...)`, `ctx.ui.editor(...)` and
  `ctx.ui.custom(...)` all return promises (`types.d.ts:68-192`). Dialog
  options accept `signal` and `timeout`.
- **Handlers may be async and are awaited.** `ExtensionHandler` returns
  `Promise<R | void>` (`types.d.ts:902`); the extension factory itself may
  be async and is awaited before `session_start`
  (`docs/extensions.md:181`). The documented exception is
  `ui_prompt_start`/`ui_prompt_end`, which are best-effort and not awaited.
- **`session_start` fires before any user prompt is accepted**
  (`docs/extensions.md:275-320`), which is exactly the slot for the
  client/project question.
- **No sandbox, no fetch helper.** Extensions run with the full permissions
  of the pi process and use Node's global `fetch` (`docs/security.md:31-35`).
  So talking to PocketBase is trivially possible — and entirely our
  responsibility to keep safe.
- **No key-value store.** Extension state is either session entries
  (`pi.appendEntry`) or our own files. We already use both patterns.

Consequence: the interaction the user asked for is feasible as described.
The risk is not capability, it is latency and failure modes at startup.

## 4. PocketBase data model

Minimum viable schema. Collection names are suggestions.

### `clients`
| field | type | notes |
|---|---|---|
| `name` | text, required | display name, the canonical spelling |
| `code` | text, unique | short slug, e.g. `cajamar` |
| `active` | bool | inactive clients are hidden from the picker |
| `unassigned` | bool | `true` only for the single "Sin determinar" row (§5.3) |

### `projects`
| field | type | notes |
|---|---|---|
| `name` | text, required | |
| `client` | relation → `clients`, required | |
| `code` | text | optional slug |
| `repo_paths` | json (array of strings) | absolute paths that map to this project; enables auto-selection |
| `active` | bool | |

### `tasks` (phase 3)
| field | type | notes |
|---|---|---|
| `title` | text, required | |
| `project` | relation → `projects`, required | |
| `status` | select | `open`/`doing`/`done` |
| `external_ref` | text | issue/PR id, optional |

### `task_entries` — the reporting unit, one row per task

This is the collection every report reads. One row = one orchestrator run
plus all its subagents, already consolidated by `buildTasks`, so overlap is
resolved before the row exists.

| field | type | source in `TaskView` |
|---|---|---|
| `task_id` | text, **unique index** | `id` (the orchestrator record's id) — idempotency key |
| `client` / `project` / `task` | relations | from the selected target |
| `started_at` / `ended_at` | date | `startedAt` / `endedAt` |
| `wall_ms` | number | `wallMs` — **union**, not a sum |
| `waiting_ms` / `work_ms` | number | same fields |
| `input` / `output` / `cache_read` / `cache_write` / `cost` | number | `usage.*`, summed across orchestrator and children |
| `segments` | json | `segments` |
| `subagent_count` | number | `subagents.length` |
| `status` | select | `status` |
| `session_id` / `session_name` | text | same fields |
| `machine` | text | hostname or configured alias |
| `prompt` | text, optional | subject to the privacy setting (§8) |

Summing these rows is always correct: `SUM(work_ms) GROUP BY project` is
the whole query. No consumer needs to know what a subagent is.

### `work_records` — raw detail, never aggregated (optional)

One row per `WorkRecord`, for drilling into a task. Every row carries
`rollup: false` as a standing warning: these rows overlap each other and
must never be summed. If you do not need to recompute history from the
server, skip this collection entirely and keep the raw JSONL local.

| field | type | source in `WorkRecord` |
|---|---|---|
| `kankaku_id` | text, **unique index** | `id` — the idempotency key |
| `task_entry` | relation → `task_entries` | parent task |
| `rollup` | bool, default `false` | never sum these rows |
| `started_at` / `settled_at` | date | `startedAt` / `settledAt` |
| `wall_ms` / `waiting_ms` / `work_ms` | number | same fields |
| `runs` / `turns` | number | same fields |
| `role` | select `orchestrator`/`subagent` | `role` |
| `parent_pid` / `pid` | number | for parent/child linkage |
| `session_id` | text | `sessionId` |
| `status` | select | `completed`/`aborted`/`interrupted` |
| `model` | text | `model` |
| `input` / `output` / `cache_read` / `cache_write` | number | `usage.*` |
| `cost` | number | `usage.cost` |
| `segments` | json | `segments` |
| `prompt` | text, optional | subject to the privacy setting (§8) |
| `machine` | text | hostname or a configured alias, for multi-machine setups |
| `schema` | number | `schema` |

The unique index is what makes retries safe: a duplicate create fails with
400 and the client treats that as success.

**Why two collections instead of one:** if the only collection were raw
records, every consumer would have to know that a subagent's time is
contained within its orchestrator's — and would eventually get it wrong.
Splitting them makes the safe path the default one: `task_entries` is
summable by construction, `work_records` is flagged as not.

## 5. Selection flow

### 5.1 At session start

On `session_start`, when `role === "orchestrator"` and `ctx.hasUI`:

1. Resolve a **project mapping** for the current repo path: look up the
   cached catalog for a project whose `repo_paths` contains the cwd, then
   the local `.kankaku/config.json` (`{ "projectId": "...", "clientId": "..." }`).
2. **If a mapping exists:** do not ask. Show it in the status bar
   (`💼 Cajamar · Portal`) and carry on. Silence is the reward for a
   configured project.
3. **If no mapping exists:** `ctx.ui.select("kankaku — client", [...])`,
   then `ctx.ui.select("kankaku — project", [...projects of that client])`.
   Offer a `— skip —` entry: declining must be possible, and must be
   remembered for the session so you are not asked twice.
4. Persist the choice: session entry (`pi.appendEntry("kankaku-target", …)`)
   so a reload keeps it, plus an optional write to `.kankaku/config.json`
   after a `confirm("Remember for this repository?")`.

Subagents never ask; they inherit the orchestrator's target, exactly as
they inherit the client label today.

### 5.2 The catalog cache

- Stored at `<KANKAKU_DIR>/catalog.json` (or `~/.kankaku/catalog.json` for
  a machine-wide cache), with `fetchedAt` and the clients/projects arrays.
- On startup: read the cache and show it **immediately**; refresh in the
  background and update the cache for next time. A stale picker beats a
  two-second stall on every session start.
- Refresh on demand with `/kankaku catalog refresh`.
- If there is no cache and PocketBase is unreachable, say so once and fall
  back to the current free-text behaviour rather than blocking work.

A TTL of a few hours is plenty; clients and projects change rarely.

### 5.3 Historical records: the "Sin determinar" client

Records written before this feature have no `clientId`, and some have a
free-text `client` label with the exact spelling drift this proposal
exists to kill.

- Create **one real client row** named `Sin determinar`, with
  `unassigned: true`. It is a row like any other, with an id, so every
  aggregation keeps working and nothing needs a `NULL` special case.
- Reports can exclude it with one filter, and the web shows it as a queue
  of work waiting to be assigned (§9.2).
- The picker hides it, or lists it last. It is a destination for migration,
  not a choice you make.
- **Keep the original label.** Every migrated row stores its old free-text
  value in `legacy_client_label`. This is the whole point: it turns "all
  the history is a grey blob" into "everything that said `cjamar` goes to
  Cajamar", a single bulk update. Without that field the history is
  unrecoverable.

`/kankaku backfill` does the mapping locally and is re-runnable.

### 5.4 Fuzzy matching is deliberately absent

No `cjamar` → `Cajamar` correction. The picker removes the class of error
entirely; fuzzy matching would reintroduce it with a confidence score
attached. Typing a name is only possible through the legacy
`/kankaku client <name>` path, which validates against the catalog and
rejects unknown names with a "did you mean" listing.

## 6. Sync design

### 6.0 A task is not final when it is first written

A background subagent can settle **after** its orchestrator, which extends
the task's union and changes `wall_ms`, `cost` and `subagent_count` for a
task that may already be in PocketBase. So sync cannot be "upload once,
advance, never look back".

Two rules handle it:

1. **Upsert by `task_id`**, never blind create. Recomputing and re-sending
   a task is always safe.
2. **Revisit a recent window.** The watermark advances as described below,
   but every sync also recomputes tasks whose `endedAt` falls inside a
   trailing window (24 hours is a sane default, configurable) and upserts
   them. Late children land in their task without a manual fix.

A task whose orchestrator is older than the window and gains a child later
is a pathological case; it resolves with `/kankaku sync --since <date>`.

### 6.1 Watermark

`worklog.jsonl` is append-only and never rewritten (a rule in `AGENTS.md`),
which makes a **byte offset** a valid, cheap watermark. State file
`<KANKAKU_DIR>/sync-state.json`:

```json
{ "offset": 91234, "syncedAt": "2026-09-20T09:12:00.000Z", "target": "https://pb.example.com" }
```

Sync reads from `offset` to EOF, pushes each record, then advances. If
`offset > size` (file replaced, or a different machine's dir), reset to 0
and rely on idempotency.

Per-record failures do not block the watermark forever: a record that fails
validation (as opposed to a network error) is recorded in a `failed` list
with its id and reason, and skipped.

### 6.2 Push

- Build tasks with `buildTasks` from the records read since the watermark
  plus the revisit window, then upsert one `task_entries` row per task
  (and, if enabled, its `work_records` children).
- PocketBase's batch API when available, otherwise one request per row.
- Duplicate unique key on create → HTTP 400 → look up and update instead,
  or treat as already synced when nothing changed.
- Network error or 5xx → stop, keep the watermark, retry later with
  exponential backoff. Never lose data, never spin.
- Unresolvable `clientId`/`projectId` (deleted in PocketBase) → push with
  the relation empty and the denormalised name kept, so the entry is not
  silently dropped.

### 6.3 When sync runs

Three modes, in order of how much I would trust them:

1. **Manual:** `/kankaku sync` — always available, shows a summary.
2. **On session start**, fire-and-forget in the background, never awaited.
3. **A cron/launchd job** running `kankaku sync` outside pi entirely — the
   most robust option, since it does not depend on a pi session being open.

Option 3 argues for a small CLI entry point (`npx kankaku sync`) that
shares the adapters with the extension. That is a modest amount of extra
surface and it decouples uploading from editing.

## 7. Architecture fit (hexagonal)

New ports:

```
src/ports/catalog.ts   → listClients(): Client[]; listProjects(clientId): Project[]
src/ports/work-sink.ts → push(records: WorkRecord[]): PushResult
```

New domain:

```
src/domain/work-target.ts → pure resolution of {clientId, projectId} from
                            session / repo mapping / project config, mirroring
                            client-label.ts's precedence logic
```

New adapters:

```
src/adapters/pocketbase-catalog.ts → fetch + auth, no UI
src/adapters/cached-catalog.ts     → disk cache + TTL, wraps any Catalog
src/adapters/pocketbase-sink.ts    → push with idempotency handling
src/adapters/target-picker.ts      → the ctx.ui.select flow, no network
src/adapters/sync-runner.ts        → watermark + orchestration
```

The domain stays pure: no `fetch`, no `Date.now()`, no pi imports. The
picker never talks to the network; it receives a catalog. The sink never
decides *what* to send; it sends what the runner gives it.

`WorkRecord` gains optional metadata fields — `clientId`, `projectId`,
`taskId`, `clientName`, `projectName`, `machine`. Per `AGENTS.md`, adding
optional fields does **not** require a `WORK_RECORD_SCHEMA` bump. The
existing `client` label stays, populated with the canonical name, so every
current report and export keeps working untouched.

## 8. Security and privacy

- **Prompts leave the machine only if you say so.** A `KANKAKU_SYNC_PROMPT`
  setting with `none` (default) / `truncated` (first ~120 chars) / `full`.
  Prompts can contain client-confidential context; the default must be the
  conservative one.
- **Credentials never in the repo.** `.kankaku/config.json` is
  project-local and frequently committed, so it holds ids only. The
  PocketBase URL and token come from `KANKAKU_PB_URL` / `KANKAKU_PB_TOKEN`,
  or from `~/.kankaku/credentials.json` with `chmod 600`.
- **A dedicated PocketBase service account**, not your admin user, with API
  rules that allow writing `task_entries` (and `work_records` when enabled) and reading `clients`/`projects`
  and nothing else. PocketBase auth tokens expire: the adapter must handle
  401 by re-authenticating once, then failing cleanly.
- **HTTPS only.** Refuse a plain-HTTP URL unless it is localhost, and say
  why.

## 9. Web UI (Nuxt + shadcn-vue)

### 9.1 Shape

PocketBase already provides REST, auth and realtime subscriptions, so the
web app is mostly views.

- **Build it static (`nuxt generate`) and serve it from PocketBase's
  `pb_public`.** One binary on the VPS, no Node server, no SSR fighting
  over where the auth token lives. shadcn-vue works fine in a SPA.
- **Use realtime subscriptions** on `task_entries`: when kankaku syncs, the
  dashboard updates itself. Cheap to add, disproportionately satisfying.
- **Single user.** PocketBase auth with one account. No multi-tenancy, no
  roles, no invitations until a second person actually needs in.

### 9.2 Scope — what makes this worth building

A full task manager (boards, comments, attachments, notifications) already
exists for free, and competing with it is a trap. The thing that does not
exist anywhere else is **AI time and cost per project, measured
automatically**. Build around that:

- **Dashboard:** time and cost by project and by client, over a date range.
- **Project detail:** its tasks, its trend, its most expensive prompts.
- **"Sin determinar" queue:** the rows waiting to be assigned to a real
  client, with bulk assignment by `legacy_client_label` (§5.3). This is the
  screen that pays for the backfill design.
- **Task CRUD:** the minimum needed for kankaku's picker to have something
  to link to — title, project, status.

Everything else is a later decision, made with data about what you actually
open every day.

### 9.3 The rule stays where it is

The web never re-derives task totals from `work_records`. It reads
`task_entries` and sums. See D6.

A shared fixture keeps both honest: one sample JSONL with an orchestrator
and overlapping subagents, plus the expected totals written by hand.
kankaku asserts them in `tests/task-view.test.ts`; the web asserts that its
`SUM` produces the same numbers. A divergence then fails in CI rather than
in front of a client.

### 9.4 The billing boundary

"A task manager, never invoicing" is the right line, and it is thinner than
it looks: client + project + time + cost is most of an invoice already.

The practical boundary is **no rates and no prices in the database**.
Storing a price per hour is the moment this stops being a measurement tool
and becomes billing software. Export CSV and let an invoicing tool do the
invoicing.

There is also a regulatory reason to stay on this side of the line: in
Spain, software that issues invoices falls under the invoicing-software
regulation (Verifactu, RD 1007/2023), with integrity and traceability
requirements. **This needs confirming with an accountant** — it is cited
here as a reason to keep the boundary, not as legal advice.

## 10. Phasing

Each phase is independently useful and independently shippable.

**Phase 1 — Catalog and selection (no writes to PocketBase).**
Read-only catalog, cached; the two pickers at session start; ids stored in
records; status bar shows `client · project`; `.kankaku/config.json` gains
`clientId`/`projectId`. Value on its own: consistent naming, plus a project
dimension in the local reports (`/kankaku clients` becomes
`/kankaku projects` too).

**Phase 2 — Sync push.**
`sync-state.json`, `/kankaku sync`, the PocketBase sink, the revisit window
(§6.0), backoff and idempotent upserts of `task_entries`. Optional
background sync at session start. This is the phase that makes the VPS
useful.

**Phase 2b — Backfill.**
The `Sin determinar` client, `legacy_client_label`, and `/kankaku backfill`
(§5.3). Do it with phase 2, not after: the first sync is what fills the
database, and deciding this afterwards means migrating twice.

**Phase 3 — Web (Nuxt + shadcn-vue).**
Static build served from `pb_public`: dashboard, project detail, the
"Sin determinar" queue, minimal task CRUD (§9). Depends on phase 2 having
put data there, and on phase 2b for the assignment queue to be useful.

**Phase 4 — Task linkage.**
`/kankaku task` picks an open task of the current project; `taskId` lands
in the record and in `task_entries`. Read-only against `tasks`, which the
web now lets you create.

**Phase 5 (optional, only if phase 4 proves it necessary) — Task creation
from pi.** `/kankaku task new "<title>"`. Still no automatic creation.

**Standalone CLI** (`kankaku sync` outside pi) can be pulled into phase 2
or deferred; it is what makes cron-based syncing possible.

## 11. Open questions

1. **Does the manager already exist?** If you are also building the
   PocketBase UI, the schema above should be validated against what the
   manager needs to display, not just what kankaku can emit.
2. **One machine or several?** The `machine` field and a machine-wide
   catalog cache assume several. If it is only the laptop, drop them.
3. **Currency and cost model.** `usage.cost` comes from the provider and is
   presumably USD. If you invoice in EUR, the conversion belongs in the
   manager (with a dated rate), not in kankaku.
4. **Do raw `work_records` go to PocketBase at all?** *Decided: optional.*
   `task_entries` is what reports read; raw rows are drill-down only and
   flagged `rollup: false`. Ship phase 2 without them and add them if you
   ever want to recompute history from the server rather than from the
   local JSONL.
5. **What happens to existing records?** *Decided:* they go to a real
   `Sin determinar` client row, keeping their old free-text label in
   `legacy_client_label` for bulk reassignment (§5.3).
6. **How far does the web go before it stops being worth it?** Worth
   revisiting after a month of use: if you are opening it daily, invest; if
   you only look at `/kankaku` in the terminal, the web stays a dashboard
   and the task manager idea quietly dies. That is an acceptable outcome.

## 12. Recommendation

Phase 1 is worth doing regardless of whether sync ever happens: it fixes
naming at the source and adds the project dimension you are missing today.
Phase 2 (with 2b) is where the idea pays off, and the outbox design means
it cannot disturb the agent loop. Phase 3 is the one that turns numbers
into something you will actually look at.

Hold phases 4 and 5 until you have used the first three for a couple of
weeks — by then you will know whether linking tasks by hand is a chore
worth automating, or a two-second pick you never think about.

The single most important decision in this document is D6: the aggregation
rule lives in `buildTasks` and nowhere else, and what travels to PocketBase
is already consolidated. Everything else can be changed later. That one
cannot, not cheaply — it is the difference between one source of truth and
two implementations that slowly stop agreeing.
