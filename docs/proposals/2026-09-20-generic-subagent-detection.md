# Proposal — Generic subagent detection, with gentle-pi first-class

Status: draft for discussion. Nothing implemented.
Date: 2026-09-20
Scope: `kankaku` (pi extension), read-only investigation as of `feat/pocketbase-hub`.

## 1. Problem

kankaku measures work time by classifying every pi process as `orchestrator`
or `subagent` (`WorkRole`, `kankaku/src/domain/work-record.ts:4`), then
joining subagent records to their orchestrator to build a `TaskView`
(`kankaku/src/domain/task-view.ts`). Both the classification and the join
today assume exactly one subagent mechanism: gentle-pi's `subagent_run`.

- **Classification** (`detectRole`, `kankaku/src/config.ts:97-99`) recognises
  only `GENTLE_PI_AGENTS_CHILD === "1"` and defaults every other process —
  including a child spawned by any other tool, and any process pi itself
  nests in-process — to `"orchestrator"`.
- **The tool name that opens a subagent span** is a single hardcoded string,
  `SUBAGENT_TOOL = "subagent_run"` (`kankaku/src/config.ts:19`, wired into
  `KankakuConfig.subagentTool` at line 91 and compared with `===` in
  `WorkTracker.onToolStart`, `kankaku/src/domain/work-tracker.ts:131`), not
  configurable.
- **The join** (`matchChildren`, `kankaku/src/domain/task-view.ts:109-150`)
  requires, all three: exact `project` string equality (line 129), exact
  `orchestrator.pid === child.parentPid` (line 130), and the child's
  `startedAt` inside the orchestrator's `[startedAt, settledAt]` window
  (lines 132-134). A child that fails any one of these becomes an orphan —
  excluded from every task/session view (`orphanSubagents`, lines 204-206)
  and, as this proposal establishes below, frequently **unsyncable to the
  hub at all**, not merely locally invisible.

Both defaults are wrong in ways that cost real money, in opposite
directions:

- **Undercount (silent)**: a real subagent that this build cannot recognise
  as a child is never joined to its task; its work time and cost vanish from
  every report, local and hub.
- **Overcount (silent, worse)**: a real subagent that this build cannot
  recognise defaults to `"orchestrator"` (the unconditional fallback in
  `detectRole`), becoming a second, phantom top-level task. Its time is then
  billed twice: once inside its true orchestrator's tool-call span (the
  `bash`/tool-execution interval that spawned it), and again as its own
  independent task row. Overcounting billable time is the harder failure to
  recover from, because nothing signals it happened.

The owner's goal is for kankaku to work across the whole pi ecosystem —
"the more global the better" — while keeping gentle-pi/gentle-ai the
richest, most robust, first-class path, since that is what the owner uses
and where kankaku will be announced. This proposal is deliberately biased
toward that asymmetry: gentle-pi gets a dedicated, highly-confident profile
with task ids, status and cross-worktree correctness; every other mechanism
gets whatever confidence its own cooperation (or lack of it) actually
supports, and — critically — a process this design cannot positively prove
is top-level must never again default to `"orchestrator"`.

## 2. Evidence — the four settled questions

### A. Where does a cross-worktree child write its records?

**Answer: yes, to a different file — and the consequence is worse than
"excluded from local reports": the child's own record can never anchor a
task at all, so it is never syncable to the hub either, by any path,
manual or automatic.**

- `resolveKankakuDir(dirOrRelative, cwd)` (`kankaku/src/adapters/kankaku-dir.ts:8-10`)
  joins a relative `KANKAKU_DIR` (default `.kankaku`) against `cwd`; an
  absolute value is used as-is.
- `LazyJsonlWorkLog` is constructed once per process, at extension-factory
  time, with no `fallbackCwd` override (`kankaku/src/extension.ts:36`), so
  it defaults to `() => process.cwd()`
  (`kankaku/src/adapters/lazy-jsonl-work-log.ts:16`).
- `append(record)` resolves its directory **lazily from `record.project`**,
  not from `process.cwd()` directly, and memoizes it for the process's
  lifetime (`lazy-jsonl-work-log.ts:21-30`).
- `record.project` is set to `ctx.cwd` at record-build time
  (`kankaku/src/adapters/pi-tracker.ts:189`), called on `agent_settled`
  (line 295) and `session_shutdown` (line 315).
- `JsonlWorkLog.append` writes via one `appendFileSync` to
  `<dir>/worklog.jsonl` (`kankaku/src/adapters/jsonl-work-log.ts:7,25-28`),
  a design explicitly chosen "so a parent and its subagent children can
  write concurrently without interleaving lines" (lines 10-12) — a claim
  that holds only when parent and child share the same file, i.e. the same
  resolved directory.

So a child whose `cwd` is a different git worktree resolves a different
`KANKAKU_DIR` and writes to `<worktree-B>/.kankaku/worklog.jsonl`, never
touching the orchestrator's `<worktree-A>/.kankaku/worklog.jsonl`. Reading
back confirms there is nothing to join locally: `readAll()` resolves via
`fallbackCwd()` (`lazy-jsonl-work-log.ts:32-34`) — the *reading* process's
own cwd — so a report run from worktree A never sees a single byte written
in worktree B. Even a hypothetical manual merge of the two files would not
help: `matchChildren`'s exact `project` equality (`task-view.ts:129`)
rejects the pair outright.

**The sharper, previously-unstated half of this finding**: `detectRole()`
correctly marks the cross-worktree child `"subagent"` regardless of cwd
(`GENTLE_PI_AGENTS_CHILD` is set by the parent regardless of where the
child runs), which means the child's own `worklog.jsonl` in worktree B
contains only `role: "subagent"` records with no matching orchestrator in
that same file. `buildTasks` only ever anchors a `TaskView` on a
`role === "orchestrator"` record (`task-view.ts:193-196`); a subagent
record can never anchor one by itself. Sync uploads `TaskView`s, so:

- **Automatic sync never runs for the child's process at all** —
  `triggerAutoSync` bails unless `role === "orchestrator"`
  (`kankaku/src/adapters/pi-tracker.ts:153`); "Subagents never sync" is
  already documented behaviour (`kankaku/README.md`, Sync section).
