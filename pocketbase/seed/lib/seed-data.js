"use strict";

// Pure helpers extracted from pocketbase/seed/seed.js so they can be unit
// tested without a network or a PocketBase instance. Nothing in this file
// performs I/O: PRNG utilities, seed-row guards, the tagged-segments and
// session-grouping algorithms, and the "rich" demo profile's static
// catalogs (clients/projects/tasks) and payload builders. seed.js owns all
// orchestration (auth, batching, create-if-missing lookups against
// PocketBase).

// --- deterministic PRNG (mulberry32) --------------------------------------

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

// FNV-1a, used to derive an independent, stable PRNG seed from a string key
// (e.g. a task_id or a stream name) without ever advancing a shared `rand`
// sequence — see the session-grouping and per-row repair generators below.
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function randInt(rand, min, max) {
  return Math.floor(min + rand() * (max - min + 1));
}

function randFloat(rand, min, max, decimals = 4) {
  const v = min + rand() * (max - min);
  return Number(v.toFixed(decimals));
}

/**
 * Picks one value from a weighted pool: [{ value, weight }, ...]. Weights
 * are relative, not required to sum to 1 or 100. A zero-weight entry is
 * never returned. Falls back to the last entry only as a numerical-edge
 * safety net (e.g. floating point rounding leaving `r` just above zero on
 * the last comparison) — every real draw is decided by the loop above it.
 */
function weightedPick(rand, weightedEntries) {
  const total = weightedEntries.reduce((sum, e) => sum + e.weight, 0);
  let r = rand() * total;
  for (const entry of weightedEntries) {
    if (r < entry.weight) return entry.value;
    r -= entry.weight;
  }
  return weightedEntries[weightedEntries.length - 1].value;
}

// --- seed-row guards -------------------------------------------------------
//
// `task_id ~ "seed-te-"` (used by the standard-profile repair queries in
// seed.js) is a SQL "contains", not "starts with" — the server-side filter
// alone would also match a real synced row whose task_id happens to CONTAIN
// "seed-te-" anywhere. Every repair pass must apply this client-side
// "starts with" check before touching a row.

const SEED_TASK_ID_PREFIX = "seed-te-";
const RICH_TASK_ID_PREFIX = "seed-te-rich-";

function isSeedRow(row) {
  return typeof row.task_id === "string" && row.task_id.startsWith(SEED_TASK_ID_PREFIX);
}

function isRichSeedRow(row) {
  return typeof row.task_id === "string" && row.task_id.startsWith(RICH_TASK_ID_PREFIX);
}

// Standard-profile rows only. `RICH_TASK_ID_PREFIX` ("seed-te-rich-") itself
// starts with `SEED_TASK_ID_PREFIX` ("seed-te-"), so `isSeedRow` alone would
// also match rich rows. The standard-profile repair passes in seed.js
// (legacy array-shaped `segments`, pre-grouping-fix `session_id`) exist to
// fix bugs specific to the STANDARD generator's history; rich rows were
// never affected by either bug and must never be recomputed by that logic.
function isStandardSeedRow(row) {
  return isSeedRow(row) && !isRichSeedRow(row);
}

// --- tagged segments -------------------------------------------------------

/**
 * Builds a tag -> milliseconds map whose total never exceeds `workMs`
 * (kankaku's real `segments` shape — see src/domain/hub-entry.ts in the
 * kankaku repo). Returns `{}` when there is no work, or (by default) with
 * `emptyProbability` chance even when there is — a real entry with no
 * tagged segments is a common case worth seeding.
 */
function buildTaggedSegments(rand, workMs, tags, options = {}) {
  const emptyProbability = options.emptyProbability ?? 0.45;
  const maxTagCount = options.maxTagCount ?? 2;
  if (workMs <= 0 || rand() < emptyProbability) return {};
  const tagCount = 1 + Math.floor(rand() * maxTagCount);
  const shuffled = [...tags].sort(() => rand() - 0.5).slice(0, tagCount);
  const segments = {};
  let remaining = workMs;
  for (const tag of shuffled) {
    const ms = 1 + Math.floor(rand() * Math.max(1, Math.floor(remaining * 0.6)));
    segments[tag] = ms;
    remaining -= ms;
  }
  return segments;
}

// --- session grouping -------------------------------------------------
//
// A "session" = several task_entries rows sharing one `session_id`. See
// seed.js's header comment near its own call sites for the full rationale
// (one open session per bucket, kept alive for the whole stream; a `mixed`
// session absorbs rows regardless of bucket for a stretch, so a few
// sessions realistically span more than one task/client/project).

