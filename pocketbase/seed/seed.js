#!/usr/bin/env node
// Dev-only seed script. No dependencies, Node >= 20 (uses global fetch).
//
// Two profiles, selected via SEED_PROFILE (default "standard"):
//
//   standard (default)  Today's small realistic dataset: 5 clients, 10
//                        projects, 25 tasks, task_entries spread over the
//                        last 60 days (some with subagents -> work_records
//                        children), plus a batch of "Sin determinar"
//                        entries with varied legacy_client_label spellings
//                        to exercise the reassignment queue described in
//                        docs/proposal.md §5.3. Unchanged from before this
//                        file grew a "rich" profile: re-running standard is
//                        still a no-op on an already-seeded standard
//                        dataset.
//
//   rich                A much larger, still fully fictional dataset for
//                        screenshots and a future public demo instance:
//                        ~12 clients, ~30 projects, ~90 tasks, ~3000
//                        task_entries over 180 days, grouped into sessions
//                        of 1-15 entries (~40% of sessions named), a
//                        thinking_level mix, pi rows carrying
//                        agent_version/plugin_version, ~10% rows from
//                        other agents (opencode, codex, claude-code) with
//                        plausible models, several machines, a model/
//                        quality mix, subagent_count > 0 on ~15% of rows
//                        with matching work_records, some interrupted/
//                        aborted statuses, and a handful of "Sin
//                        determinar" legacy rows. Client websites are
//                        restricted to the .example/.test TLDs (RFC 2606)
//                        so the favicon-fetch feature can never reach a
//                        real site even if triggered against this data.
//                        The pure catalogs/generators live in
//                        pocketbase/seed/lib/seed-data.js (unit tested in
//                        seed-data.test.js); this file only orchestrates
//                        the PocketBase calls.
//
// Both profiles are deterministic and re-runnable: every row has a stable
// natural key (clients.code, projects.code, tasks.external_ref,
// task_entries.task_id, work_records.kankaku_id) and the script looks up
// existing rows before creating, so running it twice never duplicates
// data. Rich-profile task_entries use the "seed-te-rich-" prefix (which
// itself starts with the standard profile's "seed-te-" prefix) — see
// `isStandardSeedRow` in lib/seed-data.js for why the standard profile's
// own repair passes must never touch rich rows.
//
// SAFETY: like pocketbase/seed/bulk.js, refuses to run against an instance
// on port 8090 (the owner's live PocketBase) unless --i-know is passed
// explicitly. This is also the normal way to run the everyday
// `node pocketbase/seed/seed.js` / `npm run pb:seed` recipe against your
// own real local instance — see docs/runbooks/local-development.md.
//
// Usage:
//   PB_URL=http://127.0.0.1:8090 node pocketbase/seed/seed.js --i-know
//   SEED_PROFILE=rich PB_URL=http://127.0.0.1:8092 node pocketbase/seed/seed.js

const seedData = require("./lib/seed-data.js");

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
const args = parseArgs(process.argv.slice(2));

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const SUPERUSER_EMAIL = process.env.PB_SUPERUSER_EMAIL || "admin@kankaku.local";
const SUPERUSER_PASSWORD = process.env.PB_SUPERUSER_PASSWORD || "kankaku-dev-admin";
const SEED_PROFILE = process.env.SEED_PROFILE || "standard";

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
  console.error("for the owner's live PocketBase). Pass --i-know to override (this is also the normal way");
  console.error("to run the everyday seed recipe against your own real local instance), or point PB_URL at");
  console.error("an isolated copy of pb_data on a different port (see docs/runbooks/local-development.md).");
  process.exit(1);
}

if (SEED_PROFILE !== "standard" && SEED_PROFILE !== "rich") {
  console.error(`Unknown SEED_PROFILE "${SEED_PROFILE}" — expected "standard" or "rich".`);
  process.exit(1);
}

const BATCH_SIZE = 50;
const REGULAR_ENTRY_COUNT = 400;
const UNASSIGNED_ENTRY_COUNT = 30;
const OPENCODE_ENTRY_COUNT = 7;
const OPENCODE_SUBAGENT_LINKAGE = ["linked", "unlinked", "not_applicable", "not_applicable"];
const WINDOW_DAYS = 60;

const RICH_ENTRY_COUNT = 2985;
const RICH_UNASSIGNED_COUNT = 15;
const RICH_WINDOW_DAYS = 180;

// --- deterministic PRNG (mulberry32) so re-runs generate the exact same
// dataset shape, which is what makes the idempotency check meaningful. The
// PRNG itself, plus every other pure helper below, lives in
// lib/seed-data.js (unit tested) — these are thin wrappers bound to this
// module's own shared `rand` sequence, kept so the rest of this file can
// keep calling `pick(arr)`/`randInt(min, max)` exactly as before. ---
const rand = seedData.mulberry32(424242);
const pick = (arr) => seedData.pick(rand, arr);
const randInt = (min, max) => seedData.randInt(rand, min, max);
const randFloat = (min, max, decimals = 4) => seedData.randFloat(rand, min, max, decimals);

// --- tiny PocketBase REST client -------------------------------------------

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

async function fetchAllValues(collection, field) {
  const values = new Map(); // field value -> record
  let page = 1;
  for (;;) {
    const data = await pbFetch(
      `/api/collections/${collection}/records?page=${page}&perPage=500&fields=id,${field}`
    );
    for (const item of data.items) values.set(item[field], item);
    if (page >= data.totalPages) break;
    page++;
  }
  return values;
}