- **A manual `/kankaku sync` run from inside worktree B is equally a
  no-op**: `buildTasks(log.readAll())` over a file containing only orphaned
  subagent records produces zero `TaskView`s, hence zero rows to push.
- Meanwhile worktree A's orchestrator syncs a `task_entries` row whose
  `wall_ms`/`cost`/`subagent_count` are computed from `matchChildren`
  finding **no** matching children (the true child lives in a file it
  never reads) — an undercounted row, uploaded successfully, with nothing
  in the hub signalling that anything is missing.

So the child's work is not merely invisible locally; it is lost from the
hub entirely, permanently, unless something changes.

**What an absolute, shared `KANKAKU_DIR` would change**: every process
resolving to the same directory fixes the storage split (one shared
`worklog.jsonl`, one shared `sync-state.json`/lock) and `JsonlWorkLog`'s
single-`appendFileSync`-per-record design is documented as safe for that
concurrent-append case. But `matchChildren`'s exact `project` equality
(`task-view.ts:129`) still rejects a cross-worktree pair even with shared
storage — the join logic itself, not just storage location, has to change.
A shared directory also mixes unrelated repositories' records in one file
(mitigated because `WorkRecordMetadata.project` still records each
process's own cwd, so records stay attributable) and is not something an
end user should be asked to configure by hand for every project. This
proposal does not recommend a shared `KANKAKU_DIR` as the fix — see
§4 "The cross-worktree problem" for the recommended alternative
(a machine-wide *registry*, separate from where records themselves live).

*(Investigated by a dedicated read-only pass over
`kankaku/src/adapters/kankaku-dir.ts`, `lazy-jsonl-work-log.ts`,
`jsonl-work-log.ts`, `pi-tracker.ts`, `extension.ts`,
`sync-state-store.ts`, `sync-runner.ts`, `task-view.ts`. One item remains
**inferred, not settled from source**: whether pi actually gives a
`subagent_run` child a `ctx.cwd` reflecting a different requested
worktree — `@earendil-works/pi-coding-agent`'s vendored types document
`ExtensionContext.cwd: string` with no contract either way, and
`subagent_run`/`workspace_root` are not symbols this repo's `node_modules`
defines at all — that tool is provided externally by gentle-pi. A runtime
probe would spawn a `subagent_run` child with an explicit different
`workspace_root` and log `ctx.cwd` from inside it.)*

### B. `pi-subagents` and other ecosystem packages, for real

Four packages were inspected read-only (`npm pack`, extracted, read, never
installed or executed; everything removed from the scratchpad afterward).
gentle-pi's own source is candid about one of them: `agents-runner.ts`
carries `export const LEGACY_SUBAGENTS_PACKAGE = "pi-subagents-j0k3r"` with
the comment "The retired pi-subagents package registers the same tool
names. While it is still installed we stay out of the way." — a *different*
npm name from the live `pi-subagents@0.70.0` examined below, so treat them
as related but not confirmed identical.

| Package | Tool name(s) | In/out of process | Child env markers | Ids shared with child | Result shape / usage forwarding |
|---|---|---|---|---|---|
| **gentle-pi** 3.3.0 (built in) | `subagent_run`, `subagent_status`, `subagent_result`, `list_agents`, `list_tasks`, `reply`, `subagent_parent_message` | Out of process: `child_process.spawn` of the same pi build (`lib/agents-runner.ts:505-513`), `detached: true` on POSIX (line 491) | `GENTLE_PI_AGENTS_CHILD=1` (`CHILD_MARKER`, line 242), `GENTLE_PI_AGENTS_OWNED_IPC=<nonce>` (`IPC_MARKER`, line 243) — both set unconditionally at spawn (lines 493-499) | Task id (`task.id`) known to the **parent's** tool result only (`taskDetails`, `extensions/gentle-agents.ts:319-320`); **the child cannot read its own task id** — `childArguments` (`agents-runner.ts:278-288`) passes only `--mode rpc --session-dir/--session/--model/--tools/--append-system-prompt`, none of them a task id, and the spawn env (lines 493-499) carries no task-id variable either. Task files persist separately at `~/.pi/agent/gentle-agents/tasks/<taskId>.json` (`historyDir`, `lib/agents-history.ts:18-19,24`), carrying `parentSessionId`, `cwd`, `model`, `sessionPath` (`TaskRecord`, `lib/agents-protocol.ts:111-139`) — readable from disk, but not handed to the child directly. | `{ gentleAgents: { taskId, agent, status, mode, cwd } }` on the tool result (`taskDetails`, `gentle-agents.ts:319-320`) — already what `extractTaskId` reads (`kankaku/src/domain/work-tracker.ts:280-288`). No `usage` field forwarded on the tool result; token accounting for the reviewer specifically is documented as invisible to kankaku already (`kankaku/README.md`, "Tagged segments": "gentle-pi runs it with `--no-extensions`"). |
| **pi coding-agent's bundled reference example** (`@earendil-works/pi-coding-agent/examples/extensions/subagent/index.ts`, vendored, not installed) | `subagent` | Out of process: direct spawn, `--mode json -p --no-session` | **None** — no env variable at all | None | Plain tool result, no structured `details` |
| **pi-subagents** 0.70.0 (npm, live) | one action-router tool, `"subagent"` (`src/extension/index.js:703`) | **Both**: README documents foreground children as "sessions inside the parent Pi process"; only background mode spawns an OS process (`src/runs/background/async-execution.js:511`) | Parent-injected `PI_SUBAGENT_PARENT_SESSION` (externally visible, set in `runnerEnv` at spawn, `async-execution.js` ~L500); child-self-set `PI_SUBAGENT_CHILD=1` (`subagent-runner.js:92`) is only confirmed as an in-process `process.env` write — not confirmed to reach the OS exec environ a ps-based ancestry check could see | A JSON config file path (built from `runId`/`asyncId`, `sessionId`, `completionOwnerId`) passed as a CLI arg — the child can read its own ids back from that file | Generic content/isError tool result; richer metadata (`runId`, agent, status, model, usage) exists only in a private extension-to-extension API (`docs/extension-api.md:317-332`), not on the tool result kankaku would see. Docs state built-in session totals do **not** include async child usage automatically (`docs/observability.md:34`) — a dedicated `/subagent-cost` command is the intended accounting surface, not the `usage`-on-result convention. |

Two more candidates were found via npm's `pi-package`/orchestration keyword
search and read partially for corroboration, not included as built-in
profiles here (breadth-you-can-evidence over padding, per the research
brief): **pi-background-tasks** 2.5.0 (tools `bg_delegate`/`bg_run`/etc.,
always out-of-process, unconditionally injects `PI_BG_DELEGATE_TASK_ID`
directly into the child's env — `src/core/delegate/launch.ts:346-357` —
notably the *only* package surveyed that hands the child its own task id
without a file round-trip) and **@d3ara1n/pi-subagent** 3.6.1 (tools
`subagent_delegate`/`subagent_wait`/etc., out-of-process, unconditional
`PI_SUBAGENT_DEPTH` env marker, `SubagentResult` type carries `usage`
directly on the result — `src/types.ts:148-172`, the closest of the four to
gentle-pi's `details` shape). Both are strong future built-in-profile
candidates and are called out in Open Questions.

**A concrete ambiguity this design must handle**: pi's bundled reference
example and the live `pi-subagents` package both register a tool literally
named `subagent`. A detector matching on tool name alone cannot tell them
apart; only the presence (or absence) of `PI_SUBAGENT_PARENT_SESSION`
distinguishes them. When that distinguishing signal is itself absent (e.g.
an even older or unknown `subagent`-named tool), the design must not guess
— see §4 "Safe default inverted".

### C. In-process nesting and kankaku's factory

**(a) The extension factory is re-invoked per nested session, with a fresh
instance, unless the caller explicitly threads through the same
`resourceLoader`.** `createAgentSession()`
(`@earendil-works/pi-coding-agent/dist/core/sdk.js:66-79`) constructs a new
`DefaultResourceLoader` and calls `reload()` unless one was passed in;
`reload()` re-runs extension discovery, which calls `initializeExtension()`
(`dist/core/extensions/loader.js:456-462`) — `createExtension()` builds a
brand-new `{ handlers: new Map(), tools: new Map(), ... }` and `factory(load.api)`
is invoked again. `AgentSession`'s constructor always builds a new
`ExtensionRunner` from whatever the resource loader returns
(`dist/core/agent-session.js:2182-2206`). For kankaku this means: a new
`kankaku(pi)` call, a new `WorkTracker`, but the **same OS process**, so
`process.pid`/`process.ppid` — captured once per factory invocation at
`kankaku/src/extension.ts:132-133` — are identical between the outer and
the nested instance. Two independent `WorkRecord`s with the same `pid`,
same `parentPid`, same `project`, and (absent env-marker changes) the same
`role: "orchestrator"` can result — a same-pid double-instance problem
distinct from the cross-process double-count in §1, needing its own guard
(§4).

One nuance: `session_start` specifically fires only via `bindExtensions()`
(`dist/core/agent-session.js:1906-1927`), which a nested/headless session
typically never calls, while `before_agent_start`/`turn_end`/tool events
fire unconditionally once an `ExtensionRunner` exists. So a nested
kankaku instance opens and tracks a run (`before_agent_start` onward)
without ever seeing `session_start` — relevant because kankaku's crash
recovery and auto-sync trigger from `session_start`
(`kankaku/src/adapters/pi-tracker.ts:358`); a nested instance gets neither.

**(b) Outer `turn_end` usage does not automatically include nested usage —
only the tool result's `usage` field carries it.** `TurnEndEvent`
(`dist/core/extensions/types.d.ts:585-590`) exposes `message.usage`
(the outer LLM call only) and `toolResults[]`; `ToolResultMessage.usage`
(`@earendil-works/pi-ai` `dist/types.d.ts:336-337`) is documented as
*"Usage from the tool execution itself, if available. Not part of main LLM
context accounting."* — a tool must set it deliberately.
`docs/extensions.md:2015`: *"If a tool makes nested LLM calls, return their
combined Usage as `usage`. Pi persists it on the tool result and includes
it in footer, `/session`, and RPC session totals."* kankaku's
`onToolEnd` never reads `result.usage` today (confirmed: `WorkTracker`'s
subagent handling only calls `extractTaskId`,
`kankaku/src/domain/work-tracker.ts:152-165`; `pi-tracker.ts` only reads
`usage` off the top-level assistant message, line 243).

**(c) No native "I am a nested session" signal exists.** `SessionStartEvent.reason`
is a closed union `"startup" | "reload" | "new" | "resume" | "fork"`
(`types.d.ts:419`, no `"nested"` value); `ExtensionContext`
(`types.d.ts:209-249`) has no `parentSessionId`/`isNested` field;
`parentSession` elsewhere in the types refers to session-file lineage for
`/fork`/`/clone`, unrelated to in-process nesting.

All three points are settled from source; nothing here needs a runtime
probe. (A residual, lower-stakes unknown: what a well-behaved
`createAgentSession` caller is *supposed* to do about `bindExtensions` —
not required to finish this design, noted in Open Questions.)

### D. Ancestor-chain lookup feasibility and the inflight registry

**Is `<KANKAKU_DIR>/inflight/<pid>.json` a sound registry for ancestor-chain
lookups? Only if the ancestor ran in the same project.** Its path is built
the same way as `worklog.jsonl`'s: `<resolved-dir>/inflight/<pid>.json`
(`kankaku/src/adapters/file-inflight-store.ts:43-49`), and `resolved-dir`
is the same per-project, cwd-relative `resolveKankakuDir` from §A
(`kankaku-dir.ts:8-10`). Checkpoints are written at `before_agent_start`,
`turn_end`, and `tool_execution_end`
(`kankaku/src/adapters/pi-tracker.ts:216,228,256,271`). A process walking
its OS ancestor pids and checking `<its-own-cwd>/.kankaku/inflight/<ancestorPid>.json`
gets a false negative — the file is simply absent — whenever the ancestor
ran in a different project/worktree, exactly the case this design most
needs to cover.

**Conclusion: a sound registry must be machine-wide**, independent of any
one project's `KANKAKU_DIR` — e.g. `~/.kankaku/run/<pid>.json`, resolved
once from `os.homedir()`. Tradeoffs: it only covers processes owned by the
invoking OS user (a feature for isolation, a gap for cross-user/CI
ancestor chains); it needs its own liveness/staleness sweep, mirroring the
existing `sync-state-store.ts` stale-lock pattern
(`STALE_LOCK_MS`-style), since it is no longer bounded by one project's
lifecycle and pids recycle; one directory mixes unrelated projects' entries
(mitigated by including `WorkRecord.project`, already schema-present,
`work-record.ts:57`, in each entry); and it still cannot see a genuinely
different machine — pid/ancestor schemes are host-scoped by construction.

**Ancestor-walk mechanism, per OS** (measured on this machine, macOS
27.0.0/Darwin arm64: a single `ps -eo pid,ppid` snapshot completed in
~10ms):

- **macOS**: one `ps -eo pid,ppid` snapshot, parsed in-process to walk N
  ancestors — a single subprocess spawn regardless of N, not N sequential
  `ps -o ppid= -p <pid>` spawns.
- **Linux**: `/proc/<pid>/status`'s `PPid:` line (or `/proc/<pid>/stat`
  field 4, less robust to parse) — a direct file read, no subprocess at
  all, cheaper than the macOS snapshot.
- **Windows**: no `ps`, no `/proc`. `wmic` is deprecated/removed on newer
  builds; `Get-CimInstance Win32_Process` via PowerShell works but a
  PowerShell spawn typically costs 100ms+ — unacceptable on a hot path a
  pi extension must never block. A native addon
  (`windows-process-tree`-style) avoids the spawn cost but adds a
  platform-specific dependency this package does not currently have.
  **Recommendation: skip ancestor-chain detection on Windows in the first
  version**, falling back to the existing env-marker heuristic only — a
  graceful no-op, not a hard failure.
- Since the check only needs to run once per process at `session_start`
  (not per turn), one cheap snapshot/read is an acceptable cost on
  macOS/Linux; the concern is specifically avoiding N per-hop subprocess
  spawns.

## 3. Mechanisms table

| Mechanism | Tool name(s) | In/out of process | Child marker kankaku can see today | Join keys it offers | Extensions load in child? | How kankaku misbehaves today |
|---|---|---|---|---|---|---|
| gentle-pi `subagent_run` (task mode) | `subagent_run` | out of process | `GENTLE_PI_AGENTS_CHILD=1` | pid/parentPid (same project); taskId (parent-side only) | yes (same pi build, same extension set) | Correctly joined **only when same worktree**; otherwise silently orphaned, undercounted, unsyncable (§2.A). |
| gentle-pi `subagent_run` (background, outlives parent) | `subagent_run` | out of process, `detached: true` | `GENTLE_PI_AGENTS_CHILD=1` | pid/parentPid; taskId | yes | Handled correctly today **when** matched (union already accounts for late settlement, per `AGENTS.md`); same orphan risk cross-worktree. |
| gentle-pi `subagent_run` (cross-worktree) | `subagent_run` | out of process, different `cwd` | `GENTLE_PI_AGENTS_CHILD=1` | pid/parentPid (true, but unusable — different `worklog.jsonl`) | yes | **Invisible everywhere**: orphaned locally, unsyncable to the hub (§2.A) — the sharpest bug this proposal fixes. |
| pi bundled reference example | `subagent` | out of process | none | none | not confirmed | **Double-counted**: `detectRole` defaults it to `"orchestrator"` — a phantom top-level task on top of its parent's tool-call span. |
| `pi-subagents` (foreground) | `subagent` | in process | none observable from outside (in-process) | none | n/a — same process | Not currently a distinct kankaku process at all; relevant once in-process nesting is handled (§2.C) since kankaku's own factory would re-run. |
| `pi-subagents` (background) | `subagent` | out of process | `PI_SUBAGENT_PARENT_SESSION` (parent-injected) | session id (via a JSON config file path in argv); parent session id via env | not confirmed | Currently double-counted exactly like the reference example — same tool name, no gentle-pi marker recognised. |
| configured third-party tool | user-defined | either | user-defined via `KANKAKU_SUBAGENT_CHILD_ENV` | whatever the user configures | depends | Currently invisible as a subagent concept entirely; today it is not even recognised as a subagent-opening tool call, so its span is not measured as `mode`/`agent` at all, only as an ordinary tool call. |
| in-process nesting (`createAgentSession`), usage forwarded | n/a (tool-internal) | in process | none (same process, same env) | none native; the triggering tool's own toolCallId | yes (factory re-invoked, §2.C) | Nested `WorkRecord` may double-count as a second same-pid orchestrator task (§2.C); `result.usage`, when the tool sets it, is never read (§2.C(b)), so cost from a non-cooperating nested call is invisible even when available. |
| in-process nesting, usage not forwarded | n/a | in process | none | none | yes | Nested cost entirely unobservable — no signal exists to recover it. |
| unknown/unrecognised child | any | either | none | none | unknown | Defaults to `"orchestrator"` — double-counted (the general case of the two `subagent`-named examples above). |
| two unrelated terminals, same repo | n/a — not a subagent relationship at all | n/a | n/a | none that should ever apply | n/a | Not a bug today (each is correctly its own orchestrator), but a naming/design hazard for this proposal: time containment alone must never treat these as parent/child (§4). |
| wrapper-shell spawn (e.g. a shell script that execs pi) | depends on the wrapper | out of process | depends | pid/parentPid, if the wrapper is a thin exec (no extra hop) | depends | Ancestor-chain detection (§4) must walk past a non-pi intermediate process; a shell wrapper that `spawn`s (not `exec`s) pi adds a hop ancestry must skip over, not stop at. |
| Windows / no `ps` | n/a | n/a | n/a | env markers and explicit ids only | n/a | Ancestor-chain detection unavailable; must fall back gracefully (§2.D), never block or crash. |

## 4. Goals and non-goals

**Goals**

- Recognise subagent children from more than one mechanism, without code
  changes, via a configurable profile and a small built-in set.
- Make gentle-pi's own support strictly richer than the generic path: task
  id, status, mode, cwd, and (new) cross-worktree correctness that no other
  profile gets for free.
- Invert the unsafe default: a process this design cannot positively prove
  is a top-level orchestrator must never again silently become one.
- Fix the two correctness bugs that already cost real money today
  (phantom-orchestrator double count; gentle-pi cross-worktree orphan)
  before adding any new abstraction — see `phase-6`'s ordering.
- Make undercount observable (a diagnostic command), since undercount is
  recoverable and silent overcount is not.
- Stay strictly additive to `WorkRecord`'s persisted shape: no
  `WORK_RECORD_SCHEMA` bump for this feature; every existing record and
  report keeps working unchanged.

**Non-goals**

- Guaranteeing detection of every conceivable subagent mechanism —
  unrecognised mechanisms fall safely into "uncertain," not silently into
  either miscount direction.
- Solving ancestor-chain detection on Windows in the first version (§2.D).
- Re-implementing the interval-union aggregation rule anywhere but
  kankaku's domain layer (ADR 0006 stays in force — see §4 "The
  cross-worktree problem").
- A general-purpose "any two pi processes might be related" heuristic:
  time containment alone is explicitly rejected as a join key (below).

## 5. Design

### 5.1 Subagent profile abstraction

A pure domain type, `SubagentProfile` (planned:
`kankaku/src/domain/subagent-profile.ts`), following the same hexagonal
split as the rest of the codebase — pure data and pure matching functions
in `domain/`, all I/O (env reads, process listing, file reads) supplied by
adapters, mirroring how `WorkTracker` already receives `interactiveTools`/
`subagentTool` as injected config rather than reading `process.env` itself.

A profile declares:

- `id` — a stable name (`"gentle-pi"`, `"pi-reference"`, `"pi-subagents"`,
  `"configured"`).
- `toolNames: string[]` — tool names that open a subagent span, replacing
  the single hardcoded `SUBAGENT_TOOL` string (`config.ts:19`) with a set
  `WorkTracker.onToolStart` checks membership against instead of `===`
  (`work-tracker.ts:131`).
- `readLaunchArgs(toolName, args) => { agent?, mode? }` — generalises the
  existing inline reads of `args["agent"]`/`args["mode"]`
  (`work-tracker.ts:132-133`).
- `readResult(result) => { taskId?, agent?, status?, mode?, cwd?, usage? }`
  — generalises `extractTaskId` (`work-tracker.ts:280-288`) into a full
  reader per profile's own result shape, **and**, new, reads `result.usage`
  when the profile's own docs promise it (gentle-pi does not; a future
  `@d3ara1n/pi-subagent` profile would, per §2.B).