function noTaskBucketKey(client, project) {
  return `no-task:${client || ""}:${project || ""}`;
}

/**
 * @param {string} streamKey - seeds this assigner's own isolated PRNG, so it
 *   never advances any shared `rand` sequence and always reproduces the same
 *   groupings for the same (taskId, bucketKey) call sequence.
 * @param {object} [options]
 * @param {string} [options.sessionIdPrefix]
 * @param {string[]} [options.namePool] - session_name candidates.
 * @param {string[]} [options.machinePool]
 * @param {number} [options.minSize] - inclusive.
 * @param {number} [options.maxSize] - inclusive.
 * @param {number} [options.mixedEvery] - every Nth session opened is a
 *   "mixed" one that takes priority over every bucket; 0 disables mixed
 *   sessions entirely.
 * @param {number} [options.namedProbability] - 0..1; 1 (the default) means
 *   every session gets a name from `namePool` and consumes exactly the same
 *   number of PRNG draws as the original, non-optional session-name logic
 *   (no extra coin-flip draw) — this keeps the standard profile's existing
 *   deterministic streams byte-for-byte unaffected by this option's
 *   existence. Anything less than 1 spends one extra draw per session to
 *   decide whether it gets a name at all.
 */
function makeSessionAssigner(streamKey, options = {}) {
  const {
    sessionIdPrefix = "session-",
    namePool = [],
    machinePool = [],
    minSize = 1,
    maxSize = 6,
    mixedEvery = 0,
    namedProbability = 1,
  } = options;

  const local = mulberry32(hashString(streamKey));
  const openByKey = new Map();
  let activeMixed = null;
  let sessionsOpened = 0;

  function openSession(taskId) {
    sessionsOpened++;
    const named = namedProbability >= 1 ? true : local() < namedProbability;
    return {
      sessionId: `${sessionIdPrefix}${taskId}`,
      sessionName: named && namePool.length > 0 ? namePool[Math.floor(local() * namePool.length)] : "",
      machine: machinePool.length > 0 ? machinePool[Math.floor(local() * machinePool.length)] : "",
      mixed: mixedEvery > 0 && sessionsOpened % mixedEvery === 0,
      remaining: minSize + Math.floor(local() * (maxSize - minSize + 1)),
    };
  }

  return function assignSession(taskId, bucketKey) {
    let target;

    if (activeMixed && activeMixed.remaining > 0) {
      target = activeMixed;
    }
    else {
      let open = openByKey.get(bucketKey);
      if (!open || open.remaining <= 0) {
        open = openSession(taskId);
        openByKey.set(bucketKey, open);
        if (open.mixed) activeMixed = open;
      }
      target = open;
    }

    target.remaining--;
    return { session_id: target.sessionId, session_name: target.sessionName, machine: target.machine };
  };
}

// --- rich profile: static fictional catalogs ------------------------------
//
// Fully fictional, hand-written (not procedurally generated) — same style
// as seed.js's own STANDARD catalog arrays. Websites are restricted to
// `.example`/`.test` TLDs (RFC 2606) on purpose: these can never resolve to
// a real site, so the favicon-fetch feature (pocketbase/pb_hooks/favicon.pb.js)
// can never reach out to anything real even if triggered against rich data.