async function batchCreate(requests) {
  const results = [];
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const chunk = requests.slice(i, i + BATCH_SIZE);
    const body = {
      requests: chunk.map((r) => ({
        method: "POST",
        url: `/api/collections/${r.collection}/records`,
        body: r.body,
      })),
    };
    const data = await pbFetch("/api/batch", { method: "POST", body: JSON.stringify(body) });
    data.forEach((r, idx) => {
      if (r.status < 200 || r.status >= 300) {
        throw new Error(`batch create failed: ${JSON.stringify(r)}`);
      }
      results.push({ key: chunk[idx].key, record: r.body });
    });
  }
  return results;
}

async function batchUpdate(requests) {
  const results = [];
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const chunk = requests.slice(i, i + BATCH_SIZE);
    const body = {
      requests: chunk.map((r) => ({
        method: "PATCH",
        url: `/api/collections/${r.collection}/records/${r.id}`,
        body: r.body,
      })),
    };
    const data = await pbFetch("/api/batch", { method: "POST", body: JSON.stringify(body) });
    data.forEach((r, idx) => {
      if (r.status < 200 || r.status >= 300) {
        throw new Error(`batch update failed: ${JSON.stringify(r)}`);
      }
      results.push({ key: chunk[idx].key, record: r.body });
    });
  }
  return results;
}

// --- standard profile: demo catalog ------------------------------------

const CLIENTS = [
  {
    name: "Cajamar",
    code: "cajamar",
    website: "https://www.cajamar.es",
    contact_email: "proyectos@cajamar.es",
    contact_phone: "+34 950 210 100",
    notes: "Banca cooperativa.\nContacto habitual: departamento de sistemas.\nPrefieren reuniones los jueves.",
  },
  {
    name: "Turismo Níjar",
    code: "turismo-nijar",
    website: "https://www.turismonijar.com",
    contact_email: "info@turismonijar.com",
    contact_phone: "+34 950 360 001",
    notes: "Ayuntamiento / oficina de turismo.\nPicos de trabajo antes de Semana Santa y verano.",
  },
  {
    name: "Acme",
    code: "acme",
    website: "https://acme.example",
    contact_email: "dev@acme.example",
    contact_phone: "+1 555 010 2020",
    notes: "",
  },
  {
    name: "Ferretería Soto",
    code: "ferreteria-soto",
    website: "https://ferreteriasoto.example",
    contact_email: "pedidos@ferreteriasoto.example",
    contact_phone: "+34 950 440 220",
    notes: "Negocio familiar, un solo interlocutor (Manuel).",
  },
  {
    name: "Clínica Dental Vega",
    code: "clinica-dental-vega",
    website: "https://clinicadentalvega.example",
    contact_email: "administracion@clinicadentalvega.example",
    contact_phone: "+34 950 550 330",
    notes: "Datos de pacientes: extremar cuidado con capturas/demos.",
  },
];

const PROJECTS = [
  { name: "Portal Cliente", code: "cajamar-portal", client: "cajamar", repo: "/home/dev/repos/cajamar-portal" },
  { name: "App Móvil", code: "cajamar-app", client: "cajamar", repo: "/home/dev/repos/cajamar-app" },
  { name: "Backoffice", code: "cajamar-backoffice", client: "cajamar", repo: "/home/dev/repos/cajamar-backoffice" },
  { name: "Web Turismo", code: "turismo-nijar-web", client: "turismo-nijar", repo: "/home/dev/repos/turismo-nijar-web" },
  { name: "Reservas", code: "turismo-nijar-reservas", client: "turismo-nijar", repo: "/home/dev/repos/turismo-nijar-reservas" },
  { name: "ERP Interno", code: "acme-erp", client: "acme", repo: "/home/dev/repos/acme-erp" },
  { name: "Landing", code: "acme-landing", client: "acme", repo: "/home/dev/repos/acme-landing" },
  { name: "Tienda Online", code: "ferreteria-soto-tienda", client: "ferreteria-soto", repo: "/home/dev/repos/ferreteria-soto-tienda" },
  { name: "Agenda Pacientes", code: "clinica-dental-vega-agenda", client: "clinica-dental-vega", repo: "/home/dev/repos/clinica-dental-vega-agenda" },
  { name: "Web Corporativa", code: "clinica-dental-vega-web", client: "clinica-dental-vega", repo: "/home/dev/repos/clinica-dental-vega-web" },
];

const TASK_TITLES = [
  "Fix login redirect loop",
  "Add CSV export to reports",
  "Migrate auth to PocketBase",
  "Improve mobile navigation",
  "Set up CI pipeline",
  "Refactor invoice PDF generator",
  "Add dark mode",
  "Optimize dashboard queries",
  "Write onboarding docs",
  "Add realtime notifications",
  "Fix timezone bug in bookings",
  "Add multi-language support",
  "Upgrade Nuxt to v4",
  "Add e2e tests for checkout",
  "Improve search relevance",
  "Add audit log",
  "Fix flaky test suite",
  "Add rate limiting",
  "Redesign settings page",
  "Add file upload validation",
  "Fix N+1 query in project list",
  "Add booking cancellation flow",
  "Improve error messages",
  "Add project archiving",
  "Set up staging environment",
];

