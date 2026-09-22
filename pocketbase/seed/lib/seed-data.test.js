"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
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
} = require("./seed-data.js");

// --- PRNG -------------------------------------------------------------

test("mulberry32 is deterministic for a given seed", () => {
  const a = mulberry32(777001);
  const b = mulberry32(777001);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  assert.deepEqual(seqA, seqB);
  for (const v of seqA) {
    assert.ok(v >= 0 && v < 1);
  }
});

test("mulberry32 produces different sequences for different seeds", () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  assert.notEqual(a(), b());
});

test("pick/randInt/randFloat are bounded and deterministic for a fixed rand", () => {
  const rand = mulberry32(42);
  const arr = ["a", "b", "c"];
  const value = pick(rand, arr);
  assert.ok(arr.includes(value));

  const rand2 = mulberry32(42);
  const n = randInt(rand2, 5, 5);
  assert.equal(n, 5);

  const rand3 = mulberry32(42);
  const f = randFloat(rand3, 1, 1, 4);
  assert.equal(f, 1);
});

test("weightedPick always returns a value from the pool and respects zero-weight exclusion", () => {
  const rand = mulberry32(9001);
  const pool = [
    { value: "never", weight: 0 },
    { value: "always", weight: 1 },
  ];
  for (let i = 0; i < 20; i++) {
    assert.equal(weightedPick(rand, pool), "always");
  }
});

test("weightedPick covers every non-zero-weight value over many draws", () => {
  const rand = mulberry32(123);
  const pool = [
    { value: "a", weight: 1 },
    { value: "b", weight: 1 },
    { value: "c", weight: 1 },
  ];
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(weightedPick(rand, pool));
  assert.deepEqual([...seen].sort(), ["a", "b", "c"]);
});

// --- seed-row guards ----------------------------------------------------

test("isSeedRow accepts only task_ids that START WITH the seed prefix, not merely contain it", () => {
  assert.equal(isSeedRow({ task_id: "seed-te-0001" }), true);
  assert.equal(isSeedRow({ task_id: "my-seed-te-0001" }), false);
  assert.equal(isSeedRow({ task_id: "unrelated" }), false);
  assert.equal(isSeedRow({}), false);
});

test("isRichSeedRow only matches the rich prefix", () => {
  assert.equal(isRichSeedRow({ task_id: `${RICH_TASK_ID_PREFIX}0001` }), true);
  assert.equal(isRichSeedRow({ task_id: `${SEED_TASK_ID_PREFIX}0001` }), false);
  assert.equal(isRichSeedRow({}), false);
});

test("isStandardSeedRow matches seed rows but excludes rich rows even though the rich prefix starts with the standard one", () => {
  assert.equal(isStandardSeedRow({ task_id: `${SEED_TASK_ID_PREFIX}0001` }), true);
  assert.equal(isStandardSeedRow({ task_id: `${SEED_TASK_ID_PREFIX}un-001` }), true);
  assert.equal(isStandardSeedRow({ task_id: `${RICH_TASK_ID_PREFIX}0001` }), false);
  assert.equal(isStandardSeedRow({ task_id: "unrelated" }), false);
});

// --- tagged segments -----------------------------------------------------

test("buildTaggedSegments returns {} for zero work and respects emptyProbability=0 by always producing tags", () => {
  const rand = mulberry32(5);
  assert.deepEqual(buildTaggedSegments(rand, 0, ["review", "test"]), {});

  const rand2 = mulberry32(5);
  const segments = buildTaggedSegments(rand2, 100_000, ["review", "test", "build"], { emptyProbability: 0 });
  assert.ok(Object.keys(segments).length >= 1);
  for (const ms of Object.values(segments)) {
    assert.ok(Number.isInteger(ms) && ms > 0);
  }
  const total = Object.values(segments).reduce((a, b) => a + b, 0);
  assert.ok(total <= 100_000);
});

// --- session grouping ------------------------------------------------

