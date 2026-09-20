# System overview

Two repos, one system: **kankaku** (a pi extension) writes and syncs work
records; **kankaku-hub** (PocketBase + a Nuxt SPA) holds the canonical
catalog and the synced, consolidated result. See
[ADR 0009](../adr/0009-separate-repos-instead-of-monorepo.md) for why they
are split.

## Components

| Component | Repo | Role |
|---|---|---|
| pi extension | `kankaku` | Records work time/cost per prompt locally; resolves a client/project target; syncs consolidated task rows to the hub. |
| Local JSONL log | `kankaku` (`.kankaku/worklog.jsonl`) | Append-only source of truth for local records — never rewritten. |
| Catalog cache | `kankaku` (`~/.kankaku/catalog.json`) | Local cache of the hub's clients/projects, so session start never blocks on the network. |
| PocketBase | `kankaku-hub` (`pocketbase/`) | Canonical catalog (clients/projects/tasks) + sink for synced `task_entries`/`work_records`. |
| Nuxt SPA | `kankaku-hub` (`web/`) | Dashboard, catalog management, task board, unassigned queue, entries explorer — a read/write view over PocketBase, never a second aggregation engine. |

## Trust boundaries

- **kankaku → PocketBase**: authenticated as a dedicated `role: "service"`
  account, HTTPS only (or `localhost`/`127.0.0.1` for dev) — see
  [`../specs/security-and-privacy.md`](../specs/security-and-privacy.md).
  The service account can write `task_entries`/`work_records` and read
  `clients`/`projects`/`tasks`, but cannot create/update/delete
  clients/projects/tasks.
- **Web → PocketBase**: authenticated as the `role: "owner"` human account
  (or, for local dev, the account created by
  `scripts/create-dev-accounts.sh`). The owner has full catalog write
  access; both roles can write `task_entries`/`work_records`.
- **kankaku's local machine**: `~/.kankaku/credentials.json` (`chmod 600`)
  or `KANKAKU_PB_URL`/`KANKAKU_PB_EMAIL`/`KANKAKU_PB_PASSWORD` env vars hold
  the service account's credentials — never committed to a project repo.
  `<KANKAKU_DIR>/config.json` (frequently committed) holds only ids, never
  credentials.

## System context

```mermaid
flowchart LR
    user(("Developer\n(pi user)"))
    pi["pi agent process\n+ kankaku extension"]
    jsonl[(".kankaku/worklog.jsonl")]
    cache[("~/.kankaku/catalog.json")]
    creds[("~/.kankaku/credentials.json")]
    pb["PocketBase\n(kankaku-hub)"]
    web["Nuxt SPA\n(kankaku-hub/web)"]
    owner(("Repo owner\n(via browser)"))

    user -->|prompts| pi
    pi -->|append-only| jsonl
    pi -->|read/refresh| cache
    pi -->|read| creds
    pi -->|"catalog reads,\nsync push (task_entries,\nwork_records)"| pb
    web -->|"REST + realtime,\nowner auth"| pb
    owner --> web
    pb -->|serves static build| web
```

## Sync sequence

```mermaid
sequenceDiagram
    participant Log as worklog.jsonl
    participant Runner as sync-runner.ts
    participant Plan as sync-plan.ts (planSync)
    participant TaskView as task-view.ts (buildTasks)
    participant Sink as pocketbase-sink.ts
    participant PB as PocketBase

    Runner->>Log: read records since watermark + revisit window
    Runner->>TaskView: buildTasks(records)
    TaskView-->>Runner: consolidated TaskView[] (union of intervals)
    Runner->>Plan: planSync(tasks, syncState)
    Plan-->>Runner: eligible tasks (hash changed or new)
    loop each eligible task
        Runner->>Sink: upsert(task)
        Sink->>PB: GET task_entries?filter=task_id="..."
        alt found
            Sink->>PB: PATCH task_entries/:id (measurement fields only)
        else not found
            Sink->>PB: POST task_entries (full payload incl. client/project/task)
        end
        PB-->>Sink: 200 or 400 validation_not_unique
    end
    Runner->>Runner: advance syncedThrough watermark (only past resolved tasks)
    Runner->>Log: persist sync-state.json
```

## Session-start picker sequence

```mermaid
sequenceDiagram
    participant Pi as pi (session_start)
    participant Tracker as pi-tracker.ts
    participant Target as session-target.ts
    participant Config as project-config.ts
    participant Cache as cached-catalog.ts
    participant Picker as target-picker.ts
    participant User

    Pi->>Tracker: session_start (role=orchestrator, hasUI)
    Tracker->>Target: ensurePicked()
    Target->>Config: readProjectTargetIds()
    alt mapping exists
        Target-->>Tracker: use existing target (silent)
    else no mapping, no prior pick/skip this session
        Target->>Cache: read() (cached clients/projects)
        Target->>Picker: pickTarget(catalog)
        Picker->>User: select client, then project ("— skip —" available)
        User-->>Picker: choice
        Picker-->>Target: picked target or skipped
        Target->>Target: persist as session entry ("kankaku-target")
        opt user confirms "remember for this repo"
            Target->>Config: writeProjectTargetIds()
        end
    end
    Tracker->>Tracker: continue session, attach target to records
```

## Data model (ER)

```mermaid
erDiagram
    CLIENTS ||--o{ PROJECTS : has
    PROJECTS ||--o{ TASKS : has
    CLIENTS ||--o{ TASK_ENTRIES : "client"
    PROJECTS ||--o{ TASK_ENTRIES : "project (optional)"
    TASKS ||--o{ TASK_ENTRIES : "task (optional)"
    TASK_ENTRIES ||--o{ WORK_RECORDS : "task_entry (cascade delete)"

    CLIENTS {
        text name
        text code UK
        bool active
        bool unassigned
    }
    PROJECTS {
        text name
        relation client FK
        text code
        json repo_paths
        bool active
    }
    TASKS {
        text title
        relation project FK
        select status
        text external_ref
    }
    TASK_ENTRIES {
        text task_id UK "idempotency key"
        relation client FK
        relation project FK
        relation task FK
        number wall_ms
        number work_ms
        number waiting_ms
        number cost
        text legacy_client_label
        text repo_project
    }
    WORK_RECORDS {
        text kankaku_id UK "idempotency key"
        relation task_entry FK
        bool rollup "always false, never summed"
        select role "orchestrator or subagent"
    }
```

## Related

- [`kankaku-extension.md`](kankaku-extension.md) — kankaku's internal hexagonal layout.
- [`hub-backend.md`](hub-backend.md) — PocketBase schema and access rules in detail.
- [`hub-web.md`](hub-web.md) — the Nuxt SPA in detail.
- [`aggregation.md`](aggregation.md) — the interval-union rule.
- [`../adr/README.md`](../adr/README.md), [`../specs/README.md`](../specs/README.md), [`../phases/README.md`](../phases/README.md)