const STATUSES = ["completed", "completed", "completed", "completed", "aborted", "interrupted"];
const MODELS = ["claude-sonnet-5", "claude-opus-4.5", "claude-haiku-4.5"];
const MACHINES = ["MacBook-Pro-David.local", "vps-kankaku-01"];
const LEGACY_LABELS = ["cajamar", "Cajamar", "Caja Mar", "cjamar", "turismo nijar", "TurismoNijar", "acme sl", "ACME"];
const SEGMENT_TAGS = ["review", "test", "build"];
const SESSION_MAX_SIZE = 6;
const MIXED_SESSION_EVERY = 18;

// kankaku's real `segments` shape is a tag -> milliseconds map (see
// src/domain/hub-entry.ts in the kankaku repo). ~55% of rows get one or two
// tags whose total never exceeds workMs; the rest get {} (an entry with no
// tagged segments is also a real, common case worth seeding). Delegates to
// the tested, generic `buildTaggedSegments` in lib/seed-data.js.
function buildSegments(workMs) {
  return seedData.buildTaggedSegments(rand, workMs, SEGMENT_TAGS);
}

// Repair for demo rows seeded before the tag-map fix above: they still
// carry the old [{start,end}] array in `segments`. Uses ITS OWN generator,
// seeded from the row's task_id, so it never advances the shared `rand`
// sequence (which would change every value generated after it) and stays
// repeatable.
function buildSegmentsFor(taskId, workMs) {
  const local = seedData.mulberry32(seedData.hashString(taskId));
  return seedData.buildTaggedSegments(local, workMs, SEGMENT_TAGS);
}

// `task_id ~ "seed-te-"` is a SQL "contains", not "starts with" — see
// lib/seed-data.js's header comment. Every repair pass below uses
// `isStandardSeedRow` (not the more permissive `isSeedRow`), which also
// excludes rich-profile rows: those were never affected by either legacy
// bug this repairs.
const isStandardSeedRow = seedData.isStandardSeedRow;

// Self-check, run on every invocation before any network call: proves the
// guards actually distinguish "starts with" from "contains", and that a
// rich-profile row is never treated as a standard-profile one even though
// its prefix contains the standard prefix.
{
  const assert = require("node:assert");
  assert.strictEqual(seedData.isSeedRow({ task_id: "seed-te-0001" }), true);
  assert.strictEqual(
    seedData.isSeedRow({ task_id: "my-seed-te-0001" }),
    false,
    "isSeedRow must reject a task_id that only CONTAINS the seed prefix"
  );
  assert.strictEqual(seedData.isSeedRow({ task_id: "unrelated" }), false);
  assert.strictEqual(seedData.isSeedRow({}), false);
  assert.strictEqual(isStandardSeedRow({ task_id: "seed-te-0001" }), true);
  assert.strictEqual(
    isStandardSeedRow({ task_id: `${seedData.RICH_TASK_ID_PREFIX}0001` }),
    false,
    "isStandardSeedRow must never treat a rich-profile row as a standard one"
  );
}

async function fetchLegacySegmentRows() {
  const rows = [];
  let page = 1;
  for (;;) {
    const data = await pbFetch(
      `/api/collections/task_entries/records?page=${page}&perPage=500&fields=id,task_id,work_ms,segments&filter=${encodeURIComponent('task_id ~ "seed-te-"')}`
    );
    for (const item of data.items) if (isStandardSeedRow(item) && Array.isArray(item.segments)) rows.push(item);
    if (page >= data.totalPages) break;
    page++;
  }
  return rows;
}

// --- session grouping ----------------------------------------------------
//
// A "session" = several task_entries rows sharing one `session_id`. See
// `makeSessionAssigner` in lib/seed-data.js for the full grouping
// rationale (one open session per bucket, kept alive for the whole
// stream; a `mixed` session absorbs rows regardless of bucket for a
// stretch). These wrappers pin the standard profile's own pools/sizes so
// every call site below keeps its original two-argument shape.

function noTaskBucketKey(client, project) {
  return seedData.noTaskBucketKey(client, project);
}

function makeSessionAssigner(streamKey) {
  return seedData.makeSessionAssigner(streamKey, {
    namePool: TASK_TITLES,
    machinePool: MACHINES,
    minSize: 1,
    maxSize: SESSION_MAX_SIZE,
    mixedEvery: MIXED_SESSION_EVERY,
  });
}

async function fetchSessionRepairRows() {
  const rows = [];
  let page = 1;
  for (;;) {
    const data = await pbFetch(
      `/api/collections/task_entries/records?page=${page}&perPage=500&fields=id,task_id,client,project,task,machine,session_id,session_name&filter=${encodeURIComponent('task_id ~ "seed-te-"')}`
    );
    for (const item of data.items) if (isStandardSeedRow(item)) rows.push(item);
    if (page >= data.totalPages) break;
    page++;
  }
  return rows;
}