test("noTaskBucketKey is stable for the same client/project pair", () => {
  assert.equal(noTaskBucketKey("c1", "p1"), noTaskBucketKey("c1", "p1"));
  assert.notEqual(noTaskBucketKey("c1", "p1"), noTaskBucketKey("c1", "p2"));
});

test("makeSessionAssigner groups rows into sessions bounded by minSize/maxSize and keeps a bucket's session stable while it has room", () => {
  const assign = makeSessionAssigner("test-stream", {
    namePool: ["Session A", "Session B"],
    machinePool: ["machine-1"],
    minSize: 1,
    maxSize: 15,
  });

  const seenSessionsPerBucket = new Map();
  for (let i = 0; i < 300; i++) {
    const bucketKey = `bucket-${i % 5}`;
    const { session_id } = assign(`task-${i}`, bucketKey);
    if (!seenSessionsPerBucket.has(bucketKey)) seenSessionsPerBucket.set(bucketKey, new Set());
    seenSessionsPerBucket.get(bucketKey).add(session_id);
  }
  // 300 rows across 5 buckets, sessions of size <= 15 each -> at least 300/15/5 = 4 sessions per bucket
  for (const sessions of seenSessionsPerBucket.values()) {
    assert.ok(sessions.size >= 4);
  }
});

test("makeSessionAssigner honours namedProbability: 1 always names, 0 never names", () => {
  const alwaysNamed = makeSessionAssigner("stream-always", { namePool: ["X"], machinePool: ["m"], namedProbability: 1 });
  for (let i = 0; i < 20; i++) {
    const { session_name } = alwaysNamed(`t${i}`, `b${i}`);
    assert.equal(session_name, "X");
  }

  const neverNamed = makeSessionAssigner("stream-never", { namePool: ["X"], machinePool: ["m"], namedProbability: 0 });
  for (let i = 0; i < 20; i++) {
    const { session_name } = neverNamed(`t${i}`, `b${i}`);
    assert.equal(session_name, "");
  }
});

test("makeSessionAssigner is deterministic for the same stream key and call sequence", () => {
  const calls = Array.from({ length: 50 }, (_, i) => [`task-${i}`, `bucket-${i % 3}`]);
  const run = () => {
    const assign = makeSessionAssigner("determinism-check", { namePool: ["A", "B"], machinePool: ["m1", "m2"], maxSize: 6 });
    return calls.map(([taskId, bucketKey]) => assign(taskId, bucketKey));
  };
  assert.deepEqual(run(), run());
});

// --- rich profile catalog -------------------------------------------------

