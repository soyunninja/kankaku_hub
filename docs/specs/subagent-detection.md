# Subagent detection

| | |
|---|---|
| Status | planned |
| Phase | [phase-6-generic-subagent-support](../phases/phase-6-generic-subagent-support.md) |
| Owners repos | kankaku |
| Related ADRs | [0006](../adr/0006-aggregation-rule-lives-once-in-kankaku.md), [0020](../adr/0020-subagent-profiles-gentle-pi-first-class.md), [0021](../adr/0021-join-by-explicit-id-then-ancestry.md), [0022](../adr/0022-uncertain-children-never-become-orchestrators.md), [0023](../adr/0023-cross-worktree-children-reunited-locally-first.md) |
| Code | none yet — planned: `kankaku/src/domain/subagent-profile.ts`, `kankaku/src/domain/task-view.ts` (extended), `kankaku/src/domain/work-tracker.ts` (extended), `kankaku/src/ports/process-registry.ts`, `kankaku/src/adapters/machine-process-registry.ts`, `kankaku/src/adapters/ancestry.ts`, `kankaku/src/adapters/kankaku-command.ts` (extended) |
| Tests | none yet — see Traceability |

## Purpose

Defines how kankaku recognises a subagent process from more than one
mechanism (gentle-pi, pi's bundled reference example, the `pi-subagents`
package, and any user-configured tool/env-marker pair), how it joins a
recognised child to its orchestrator, and — critically — how it classifies
a process it cannot positively prove is either, so that an unrecognised
mechanism produces recoverable undercount rather than unrecoverable
overcount. See
[the proposal](../proposals/2026-09-20-generic-subagent-detection.md) for
full evidence and design rationale.

## Requirements

1. `SUBAGENT-REQ-001` — The system SHALL support multiple subagent
   profiles, each declaring the tool name(s) that open a subagent span, how
   to read `agent`/`mode` from launch args, how to read `taskId`/`status`/
   `cwd`/`usage` from the tool result, and which env var(s) mark a child
   process of that profile — matched by tool name and env markers, never a
   single hardcoded tool name.
2. `SUBAGENT-REQ-002` — `KANKAKU_SUBAGENT_TOOLS` SHALL be parsed as a
   comma-separated list of additional tool names, additive to every
   built-in profile's tool names, using the same tolerant
   trim-and-filter-empty parsing as `KANKAKU_INTERACTIVE_TOOLS`.
3. `SUBAGENT-REQ-003` — `KANKAKU_SUBAGENT_CHILD_ENV` SHALL be parsed as a
   `;`-separated list of `NAME=VALUE` pairs identifying a child-process env
   marker, skipping malformed entries (missing `=`, empty name, empty
   value) rather than failing the whole variable, using the same tolerant
   convention as `KANKAKU_SEGMENTS`'s `tag=tool:regex` parsing.
4. `SUBAGENT-REQ-004` — The built-in gentle-pi profile SHALL read `taskId`,
   `agent`, `status`, `mode`, and `cwd` from
   `result.details.gentleAgents`, preserving today's `extractTaskId`
   behaviour unchanged.
5. `SUBAGENT-REQ-005` — When two or more profiles register the same tool
   name, the system SHALL resolve the ambiguity using each candidate
   profile's child-env markers, and SHALL classify the record `uncertain`
   (never guess a profile) when no marker resolves the ambiguity.
6. `SUBAGENT-REQ-006` — When a matched profile's `readResult` reports a
   `usage` value on a subagent tool's result, that usage SHALL be added to
   the triggering (parent) record's usage totals.
7. `SUBAGENT-REQ-007` — The join process SHALL attempt, strictly in order:
   (a) an explicit shared id, when a profile provides one; (b) pid ancestry
   corroborated by a live entry in the machine-wide process registry; then
   SHALL stop — time containment alone SHALL NEVER by itself join two
   records.