// Repairs session_id/session_name/machine for EVERY standard-profile
// seed-te- row (freshly created this run or left over from before this
// fix), so re-running the script is idempotent and an already-seeded
// owner-facing dev DB gets repaired in place too. Recomputes the same
// three streams (regular/unassigned/opencode) used at creation time,
// sorted by task_id so the recomputation always matches creation-time
// order, and only returns rows whose stored value actually differs from
// the target.
function computeSessionRepairUpdates(rows) {
  const regular = [];
  const unassigned = [];
  const opencode = [];
  for (const row of rows) {
    if (row.task_id.startsWith("seed-te-un-")) unassigned.push(row);
    else if (row.task_id.startsWith("seed-te-oc-")) opencode.push(row);
    else regular.push(row);
  }

  const byTaskId = (a, b) => (a.task_id < b.task_id ? -1 : a.task_id > b.task_id ? 1 : 0);
  regular.sort(byTaskId);
  unassigned.sort(byTaskId);
  opencode.sort(byTaskId);

  const streams = [
    { rows: regular, assign: makeSessionAssigner("session-groups-regular") },
    { rows: unassigned, assign: makeSessionAssigner("session-groups-unassigned") },
    { rows: opencode, assign: makeSessionAssigner("session-groups-opencode") },
  ];

  const updates = [];
  for (const { rows: streamRows, assign } of streams) {
    for (const row of streamRows) {
      const bucketKey = row.task || noTaskBucketKey(row.client, row.project);
      const session = assign(row.task_id, bucketKey);
      if (
        row.session_id !== session.session_id ||
        row.session_name !== session.session_name ||
        row.machine !== session.machine
      ) {
        updates.push({
          key: row.task_id,
          collection: "task_entries",
          id: row.id,
          body: {
            session_id: session.session_id,
            session_name: session.session_name,
            machine: session.machine,
          },
        });
      }
    }
  }
  return updates;
}

