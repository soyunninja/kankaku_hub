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
  LINKED_PROFILE,
  catalogNaturalKey,
  buildLinkedEntryPlan,
  buildLinkedHistoricalPlan,
  buildLinkedHistoricalEntryPayload,
  buildLinkedEntryPayload,
  buildLinkedWorkRecordPayloads,
  hasSingleLinkedHistoryEvent,
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

// --- linked profile -------------------------------------------------------

test("catalogNaturalKey uses task refs for external_ref and preserves other catalog keys", () => {
  assert.equal(catalogNaturalKey({ ref: "SEED-LINKED-001", external_ref: undefined }, "external_ref"), "SEED-LINKED-001");
  assert.equal(catalogNaturalKey({ code: "linked-client" }, "code"), "linked-client");
  assert.equal(catalogNaturalKey({ name: "Engineering" }, "name"), "Engineering");
});

test("LINKED_PROFILE is a small deterministic connected catalog", () => {
  assert.equal(LINKED_PROFILE.CLIENTS.length, 3);
  assert.equal(LINKED_PROFILE.PROJECTS.length, 6);
  assert.equal(LINKED_PROFILE.TASKS.length, 12);
  assert.equal(LINKED_PROFILE.DEPARTMENTS.length, 2);
  assert.equal(LINKED_PROFILE.MEMBERS.length, 4);
  assert.equal(LINKED_PROFILE.MACHINES.length, 4);
  const clientCodes = new Set(LINKED_PROFILE.CLIENTS.map((client) => client.code));
  const projectCodes = new Set(LINKED_PROFILE.PROJECTS.map((project) => project.code));
  assert.ok(LINKED_PROFILE.PROJECTS.every((project) => clientCodes.has(project.client)));
  assert.ok(LINKED_PROFILE.TASKS.every((task) => projectCodes.has(task.project)));
  assert.ok(LINKED_PROFILE.MEMBERS.every((member) => LINKED_PROFILE.DEPARTMENTS.some((department) => department.key === member.department)));
  assert.ok(LINKED_PROFILE.MACHINES.every((machine) => LINKED_PROFILE.MEMBERS.some((member) => member.key === machine.member)));
  for (const client of LINKED_PROFILE.CLIENTS) {
    assert.equal(LINKED_PROFILE.PROJECTS.filter((project) => project.client === client.code).length, 2);
  }
  for (const project of LINKED_PROFILE.PROJECTS) {
    assert.equal(LINKED_PROFILE.TASKS.filter((task) => task.project === project.code).length, 2);
  }
});

test("linked profile expands to 15 entries per task with stable additive keys and balanced machines", () => {
  const first = buildLinkedEntryPlan(LINKED_PROFILE.TASKS, LINKED_PROFILE.MACHINES);
  const second = buildLinkedEntryPlan(LINKED_PROFILE.TASKS, LINKED_PROFILE.MACHINES);
  assert.deepEqual(first, second);
  assert.equal(first.length, 180);

  const byTask = new Map(LINKED_PROFILE.TASKS.map((task) => [task.ref, []]));
  const machineCounts = new Map(LINKED_PROFILE.MACHINES.map((machine) => [machine.key, 0]));
  for (const row of first) {
    byTask.get(row.taskRef).push(row);
    machineCounts.set(row.machine, machineCounts.get(row.machine) + 1);
  }
  for (const [taskIndex, task] of LINKED_PROFILE.TASKS.entries()) {
    const rows = byTask.get(task.ref);
    assert.equal(rows.length, 15);
    for (let n = 0; n < 3; n++) {
      assert.equal(rows[n].taskId, `seed-te-linked-${String(taskIndex * 3 + n + 1).padStart(3, "0")}`);
      assert.equal(rows[n].machine, LINKED_PROFILE.MACHINES[(taskIndex + n) % LINKED_PROFILE.MACHINES.length].key);
    }
    for (let n = 3; n < 15; n++) {
      assert.equal(rows[n].taskId, `seed-te-linked-${task.ref}-${String(n + 1).padStart(2, "0")}`);
      assert.equal(rows[n].machine, LINKED_PROFILE.MACHINES[(taskIndex + n) % LINKED_PROFILE.MACHINES.length].key);
    }
    assert.equal(new Set(rows.map((row) => row.taskId)).size, 15);
  }
  assert.deepEqual([...machineCounts.values()], [45, 45, 45, 45]);
});

