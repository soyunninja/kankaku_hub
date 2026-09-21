#!/usr/bin/env node
// Dev-only SCALE seed script. No dependencies, Node >= 20 (uses global
// fetch). Inserts N synthetic `task_entries` rows spread over several
// years, across several clients/projects/tasks/sessions/agents/qualities,
// to prove the totals endpoint (pocketbase/pb_hooks/totals.pb.js) and the
// migrated web screens stay fast at scale — see
// docs/architecture/aggregation.md "the server sums; the browser
// displays" and docs/adr/0027-totals-computed-server-side.md.
//
// SAFETY: refuses to run against an instance on port 8090 (the owner's
// live PocketBase, per this repo's environment rules) unless --i-know is
// passed explicitly. Always prefer running this against an ISOLATED copy
// of pb_data on a different port (see docs/runbooks/local-development.md
// and the "Scale proof" section of the totals feature's report).
//
// Deterministic (mulberry32, its own fixed seed, separate from
// seed.js's 424242 to avoid any accidental correlation) and idempotent:
// every row's `task_id` is `bulk-te-<index>` and a duplicate-create
// failure (`validation_not_unique`, the documented upsert-by-error
// pattern from docs/contract.md) is treated as "already seeded, skip",
// exactly like kankaku's own sync client would. Re-running with the same
// --count is a no-op after the first run; a larger --count only creates
// the additional rows.
//
// Batched via /api/batch (migration 1758300010_enable_batch_api.js),
// chunked at 50 per call (server caps a single call at 100) with a
// configurable in-flight concurrency, since PocketBase's write path uses
// a nonconcurrent SQLite connection pool and unbounded concurrency here
// would just queue, not speed anything up.
//
// Usage:
//   node pocketbase/seed/bulk.js --count 100000 --url http://127.0.0.1:8092
//   node pocketbase/seed/bulk.js --count 1000 --url http://127.0.0.1:8090 --i-know

const args = parseArgs(process.argv.slice(2));

const PB_URL = args.url || process.env.PB_URL || "http://127.0.0.1:8090";
const COUNT = Number(args.count || 100000);
const YEARS = Number(args.years || 3);
const BATCH_SIZE = Number(args["batch-size"] || 50);
const CONCURRENCY = Number(args.concurrency || 6);
const SUPERUSER_EMAIL = process.env.PB_SUPERUSER_EMAIL || "admin@kankaku.local";
const SUPERUSER_PASSWORD = process.env.PB_SUPERUSER_PASSWORD || "kankaku-dev-admin";
const ID_PREFIX = "bulk-te-";
const SESSION_ID_PREFIX = "bulk-session-";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    }
    else {
      out[key] = true;
    }
  }
  return out;
}

function isPort8090(url) {
  try {
    const parsed = new URL(url);
    return parsed.port === "8090" || (parsed.port === "" && url.includes(":8090"));
  }
  catch (_e) {
    return url.includes(":8090");
  }
}

if (isPort8090(PB_URL) && !args["i-know"]) {
  console.error(`Refusing to run against ${PB_URL} (port 8090 — this repo's environment rules reserve it`);
  console.error("for the owner's live PocketBase). Pass --i-know to override, or point --url at an isolated");
  console.error("copy of pb_data on a different port (see docs/runbooks/local-development.md).");
  process.exit(1);
}

// --- deterministic PRNG (mulberry32), own seed, separate from seed.js ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(990199001);
const pick = arr => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(min + rand() * (max - min + 1));
const randFloat = (min, max, decimals = 4) => Number((min + rand() * (max - min)).toFixed(decimals));

// --- tiny PocketBase REST client -----------------------------------------

let authToken = null;

async function pbFetch(path, opts = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: authToken } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${opts.method || "GET"} ${path} -> ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

async function authenticate() {
  const data = await pbFetch("/api/collections/_superusers/auth-with-password", {
    method: "POST",
    body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD }),
  });
  authToken = data.token;
}

async function fetchAll(collection, fields) {
  const items = [];
  let page = 1;
  for (;;) {
    const data = await pbFetch(`/api/collections/${collection}/records?page=${page}&perPage=200&fields=${encodeURIComponent(fields)}`);
    items.push(...data.items);
    if (page >= data.totalPages) break;
    page++;
  }
  return items;
}