const RICH_CLIENTS = [
  { name: "Northwind Robotics", code: "northwind-robotics", website: "https://northwindrobotics.example", contact_email: "hello@northwindrobotics.example", contact_phone: "+1 555 010 3301", notes: "Fictional demo client — robotics/automation." },
  { name: "Pixelforge Studios", code: "pixelforge-studios", website: "https://pixelforgestudios.example", contact_email: "team@pixelforgestudios.example", contact_phone: "+1 555 010 3302", notes: "Fictional demo client — game/creative studio." },
  { name: "Ironclad Logistics", code: "ironclad-logistics", website: "https://ironcladlogistics.test", contact_email: "ops@ironcladlogistics.test", contact_phone: "+1 555 010 3303", notes: "Fictional demo client — freight/logistics." },
  { name: "Bluewave Analytics", code: "bluewave-analytics", website: "https://bluewaveanalytics.example", contact_email: "info@bluewaveanalytics.example", contact_phone: "+1 555 010 3304", notes: "Fictional demo client — data analytics." },
  { name: "Solaris Health Group", code: "solaris-health", website: "https://solarishealth.example", contact_email: "contact@solarishealth.example", contact_phone: "+1 555 010 3305", notes: "Fictional demo client — healthcare." },
  { name: "Cobalt Retail Co", code: "cobalt-retail", website: "https://cobaltretail.test", contact_email: "support@cobaltretail.test", contact_phone: "+1 555 010 3306", notes: "Fictional demo client — retail." },
  { name: "Fernwood Publishing", code: "fernwood-publishing", website: "https://fernwoodpublishing.example", contact_email: "editorial@fernwoodpublishing.example", contact_phone: "+1 555 010 3307", notes: "Fictional demo client — publishing." },
  { name: "Granite Peak Outfitters", code: "granite-peak", website: "https://granitepeak.test", contact_email: "orders@granitepeak.test", contact_phone: "+1 555 010 3308", notes: "Fictional demo client — outdoor retail." },
  { name: "Lumen Energy Partners", code: "lumen-energy", website: "https://lumenenergy.example", contact_email: "info@lumenenergy.example", contact_phone: "+1 555 010 3309", notes: "Fictional demo client — energy." },
  { name: "Cascade Freight", code: "cascade-freight", website: "https://cascadefreight.example", contact_email: "dispatch@cascadefreight.example", contact_phone: "+1 555 010 3310", notes: "Fictional demo client — freight." },
  { name: "Orchid Dental Group", code: "orchid-dental", website: "https://orchiddental.test", contact_email: "front-desk@orchiddental.test", contact_phone: "+1 555 010 3311", notes: "Fictional demo client — dental clinics." },
  { name: "Meridian Language School", code: "meridian-language", website: "https://meridianlanguage.example", contact_email: "admissions@meridianlanguage.example", contact_phone: "+1 555 010 3312", notes: "Fictional demo client — language education." },
];

const PROJECT_NAME_TEMPLATES = ["Customer Portal", "Internal Dashboard", "Mobile App", "Booking System", "Inventory Tool", "Support Desk"];
// Alternates 3/2 projects per client across the 12 clients -> exactly 30.
const PROJECTS_PER_CLIENT = [3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2];

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function buildRichProjectCatalog() {
  const projects = [];
  RICH_CLIENTS.forEach((client, clientIndex) => {
    const count = PROJECTS_PER_CLIENT[clientIndex % PROJECTS_PER_CLIENT.length];
    for (let k = 0; k < count; k++) {
      const name = PROJECT_NAME_TEMPLATES[k % PROJECT_NAME_TEMPLATES.length];
      const code = `${client.code}-${slugify(name)}`;
      projects.push({ name, code, client: client.code, repo: `/home/dev/repos/${code}` });
    }
  });
  return projects;
}

const TASK_TITLE_TEMPLATES = [
  "Fix critical bug in checkout flow",
  "Add export to CSV",
  "Improve page load performance",
  "Set up automated backups",
  "Refactor authentication module",
  "Add dark mode support",
  "Write API documentation",
  "Fix flaky integration tests",
  "Add multi-language support",
  "Optimize database queries",
  "Improve mobile navigation",
  "Add audit log",
  "Redesign settings page",
  "Add rate limiting",
  "Fix timezone bug in scheduling",
];

function buildRichTaskCatalog(projects) {
  const tasks = [];
  let index = 0;
  for (const project of projects) {
    for (let k = 0; k < 3; k++) {
      index++;
      const title = TASK_TITLE_TEMPLATES[(index - 1) % TASK_TITLE_TEMPLATES.length];
      tasks.push({ ref: `SEED-RICH-${String(index).padStart(3, "0")}`, title, project: project.code });
    }
  }
  return tasks;
}

const RICH_MACHINES = ["MacBook-Pro-Devon.local", "workstation-linux-04", "macbook-air-m4", "vps-rich-demo-01"];

const RICH_LEGACY_LABELS = [
  "northwind robotic",
  "North Wind Robotics",
  "bluewave",
  "BlueWave Analytics",
  "cobalt retial",
  "Cobalt Retail",
  "fernwood pub",
  "lumen energy ptnrs",
  "ironclad logisitcs",
  "granite pk",
];

const RICH_THINKING_LEVELS = [
  { value: "off", weight: 20 },
  { value: "minimal", weight: 15 },
  { value: "low", weight: 20 },
  { value: "medium", weight: 20 },
  { value: "high", weight: 15 },
  { value: "xhigh", weight: 7 },
  { value: "max", weight: 3 },
];

