# The kankaku extension: hexagonal layout

Repo: [`kankaku`](../../../kankaku) (branch `feat/pocketbase-hub` at the time of
writing, 20 commits ahead of `main`/v0.4.6, unpublished). This document maps
the extension's hexagonal architecture and shows where each hub-related
concern lives. See [`overview.md`](overview.md) for how this fits with the
hub backend, and [`../adr/README.md`](../adr/README.md) for why it is
structured this way.

## Dependency rule

Per the extension's own `AGENTS.md`: dependencies point inward. Adapters
import domain and ports; domain imports nothing outside `src/domain/` and
`src/ports/`. The domain has no `fetch`, no `Date.now()`, no pi imports —
every side effect is behind a port, injected by an adapter.

```
src/
  extension.ts       wiring only, no logic
  config.ts          env var parsing (KankakuConfig, SyncConfig, HubEnvCredentials)
  domain/            pure logic, fully unit-testable without I/O
  ports/             interfaces the domain and orchestration code depend on
  adapters/          I/O: pi events/UI, filesystem, HTTP, cross-process locking
```

## Domain (`src/domain/`)

| File | Responsibility |
|---|---|
| `intervals.ts` | `unionMs(intervals)` — the single interval-merge primitive: sort by start, merge overlapping/adjacent ranges, sum merged durations. Used for waiting spans, segment spans, task wall time, and session wall time. |
| `work-tracker.ts` | `WorkTracker` — stateful accumulation of one record's spans; segments are built in a `Map` and only converted to a plain object via `Object.fromEntries` at the end (prototype-pollution guard, see below). |
| `work-record.ts` | `WorkRecord` types, `WORK_RECORD_SCHEMA`, `isWorkRecord` guard. `WorkRecordMetadata` carries the hub fields: `clientId`, `clientName`, `projectId`, `projectName`, `machine`. |
| `work-target.ts` | `resolveWorkTarget` — pure resolution of `{ clientId, projectId }` from session state / project config / catalog `repo_paths`. |
| `task-view.ts` | `buildTasks`, `buildTaskView`, `buildSessions`, `matchChildren` — see [`aggregation.md`](aggregation.md). |
| `hub-entry.ts` | `buildTaskEntryCreatePayload` / `buildTaskEntryUpdatePayload`, `resolveTaskAssignment` — the create-only assignment rule. See [`../specs/sync-push.md`](../specs/sync-push.md). |
| `sync-plan.ts` | `planSync`, `computeTaskContentHash`, `pruneHashes` — decides which tasks need (re-)pushing. |
| `client-label.ts` | `resolveClient` — precedence logic for the legacy free-text client label. |
| `day.ts`, `export.ts`, `segment-rule.ts` | Local reporting/export helpers, not hub-specific. |

## Ports (`src/ports/`)

| Port | Purpose |
|---|---|
| `catalog.ts` | `Catalog` — `listClients()`, `listProjects(clientId)`. |
| `work-sink.ts` | `WorkSink` — `push(tasks: TaskView[]): Promise<PushTaskResult[]>`. |
| `work-log.ts` | Append/read the local JSONL log. |
| `clock.ts` | `now()`, injected everywhere `Date.now()` would otherwise appear, for deterministic tests. |
| `inflight-store.ts` | Tracks in-progress records for crash recovery. |

## Adapters (`src/adapters/`)

| Adapter | Purpose |
|---|---|
| `pocketbase-client.ts` | Generic HTTP primitive: auth, single-flight authentication, request signing, 401 retry. |
| `pocketbase-catalog.ts` | Maps PocketBase records to domain `Client`/`Project`. |
| `cached-catalog.ts` | Disk cache (`~/.kankaku/catalog.json`) + TTL, wraps any `Catalog`. |
| `pocketbase-sink.ts` | `PocketBaseSink implements WorkSink` — upsert by `task_id`, filter-value escaping. |
| `hub-credentials.ts` | Reads `~/.kankaku/credentials.json` + env vars, validates the hub URL. |
| `project-config.ts` | Reads/writes `<KANKAKU_DIR>/config.json` (`clientId`/`projectId`/legacy `client`). |
| `target-picker.ts` | The `ctx.ui.select` flow — pure UI, no network. |
| `session-target.ts` | Composes catalog access + persistence; decides when to show the picker. |
| `sync-runner.ts` | Orchestrates one sync pass: throttle check, `buildTasks`, `planSync`, `sink.push`, persist state. |
| `sync-state-store.ts` | `sync-state.json` persistence + the cross-process lock (`sync.lock`). |
| `kankaku-command.ts` | Registers and dispatches `/kankaku ...` subcommands. |
| `pi-tracker.ts` | Wires pi lifecycle events (`session_start`, `turn_end`, `agent_settled`, ...) to the domain/adapters above. |
| `report.ts`, `export-writer.ts`, `status-bar.ts`, `jsonl-work-log.ts`, `kankaku-dir.ts`, `session-client.ts`, `file-inflight-store.ts`, `lazy-*.ts` | Local reporting, export, status bar, and crash-recovery concerns, not hub-specific. |