test("RICH_PROFILE.CLIENTS has ~12 fictional clients with only .example/.test websites", () => {
  assert.equal(RICH_PROFILE.CLIENTS.length, 12);
  const codes = new Set();
  for (const client of RICH_PROFILE.CLIENTS) {
    assert.ok(client.website.endsWith(".example") || client.website.endsWith(".test") || /\.(example|test)\//.test(client.website));
    assert.ok(/^https:\/\/[a-z0-9.-]+\.(example|test)$/.test(client.website), `unexpected website shape: ${client.website}`);
    assert.ok(!codes.has(client.code), `duplicate client code ${client.code}`);
    codes.add(client.code);
  }
});

test("RICH_PROFILE.PROJECTS has ~30 projects, each referencing an existing client code", () => {
  assert.equal(RICH_PROFILE.PROJECTS.length, 30);
  const clientCodes = new Set(RICH_PROFILE.CLIENTS.map((c) => c.code));
  const projectCodes = new Set();
  for (const project of RICH_PROFILE.PROJECTS) {
    assert.ok(clientCodes.has(project.client), `project ${project.code} references unknown client ${project.client}`);
    assert.ok(!projectCodes.has(project.code), `duplicate project code ${project.code}`);
    projectCodes.add(project.code);
  }
});

test("RICH_PROFILE.TASKS has ~90 tasks, each referencing an existing project code", () => {
  assert.equal(RICH_PROFILE.TASKS.length, 90);
  const projectCodes = new Set(RICH_PROFILE.PROJECTS.map((p) => p.code));
  const refs = new Set();
  for (const task of RICH_PROFILE.TASKS) {
    assert.ok(projectCodes.has(task.project), `task ${task.ref} references unknown project ${task.project}`);
    assert.ok(!refs.has(task.ref), `duplicate task ref ${task.ref}`);
    refs.add(task.ref);
  }
});

// --- rich payload builders ------------------------------------------------

test("buildRichEntryPayload produces a schema-consistent row with valid enum values", () => {
  const rand = mulberry32(777001);
  const payload = buildRichEntryPayload(
    {
      taskId: "seed-te-rich-0001",
      clientId: "CLIENT_ID",
      projectId: "PROJECT_ID",
      taskRecordId: "TASK_ID",
      repoProject: "/home/dev/repos/example",
      sessionId: "session-x",
      sessionName: "Some session",
      sessionMachine: "machine-1",
      now: Date.parse("2026-09-22T00:00:00Z"),
      windowDays: 180,
    },
    rand,
  );

  assert.equal(payload.task_id, "seed-te-rich-0001");
  assert.ok(["completed", "aborted", "interrupted"].includes(payload.status));
  assert.ok(["measured", "unavailable"].includes(payload.waiting_quality));
  assert.ok(["measured", "estimated", "unknown"].includes(payload.cost_quality));
  assert.ok(["linked", "unlinked", "not_applicable"].includes(payload.subagent_linkage));
  assert.ok(["pi", "opencode", "codex", "claude-code"].includes(payload.agent));
  assert.ok(payload.wall_ms > 0);
  assert.equal(payload.waiting_ms + payload.work_ms, payload.wall_ms);
  assert.equal(payload.subagent_count > 0, payload.subagent_linkage === "linked");
  if (payload.agent === "pi") {
    assert.equal(payload.plugin_version, "0.4.6");
  }
  assert.ok(
    ["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(payload.thinking_level),
  );
});

test("buildRichEntryPayload is deterministic for the same rand sequence", () => {
  const params = {
    taskId: "seed-te-rich-0002",
    clientId: "CLIENT_ID",
    projectId: "PROJECT_ID",
    taskRecordId: "TASK_ID",
    repoProject: "/home/dev/repos/example",
    sessionId: "session-x",
    sessionName: "Some session",
    sessionMachine: "machine-1",
    now: Date.parse("2026-09-22T00:00:00Z"),
    windowDays: 180,
  };
  const a = buildRichEntryPayload(params, mulberry32(555));
  const b = buildRichEntryPayload(params, mulberry32(555));
  assert.deepEqual(a, b);
});

test("buildRichWorkRecordPayloads returns one orchestrator and N subagents that never exceed the parent's totals", () => {
  const rand = mulberry32(4242);
  const entry = {
    id: "ENTRY_ID",
    started_at: "2026-09-22 00:00:00Z",
    ended_at: "2026-09-22 01:00:00Z",
    wall_ms: 3_600_000,
    waiting_ms: 100_000,
    work_ms: 3_500_000,
    runs: 3,
    turns: 10,
    status: "completed",
    model: "claude-sonnet-5",
    input: 1000,
    output: 500,
    cache_read: 2000,
    cache_write: 100,
    cost: 0.05,
    segments: {},
    session_id: "session-x",
    machine: "machine-1",
    thinking_level: "medium",
  };

  const { orchestrator, subagents } = buildRichWorkRecordPayloads(entry, 3, rand);
  assert.equal(orchestrator.role, "orchestrator");
  assert.equal(orchestrator.rollup, false);
  assert.equal(subagents.length, 3);
  for (const sub of subagents) {
    assert.equal(sub.role, "subagent");
    assert.equal(sub.rollup, false);
    assert.ok(sub.work_ms <= entry.work_ms);
    assert.ok(sub.cost <= entry.cost);
  }
});