const RICH_STATUSES = [
  { value: "completed", weight: 78 },
  { value: "aborted", weight: 12 },
  { value: "interrupted", weight: 10 },
];

const RICH_AGENTS = [
  { value: "pi", weight: 90 },
  { value: "opencode", weight: 4 },
  { value: "codex", weight: 3 },
  { value: "claude-code", weight: 3 },
];

const RICH_AGENT_INFO = {
  pi: {
    plugin: "kankaku",
    pluginVersion: "0.4.6",
    agentVersions: ["0.5.0", "0.5.1", "0.5.2", "0.5.3"],
    models: ["claude-sonnet-5", "claude-opus-4.5", "claude-haiku-4.5"],
  },
  opencode: {
    plugin: "kankaku-opencode",
    pluginVersion: "0.2.1",
    agentVersions: [],
    models: ["gpt-5-codex", "gpt-5.1-codex-max"],
  },
  codex: {
    plugin: "kankaku-codex",
    pluginVersion: "0.1.0",
    agentVersions: [],
    models: ["gpt-5.1-codex-max", "gpt-5-codex"],
  },
  "claude-code": {
    plugin: "kankaku-claude-code",
    pluginVersion: "0.3.0",
    agentVersions: [],
    models: ["claude-sonnet-5", "claude-opus-4.5"],
  },
};

const RICH_PROJECTS = buildRichProjectCatalog();
const RICH_TASKS = buildRichTaskCatalog(RICH_PROJECTS);

const RICH_PROFILE = {
  CLIENTS: RICH_CLIENTS,
  PROJECTS: RICH_PROJECTS,
  TASKS: RICH_TASKS,
  MACHINES: RICH_MACHINES,
  LEGACY_LABELS: RICH_LEGACY_LABELS,
  SESSION_NAME_POOL: TASK_TITLE_TEMPLATES,
  THINKING_LEVELS: RICH_THINKING_LEVELS,
  STATUSES: RICH_STATUSES,
  AGENTS: RICH_AGENTS,
  AGENT_INFO: RICH_AGENT_INFO,
};

// --- rich profile: payload builders --------------------------------------

function randomStartedAt(rand, now, windowDays) {
  const offsetMs = randInt(rand, 0, windowDays * 24 * 60 * 60 * 1000);
  return new Date(now - offsetMs);
}

function toPbDate(d) {
  return d.toISOString().replace("T", " ").replace("Z", "Z");
}

/**
 * Builds one "rich" profile task_entries payload. Pure: every random
 * decision is drawn from the injected `rand`, and `now`/`windowDays` are
 * passed in rather than read from the clock, so the same (params, rand)
 * pair always yields byte-identical output.
 */
function buildRichEntryPayload(params, rand) {
  const {
    taskId,
    clientId,
    projectId,
    taskRecordId,
    repoProject,
    legacyLabel,
    sessionId,
    sessionName,
    sessionMachine,
    now,
    windowDays,
  } = params;

  const startedAt = randomStartedAt(rand, now, windowDays);
  const wallMs = randInt(rand, 3 * 60 * 1000, 4 * 60 * 60 * 1000);

  const agent = weightedPick(rand, RICH_AGENTS);
  const info = RICH_AGENT_INFO[agent];
  const model = pick(rand, info.models);
  const agentVersion = info.agentVersions.length > 0 ? pick(rand, info.agentVersions) : "";

  const isPi = agent === "pi";
  const waitingQuality = isPi ? (rand() < 0.85 ? "measured" : "unavailable") : "unavailable";
  const waitingMs = waitingQuality === "unavailable" ? 0 : randInt(rand, 0, Math.floor(wallMs * 0.2));
  const workMs = wallMs - waitingMs;
  const endedAt = new Date(startedAt.getTime() + wallMs);

  const costQuality = isPi
    ? weightedPick(rand, [{ value: "measured", weight: 70 }, { value: "estimated", weight: 25 }, { value: "unknown", weight: 5 }])
    : weightedPick(rand, [{ value: "estimated", weight: 2 }, { value: "unknown", weight: 1 }]);

  const input = randInt(rand, 300, 9000);
  const output = randInt(rand, 150, 4500);
  const cacheRead = randInt(rand, 0, 25000);
  const cacheWrite = randInt(rand, 0, 6000);
  const cost = costQuality === "unknown"
    ? 0
    : randFloat(rand, input * 0.000003 + output * 0.000015, input * 0.000004 + output * 0.000018, 6);

  const subagentCount = rand() < 0.15 ? randInt(rand, 1, 4) : 0;
  const subagentLinkage = subagentCount > 0 ? "linked" : "not_applicable";

  const segments = buildTaggedSegments(rand, workMs, ["review", "test", "build"]);
  const thinkingLevel = weightedPick(rand, RICH_THINKING_LEVELS);
  const status = weightedPick(rand, RICH_STATUSES);
  const runsVal = randInt(rand, 1, 6);
  const turnsVal = randInt(rand, 1, 20);

  return {
    task_id: taskId,
    client: clientId,
    project: projectId || "",
    task: taskRecordId || "",
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
    status,
    session_id: sessionId,
    session_name: sessionName || "",
    machine: sessionMachine,
    model,
    prompt: "",
    legacy_client_label: legacyLabel || "",
    repo_project: repoProject || "",
    schema: 1,
    agent,
    agent_version: agentVersion,
    plugin: info.plugin,
    plugin_version: info.pluginVersion,
    waiting_quality: waitingQuality,
    cost_quality: costQuality,
    subagent_linkage: subagentLinkage,
    thinking_level: thinkingLevel,
  };
}