test("linked historical planning is additive, UTC-calendar based, unique, and balanced", () => {
  const now = Date.parse("2026-09-22T23:59:59Z");
  const plan = buildLinkedHistoricalPlan(LINKED_PROFILE.TASKS, LINKED_PROFILE.MACHINES, now);
  assert.equal(plan.length, 120);
  assert.deepEqual([...new Set(plan.map((row) => row.date))], Array.from({ length: 10 }, (_, i) => `2026-09-${String(12 + i).padStart(2, "0")}`));
  assert.equal(new Set(plan.map((row) => row.taskId)).size, 120);
  assert.ok(plan.every((row) => row.taskId.endsWith(`${row.taskRef}-${row.date}`)));
  for (let day = 0; day < 10; day++) {
    const rows = plan.slice(day * 12, day * 12 + 12);
    assert.equal(new Set(rows.map((row) => row.taskRef)).size, 12);
    assert.deepEqual(LINKED_PROFILE.MACHINES.map((m) => rows.filter((r) => r.machine === m.key).length), [3, 3, 3, 3]);
  }
  assert.deepEqual(plan, buildLinkedHistoricalPlan(LINKED_PROFILE.TASKS, LINKED_PROFILE.MACHINES, now));
  assert.throws(() => buildLinkedHistoricalPlan(LINKED_PROFILE.TASKS, [], now), /machines/);
});

test("historical linked payloads stay inside their UTC date with coherent minute-scale duration", () => {
  const payload = buildLinkedHistoricalEntryPayload({ taskId: "k", clientId: "c", projectId: "p", taskRecordId: "t", machine: "m", date: "2026-09-12" }, mulberry32(9));
  assert.match(payload.started_at, /^2026-09-12 /);
  assert.match(payload.ended_at, /^2026-09-12 /);
  assert.ok(payload.wall_ms >= 60_000 && payload.wall_ms <= 240_000);
  assert.equal(payload.waiting_ms + payload.work_ms, payload.wall_ms);
  assert.equal(Object.hasOwn(payload, "member"), false);
});