8. `SUBAGENT-REQ-008` — `project` (repo/cwd) equality SHALL be treated as a
   hint that is preferred when available, never as a hard filter that
   excludes an otherwise-eligible cross-project match established via
   `SUBAGENT-REQ-007`(b).
9. `SUBAGENT-REQ-009` — Every kankaku process SHALL write a machine-wide
   registry entry at `~/.kankaku/run/<pid>.json` (independent of any
   project's `KANKAKU_DIR`) at session start, recording at least `pid`,
   `parentPid`, `role`, `project`, and `startedAt`.
10. `SUBAGENT-REQ-010` — The registry SHALL be swept for stale or
    dead-process entries using a liveness check (mirroring the existing
    inflight-checkpoint staleness pattern), not left to grow unbounded.
11. `SUBAGENT-REQ-011` — Ancestor-chain lookup SHALL use one
    single-snapshot mechanism per process (one `ps -eo pid,ppid` call on
    macOS; direct `/proc/<pid>/status` reads on Linux), never one
    subprocess spawn per ancestor hop.
12. `SUBAGENT-REQ-012` — On a platform with no supported ancestor-chain
    mechanism (Windows in the first version), ancestor-chain detection
    SHALL no-op gracefully — never block, throw, or crash the extension —
    and SHALL fall back to env-marker-only detection.
13. `SUBAGENT-REQ-013` — A record's classification SHALL be exactly one of
    `orchestrator` (confirmed: no recognised child-env-marker present),
    `subagent-joined`, `subagent-unjoined` (orphan), or `uncertain`. An
    unrecognised process SHALL NOT default to `orchestrator`.
14. `SUBAGENT-REQ-014` — An `uncertain` or `subagent-unjoined` record SHALL
    NOT be counted as a new top-level task in local reports, and SHALL NOT
    be synced to the hub as its own task row.
15. `SUBAGENT-REQ-015` — Two `role: "orchestrator"` records sharing the
    same `pid` with overlapping `[startedAt, settledAt]` windows SHALL have
    their wall time unioned (never summed) via the existing `unionMs`
    primitive, and SHALL be flagged as likely in-process nesting.
16. `SUBAGENT-REQ-016` — Every new optional field introduced for this
    capability (e.g. `roleConfidence`, `profile`, `orchestratorRef`) SHALL
    NOT require a `WORK_RECORD_SCHEMA` version bump, and a record without
    these fields SHALL remain valid per `isWorkRecord`.
17. `SUBAGENT-REQ-017` — `/kankaku doctor` SHALL report, without any
    network call: which profile matched each of today's records, a count
    of orphan and uncertain records with their reason, and whether
    ancestor-chain detection is available on the current platform.
18. `SUBAGENT-REQ-018` — The hub SHALL NEVER sum two independently-synced
    task rows to recover a cross-worktree parent/child union; a
    consolidated row is only ever produced by local reunification
    (`SUBAGENT-REQ-007` through `SUBAGENT-REQ-009`) before sync runs.
19. `SUBAGENT-REQ-019` — A registry entry SHALL identify a process
    INSTANCE, not a pid: it SHALL carry the process's OS start time, and an
    ancestor SHALL be matched only when the entry's recorded start time and
    a fresh reading for the live pid agree within a small tolerance. A
    pid-only match is never sufficient: the OS reuses pids, and a stale
    entry whose pid was later reused by the user's shell would mark every
    genuine session launched from it as uncertain, silently dropping
    billable work. When the start time cannot be obtained the match is NOT
    proven and the process falls back to the pre-registry behaviour. (Added
    2026-09-20 after the 6a review found this defect in the first
    implementation; see ADR 0023 "Consequences".)
20. `SUBAGENT-REQ-020` — Every process SHALL remove its own registry entry
    on exit (verifying pid and identity first, never another process's
    file), and the sweep SHALL also discard entries that are dead,
    stale-by-reuse (pid alive, identity mismatch), unverifiable (no
    recorded identity, e.g. written by an older build) or over a maximum
    age. `/kankaku doctor` SHALL report how many were discarded and why.

## Scenarios

### Scenario: gentle-pi task-mode subagent joins normally (`SUBAGENT-REQ-004`, `SUBAGENT-REQ-007`)

- **Given** an orchestrator spawns a gentle-pi `subagent_run` child in
  `task` mode, in the same worktree
- **When** the child settles and the orchestrator's task is built
- **Then** the child is joined via `pid`/`parentPid`/time (as today), and
  its `taskId`/`agent`/`status`/`mode`/`cwd` are available from the
  orchestrator's `SubagentSpan`

### Scenario: gentle-pi background subagent outlives its orchestrator (`SUBAGENT-REQ-004`, `SUBAGENT-REQ-007`)

- **Given** a gentle-pi `subagent_run` child started in `background` mode,
  in the same worktree, still running after its orchestrator settles
- **When** the child later settles and a sync/report runs
- **Then** the task's `wallMs` extends to cover the child's later
  settlement (existing union behaviour, unchanged), and the join still
  succeeds via `pid`/`parentPid`

### Scenario: gentle-pi cross-worktree subagent is reunited locally (`SUBAGENT-REQ-007`, `SUBAGENT-REQ-008`, `SUBAGENT-REQ-009`)

- **Given** an orchestrator in worktree A spawns a gentle-pi `subagent_run`
  child that runs in worktree B (a different `KANKAKU_DIR`/`worklog.jsonl`)
- **When** the child starts, it walks its OS ancestor chain, finds a live
  machine-wide registry entry for the orchestrator's pid, and records
  `orchestratorRef` on its own record
- **Then** `matchChildren`'s registry-corroborated pass joins the two
  records despite their different `project` values, and exactly one
  consolidated `task_entries` row (not two, not summed) is eligible for
  sync

### Scenario: pi's bundled reference example is not double-counted (`SUBAGENT-REQ-001`, `SUBAGENT-REQ-005`, `SUBAGENT-REQ-013`)

- **Given** an orchestrator calls pi's bundled reference `subagent` tool,
  whose child sets no recognised env marker
- **When** the child process starts and is classified
- **Then** it is classified `uncertain`, not `orchestrator` — it is not
  counted as a second top-level task, and is surfaced in `/kankaku doctor`

### Scenario: a user-configured third-party tool is recognised (`SUBAGENT-REQ-002`, `SUBAGENT-REQ-003`)

- **Given** `KANKAKU_SUBAGENT_TOOLS=my_subagent_tool` and
  `KANKAKU_SUBAGENT_CHILD_ENV=MY_TOOL_CHILD=1` are set
- **When** `my_subagent_tool` is called and its child process sets
  `MY_TOOL_CHILD=1`
- **Then** the child is recognised as a subagent of the configured profile,
  without any change to gentle-pi's own built-in recognition

### Scenario: in-process nesting with forwarded usage (`SUBAGENT-REQ-006`, `SUBAGENT-REQ-015`)

- **Given** a tool calls `createAgentSession` in-process and its result
  carries a `usage` field summarising the nested session's cost
- **When** the tool call settles
- **Then** that usage is added to the triggering record's totals, and if
  the nested session also produced its own same-pid orchestrator record
  with an overlapping window, the two are unioned and flagged as likely
  nesting rather than summed as two separate tasks

### Scenario: in-process nesting without forwarded usage (`SUBAGENT-REQ-006`)

- **Given** a tool calls `createAgentSession` in-process and does not set
  `usage` on its result
- **When** the tool call settles
- **Then** no usage is attributed from that nested call (it remains
  genuinely unobservable, per the proposal's §2.C(b) finding) — the system
  does not fabricate or estimate a value

### Scenario: a genuinely unknown child is never promoted to orchestrator (`SUBAGENT-REQ-013`, `SUBAGENT-REQ-014`)

- **Given** a process with no recognised child-env-marker and no
  registry-corroborated orchestrator ancestor
- **When** it is classified
- **Then** it is `uncertain`, excluded from local top-level task counts and
  from hub sync as its own task, and visible in `/kankaku doctor`'s
  uncertain bucket

### Scenario: two unrelated terminals in the same repo are never joined (`SUBAGENT-REQ-007`, `SUBAGENT-REQ-008`)

- **Given** two independent, unrelated `pi` sessions running in the same
  repository at overlapping times, neither spawned by the other
- **When** task/session views are built
- **Then** they remain two separate orchestrator tasks — shared `project`
  and overlapping time never join them, since no explicit id or
  ancestry-corroborated registry match exists between them

### Scenario: a shell-wrapper spawn is walked past, not stopped at (`SUBAGENT-REQ-011`)

- **Given** a subagent is actually launched via a thin shell wrapper that
  `spawn`s (not `exec`s) the real pi child, adding one extra process hop
- **When** the child walks its ancestor chain looking for a registry entry
- **Then** the walk continues past the non-pi wrapper process to the true
  orchestrator ancestor, rather than stopping at the first ancestor found

### Scenario: Windows falls back gracefully with no ancestor-chain support (`SUBAGENT-REQ-012`)

- **Given** kankaku is running on Windows
- **When** a process needs role classification and no env marker resolves
  it
- **Then** ancestor-chain detection is skipped entirely (no PowerShell/
  `wmic` spawn attempted), the process is classified `uncertain` rather
  than blocking or crashing, and `/kankaku doctor` reports ancestor
  detection as unavailable on this platform

### Scenario: adding optional fields does not bump the schema (`SUBAGENT-REQ-016`)

- **Given** a `WorkRecord` written by a build implementing this spec,
  carrying `roleConfidence`/`profile`/`orchestratorRef`
- **When** `WORK_RECORD_SCHEMA` and `isWorkRecord` are inspected, and the
  record is read by a build predating this spec
- **Then** `WORK_RECORD_SCHEMA` is unchanged, the record validates under
  both builds, and the older build simply ignores the fields it does not
  know

### Scenario: the hub never sums two independent unions (`SUBAGENT-REQ-018`)

- **Given** local reunification failed for a cross-worktree pair (the
  registry entry had already expired) and both sides independently synced
  their own partial task rows
- **When** the hub receives both rows
- **Then** it stores them as two independent `task_entries` rows and never
  sums their `wall_ms` into a combined figure

## Configuration

| Name | Default | Purpose |
|---|---|---|
| `KANKAKU_SUBAGENT_TOOLS` | unset (built-in profiles' tool names only) | Comma-separated additional tool names recognised as subagent-launchers (`SUBAGENT-REQ-002`). |
| `KANKAKU_SUBAGENT_CHILD_ENV` | unset (built-in profiles' markers only) | `;`-separated `NAME=VALUE` child-process env markers for the configured profile (`SUBAGENT-REQ-003`). |
| `~/.kankaku/run/<pid>.json` | — | Machine-wide live-process registry entry, written at session start (`SUBAGENT-REQ-009`), independent of any project's `KANKAKU_DIR`. |

## Edge cases & failure modes

- **Pid reuse across the registry**: an entry for a dead process whose pid
  was reassigned to an unrelated live process must fail its liveness check
  and be swept (`SUBAGENT-REQ-010`) before it could ever produce a false
  ancestry match.
- **A detached child reparented before inspection**: ancestor-chain
  detection can only see the chain as it exists when the child looks —
  a child reparented to init/launchd before that point cannot recover its
  original ancestry this way (documented limitation, not a bug this spec
  fixes; mirrors the existing `pid`/`parentPid`-captured-once-at-factory-time
  limitation already documented in `kankaku/AGENTS.md`).
- **Registry write failure** (no write permission to `~/.kankaku/run/`,
  disk full): must not block or fail the run it would otherwise track —
  same fire-and-forget tolerance the existing inflight checkpoint already
  has for its own writes.
- **A profile's tool name collides with a built-in one but its env marker
  differs** (e.g. a user configures `KANKAKU_SUBAGENT_TOOLS=subagent_run`
  pointing at an unrelated tool): the built-in gentle-pi profile's own env
  marker still takes precedence for a process that actually sets it; a
  process setting neither is `uncertain`, never silently mis-attributed to
  gentle-pi.
- **A machine-wide registry read from a different OS user** (sudo,
  container, CI runner): out of scope — pid/ancestry schemes are
  inherently scoped to processes visible to the invoking user.

## Out of scope

- Solving ancestor-chain detection on Windows beyond graceful no-op — see
  the proposal §2.D and `phase-6`'s "Next steps".
- Passing gentle-pi's `taskId` to the child process itself — depends on
  upstream cooperation, not resolvable inside kankaku alone (proposal Open
  Question #1).
- Built-in profiles for `pi-background-tasks` or `@d3ara1n/pi-subagent` —
  candidates for a later phase (proposal §2.B, Open Question #2), not built
  here.
- The optional `linked_task_id` cosmetic hub self-relation for a failed
  local reunification — deferred (ADR 0023, proposal §5.5).
- Any cross-machine subagent relationship — pid/ancestry schemes are
  host-scoped by construction.

## Traceability

| Requirement | Proof | Status |
|---|---|---|
| `SUBAGENT-REQ-001` | `kankaku/tests/subagent-profile.test.ts` (planned) | not covered |
| `SUBAGENT-REQ-002` | `kankaku/tests/subagent-profile.test.ts` (planned) | not covered |
| `SUBAGENT-REQ-003` | `kankaku/tests/subagent-profile.test.ts` (planned) | not covered |
| `SUBAGENT-REQ-004` | `kankaku/tests/subagent-profile.test.ts` (planned) | not covered |
| `SUBAGENT-REQ-005` | `kankaku/tests/subagent-profile.test.ts` (planned) | not covered |
| `SUBAGENT-REQ-006` | `kankaku/tests/work-tracker.test.ts` (planned extension) | not covered |
| `SUBAGENT-REQ-007` | `kankaku/tests/task-view.test.ts` (planned extension) | not covered |
| `SUBAGENT-REQ-008` | `kankaku/tests/task-view.test.ts` (planned extension) | not covered |
| `SUBAGENT-REQ-009` | `kankaku/tests/process-registry.test.ts` (planned) | not covered |
| `SUBAGENT-REQ-010` | `kankaku/tests/process-registry.test.ts` (planned) | not covered |
| `SUBAGENT-REQ-011` | `kankaku/tests/ancestry.test.ts` (planned) | not covered |
| `SUBAGENT-REQ-012` | `kankaku/tests/ancestry.test.ts` (planned) | not covered |
| `SUBAGENT-REQ-013` | `kankaku/tests/task-view.test.ts` (planned extension) | not covered |
| `SUBAGENT-REQ-014` | `kankaku/tests/task-view.test.ts`, `kankaku/tests/sync-runner.test.ts` (planned extensions) | not covered |
| `SUBAGENT-REQ-015` | `kankaku/tests/task-view.test.ts` (planned extension) | not covered |
| `SUBAGENT-REQ-016` | `kankaku/tests/work-record.test.ts` (planned extension) | not covered |
| `SUBAGENT-REQ-017` | `kankaku/tests/kankaku-command.test.ts` (planned extension) | not covered |
| `SUBAGENT-REQ-018` | not applicable to a kankaku-repo test (hub-side behaviour: absence of a summing code path) | not covered |
| `SUBAGENT-REQ-019` | `kankaku/tests/ancestry-match.test.ts`, `kankaku/tests/ancestry.test.ts` | covered |
| `SUBAGENT-REQ-020` | `kankaku/tests/registry-health.test.ts`, `kankaku/tests/machine-process-registry.test.ts`, `kankaku/tests/kankaku-command.test.ts` | covered |
