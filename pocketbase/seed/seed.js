#!/usr/bin/env node
// Dev-only seed script. No dependencies, Node >= 20 (uses global fetch).
//
// Inserts a realistic demo dataset: clients, projects, tasks, task_entries
// spread over the last 60 days (some with subagents -> work_records
// children), plus a batch of "Sin determinar" entries with varied
// legacy_client_label spellings to exercise the reassignment queue
// described in docs/proposal.md §5.3.
//
// Deterministic and re-runnable: every row has a stable natural key
// (clients.code, projects.code, tasks.external_ref, task_entries.task_id,
// work_records.kankaku_id) and the script looks up existing rows before
// creating, so running it twice never duplicates data.
//
// Demo clients also carry plausible values for the four optional contact
// fields (`website`, `contact_email`, `contact_phone`, `notes`). Unlike the
// rest of this script (which only ever creates missing rows), the contact
// fields ARE re-applied to already-existing demo clients on every run: they
// are pure demo/display data, not something a script needs to treat as
// owner-authored, so keeping them in sync with this file's canonical values
// is more useful than leaving old runs stale after the fields are edited
// here. The "Sin determinar" client is seeded by migration
// `1758300008_seed_unassigned_client.js`, not by this script, and is never
// touched here — its contact fields stay empty, same as its other fields.
//
// Usage:
//   PB_URL=http://127.0.0.1:8090 node pocketbase/seed/seed.js

const PB_URL = process.env.PB_URL || "http://127.0.0.1:8090";
const SUPERUSER_EMAIL = process.env.PB_SUPERUSER_EMAIL || "admin@kankaku.local";
const SUPERUSER_PASSWORD = process.env.PB_SUPERUSER_PASSWORD || "kankaku-dev-admin";

const BATCH_SIZE = 50;
const REGULAR_ENTRY_COUNT = 400;
const UNASSIGNED_ENTRY_COUNT = 30;
const WINDOW_DAYS = 60;

// --- deterministic PRNG (mulberry32) so re-runs generate the exact same
// dataset shape, which is what makes the idempotency check meaningful. ---
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
const rand = mulberry32(424242);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const randInt = (min, max) => Math.floor(min + rand() * (max - min + 1));
const randFloat = (min, max, decimals = 4) => {
  const v = min + rand() * (max - min);
  return Number(v.toFixed(decimals));
};

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

// --- demo catalog ------------------------------------------------------

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

function randomStartedAt() {
  const now = Date.now();
  const offsetMs = randInt(0, WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return new Date(now - offsetMs);
}

function toPbDate(d) {
  return d.toISOString().replace("T", " ").replace("Z", "Z");
}

function buildEntryPayload({ taskId, client, project, task, repoProject, legacyLabel }) {
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
    segments: [{ start: toPbDate(startedAt), end: toPbDate(endedAt) }],
    subagent_count: subagentCount,
    runs: randInt(1, 6),
    turns: randInt(1, 20),
    status: pick(STATUSES),
    session_id: `session-${taskId}`,
    session_name: pick(TASK_TITLES),
    machine: pick(MACHINES),
    model: pick(MODELS),
    prompt: "",
    legacy_client_label: legacyLabel || "",
    repo_project: repoProject || "",
    schema: 1,
  };
}

async function main() {
  console.log(`Seeding ${PB_URL} ...`);
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

  for (let i = 1; i <= REGULAR_ENTRY_COUNT; i++) {
    const taskId = `seed-te-${String(i).padStart(4, "0")}`;
    if (existingEntryIds.has(taskId)) continue;

    const useTask = rand() < 0.9;
    const task = useTask ? pick(taskList) : null;
    const projectCode = task ? task.project : pick(PROJECTS).code;
    const project = PROJECTS.find((p) => p.code === projectCode);

    entryCreates.push({
      key: taskId,
      collection: "task_entries",
      body: buildEntryPayload({
        taskId,
        client: clientIdByCode.get(project.client),
        project: projectIdByCode.get(project.code),
        task: task ? task.id : null,
        repoProject: project.repo,
      }),
    });
  }

  // 5. task_entries: "Sin determinar" queue, varied legacy labels ---------
  const unassignedClientId = clientIdByCode.get("sin-determinar");
  if (!unassignedClientId) {
    throw new Error('"Sin determinar" client not found — did migrations run?');
  }

  for (let i = 1; i <= UNASSIGNED_ENTRY_COUNT; i++) {
    const taskId = `seed-te-un-${String(i).padStart(3, "0")}`;
    if (existingEntryIds.has(taskId)) continue;

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
      }),
    });
  }

  const createdEntries = await batchCreate(entryCreates);
  for (const { key, record } of createdEntries) existingEntryIds.set(key, record);
  console.log(`task_entries: ${entryCreates.length} created`);

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

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