// --- generators ------------------------------------------------------------

const AGENTS = [
  { agent: "pi", plugin: "kankaku", pluginVersion: "0.9.0" },
  { agent: "opencode", plugin: "kankaku-opencode", pluginVersion: "0.2.1" },
  { agent: "", plugin: "", pluginVersion: "" }, // legacy / not reported
];
const MODELS = ["claude-sonnet-5", "claude-opus-4.5", "claude-haiku-4.5"];
const STATUSES = ["completed", "completed", "completed", "aborted", "interrupted"];
const WAITING_QUALITIES = ["measured", "measured", "measured", "unavailable"];
const COST_QUALITIES = ["measured", "measured", "estimated", "unknown"];
const SUBAGENT_LINKAGES = ["not_applicable", "not_applicable", "linked", "unlinked"];
const MACHINES = ["MacBook-Pro-David.local", "workstation-linux", "macbook-air-m3"];

function randomStartedAt(now, years) {
  const spanMs = years * 365 * 24 * 60 * 60 * 1000;
  const offset = randInt(0, spanMs);
  return new Date(now.getTime() - offset);
}

function isoNoMillisTrim(date) {
  return date.toISOString().replace("T", " ");
}

/**
 * Builds one synthetic task_entries row. Sessions are synthesized in
 * small clusters (2-6 consecutive entries sharing a session_id) so
 * group_by=session has realistic multi-row groups, not just singletons.
 */
function buildEntry(index, clients, projects, tasks, now, sessionState) {
  const client = pick(clients);
  const projectsForClient = projects.filter(p => p.client === client.id);
  const project = projectsForClient.length > 0 ? pick(projectsForClient) : pick(projects);
  const tasksForProject = tasks.filter(t => t.project === project.id);
  const task = rand() < 0.7 && tasksForProject.length > 0 ? pick(tasksForProject) : null;

  if (!sessionState.remaining || sessionState.remaining <= 0) {
    sessionState.id = `${SESSION_ID_PREFIX}${sessionState.counter++}`;
    sessionState.name = pick(["Fix login bug", "Add export CSV", "Refactor auth module", "Improve dashboard perf", "Write onboarding docs", "Investigate flaky test"]);
    sessionState.remaining = randInt(1, 6);
    sessionState.baseTime = randomStartedAt(now, YEARS);
  }
  sessionState.remaining--;

  const startedAt = new Date(sessionState.baseTime.getTime() + randInt(0, 3600_000) * (6 - sessionState.remaining));
  const wallMs = randInt(30_000, 3_600_000);
  const agentInfo = pick(AGENTS);
  const waitingQuality = agentInfo.agent === "" ? "" : pick(WAITING_QUALITIES);
  const waitingMs = waitingQuality === "unavailable" ? 0 : randInt(0, Math.floor(wallMs * 0.3));
  const workMs = waitingQuality === "unavailable" ? wallMs : wallMs - waitingMs;
  const costQuality = agentInfo.agent === "" ? "" : pick(COST_QUALITIES);
  const cost = costQuality === "unknown" ? 0 : randFloat(0.001, 5, 6);
  const endedAt = new Date(startedAt.getTime() + wallMs);

  return {
    task_id: `${ID_PREFIX}${index}`,
    client: client.id,
    project: project.id,
    task: task ? task.id : "",
    started_at: isoNoMillisTrim(startedAt),
    ended_at: isoNoMillisTrim(endedAt),
    wall_ms: wallMs,
    waiting_ms: waitingMs,
    work_ms: workMs,
    input: randInt(100, 20000),
    output: randInt(50, 8000),
    cache_read: randInt(0, 5000),
    cache_write: randInt(0, 2000),
    cost: cost,
    subagent_count: 0,
    runs: randInt(1, 5),
    turns: randInt(1, 20),
    status: pick(STATUSES),
    session_id: sessionState.id,
    session_name: sessionState.name,
    machine: pick(MACHINES),
    model: pick(MODELS),
    legacy_client_label: "",
    repo_project: project.name ? `/home/dev/repos/${project.name.toLowerCase().replace(/\s+/g, "-")}` : "",
    schema: 1,
    agent: agentInfo.agent,
    agent_version: agentInfo.agent === "" ? "" : "1.0.0",
    plugin: agentInfo.plugin,
    plugin_version: agentInfo.pluginVersion,
    waiting_quality: waitingQuality,
    cost_quality: costQuality,
    subagent_linkage: pick(SUBAGENT_LINKAGES),
  };
}

