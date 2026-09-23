# kankaku-hub

PocketBase backend for [kankaku](../kankaku), a pi extension that measures
AI agent work time and token cost. This repo receives consolidated task
rows from kankaku's sync client, holds the canonical catalog of
clients/projects/tasks, and serves the Nuxt dashboard in `./web` as a static
build from the same PocketBase process.

Public site: [kankaku.io](https://kankaku.io). Full design: [`docs/proposal.md`](docs/proposal.md).

## What this is (and isn't)

- **Is:** a task/project catalog kankaku's picker reads from, and a sink
  for already-consolidated time/cost rows kankaku pushes to it.
- **Isn't:** invoicing software. There are no rates, prices, margins or
  invoice numbers anywhere in this schema, on purpose — see
  `docs/proposal.md` §9.4 and `AGENTS.md`. Export the numbers and invoice
  elsewhere.

## Layout

```
pocketbase/
  bin/            pocketbase binary (gitignored — see scripts/pb-download.sh)
  pb_data/        SQLite data dir (gitignored)
  pb_migrations/  collections schema — the source of truth
  seed/           dev-only demo data generator
docs/
  proposal.md     the design doc this repo implements
  contract.md     the exact API contract for the kankaku sync client
scripts/          pb-download.sh, dev.sh, create-dev-accounts.sh
web/              Nuxt 4 SPA dashboard, static-built and served by PocketBase
docs/             specs, ADRs, phases, runbooks — start at docs/README.md
```

## Running locally

Requires Node >= 20 (for the seed script; no other dependencies) and
`curl`/`unzip` for the download script.

```bash
# 1. Download the pinned PocketBase binary (darwin/linux, arm64/amd64)
scripts/pb-download.sh

# 2. Start PocketBase — applies pb_migrations automatically, serves on
#    127.0.0.1:8090
scripts/dev.sh

# 3. In another terminal: create the local dev superuser, owner and
#    service accounts (safe to re-run)
scripts/create-dev-accounts.sh

# 4. Seed demo data: clients, projects, tasks, task_entries, work_records
#    (deterministic, safe to re-run — see pocketbase/seed/seed.js). --i-know
#    is required because this targets port 8090; set SEED_PROFILE=rich for
#    the larger, fully fictional dataset used for screenshots/demos.
node pocketbase/seed/seed.js --i-know
```

Dashboard: http://127.0.0.1:8090/_/
REST API: http://127.0.0.1:8090/api/

Local dev credentials are in `ESTADO.md` (not committed as a separate
secrets file since these are throwaway local-only accounts).

## Configuration (environment variables)

PocketBase-process env vars read by `pocketbase/pb_hooks/`:

| Variable | Default | Purpose |
|---|---|---|
| `KANKAKU_ENGRAM_URL` | unset (feature disabled) | Base URL of an operator-run [Engram](https://github.com/soyunninja/engram) daemon (`engram serve`), e.g. `http://127.0.0.1:7437`. Enables the session-narrative proxy — see [`docs/architecture/hub-backend.md`](docs/architecture/hub-backend.md#engram-narrative-read-only-proxy-pocketbasepb_hooksengrampbjs). |
| `KANKAKU_ENGRAM_TIMEOUT_SECONDS` | `2` | Per-request timeout for calls to the Engram daemon above. |
| `KANKAKU_ENGRAM_TOKEN` | unset | Optional bearer token sent as `Authorization: Bearer <token>` on every Engram request. Required only when the daemon itself was started with `ENGRAM_HTTP_TOKEN` set — set both to the same value. |

## The billing boundary

Clients, projects, tasks, time and token cost are stored. Hourly rates,
prices, margins and invoice numbers are not, and never will be — see
`AGENTS.md` and `docs/proposal.md` §9.4/§8.

## The aggregation rule

`task_entries` rows are pre-consolidated by kankaku (union of overlapping
orchestrator/subagent intervals) and are always safe to `SUM(...)
GROUP BY ...`. `work_records` rows are raw detail, flagged `rollup: false`,
and must never be summed. See `AGENTS.md` (rule D6) before writing any
report or dashboard query.

## Sync contract

If you're building kankaku's sync client or the web dashboard, read
[`docs/contract.md`](docs/contract.md) — it documents the exact base URL,
auth flow, collection/field names, upsert-by-`task_id` filter syntax and
batch API usage, all captured from real requests against a local instance.

## License

MIT — see [`LICENSE`](LICENSE).