test("linked profile produces 15 task entries and related work_records per task", () => {
  const now = Date.parse("2026-09-22T00:00:10Z");
  const historyFloor = now - 5_000;
  const clientIds = new Map(LINKED_PROFILE.CLIENTS.map((client, i) => [client.code, `client-${i}`]));
  const projectIds = new Map(LINKED_PROFILE.PROJECTS.map((project, i) => [project.code, `project-${i}`]));
  const taskIds = new Map(LINKED_PROFILE.TASKS.map((task, i) => [task.ref, `task-${i}`]));
  const entriesPerTask = new Map();
  const rand = mulberry32(101);
  let entryCount = 0;
  let workRecordCount = 0;

  const plan = buildLinkedEntryPlan(LINKED_PROFILE.TASKS, LINKED_PROFILE.MACHINES);
  for (const { taskRef, taskIndex, taskId, machine: machineKey } of plan) {
    const task = LINKED_PROFILE.TASKS[taskIndex];
    const project = LINKED_PROFILE.PROJECTS.find((item) => item.code === task.project);
    const machine = LINKED_PROFILE.MACHINES.find((item) => item.key === machineKey);
    const entry = buildLinkedEntryPayload({
      taskId, clientId: clientIds.get(project.client), projectId: projectIds.get(project.code),
      taskRecordId: taskIds.get(task.ref), machine: machine.key, now,
    }, rand);
    const started = Date.parse(entry.started_at);
    const ended = Date.parse(entry.ended_at);
    assert.ok(started > historyFloor && started <= ended && ended <= now);
    assert.equal(entry.client, clientIds.get(project.client));
    assert.equal(entry.project, projectIds.get(project.code));
    assert.equal(entry.task, taskIds.get(task.ref));
    assert.equal(entry.machine, machine.key);
    assert.equal(entry.waiting_ms + entry.work_ms, entry.wall_ms);
    assert.equal(entry.status, "completed");
    for (const hookField of ["attributed_machine", "member", "department"]) {
      assert.equal(Object.hasOwn(entry, hookField), false, "creation hook owns attribution fields");
    }
    const { orchestrator, subagents } = buildLinkedWorkRecordPayloads(entry, entry.subagent_count, rand);
    assert.ok(subagents.every((subagent) => subagent.parent_pid === orchestrator.pid));
    const records = [orchestrator, ...subagents].map((record, i) => ({
      kankaku_id: `${taskId}-${i ? `sub-${i}` : "orch"}`,
      task_entry: `entry-${taskId}`,
      rollup: record.rollup,
      role: record.role,
      started_at: record.started_at,
      settled_at: record.settled_at,
      wall_ms: record.wall_ms,
      waiting_ms: record.waiting_ms,
      work_ms: record.work_ms,
    }));
    assert.equal(records.length, 2);
    assert.ok(records.every((record) => record.task_entry === `entry-${taskId}` && record.rollup === false));
    assert.ok(records.every((record) => Date.parse(record.settled_at) - Date.parse(record.started_at) === record.wall_ms));
    assert.ok(records.every((record) => Date.parse(record.started_at) >= Date.parse(entry.started_at) && Date.parse(record.settled_at) <= Date.parse(entry.ended_at)));
    assert.ok(records.every((record) => record.waiting_ms + record.work_ms === record.wall_ms));
    entriesPerTask.set(taskRef, (entriesPerTask.get(taskRef) || 0) + 1);
    entryCount++;
    workRecordCount += records.length;
  }
  assert.equal(entryCount, 180);
  assert.equal(workRecordCount, 360);
  assert.ok([...entriesPerTask.values()].every((count) => count === 15));
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

test("linked raw records have contained intervals and coherent wall/work accounting", () => {
  const start = "2026-09-12 09:00:00.000Z";
  const end = "2026-09-12 09:04:00.000Z";
  const entry = { started_at: start, ended_at: end, wall_ms: 240_000,
    waiting_ms: 20_000, work_ms: 220_000, runs: 1, turns: 4, status: "completed", model: "claude-sonnet-5",
    input: 1000, output: 100, cache_read: 0, cache_write: 0, cost: 0.01, segments: {}, session_id: "s", machine: "m" };
  const { orchestrator, subagents } = buildLinkedWorkRecordPayloads(entry, 1, mulberry32(44));
  assert.equal(subagents.length, 1);
  for (const record of [orchestrator, ...subagents]) {
    const started = Date.parse(record.started_at);
    const settled = Date.parse(record.settled_at);
    assert.equal(settled - started, record.wall_ms);
    assert.ok(started >= Date.parse(entry.started_at));
    assert.ok(settled <= Date.parse(entry.ended_at));
    assert.equal(record.waiting_ms + record.work_ms, record.wall_ms);
  }
  assert.equal(subagents[0].parent_pid, orchestrator.pid);
});

test("linked historical readiness rejects any extra transition even if an older event matches", () => {
  const cutoff = Date.parse("2026-09-12T00:00:00Z");
  assert.equal(hasSingleLinkedHistoryEvent([{ at: "2026-09-10T00:00:00Z", value: "m1" }], "m1", cutoff), true);
  assert.equal(hasSingleLinkedHistoryEvent([
    { at: "2026-09-10T00:00:00Z", value: "m1" }, { at: "2026-09-15T00:00:00Z", value: "m2" },
  ], "m1", cutoff), false);
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