## Where each hub concern lives

| Concern | Layer | File(s) |
|---|---|---|
| Hub credentials & URL validation | adapter | `hub-credentials.ts`, `config.ts` (`validateHubUrl`, `isLocalHost`) |
| Catalog cache | adapter | `cached-catalog.ts` |
| Client/project picker | adapter | `target-picker.ts` (UI), `session-target.ts` (orchestration + persistence) |
| Target/record identity fields | domain | `work-target.ts`, `work-record.ts` |
| Interval-union aggregation | domain | `intervals.ts`, `task-view.ts` |
| Create-only sync payload mapping | domain | `hub-entry.ts` |
| Sync planning (what to push) | domain | `sync-plan.ts` |
| Sync execution, throttle, locking | adapter | `sync-runner.ts`, `sync-state-store.ts` |
| PocketBase HTTP + single-flight auth | adapter | `pocketbase-client.ts` |
| PocketBase catalog read | adapter | `pocketbase-catalog.ts` |
| PocketBase sink (push) | adapter | `pocketbase-sink.ts` |
| `/kankaku` commands (target, catalog, sync, backfill) | adapter | `kankaku-command.ts` |

## Prototype-pollution guards

Several hub-related maps are keyed by content that ultimately traces back to
free-text data (task ids, legacy client labels, segment tags): building an
object with `obj[key] = value` on such keys risks `__proto__`/`constructor`
colliding with `Object.prototype`. The extension's fix, applied consistently:
accumulate into a `Map`, then convert to a plain object once via
`Object.fromEntries(map)` — never assign into a plain object by a
caller-controlled key.

| Guard | File | Commit |
|---|---|---|
| Segment maps (`WorkTracker`) | `work-tracker.ts` | pre-existing pattern |
| Segment summaries (`report.ts`, `task-view.ts`) | `report.ts`, `task-view.ts` | `e473b7f` |
| Home directory resolution | `hub-credentials.ts` (`safeHomeDir` wraps a throwing `homeDir()` provider in try/catch) | `23e7678` |
| Sync hash/label maps (`newHashes`, `unassigned`) | `sync-runner.ts`, `sync-plan.ts` (`pruneHashes`) | `d51e564` |
| Reserved segment/client-label tags (`__proto__`, `constructor`, `prototype`) | `config.ts` (`RESERVED_TAGS`/`isSafeTag`), `client-label.ts` (`RESERVED_NAMES`) | pre-existing |

## Single-flight authentication and filter-value escaping

- **Single-flight auth** (`pocketbase-client.ts#authenticate`, commit
  `8750035`): concurrent callers share one in-flight `authInFlight` promise
  instead of each starting their own `POST /auth-with-password`; cleared on
  settle so a failed attempt doesn't poison later ones. The first (no-cache)
  catalog fetch is additionally bounded by an overall deadline
  (`DEFAULT_FIRST_FETCH_DEADLINE_MS = 5000`) via `AbortSignal.any`, so a
  session never stalls indefinitely waiting on the hub at startup.
- **Filter-value escaping** (`pocketbase-sink.ts#escapeFilterValue`, commit
  `b9666f2`): escapes `\` and `"` before interpolating a value into a
  PocketBase filter string (`field="<value>"`), covered by
  `tests/pocketbase-sink.test.ts` including a task id containing a quote.

## Cross-process lock

`sync-state-store.ts` (`SyncStateStore`): `tryLock()` opens `<KANKAKU_DIR>/sync.lock`
with the exclusive-create flag `"wx"` — only one racing process can ever
create the file; the loser gets `EEXIST` and backs off. A lock older than
`STALE_LOCK_MS` (5 minutes) or owned by a dead pid is recovered by renaming
it to a unique tombstone (atomic `renameSync`) before deleting it, so only
one racer's recovery can succeed and no one clobbers a fresher lock. See
[`../specs/auto-sync-and-locking.md`](../specs/auto-sync-and-locking.md).

## Planned change

A [proposal](../proposals/2026-09-20-generic-subagent-detection.md) would
add a `domain/subagent-profile.ts` (pure, profile matching for gentle-pi,
pi's reference example, `pi-subagents`, and a configured profile) plus two
new adapters — a machine-wide process registry and an OS-specific
ancestor-chain lookup — so subagent recognition stops being a single
hardcoded tool name and env-var check. See
[ADR 0020](../adr/0020-subagent-profiles-gentle-pi-first-class.md) and
[`specs/subagent-detection.md`](../specs/subagent-detection.md).

## Related

- [`overview.md`](overview.md) — system-wide data flow.
- [`aggregation.md`](aggregation.md) — the interval-union rule in detail.
- [`../specs/README.md`](../specs/README.md) — capability specs referencing these files.
- [`../adr/0006-aggregation-rule-lives-once-in-kankaku.md`](../adr/0006-aggregation-rule-lives-once-in-kankaku.md)