/**
 * Builds the work_records payload bodies (orchestrator + N subagents) for a
 * rich-profile entry with `subagentCount > 0`. Mirrors the split ratio
 * seed.js's standard profile already uses (orchestrator carries 60% of the
 * parent's totals, subagents share the remaining 40%): `rollup` is always
 * false on every row (AGENTS.md's D6 rule — these are raw, overlapping
 * detail, never summed outside kankaku). Returns bare bodies; the caller
 * (seed.js) assigns `kankaku_id`/`task_entry` once the parent row's real id
 * is known.
 */
function buildRichWorkRecordPayloads(entry, subagentCount, rand) {
  const orchestrator = {
    rollup: false,
    role: "orchestrator",
    pid: randInt(rand, 1000, 60000),
    parent_pid: 0,
    started_at: entry.started_at,
    settled_at: entry.ended_at,
    wall_ms: entry.wall_ms,
    waiting_ms: entry.waiting_ms,
    work_ms: entry.work_ms,
    runs: entry.runs,
    turns: entry.turns,
    status: entry.status,
    model: entry.model,
    input: Math.round(entry.input * 0.6),
    output: Math.round(entry.output * 0.6),
    cache_read: Math.round(entry.cache_read * 0.6),
    cache_write: Math.round(entry.cache_write * 0.6),
    cost: Number((entry.cost * 0.6).toFixed(6)),
    segments: entry.segments,
    tools: ["Read", "Edit", "Bash"],
    session_id: entry.session_id,
    prompt: "",
    machine: entry.machine,
    thinking_level: entry.thinking_level || "",
    schema: 1,
  };

  const subagents = [];
  for (let s = 1; s <= subagentCount; s++) {
    const share = 0.4 / subagentCount;
    subagents.push({
      rollup: false,
      role: "subagent",
      pid: randInt(rand, 1000, 60000),
      parent_pid: randInt(rand, 1000, 60000),
      started_at: entry.started_at,
      settled_at: entry.ended_at,
      wall_ms: Math.round(entry.wall_ms * share),
      waiting_ms: 0,
      work_ms: Math.round(entry.work_ms * share),
      runs: randInt(rand, 1, 3),
      turns: randInt(rand, 1, 8),
      status: "completed",
      model: entry.model,
      input: Math.round((entry.input * share) / 0.6),
      output: Math.round((entry.output * share) / 0.6),
      cache_read: Math.round((entry.cache_read * share) / 0.6),
      cache_write: Math.round((entry.cache_write * share) / 0.6),
      cost: Number(((entry.cost * share) / 0.6).toFixed(6)),
      segments: entry.segments,
      tools: ["Read", "Grep"],
      session_id: entry.session_id,
      prompt: "",
      machine: entry.machine,
      thinking_level: entry.thinking_level || "",
      schema: 1,
    });
  }

  return { orchestrator, subagents };
}

module.exports = {
  mulberry32,
  hashString,
  pick,
  randInt,
  randFloat,
  weightedPick,
  SEED_TASK_ID_PREFIX,
  RICH_TASK_ID_PREFIX,
  isSeedRow,
  isRichSeedRow,
  isStandardSeedRow,
  buildTaggedSegments,
  noTaskBucketKey,
  makeSessionAssigner,
  RICH_PROFILE,
  buildRichEntryPayload,
  buildRichWorkRecordPayloads,
};