/**
 * PocketBase's /api/batch runs as a SINGLE DB TRANSACTION (confirmed
 * empirically against the real 0.40.4 binary, not assumed — this
 * contradicts a stale comment in web/app/composables/useUnassignedQueue.ts
 * claiming "the batch endpoint does not fail the whole call for one bad
 * sub-request"; that composable only ever sends PATCH updates to existing
 * records, which rarely hit a unique-constraint failure, so the
 * discrepancy never surfaced there — see this feature's final report):
 * ONE failing sub-request rolls back the WHOLE batch and the endpoint
 * returns a single top-level 400, not a 200 with per-item statuses.
 *
 * Since a chunk is therefore atomic (either every row in it was already
 * committed by a previous run, or none was — chunks are never partially
 * applied), a `validation_not_unique` failure on the batch as a whole is
 * treated as "this entire chunk was already seeded, skip it", not a
 * per-row concern.
 */
async function insertBatch(rows) {
  const requests = rows.map(row => ({
    method: "POST",
    url: "/api/collections/task_entries/records",
    body: row,
  }));
  try {
    const results = await pbFetch("/api/batch", { method: "POST", body: JSON.stringify({ requests }) });
    return { created: results.length, alreadyExisted: 0, failed: 0 };
  }
  catch (err) {
    if (String(err.message).includes("validation_not_unique")) {
      return { created: 0, alreadyExisted: rows.length, failed: 0 };
    }
    console.error(`chunk starting at ${rows[0].task_id} failed: ${err.message}`);
    return { created: 0, alreadyExisted: 0, failed: rows.length };
  }
}

async function runPool(items, worker, concurrency) {
  let index = 0;
  let active = 0;
  return new Promise((resolve, reject) => {
    const results = [];
    function next() {
      if (index >= items.length && active === 0) {
        resolve(results);
        return;
      }
      while (active < concurrency && index < items.length) {
        const i = index++;
        active++;
        worker(items[i], i)
          .then((r) => { results[i] = r; active--; next(); })
          .catch(reject);
      }
    }
    next();
  });
}

async function main() {
  console.log(`bulk.js: seeding ${COUNT} task_entries against ${PB_URL} (years=${YEARS}, batch=${BATCH_SIZE}, concurrency=${CONCURRENCY})`);
  const t0 = Date.now();
  await authenticate();

  const clients = await fetchAll("clients", "id,unassigned");
  const realClients = clients.filter(c => !c.unassigned);
  const projects = await fetchAll("projects", "id,name,client");
  const tasks = await fetchAll("tasks", "id,project");

  if (realClients.length === 0 || projects.length === 0) {
    console.error("No clients/projects found — run `npm run pb:seed` against this instance first.");
    process.exit(1);
  }

  const now = new Date();
  const sessionState = { counter: 0, remaining: 0 };
  const rows = [];
  for (let i = 0; i < COUNT; i++) {
    rows.push(buildEntry(i, realClients, projects, tasks, now, sessionState));
  }

  const chunks = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) chunks.push(rows.slice(i, i + BATCH_SIZE));

  let created = 0;
  let alreadyExisted = 0;
  let failed = 0;
  let done = 0;
  await runPool(chunks, async (chunk) => {
    const r = await insertBatch(chunk);
    created += r.created;
    alreadyExisted += r.alreadyExisted;
    failed += r.failed;
    done += chunk.length;
    if (done % (BATCH_SIZE * 20) === 0 || done === rows.length) {
      const elapsedS = (Date.now() - t0) / 1000;
      console.log(`  ${done}/${rows.length} (${(done / elapsedS).toFixed(0)}/s) created=${created} alreadyExisted=${alreadyExisted} failed=${failed}`);
    }
    return r;
  }, CONCURRENCY);

  const elapsedS = (Date.now() - t0) / 1000;
  console.log(`Done in ${elapsedS.toFixed(1)}s: created=${created} alreadyExisted=${alreadyExisted} failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
