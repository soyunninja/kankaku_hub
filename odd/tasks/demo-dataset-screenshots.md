# Feature: rich fictional demo dataset, isolated stack script, fresh screenshots

Locator: `odd/tasks/demo-dataset-screenshots.md` (Engram topic
`odd/demo-dataset-screenshots/tasks`, project kankaku-hub). Branch:
`feat/engram-narrative` (continues the day's branch). Created 2026-09-22.

## Objective
1. A deterministic, fully fictional, RICH demo dataset (clients, projects,
   tasks, sessions, entries, work records) generated into a fresh, isolated
   PocketBase data dir — never the owner's `pocketbase/pb_data`, never :8090.
2. A repo script that builds that isolated stack safely and repeatably (also
   the standard e2e/screenshot stack from now on).
3. Fresh hub screenshots with the new palettes for the Astro site.
4. Groundwork for a public read-only demo instance (documented; the security
   migration is a separate, explicit task).

## Facts (mapped)
- `pocketbase/seed/seed.js`: fictional, deterministic (mulberry32 424242),
  idempotent via natural keys, `seed-te-` prefix guard; 5 clients / 10 projects
  / 25 tasks / ~437 entries over 60 days; does NOT set `thinking_level`,
  `session_dir`, pi `agent_version`/`plugin_version`; `PB_URL` defaults to
  8090 with NO guard. `bulk.js` has an 8090 guard (`--i-know`).
- Screenshots: captured by web/e2e specs via `shoot()` into
  `web/docs/screenshots/`, then `site/scripts/refresh-screenshots.mjs` copies a
  curated list into `site/src/assets/screenshots/`. The site uses 4 files
  (dashboard-dark/light, tasks-dark, clients-dark).
- Hazards: `scripts/dev.sh` and `scripts/create-dev-accounts.sh` hardcode the
  real pb_data and 8090; `web/e2e/helpers.ts#pbOrigin` defaults to 8090
  (needs `NUXT_PUBLIC_PB_URL` + `E2E_ALLOW_PB_WRITES=1`).
- No `viewer` role exists (`users.role` = owner|service); `task_entries` and
  `work_records` allow create/update to ANY authenticated user.

## Tasks
- [x] T1 `scripts/isolated-stack.sh` (bash, no deps): `up <dir> [--pb-port 8092]
      [--web-port 3002] [--seed] [--engram-url URL]` creates a fresh data dir
      (refuses paths inside pocketbase/pb_data and port 8090/3000/4321),
      starts PocketBase with migrations+hooks, creates superuser + owner
      account (`pocketbase superuser upsert --dir <dir>` + API), optionally
      seeds (`PB_URL` forced to the chosen port), optionally rsyncs web/ to
      `<dir>/web` (symlink node_modules) and starts `nuxt dev` on the web port
      with `NUXT_PUBLIC_PB_URL`; writes PIDs to `<dir>/stack.pids`; `down <dir>`
      kills them; prints the exact env for Playwright. Documented in
      docs/runbooks/local-development.md (replacing the ad-hoc recipe). Writer A.
- [x] T2 seed.js "rich" profile: `SEED_PROFILE=rich` (default unchanged
      `standard`) → ~12 clients, ~30 projects, ~90 tasks, ~3000 entries over
      180 days grouped into sessions of 1–15 entries (session_id + some
      session_name), `thinking_level` mix, pi `agent_version`/`plugin_version`,
      a few non-pi agents, machines, models mix, quality fields, work_records
      for subagent entries; still deterministic, idempotent, `seed-te-` guarded,
      fictional names only (no real domains: websites under `.example`). Add a
      PB_URL 8090 guard like bulk.js (`--i-know`). Node tests for pure
      generators where feasible (seed has none today: add
      `pocketbase/seed/seed.test.js` for the pure helpers you extract). Writer A.
- [x] T3 run: `scripts/isolated-stack.sh up <scratch> --seed` with
      SEED_PROFILE=rich, then web e2e screenshot specs (smoke, entry-detail,
      commands, screenshots-ja) against it, then
      `node site/scripts/refresh-screenshots.mjs`; review the 4 site PNGs +
      key web/docs PNGs; `down`. Per-action worker.
- [x] T4 commits: script+runbook; seed; screenshots (web/docs + site assets).
      Parent.
- [ ] T5 (planned, NOT in this pass) public demo: migration adding `viewer`
      role + tightening task_entries/work_records create/update to owner or
      service; demo account; runbook "demo instance" (fresh dir + rich seed +
      viewer login). Needs owner go-ahead.

## Constraints
Never touch pocketbase/pb_data, :8090, :3000, :4321, the real Engram :7437.
English artifacts. Strict TDD for pure helpers. Conventional commits.

## Progress / evidence
- T1 4c8ec0b: refusals exercised live (pb_data path, nested path, ports
  8090/3000/4321); bash -n ok (shellcheck not installed). Runbook updated.
- T2 8c28800: TDD RED (module missing) → GREEN 19 tests (`npm run seed:test`);
  hooks:test 150. Live rich run on 8092: 13 clients (12 + Sin determinar),
  30 projects, 90 tasks, 3000 entries, 1562 work_records, 433 sessions, agents
  pi 90.5% / claude-code / opencode / codex, 14.2% with subagents; second seed
  run created 0 rows (idempotent). Owner's 8090/3000 PIDs unchanged.
- Note: `npm run pb:seed` now passes `--i-know` because that recipe targets the
  owner's own dev instance on purpose; accidental direct runs are refused.

- T3: stack up with rich seed; specs smoke/entry-detail/commands/screenshots-ja/
  sessions-queue/entries-grouped → 27/28; the 1 failure was real: the Engram
  card on Commands linked to /settings and commands.spec.ts forbids in-app
  links there → fixed (20061b9, link → plain text). 38 PNGs regenerated under
  web/docs/screenshots (+2 new entries-grouped dark/light); site curated set
  refreshed (10 files). Parent reviewed dashboard-dark and clients-dark:
  fictional clients only, new palettes. Data dir kept at scratchpad/demo-stack.
- T4: cb4f5b2 docs(screenshots). Branch: 16 commits over main 341f0f8.
- T5 still planned (viewer role + write-rule tightening) — awaiting owner.