- `childEnvMarkers: Array<{ name: string; value?: string }>` — env
  var(s) that mark a process as this profile's child. A profile with none
  (pi's reference example) declares an empty array and is documented as
  "cannot self-identify as a child from its own environment; ancestry is
  the only signal available for it."
- `joinKeyConfidence` — which join keys this profile can offer and at what
  confidence (below).

**Built-in profiles**: **gentle-pi** (first-class — task id, status, mode,
cwd all read from `result.details.gentleAgents`, matching §2.B's table
exactly), **pi reference example** (tool `subagent`, no env marker,
ancestry-only, always starts "uncertain" — see §5.3), and **pi-subagents**
(tool `subagent`, env marker `PI_SUBAGENT_PARENT_SESSION` when present,
foreground mode explicitly out of scope for process-level detection since
it never becomes a separate OS process — see §5.4 for how in-process cases
are handled instead). A fourth, **configured**, profile is built from two
new env vars, modelled directly on existing parsing conventions:

- `KANKAKU_SUBAGENT_TOOLS` — comma-separated tool names, parsed exactly
  like `KANKAKU_INTERACTIVE_TOOLS` (`config.ts:75-81`); merged into (not
  replacing) the built-in tool name set, so configuring a third-party tool
  never silently stops recognising gentle-pi's own.
- `KANKAKU_SUBAGENT_CHILD_ENV` — `;`-separated `NAME=VALUE` pairs, parsed
  like `KANKAKU_SEGMENTS`'s `tag=tool:regex` rules
  (`parseSegmentRules`, `config.ts:44-71`): malformed entries are skipped,
  not fatal to the rest of the variable. Accumulated via a `Map`, emitted
  once through `Object.fromEntries` — never `obj[key] = value` on a plain
  object — matching the codebase's existing prototype-pollution guard
  convention (`kankaku-hub/docs/architecture/kankaku-extension.md`
  "Prototype-pollution guards" table), since both tool names and env var
  names ultimately trace back to configuration a user could set to
  `__proto__`.

Because `pi-subagents` and pi's bundled example both register a tool
literally named `subagent` (§2.B), profile matching is never tool-name-only:
a tool-name match narrows candidates, and env markers (when present) pick
among them; when no env marker resolves the ambiguity, the record is
"uncertain," never guessed (§5.3).

### 5.2 Join keys, ranked by confidence

1. **Explicit shared id (high)** — gentle-pi's `taskId`, already captured
   on the orchestrator's own `SubagentSpan` (`work-tracker.ts:155-164`) but
   never used for joining today. This proposal keeps using it
   **parent-side only**: investigation confirmed the gentle-pi child
   cannot read its own task id from env or args (§2.B) — no `childArguments`
   flag and no spawn-env variable carries it. Recording a task id on the
   *child's own* record is therefore not implementable purely inside
   kankaku today; it depends on gentle-pi choosing to pass one (see Open
   Questions — a first-class-support request, not something kankaku can
   build unilaterally). Until then, high-confidence joining stays scoped
   to same-file matches, exactly as today, **plus** the machine-wide
   registry path below for the cross-worktree case, which does not need
   the child to know its task id at all.
2. **Pid ancestry against a registry of live tracked processes (medium)**
   — every kankaku process (orchestrator or subagent) writes a cheap entry
   to the machine-wide registry (`~/.kankaku/run/<pid>.json`, §2.D) at
   `session_start`, alongside its existing inflight checkpoint. A subagent
   process (own `pid`/`parentPid` already known, per the existing capture
   at `extension.ts:132-133`) resolves its true ancestor's identity —
   pid, project, `startedAt` — by walking the OS ancestor chain (§2.D's
   OS-specific mechanism) and matching against registry entries, then
   records that discovery on **its own** record as a new optional field
   (`orchestratorRef?: { pid, project, startedAt }`). This works
   cross-worktree because the registry is not keyed by `KANKAKU_DIR` at
   all. `project` equality is downgraded from a hard filter to a **hint**:
   `matchChildren` still prefers a same-project match when one exists, but
   a cross-project match backed by a live registry entry plus pid/parentPid
   ancestry is now eligible too.
3. **Time containment alone (never an auto-join)** — two processes whose
   intervals happen to overlap in the same repository (the "two unrelated
   terminals" scenario, §3) must never be joined on that basis; it produces
   exactly the false-positive union the "two terminals" scenario in the
   spec exists to catch. At most, a process with no confirmed relationship
   but a suggestive time/project overlap is surfaced as a **labelled
   suggestion** in the `/kankaku doctor` diagnostic (§5.6) — visible to a
   human, never auto-applied.

### 5.3 Generic, cooperation-free role detection — and its limits

For a process with no recognised child-env-marker at all (pi's bundled
example; an unknown `subagent`-named tool; a genuinely new mechanism),
kankaku walks its OS ancestor chain (§2.D: one cheap snapshot on
macOS/Linux, graceful no-op on Windows) looking for a live registry entry
belonging to a process that itself already resolved as `"orchestrator"`.
Finding one raises confidence but never to "confirmed" — ancestry proves
*process lineage*, not that the ancestor is this specific run's logical
parent (a long-lived shell could be ancestor to many unrelated pi
invocations over a session). What ancestry **cannot** cover: a detached
child that outlives and is reparented away from its true parent before
kankaku ever inspects it (the existing `pid`/`parentPid` capture already
documents this limitation for gentle-pi itself — captured once at factory
time, unaffected by later reparenting); any relationship across machines;
and, on Windows in v1, anything at all (falls back to env markers only).

### 5.4 The safe default inverted

This is the core policy change. Today `detectRole` returns exactly two
values and defaults everything unrecognised to `"orchestrator"`
(`config.ts:97-99`) — the unsafe default this proposal exists to remove.

**New states a record can be in** (a classification `TaskView`/reporting
code apply, not a change to the persisted `role` enum's two values — see
§7 for why the wire shape stays binary):

| State | Meaning | Counted in local reports | Counted in hub sync |
|---|---|---|---|
| **orchestrator** | Confirmed top-level: no recognised child-env-marker present, and (new) either no live registry entry for an ancestor pid, or `session_start` fired for this process (a nested nested session never gets `session_start`, §2.C — useful corroboration, not by itself sufficient) | Yes, as its own task | Yes |
| **subagent-joined** | Matched to an orchestrator via §5.2's ranked keys | Folded into its task, as today | Folded into its task's row, as today |
| **subagent-unjoined (orphan)** | Recognised as *someone's* child (an env marker matched a known profile) but no orchestrator could be matched | Shown separately, never dropped (as today, `orphanSubagents`) | **Not synced as its own task** (unchanged — sync is task-anchored); flagged by `/kankaku doctor` so the gap is visible, addressed by §5.5's reunification path rather than by inventing a synthetic task |
| **uncertain** | No child-env-marker matched *and* no confirmed-orchestrator ancestor found either — the process cannot be proven top-level *or* proven a child | **Not** counted as a new top-level task by default; shown in a distinct "uncertain" bucket in `/kankaku doctor` and in `/kankaku all`-style reports, so the gap is visible instead of silently wrong | Not synced as its own task until a human/config resolves the ambiguity (e.g. adding the tool to `KANKAKU_SUBAGENT_TOOLS` with an env marker) |

The asymmetry is deliberate: an orphan or uncertain record produces
**undercount**, which is recoverable — once the missing link is found
(better profile config, a fixed registry entry, a future gentle-pi
cooperation improvement), a later `/kankaku sync all` or `backfill` can
pick it up, because the record itself was never lost, only unjoined.
Silently promoting an uncertain record to `"orchestrator"` produces
**overcount**, which is not recoverable after the fact without a human
manually finding and correcting a double-billed task — exactly today's
bug with the two `subagent`-named examples in §3.

### 5.5 The cross-worktree problem

§2.A establishes the child's record is not just unjoined but genuinely
unsyncable today. The fix has two layers:

1. **Local reunification, before `buildTasks` ever runs**, using the §5.2
   registry: `matchChildren` gains a second pass over records that failed
   the same-file match, considering registry-corroborated cross-project
   candidates with `project` downgraded to a hint. This is deliberately
   the preferred path, because it keeps ADR 0006 — "the aggregation rule
   exists exactly once, in kankaku" — fully intact: `unionMs` still runs
   locally, once, over a (now richer) candidate list, and only a single,
   already-consolidated `TaskView` is ever pushed to the hub, exactly as
   today.
2. **What the hub does *not* do, and why**: the task instructions
   explicitly ask whether the hub should own cross-repo joins, given ADR
   0006's "the aggregation rule lives once in kankaku." It should not, and
   the reason is arithmetic, not merely architectural taste: if local
   reunification fails (the registry entry already expired by the time
   sync runs — a real possibility, since sync can lag behind process exit)
   and worktree A's orchestrator and worktree B's now-hub-visible task
   (were one to be invented) each independently ran `unionMs` over their
   *own*, necessarily incomplete, interval sets, their two `wall_ms`
   values are **not disjoint** — they overlap by construction (the child
   ran concurrently with part of the parent's span). Summing two
   independently-unioned, overlapping rows server-side double-counts
   exactly the overlapping seconds; it is not the same operation as
   `unionMs` and cannot be substituted for it. So: no synthetic
   `task_entries` row is invented for an orphaned cross-worktree child, and
   the hub never sums two rows to "recover" a missing union. The only
   hub-side accommodation considered is a purely **cosmetic**, optional
   nullable self-relation (`linked_task_id`) kankaku could set when it
   uploads a task it knows — from a since-expired registry entry, say — was
   probably one side of a pair it could not fully reunite locally; the web
   would use it only to visually group two rows, never to sum their times.
   This is explicitly **not** built in this proposal's first phase (see
   `phase-6`) — it is a fallback for the case local reunification's own
   TTL genuinely lost the link, not a routine mechanism.

### 5.6 In-process subagents

Two distinct problems, both addressed:

- **Cost recovery**: `WorkTracker.onToolEnd` starts reading `result.usage`
  (when a profile's `readResult` says the tool sets it) on the *triggering*
  tool call — the same `SubagentSpan` gentle-pi's `taskId` already attaches
  to (`work-tracker.ts:152-165`) — so nested-session cost is attributed
  once, to the parent record, via the exact mechanism
  `docs/extensions.md:2015` already documents pi as supporting
  (`toolResults[i].usage`, confirmed in §2.C(b)). No new persisted field is
  required: `UsageTotals` already exists per record
  (`work-record.ts:8-14`); this only changes what populates it for a
  matched profile.
- **The shared-pid double-instance problem** (§2.C(a)): since the factory
  genuinely re-runs for a nested session in the same process, a second
  `WorkRecord` with the same `pid`/`parentPid`/`project` and (absent
  further signal) the same `role: "orchestrator"` can be produced. Rather
  than trying to suppress the nested instance (no native "I am nested"
  signal exists to key that suppression on, §2.C(c)), `buildTasks` treats
  two `role: "orchestrator"` records sharing a `pid` with overlapping
  `[startedAt, settledAt]` windows as a same-process-nesting suspect:
  their wall time is **unioned**, not summed (reusing the same `unionMs`
  primitive already used for orchestrator+subagent union, `intervals.ts`),
  and the pair is flagged in `/kankaku doctor` as "likely in-process
  nesting" so it stays visible rather than silently either double-counted
  or silently merged without a trace.

### 5.7 What gentle-pi users get that others do not

Concretely, with gentle-pi configured: agent name, mode (`task`/
`background`), task id, live status, and cwd on every subagent span
(already true today, `extractTaskId`); plus, new from this proposal,
cross-worktree correctness via the machine-wide registry (§5.5) — no other
profile gets a registry-backed reunification path in the first phase,
since only gentle-pi's `pid`/`parentPid` are already proven reliable
across worktrees (§2.A's "sharper" finding: `detectRole` already correctly
marks the child `"subagent"` cross-worktree; the registry only needed to
fix *where* that gets discovered, not *whether* the marker survives). A
non-cooperating or partially-cooperating profile (no env marker, no result
shape) gets, at best, ancestry-based "uncertain," never gentle-pi's
confirmed join.

### 5.8 Observability — `/kankaku doctor`

A new subcommand (`kankaku-command.ts`, alongside the existing `/kankaku
sync status`-style read-only reports) reporting, with no network call:
which profile matched each of today's records (by tool name/env marker),
a count of orphan and uncertain records with their reason (no env marker
matched; env marker matched but no orchestrator found; ambiguous tool-name
match with no distinguishing marker; likely in-process nesting), and the
current registry/ancestry availability on this platform (e.g. "ancestor
detection unavailable: Windows"). This is the mechanism that makes §5.4's
undercount visible instead of silent — the entire point of inverting the
default is defeated if the resulting orphans are just as invisible as
today's phantom orchestrators were loud.

## 6. Alternatives considered and rejected

- **Keep a single hardcoded tool name, add more `===` branches per known
  package.** Rejected: does not scale past a handful of packages, and
  every branch needs its own env-marker/result-shape knowledge hardcoded
  into `work-tracker.ts`, which should stay pure and profile-agnostic.
- **Trust time-containment-plus-project as a join key, dropping the pid
  requirement.** Rejected explicitly: this is exactly the "two unrelated
  terminals in the same repo" false-positive the spec's scenarios guard
  against — two independent orchestrator sessions in one repo would be
  misjoined into one task.
- **Let the hub reconcile cross-worktree children by summing two
  independently-synced rows.** Rejected: arithmetically wrong when the two
  local unions overlap in wall-clock time (§5.5) and violates ADR 0006's
  "exactly once" boundary regardless.
- **Default unrecognised processes to `"subagent"` instead of
  `"orchestrator"`.** Rejected: trades one silent-wrong default for
  another — an actual top-level session (a user running pi directly with
  some unrelated ancestor process, e.g. a terminal multiplexer) would
  vanish from every report. Hence a genuine third state ("uncertain"),
  not a flipped binary default.
- **Bump `WORK_RECORD_SCHEMA` to add a `role: "uncertain"` enum value
  directly.** Rejected: `isWorkRecord`'s `ROLES` check
  (`work-record.ts:89,109`) would reject the third value entirely under
  an *older* kankaku build reading a *newer* record, silently dropping it
  from `readAll()` — arguably tolerable, but unnecessary. Keeping `role`
  binary and adding an optional `roleConfidence`/`profile` field alongside
  it is strictly additive: an older reader simply ignores fields it does
  not know, exactly the schema-versioning contract `RECID-REQ-002`/
  `RECID-REQ-004` (`kankaku-hub/docs/specs/record-identity.md`) already
  establishes for the hub-identity fields.
- **Have the child self-report a task id it cannot actually read
  (guessing/deriving one).** Rejected: investigated and confirmed
  infeasible for gentle-pi as currently implemented (§2.B, §5.2); noted as
  an upstream cooperation request instead of worked around with a fragile
  heuristic (e.g. scanning `~/.pi/agent/gentle-agents/tasks/*.json` for a
  `sessionPath` matching this process's own session file was considered
  and rejected as a private-storage-format coupling this design should not
  take on).

## 7. Migration and compatibility

kankaku is a published npm package; existing `worklog.jsonl` files and
existing consumers must keep working unchanged.

- `WORK_RECORD_SCHEMA` stays `1`. Every new field this design proposes
  (`roleConfidence`, `profile`, `orchestratorRef`, and the extended
  `SubagentSpan.taskId` usage) is optional, following exactly the pattern
  `RECID-REQ-002` already sets for the hub-identity fields
  (`kankaku-hub/docs/specs/record-identity.md`).
- `isWorkRecord` (`work-record.ts:102-135`) needs new optional-field type
  guards for each addition, the same shape as its existing
  `record["clientId"] === undefined || typeof ... === "string"` checks —
  additive, never a new required field.
- `role`'s two persisted values (`"orchestrator"` | `"subagent"`) do not
  change; a record from a build predating this feature reads back
  identically to today.
- `config.subagentTool` (singular) becomes `config.subagentTools` (plural)
  internally; `KANKAKU_SUBAGENT_TOOLS` is additive to, never a replacement
  for, the built-in gentle-pi tool set, so a user who never sets it keeps
  today's exact behaviour.
- `matchChildren`'s existing exact-match pass is unchanged and stays the
  primary path; the registry-backed second pass only ever adds candidates
  it would otherwise have missed, never removes an existing match.

## 8. Test strategy

Planned test files (none exist yet — this is a proposal):

- `kankaku/tests/subagent-profile.test.ts` — profile matching, tool-name
  ambiguity resolution, `KANKAKU_SUBAGENT_TOOLS`/`KANKAKU_SUBAGENT_CHILD_ENV`
  parsing including malformed-entry tolerance (mirroring
  `tests/config.test.ts`'s existing `KANKAKU_SEGMENTS` coverage style).
- `kankaku/tests/task-view.test.ts` (extended) — the registry-backed second
  matching pass; same-pid overlapping-orchestrator union (in-process
  nesting); orphan/uncertain classification.
- `kankaku/tests/work-tracker.test.ts` (extended) — `result.usage` reading
  on a matched profile's subagent tool call.
- `kankaku/tests/process-registry.test.ts` (new adapter) — machine-wide
  registry read/write/staleness.
- `kankaku/tests/ancestry.test.ts` (new adapter) — OS-specific ancestor
  walk, with the Windows path asserting graceful no-op rather than a
  thrown error.
- `kankaku/tests/kankaku-command.test.ts` (extended) — `/kankaku doctor`
  output shape and content, no network call.

All fake-clock/fake-pi/no-real-process, per `kankaku/AGENTS.md`'s existing
testing rules; ancestry/registry adapters get injectable OS-call
dependencies exactly like `Clock`.

## 9. Phased rollout

See [`../phases/phase-6-generic-subagent-support.md`](../phases/phase-6-generic-subagent-support.md).
Ordered so the first sub-phase fixes the two bugs that already cost money
today — the phantom-orchestrator double count and the gentle-pi
cross-worktree orphan — before any profile abstraction is introduced.

## 10. Open questions that remain

1. **gentle-pi cooperation**: would gentle-pi be willing to pass the
   child its own task id (e.g. reusing the `GENTLE_PI_AGENTS_OWNED_IPC`
   pattern, or a new `GENTLE_PI_AGENTS_TASK_ID` env var)? This would raise
   the cross-worktree join from "registry + ancestry, medium confidence"
   to "explicit id, high confidence" without kankaku needing the registry
   at all for the gentle-pi case specifically. Not something this proposal
   can resolve unilaterally.
2. Should `pi-background-tasks` and `@d3ara1n/pi-subagent` (§2.B) become
   built-in profiles in a later phase, given both offer stronger signals
   (unconditional task-id env var; `usage` directly on the result) than
   the two profiles built in first? Recommendation: yes, once the core
   abstraction ships and has real usage — see `phase-6`'s "Next steps".
3. What is the correct behaviour when `createAgentSession` is called
   without `bindExtensions` (§2.C) — is that an intentional "headless,
   uninstrumented" contract from pi's own perspective, or an edge case
   well-behaved callers are expected to avoid? Affects how confidently
   §5.6's in-process guard can rely on `session_start` as a corroborating
   signal.
4. Should the machine-wide registry (§2.D, §5.2) also back a future
   `/kankaku` "what's running right now, across every project" view, given
   it necessarily already tracks that? Out of scope for this proposal but
   a plausible reuse.
5. The optional `linked_task_id` hub self-relation (§5.5) — worth building
   at all, or should an orphaned cross-worktree child simply stay invisible
   in the hub until local reunification succeeds (or the user re-runs
   sync after fixing the registry)? Leaning toward: do not build it in
   phase-6; revisit only if the registry's TTL turns out to lose links in
   practice.

## Related

- ADRs: [0020](../adr/0020-subagent-profiles-gentle-pi-first-class.md),
  [0021](../adr/0021-join-by-explicit-id-then-ancestry.md),
  [0022](../adr/0022-uncertain-children-never-become-orchestrators.md),
  [0023](../adr/0023-cross-worktree-children-reunited-locally-first.md)
- Spec: [`../specs/subagent-detection.md`](../specs/subagent-detection.md)
- Phase: [`../phases/phase-6-generic-subagent-support.md`](../phases/phase-6-generic-subagent-support.md)
- Code (existing): `kankaku/src/config.ts`, `kankaku/src/domain/work-tracker.ts`,
  `kankaku/src/domain/task-view.ts`, `kankaku/src/domain/work-record.ts`,
  `kankaku/src/extension.ts`, `kankaku/src/adapters/pi-tracker.ts`,
  `kankaku/src/adapters/kankaku-dir.ts`, `kankaku/src/adapters/file-inflight-store.ts`
- Architecture: [`../architecture/aggregation.md`](../architecture/aggregation.md),
  [`../architecture/kankaku-extension.md`](../architecture/kankaku-extension.md)