function randomStartedAt() {
  const now = Date.now();
  const offsetMs = randInt(0, WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return new Date(now - offsetMs);
}

function toPbDate(d) {
  return d.toISOString().replace("T", " ").replace("Z", "Z");
}

function buildEntryPayload({
  taskId,
  client,
  project,
  task,
  repoProject,
  legacyLabel,
  sessionId,
  sessionName,
  sessionMachine,
}) {
  const startedAt = randomStartedAt();
  const wallMs = randInt(3 * 60 * 1000, 4 * 60 * 60 * 1000);
  const waitingMs = randInt(0, Math.floor(wallMs * 0.2));
  const workMs = wallMs - waitingMs;
  const endedAt = new Date(startedAt.getTime() + wallMs);

  const input = randInt(300, 9000);
  const output = randInt(150, 4500);
  const cacheRead = randInt(0, 25000);
  const cacheWrite = randInt(0, 6000);
  const cost = randFloat(
    input * 0.000003 + output * 0.000015 + cacheRead * 0.0000003 + cacheWrite * 0.00000375,
    input * 0.000004 + output * 0.000018 + cacheRead * 0.0000004 + cacheWrite * 0.00000450,
    6
  );

  const subagentCount = rand() < 0.22 ? randInt(1, 3) : 0;

  // Always draw a value here, in the same order as an un-grouped run,
  // even when a session-assignment param below overrides it — this keeps
  // the shared `rand` sequence (and therefore every other field's value)
  // identical to a pre-session-grouping run. See the session-grouping
  // comment above `makeSessionAssigner`.
  const segments = buildSegments(workMs);
  const runsVal = randInt(1, 6);
  const turnsVal = randInt(1, 20);
  const statusVal = pick(STATUSES);
  const drawnSessionName = pick(TASK_TITLES);
  const drawnMachine = pick(MACHINES);
  const modelVal = pick(MODELS);

  return {
    task_id: taskId,
    client,
    project: project || "",
    task: task || "",
    started_at: toPbDate(startedAt),
    ended_at: toPbDate(endedAt),
    wall_ms: wallMs,
    waiting_ms: waitingMs,
    work_ms: workMs,
    input,
    output,
    cache_read: cacheRead,
    cache_write: cacheWrite,
    cost,
    segments,
    subagent_count: subagentCount,
    runs: runsVal,
    turns: turnsVal,
    status: statusVal,
    session_id: sessionId || `session-${taskId}`,
    session_name: sessionName || drawnSessionName,
    machine: sessionMachine || drawnMachine,
    model: modelVal,
    prompt: "",
    legacy_client_label: legacyLabel || "",
    repo_project: repoProject || "",
    schema: 1,
    // All rows this script creates directly are written by the pi package,
    // whose measurement is the full one (mirrors migration 1758300013's
    // backfill derivation for subagent_linkage).
    agent: "pi",
    plugin: "kankaku",
    waiting_quality: "measured",
    cost_quality: "measured",
    subagent_linkage: subagentCount > 0 ? "linked" : "not_applicable",
  };
}

// Demo rows for a second agent ("opencode"), to exercise agent/quality UI in
// dev. Uses ITS OWN mulberry32 instance seeded from the row's task_id (same
// isolation pattern as buildSegmentsFor above), so it never advances the
// shared `rand` sequence — every existing seeded row's values stay stable
// across reruns regardless of this batch's size.
function buildOpencodeEntryPayload({
  taskId,
  client,
  project,
  task,
  repoProject,
  sessionId,
  sessionName,
  sessionMachine,
}) {
  const local = seedData.mulberry32(seedData.hashString(`opencode-demo-${taskId}`));
  const startedAt = new Date(Date.now() - Math.floor(local() * WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const wallMs = Math.floor(3 * 60 * 1000 + local() * (4 * 60 * 60 * 1000 - 3 * 60 * 1000));
  // opencode's plugin exposes no waiting-time signal: work_ms == wall_ms is
  // an upper bound, hence waiting_quality "unavailable" below.
  const waitingMs = 0;
  const workMs = wallMs;
  const endedAt = new Date(startedAt.getTime() + wallMs);

  const input = Math.floor(300 + local() * (9000 - 300));
  const output = Math.floor(150 + local() * (4500 - 150));
  const cacheRead = Math.floor(local() * 25000);
  const cacheWrite = Math.floor(local() * 6000);
  // cost_quality "estimated": computed from token counts, not provider-reported.
  const cost = Number((input * 0.000004 + output * 0.000015 + cacheRead * 0.0000004 + cacheWrite * 0.0000045).toFixed(6));

  const linkage = OPENCODE_SUBAGENT_LINKAGE[Math.floor(local() * OPENCODE_SUBAGENT_LINKAGE.length)];
  const subagentCount = linkage === "not_applicable" ? 0 : 1 + Math.floor(local() * 2);

  // Same discipline as buildEntryPayload above: always draw these, in the
  // same order, even when a session-assignment param overrides them, so
  // this row's own isolated `local` sequence (and every other field) stays
  // identical to a pre-session-grouping run.
  const segments = buildSegmentsFor(taskId, workMs);
  const runsVal = 1 + Math.floor(local() * 5);
  const turnsVal = 1 + Math.floor(local() * 19);
  const statusVal = STATUSES[Math.floor(local() * STATUSES.length)];
  const drawnSessionName = TASK_TITLES[Math.floor(local() * TASK_TITLES.length)];
  const drawnMachine = MACHINES[Math.floor(local() * MACHINES.length)];

  return {
    task_id: taskId,
    client,
    project: project || "",
    task: task || "",
    started_at: toPbDate(startedAt),
    ended_at: toPbDate(endedAt),
    wall_ms: wallMs,
    waiting_ms: waitingMs,
    work_ms: workMs,
    input,
    output,
    cache_read: cacheRead,
    cache_write: cacheWrite,
    cost,
    segments,
    subagent_count: subagentCount,
    runs: runsVal,
    turns: turnsVal,
    status: statusVal,
    session_id: sessionId || `session-${taskId}`,
    session_name: sessionName || drawnSessionName,
    machine: sessionMachine || drawnMachine,
    model: "gpt-5-codex",
    prompt: "",
    legacy_client_label: "",
    repo_project: repoProject || "",
    schema: 1,
    agent: "opencode",
    agent_version: "0.1.0",
    plugin: "kankaku-opencode",
    plugin_version: "0.1.0",
    waiting_quality: "unavailable",
    cost_quality: "estimated",
    subagent_linkage: linkage,
  };
}

async function seedStandardProfile() {
  console.log(`Seeding ${PB_URL} (profile=standard) ...`);
  await authenticate();

  // 1. clients -----------------------------------------------------------
  const existingClients = await fetchAllValues("clients", "code");
  const clientCreates = CLIENTS.filter((c) => !existingClients.has(c.code)).map((c) => ({
    key: c.code,
    collection: "clients",
    body: {
      name: c.name,
      code: c.code,
      active: true,
      unassigned: false,
      website: c.website || "",
      contact_email: c.contact_email || "",
      contact_phone: c.contact_phone || "",
      notes: c.notes || "",
    },
  }));
  const createdClients = await batchCreate(clientCreates);
  for (const { key, record } of createdClients) existingClients.set(key, record);
  const clientIdByCode = new Map([...existingClients].map(([code, rec]) => [code, rec.id]));
  console.log(`clients: ${clientCreates.length} created, ${CLIENTS.length} total expected`);

  // Re-apply the four contact fields to demo clients that already existed
  // (see the header comment above: this is the one exception to "create
  // only, never touch existing rows" in this script, because contact
  // fields on the demo clients are pure display data, not owner-authored
  // state). Never touches "Sin determinar" (not in CLIENTS).
  const clientContactUpdates = CLIENTS.filter((c) => existingClients.has(c.code) && !createdClients.some((cc) => cc.key === c.code)).map((c) => ({
    key: c.code,
    collection: "clients",
    id: clientIdByCode.get(c.code),
    body: {
      website: c.website || "",
      contact_email: c.contact_email || "",
      contact_phone: c.contact_phone || "",
      notes: c.notes || "",
    },
  }));
  if (clientContactUpdates.length > 0) {
    await batchUpdate(clientContactUpdates);
  }
  console.log(`clients: ${clientContactUpdates.length} had contact fields refreshed`);

  // 2. projects ------------------------------------------------------------
  const existingProjects = await fetchAllValues("projects", "code");
  const projectCreates = PROJECTS.filter((p) => !existingProjects.has(p.code)).map((p) => ({
    key: p.code,
    collection: "projects",
    body: {
      name: p.name,
      code: p.code,
      client: clientIdByCode.get(p.client),
      repo_paths: [p.repo],
      active: true,
    },
  }));
  const createdProjects = await batchCreate(projectCreates);
  for (const { key, record } of createdProjects) existingProjects.set(key, record);
  const projectIdByCode = new Map([...existingProjects].map(([code, rec]) => [code, rec.id]));
  console.log(`projects: ${projectCreates.length} created, ${PROJECTS.length} total expected`);

  // 3. tasks (deduped by external_ref, used as a stable seed key) --------
  const existingTasks = await fetchAllValues("tasks", "external_ref");
  const taskSeeds = TASK_TITLES.map((title, i) => ({
    ref: `SEED-${String(i + 1).padStart(3, "0")}`,
    title,
    project: PROJECTS[i % PROJECTS.length].code,
  }));
  const taskCreates = taskSeeds
    .filter((t) => !existingTasks.has(t.ref))
    .map((t) => ({
      key: t.ref,
      collection: "tasks",
      body: {
        title: t.title,
        project: projectIdByCode.get(t.project),
        status: pick(["open", "doing", "done", "done"]),
        external_ref: t.ref,
      },
    }));
  const createdTasks = await batchCreate(taskCreates);
  for (const { key, record } of createdTasks) existingTasks.set(key, record);
  console.log(`tasks: ${taskCreates.length} created, ${taskSeeds.length} total expected`);

  const taskList = taskSeeds.map((t) => ({ ...t, id: existingTasks.get(t.ref).id }));

  // 4. task_entries: regular, spread across real tasks/projects -----------
  const existingEntryIds = await fetchAllValues("task_entries", "task_id");
  const entryCreates = [];

  const assignRegularSession = makeSessionAssigner("session-groups-regular");
  for (let i = 1; i <= REGULAR_ENTRY_COUNT; i++) {
    const taskId = `seed-te-${String(i).padStart(4, "0")}`;
    if (existingEntryIds.has(taskId)) continue;

    const useTask = rand() < 0.9;
    const task = useTask ? pick(taskList) : null;
    const projectCode = task ? task.project : pick(PROJECTS).code;
    const project = PROJECTS.find((p) => p.code === projectCode);
    const entryClient = clientIdByCode.get(project.client);
    const entryProject = projectIdByCode.get(project.code);
    const bucketKey = task ? task.id : noTaskBucketKey(entryClient, entryProject);
    const session = assignRegularSession(taskId, bucketKey);

    entryCreates.push({
      key: taskId,
      collection: "task_entries",
      body: buildEntryPayload({
        taskId,
        client: entryClient,
        project: entryProject,
        task: task ? task.id : null,
        repoProject: project.repo,
        sessionId: session.session_id,
        sessionName: session.session_name,
        sessionMachine: session.machine,
      }),
    });
  }

  // 5. task_entries: "Sin determinar" queue, varied legacy labels ---------
  const unassignedClientId = clientIdByCode.get("sin-determinar");
  if (!unassignedClientId) {
    throw new Error('"Sin determinar" client not found — did migrations run?');
  }

  const assignUnassignedSession = makeSessionAssigner("session-groups-unassigned");
  for (let i = 1; i <= UNASSIGNED_ENTRY_COUNT; i++) {
    const taskId = `seed-te-un-${String(i).padStart(3, "0")}`;
    if (existingEntryIds.has(taskId)) continue;

    const session = assignUnassignedSession(taskId, noTaskBucketKey(unassignedClientId, ""));

    entryCreates.push({
      key: taskId,
      collection: "task_entries",
      body: buildEntryPayload({
        taskId,
        client: unassignedClientId,
        project: null,
        task: null,
        repoProject: "",
        legacyLabel: pick(LEGACY_LABELS),
        sessionId: session.session_id,
        sessionName: session.session_name,
        sessionMachine: session.machine,
      }),
    });
  }

  // 5b. task_entries: demo rows for a second agent ("opencode"), to exercise
  // agent/quality UI in dev. Small, clearly-labelled batch; deterministic
  // task ids with a distinct prefix, reusing the first seeded project so no
  // new client/project is invented for this.
  const opencodeProject = PROJECTS[0];
  const opencodeTasks = taskList.filter((t) => t.project === opencodeProject.code);
  const assignOpencodeSession = makeSessionAssigner("session-groups-opencode");
  for (let i = 1; i <= OPENCODE_ENTRY_COUNT; i++) {
    const taskId = `seed-te-oc-${String(i).padStart(3, "0")}`;
    if (existingEntryIds.has(taskId)) continue;

    const task = i % 2 === 0 && opencodeTasks.length > 0 ? opencodeTasks[i % opencodeTasks.length] : null;
    const entryClient = clientIdByCode.get(opencodeProject.client);
    const entryProject = projectIdByCode.get(opencodeProject.code);
    const bucketKey = task ? task.id : noTaskBucketKey(entryClient, entryProject);
    const session = assignOpencodeSession(taskId, bucketKey);

    entryCreates.push({
      key: taskId,
      collection: "task_entries",
      body: buildOpencodeEntryPayload({
        taskId,
        client: entryClient,
        project: entryProject,
        task: task ? task.id : null,
        repoProject: opencodeProject.repo,
        sessionId: session.session_id,
        sessionName: session.session_name,
        sessionMachine: session.machine,
      }),
    });
  }

  const createdEntries = await batchCreate(entryCreates);
  for (const { key, record } of createdEntries) existingEntryIds.set(key, record);
  console.log(`task_entries: ${entryCreates.length} created`);

  // 5b. Repair demo rows still holding the legacy array-shaped `segments`.
  // Only standard-profile seed rows (task_id "seed-te-…", excluding rich
  // rows) with an ARRAY value are touched, so a real synced entry, a rich
  // row, or an already-correct row is never modified.
  const legacyRows = await fetchLegacySegmentRows();
  await batchUpdate(
    legacyRows.map((row) => ({
      key: row.task_id,
      collection: "task_entries",
      id: row.id,
      body: { segments: buildSegmentsFor(row.task_id, row.work_ms) },
    }))
  );
  console.log(`task_entries: ${legacyRows.length} had legacy segments repaired`);

  // 5c. Repair session_id/session_name/machine for every standard-profile
  // seed-te- row so sessions group realistically (several entries per
  // session, consistent client/project/machine, a few crossing tasks)
  // instead of the old one-entry-per-session scheme. Covers rows left over
  // from before this fix as well as rows just created above — see the
  // session-grouping comment near `makeSessionAssigner`.
  const sessionRepairRows = await fetchSessionRepairRows();
  const sessionUpdates = computeSessionRepairUpdates(sessionRepairRows);
  await batchUpdate(sessionUpdates);
  console.log(`task_entries: ${sessionUpdates.length} had session grouping repaired`);

  // 6. work_records for entries with subagent_count > 0 -------------------
  const existingWorkRecordIds = await fetchAllValues("work_records", "kankaku_id");
  const workRecordCreates = [];

  for (const { key, record } of createdEntries) {
    const subagentCount = record.subagent_count || 0;
    if (subagentCount === 0) continue;

    const orchestratorId = `${key}-orch`;
    if (!existingWorkRecordIds.has(orchestratorId)) {
      workRecordCreates.push({
        key: orchestratorId,
        collection: "work_records",
        body: {
          kankaku_id: orchestratorId,
          task_entry: record.id,
          rollup: false,
          role: "orchestrator",
          pid: randInt(1000, 60000),
          parent_pid: 0,
          started_at: record.started_at,
          settled_at: record.ended_at,
          wall_ms: record.wall_ms,
          waiting_ms: record.waiting_ms,
          work_ms: record.work_ms,
          runs: record.runs,
          turns: record.turns,
          status: record.status,
          model: record.model,
          input: Math.round(record.input * 0.6),
          output: Math.round(record.output * 0.6),
          cache_read: Math.round(record.cache_read * 0.6),
          cache_write: Math.round(record.cache_write * 0.6),
          cost: Number((record.cost * 0.6).toFixed(6)),
          segments: record.segments,
          tools: ["Read", "Edit", "Bash"],
          session_id: record.session_id,
          prompt: "",
          machine: record.machine,
          schema: 1,
        },
      });
    }

    for (let s = 1; s <= subagentCount; s++) {
      const subId = `${key}-sub-${s}`;
      if (existingWorkRecordIds.has(subId)) continue;

      const share = 0.4 / subagentCount;
      workRecordCreates.push({
        key: subId,
        collection: "work_records",
        body: {
          kankaku_id: subId,
          task_entry: record.id,
          rollup: false,
          role: "subagent",
          pid: randInt(1000, 60000),
          parent_pid: randInt(1000, 60000),
          started_at: record.started_at,
          settled_at: record.ended_at,
          wall_ms: Math.round(record.wall_ms * share),
          waiting_ms: 0,
          work_ms: Math.round(record.work_ms * share),
          runs: randInt(1, 3),
          turns: randInt(1, 8),
          status: "completed",
          model: record.model,
          input: Math.round((record.input * share) / 0.6),
          output: Math.round((record.output * share) / 0.6),
          cache_read: Math.round((record.cache_read * share) / 0.6),
          cache_write: Math.round((record.cache_write * share) / 0.6),
          cost: Number(((record.cost * share) / 0.6).toFixed(6)),
          segments: record.segments,
          tools: ["Read", "Grep"],
          session_id: record.session_id,
          prompt: "",
          machine: record.machine,
          schema: 1,
        },
      });
    }
  }

  await batchCreate(workRecordCreates);
  console.log(`work_records: ${workRecordCreates.length} created`);

  console.log("Seed complete (standard).");
}

// --- rich profile ---------------------------------------------------------
//
// Orchestration only: every generator/catalog is pure and lives in
// lib/seed-data.js (RICH_PROFILE, buildRichEntryPayload,
// buildRichWorkRecordPayloads), unit tested in seed-data.test.js.

async function seedRichProfile() {
  console.log(`Seeding ${PB_URL} (profile=rich) ...`);
  await authenticate();

  const RICH = seedData.RICH_PROFILE;

  // 1. clients -------------------------------------------------------------
  const existingClients = await fetchAllValues("clients", "code");
  const clientCreates = RICH.CLIENTS.filter((c) => !existingClients.has(c.code)).map((c) => ({
    key: c.code,
    collection: "clients",
    body: {
      name: c.name,
      code: c.code,
      active: true,
      unassigned: false,
      website: c.website,
      contact_email: c.contact_email,
      contact_phone: c.contact_phone,
      notes: c.notes,
    },
  }));
  const createdClients = await batchCreate(clientCreates);
  for (const { key, record } of createdClients) existingClients.set(key, record);
  const clientIdByCode = new Map([...existingClients].map(([code, rec]) => [code, rec.id]));
  console.log(`[rich] clients: ${clientCreates.length} created, ${RICH.CLIENTS.length} total expected`);

  // 2. projects --------------------------------------------------------------
  const existingProjects = await fetchAllValues("projects", "code");
  const projectCreates = RICH.PROJECTS.filter((p) => !existingProjects.has(p.code)).map((p) => ({
    key: p.code,
    collection: "projects",
    body: {
      name: p.name,
      code: p.code,
      client: clientIdByCode.get(p.client),
      repo_paths: [p.repo],
      active: true,
    },
  }));
  const createdProjects = await batchCreate(projectCreates);
  for (const { key, record } of createdProjects) existingProjects.set(key, record);
  const projectIdByCode = new Map([...existingProjects].map(([code, rec]) => [code, rec.id]));
  console.log(`[rich] projects: ${projectCreates.length} created, ${RICH.PROJECTS.length} total expected`);

  // 3. tasks -------------------------------------------------------------
  const existingTasks = await fetchAllValues("tasks", "external_ref");
  const taskCreates = RICH.TASKS.filter((t) => !existingTasks.has(t.ref)).map((t) => ({
    key: t.ref,
    collection: "tasks",
    body: {
      title: t.title,
      project: projectIdByCode.get(t.project),
      status: pick(["open", "doing", "done", "done"]),
      external_ref: t.ref,
    },
  }));
  const createdTasks = await batchCreate(taskCreates);
  for (const { key, record } of createdTasks) existingTasks.set(key, record);
  console.log(`[rich] tasks: ${taskCreates.length} created, ${RICH.TASKS.length} total expected`);

  const taskList = RICH.TASKS.map((t) => ({ ...t, id: existingTasks.get(t.ref).id }));

  // 4. task_entries ---------------------------------------------------------
  const existingEntryIds = await fetchAllValues("task_entries", "task_id");
  const entryCreates = [];
  const now = Date.now();

  const assignRichSession = seedData.makeSessionAssigner("rich-session-groups-regular", {
    sessionIdPrefix: "session-rich-",
    namePool: RICH.SESSION_NAME_POOL,
    machinePool: RICH.MACHINES,
    minSize: 1,
    maxSize: 15,
    namedProbability: 0.4,
  });

  for (let i = 1; i <= RICH_ENTRY_COUNT; i++) {
    const taskId = `${seedData.RICH_TASK_ID_PREFIX}${String(i).padStart(4, "0")}`;
    if (existingEntryIds.has(taskId)) continue;

    const useTask = rand() < 0.9;
    const task = useTask ? pick(taskList) : null;
    const projectCode = task ? task.project : pick(RICH.PROJECTS).code;
    const project = RICH.PROJECTS.find((p) => p.code === projectCode);
    const entryClient = clientIdByCode.get(project.client);
    const entryProject = projectIdByCode.get(project.code);
    const bucketKey = task ? task.id : seedData.noTaskBucketKey(entryClient, entryProject);
    const session = assignRichSession(taskId, bucketKey);

    entryCreates.push({
      key: taskId,
      collection: "task_entries",
      body: seedData.buildRichEntryPayload(
        {
          taskId,
          clientId: entryClient,
          projectId: entryProject,
          taskRecordId: task ? task.id : null,
          repoProject: project.repo,
          sessionId: session.session_id,
          sessionName: session.session_name,
          sessionMachine: session.machine,
          now,
          windowDays: RICH_WINDOW_DAYS,
        },
        rand
      ),
    });
  }

  // 5. task_entries: a handful of "Sin determinar" legacy rows -------------
  const unassignedClientId = clientIdByCode.get("sin-determinar");
  if (!unassignedClientId) {
    throw new Error('"Sin determinar" client not found — did migrations run?');
  }

  const assignRichUnassignedSession = seedData.makeSessionAssigner("rich-session-groups-unassigned", {
    sessionIdPrefix: "session-rich-",
    namePool: RICH.SESSION_NAME_POOL,
    machinePool: RICH.MACHINES,
    minSize: 1,
    maxSize: 15,
    namedProbability: 0.4,
  });

  for (let i = 1; i <= RICH_UNASSIGNED_COUNT; i++) {
    const taskId = `${seedData.RICH_TASK_ID_PREFIX}un-${String(i).padStart(3, "0")}`;
    if (existingEntryIds.has(taskId)) continue;

    const session = assignRichUnassignedSession(taskId, seedData.noTaskBucketKey(unassignedClientId, ""));

    entryCreates.push({
      key: taskId,
      collection: "task_entries",
      body: seedData.buildRichEntryPayload(
        {
          taskId,
          clientId: unassignedClientId,
          projectId: null,
          taskRecordId: null,
          repoProject: "",
          legacyLabel: pick(RICH.LEGACY_LABELS),
          sessionId: session.session_id,
          sessionName: session.session_name,
          sessionMachine: session.machine,
          now,
          windowDays: RICH_WINDOW_DAYS,
        },
        rand
      ),
    });
  }

  const createdEntries = await batchCreate(entryCreates);
  for (const { key, record } of createdEntries) existingEntryIds.set(key, record);
  console.log(`[rich] task_entries: ${entryCreates.length} created`);

  // 6. work_records for entries with subagent_count > 0 ---------------------
  const existingWorkRecordIds = await fetchAllValues("work_records", "kankaku_id");
  const workRecordCreates = [];

  for (const { key, record } of createdEntries) {
    const subagentCount = record.subagent_count || 0;
    if (subagentCount === 0) continue;

    const { orchestrator, subagents } = seedData.buildRichWorkRecordPayloads(record, subagentCount, rand);

    const orchestratorId = `${key}-orch`;
    if (!existingWorkRecordIds.has(orchestratorId)) {
      workRecordCreates.push({
        key: orchestratorId,
        collection: "work_records",
        body: { kankaku_id: orchestratorId, task_entry: record.id, ...orchestrator },
      });
    }

    subagents.forEach((sub, idx) => {
      const subId = `${key}-sub-${idx + 1}`;
      if (existingWorkRecordIds.has(subId)) return;
      workRecordCreates.push({
        key: subId,
        collection: "work_records",
        body: { kankaku_id: subId, task_entry: record.id, ...sub },
      });
    });
  }

  await batchCreate(workRecordCreates);
  console.log(`[rich] work_records: ${workRecordCreates.length} created`);

  console.log("Seed complete (rich).");
}

async function main() {
  if (SEED_PROFILE === "rich") {
    await seedRichProfile();
  }
  else {
    await seedStandardProfile();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
