# Feature: Engram session narrative in the hub

Locator: `odd/tasks/engram-narrative.md` (Engram topic `odd/engram-narrative/tasks`,
project kankaku-hub). Branch: `feat/engram-narrative` (from main 341f0f8).
Created 2026-09-22. Backlog origin: backlog/engram-session-narrative;
research: research/engram-read-api-for-hub.

## Objective
When the hub operator configures an Engram daemon, each session shows WHAT was
done (Engram's session summary Goal, or the first user prompt) next to
kankaku's time and cost. Without Engram the UI is byte-for-byte today's.

## Facts (verified)
- Join key: Engram `sessions.id` == pi session id == `task_entries.session_id`.
- Engram daemon (`engram serve`, default :7437) has NO CORS headers → the
  browser cannot read it; PocketBase must proxy server-side (`$http.send`,
  pattern in `pocketbase/pb_hooks/favicon.pb.js`).
- Daemon API: `GET /sessions/{id}` → {id, project, directory, started_at,...};
  `GET /observations?project=&type=session_summary&limit=` → rows with
  `session_id`, `title`, `content` (the `session_id` query param is IGNORED:
  filter client-side); `GET /prompts/recent?project=&limit=` → rows with
  `id`, `session_id`, `content`. Summary content starts with "## Goal\n..." or
  "Goal: ..." (both seen).
- Hub SPA is a static build: config must be server-side (PB env var), read in
  the hook with `$os.getenv` (verify in pb_data/types.d.ts).
- Hooks: nest every require/helper INSIDE the routerAdd handler (goja
  constraint, see totals.pb.js header); pure logic in `lib/*.js` with
  `node --test`.

## Contract (hub-internal, auth required)
- Env (PocketBase process): `KANKAKU_ENGRAM_URL` (e.g. http://127.0.0.1:7437);
  optional `KANKAKU_ENGRAM_TIMEOUT_SECONDS` (default 2).
- `GET /api/kankaku/engram/status` → 200 `{configured: bool, reachable: bool}`
  (reachable = `GET {url}/health` ok within timeout; false when not configured).
- `POST /api/kankaku/engram/sessions` body `{ids: string[]}` (≤ 50) →
  200 `{sessions: {[id]: Narrative}}` with only ids that have data.
  `Narrative = {project, title, goal?, summary?, first_prompt?, source:
  "summary"|"prompt", created_at?}`. `title` = goal line, else first prompt
  truncated to 120 chars (pure `titleFrom`). Per id: /sessions/{id} (404 →
  skip) → project; observations for that project (cached per request, limit
  200) filtered by session_id, newest first; else prompts filtered by
  session_id, earliest first. Any daemon failure → skip that id, never 5xx.
- Not configured → both routes 404 `{code: "engram_not_configured"}` (same
  404-means-unavailable convention as totals → typed error in the web).

## Web
- `web/app/lib/session-title.ts` (pure): `sessionTitle(sessionId, sessionName,
  narrativeTitle?)` → narrativeTitle when non-empty, else EXACTLY
  `sessionMarkerLabel(sessionId, sessionName)`.
- `web/app/composables/useEngramNarrative.ts`: `EngramUnavailableError` on
  404; `status()` cached per page load (one call); `forSessions(ids)` batch →
  Map, cached per id; never throws to callers (returns empty on any error);
  after a 404 the composable stays disabled for the page lifetime (no more
  calls).
- Entries grouped row (`session-group-row`): when a narrative exists, the
  session cell shows the title on the first line and today's marker label as
  a small muted second line; the marker dot/click stay. Expanded: a summary
  block ABOVE the nested table (goal + the rest of the summary as pre-wrapped
  text, clamped to ~6 lines with a "show more" toggle); first_prompt-only
  narratives show the prompt as the block. Nothing rendered when absent.
- Sessions-without-task rows: title cell uses `sessionTitle(...)`; a muted
  second line keeps today's name when the title came from Engram.
- Settings page: read-only "Engram" card mirroring the Connection card: not
  configured / configured (reachable | unreachable). Informational only.
- i18n es/en/ja for every new string.
- Site: drop the "coming soon" badge/wording of the Engram section and guide
  paragraph (this feature ships it) — separate commit.

## Out of scope
Cloud Engram API (none exists); writing to Engram; per-user Engram URLs.

## Constraints
Strict TDD. Runners: `npm run hooks:test`, `pnpm --dir web test`, typecheck,
lint; Playwright only on the isolated stack (PB 8092 / Nuxt 3002) with a fake
Engram HTTP server on 7438 for the "configured" path and none for the
"unchanged UI" path. Never the owner's :8090/:3000/pb_data. Auth-gate both
routes (any authenticated hub user, like totals). English artifacts; ESTADO.md
Spanish. Conventional commits, no AI attribution.

## Tasks
- [x] T1 hooks: `pocketbase/pb_hooks/lib/engram-narrative.js` (pure: parseGoal,
      pickSummary, pickFirstPrompt, titleFrom, buildNarrative, buildStatus,
      request validation) + `lib/engram-narrative.test.js`; thin
      `pocketbase/pb_hooks/engram.pb.js` with the two routes. Docs:
      `docs/architecture/hub-backend.md` section + README env var. Writer A.
- [x] T2 web: session-title lib + tests; composable + tests; entries grouped
      row/expanded block; sessions-without-task title; settings card; i18n.
      Writer B.
- [x] T3 e2e: `web/e2e/engram-narrative.spec.ts` + `web/e2e/fixtures/
      fake-engram.mjs` (node http server: /health, /sessions/{id},
      /observations, /prompts/recent with fixture data keyed by the spec's
      session ids); spec 1: not configured → grouped rows identical to
      entries-grouped baseline; spec 2: configured → title + summary block +
      queue title. Writer B writes; parent runs on the isolated stack.
- [x] T4 site: remove "coming soon" from the Engram section/guide (es/en/ja).
- [x] T5 verify + commits: 2038b10 hooks · ce7b895 site · 3988937 web + ESTADO.md.
- [x] T6 follow-up (owner question "¿Engram necesita token?" + screenshot):
      optional KANKAKU_ENGRAM_TOKEN → Bearer on every daemon call; status
      reports `unauthorized` (daemon 401/403) and Settings shows it; summary
      block strips the repeated Goal section and renders markdown headings as
      plain labels. Route: delegated writer; then re-run hooks:test/vitest and
      one isolated e2e pass of engram-narrative.spec.ts (both paths).

## Acceptance
Without KANKAKU_ENGRAM_URL every screen renders as at 341f0f8 (e2e proves the
grouped rows). With it, sessions with a summary show the Goal as title and the
summary when expanded; sessions with only prompts show the first prompt;
sessions unknown to Engram are unchanged. hooks:test, vitest, typecheck, lint
green.

## Delivery
Forecast ~700 lines across hooks/web/site; three work-unit commits;
single-pr strategy (local workflow); RDD off.

## Progress / evidence
- T1: writer A, TDD RED (module missing, 42 tests) → GREEN; hooks:test 101 →
  143. Isolated PB 8092 against the owner's real local Engram (GETs only):
  unauth 401; status {configured:true,reachable:true}; sessions for 3 ids →
  2 narratives (summary + prompt), unknown id dropped; {"ids":[]} and 51 ids →
  400 invalid_body; no env → 404 engram_not_configured; dead daemon → status
  reachable:false and sessions {} in ~15 ms. Owner's :8090/:3000 untouched.
  Commit: 2038b10 feat(hub): read-only Engram proxy for session narratives.
- T2/T3: writer B, TDD RED→GREEN (session-title 7, composable 8); vitest 398 →
  413. Isolated e2e RUN A (no env): engram-narrative test 1 + entries-grouped
  + sessions-queue + session-features + smoke 15 passed / 1 skipped; RUN B
  (fake Engram 7438, KANKAKU_ENGRAM_URL set, E2E_ENGRAM=1): test 2 passed
  (test 1 fails by design there → now gated with test.skip when E2E_ENGRAM=1).
  Screenshots reviewed: title + original label on the row, narrative block
  above the nested table, Settings "Conectado". Owner's :8090/:3000 untouched.
- T4: site badge removed and guide reworded in present tense (ce7b895).
- Product nuance found: a resumed pi session spans topics; the newest summary
  wins, so the title reflects the latest goal (session 01a0c801 resumed at
  12:31 got the "hablemos hover" goal). Accepted.

### T6 evidence
- Writer TDD: readConfig token (3), authHeaders (2), buildStatus unauthorized
  (2), narrativeBody (9) + lineCount (3); hooks:test 143 → 150; vitest 413 →
  426. One composable test could not show RED (untyped pass-through) —
  reported honestly.
- Isolated stack: RUN A (no env) 12 passed / 1 skipped; RUN B (fake Engram
  7438, KANKAKU_ENGRAM_TOKEN=e2e-token) spec passed and the daemon-side
  header stub printed "Bearer e2e-token"; RUN C (401 stub 7439) status →
  {configured:true, reachable:false, unauthorized:true}, sessions → {},
  Settings shows "No autorizado (token)". Screenshot reviewed: goal line +
  "Accomplished:" body, no duplicated goal, no raw markdown.
- Commit e279ed2. Feature complete: 2038b10, ce7b895, 3988937, e279ed2 on
  feat/engram-narrative (4 commits over main 341f0f8). Merge is the owner's
  call.

## Activation (owner)
Start PocketBase with `KANKAKU_ENGRAM_URL=http://127.0.0.1:7437` (and
`KANKAKU_ENGRAM_TOKEN` only if the daemon runs with `ENGRAM_HTTP_TOKEN`), e.g.
by exporting it before `scripts/dev.sh`; restart PocketBase. Nuxt needs
nothing. Check Ajustes → Engram → "Conectado".

### T7 docs system (owner asked "¿lo documentaste?")
- Commit e87181d: ADR 0028, spec engram-narrative.md (ENGRAM-REQ-001..014,
  traceability 11 full / 3 partial / 1 code-review-only), runbook recipe,
  glossary, ENGRAM prefix, phase-3 deliverable, docs/README.md counts fixed.
- Branch: 5 commits over main (2038b10, ce7b895, 3988937, e279ed2, e87181d).

### T8 owner follow-ups (same branch)
- 4bd530c feat(commands): "Engram (opcional)" card + HUB_ENV_VARS table on the
  hub's Commands page (vitest 428).
- 9610884 docs(site): guide section "Subagentes y gentle-ai" es/en/ja (kankaku
  measures without gentle-ai; subagent mechanisms and the uncertain state).
- Branch: 7 commits over main 341f0f8. Merge pending owner decision.
- b4eccac style(site): tokens.css ported to the hub palettes (dark Cute, light
  Sexy pink); site Playwright 37/37 incl. axe both themes. Branch: 8 commits.
- 3362884 chore(site): SITE_URL default https://kankaku.io (+ kankaku 34ed0ff
  homepage/README). 0d740eb docs(site): footer credit Gentleman Programming +
  gentle-ai. Branch: 10 commits over main 341f0f8.
- 8d50bb4 style(site): footer links pink + underlined. ca8508d docs(site):
  Engram links → gentlemanprogramming.com/#engram (home + guide es/en/ja).
  Branch: 12 commits over main 341f0f8; site suite 37/37.
