"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const narrative = require("./engram-narrative.js");

const summaries = [
  { id: "s-old", session_id: "s1", created_at: "2026-01-01", content: "old" },
  { id: "s-tie-a", session_id: "s1", created_at: "2026-01-02", content: "tie a" },
  { id: "s-tie-z", session_id: "s1", created_at: "2026-01-02", content: "tie z" },
  { id: "s-invalid", session_id: "s2", created_at: "not-a-date", content: "invalid" },
  { id: "s-missing-date", session_id: "s2", content: "missing date" },
  { session_id: "s3", content: "missing id" },
  null,
  { id: "wrong", session_id: "other", created_at: "2026-12-01" },
];
const prompts = [
  { id: "p-later", session_id: "s1", created_at: "2026-01-02" },
  { id: "p-tie-z", session_id: "s1", created_at: "2026-01-01" },
  { id: "p-tie-a", session_id: "s1", created_at: "2026-01-01" },
  { id: "p-invalid", session_id: "s2", created_at: "not-a-date" },
  { id: "p-missing-date", session_id: "s2" },
  { session_id: "s3" },
  null,
];

test("per-session indexes exactly match public selectors and retain selected row references", () => {
  const summariesIndex = narrative.buildSummarySelectionIndex(summaries);
  const promptsIndex = narrative.buildPromptSelectionIndex(prompts);
  for (const id of ["s1", "s2", "s3", "no-match"]) {
    assert.strictEqual(summariesIndex.get(id) ?? null, narrative.pickSummaryForSession(summaries, id));
    assert.strictEqual(promptsIndex.get(id) ?? null, narrative.pickFirstPromptForSession(prompts, id));
  }
  assert.equal(summariesIndex.get("s1").id, "s-tie-z");
  assert.equal(promptsIndex.get("s1").id, "p-tie-a");
  assert.equal(summariesIndex.get("s2").id, "s-invalid");
  assert.equal(promptsIndex.get("s2").id, "p-missing-date");
});

test("mixed timestamp types retain the public selector's exact sort winner", () => {
  const mixed = [
    { session_id: "s", created_at: 1, id: "a" },
    { session_id: "s", created_at: "1", id: "b" },
    { session_id: "s", created_at: 1, id: "c" },
    { session_id: "bool", created_at: true, id: "bool-true" },
    { session_id: "bool", created_at: "z", id: "bool-string" },
    { session_id: "object", created_at: { value: 1 }, id: "object-value" },
    { session_id: "object", created_at: "[object Object]", id: "object-string" },
    { session_id: "array", created_at: [1], id: "array-number" },
    { session_id: "array", created_at: "1", id: "array-string" },
    { session_id: "array", created_at: [], id: "array-empty" },
    { session_id: "ties", created_at: 2, id: "tie-a" },
    { session_id: "ties", created_at: 2, id: "tie-z" },
    { session_id: "ties", created_at: "2", id: "tie-text" },
    { session_id: NaN, created_at: "x", id: "unmatchable" },
  ];
  const prompts = mixed.map((row) => ({ ...row, id: `p-${row.id}` }));
  for (const row of mixed.concat(prompts)) Object.freeze(row);
  Object.freeze(mixed);
  Object.freeze(prompts);

  const summaryIndex = narrative.buildSummarySelectionIndex(mixed);
  const promptIndex = narrative.buildPromptSelectionIndex(prompts);
  for (const id of ["s", "bool", "object", "array", "ties", NaN, "missing"]) {
    assert.strictEqual(summaryIndex.get(id) ?? null, narrative.pickSummaryForSession(mixed, id));
    assert.strictEqual(promptIndex.get(id) ?? null, narrative.pickFirstPromptForSession(prompts, id));
  }
  assert.strictEqual(summaryIndex.get(NaN), undefined, "strict equality selectors cannot match NaN session ids");

  const reproducer = [
    { session_id: "s", created_at: 1, id: "a" },
    { session_id: "s", created_at: "1" },
    { session_id: "s", created_at: 1 },
  ];
  const expectedSummary = narrative.pickSummaryForSession(reproducer, "s");
  const expectedPrompt = narrative.pickFirstPromptForSession(reproducer, "s");
  assert.strictEqual(narrative.buildSummarySelectionIndex(reproducer).get("s"), expectedSummary);
  assert.strictEqual(narrative.buildPromptSelectionIndex(reproducer).get("s"), expectedPrompt);
});

test("index construction is linear, lookup does not revisit source rows, and inputs stay unchanged", () => {
  const source = [];
  for (let i = 0; i < 200; i++) source.push({
    id: `o${i}`,
    session_id: `session-${i % 50}`,
    created_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
  });
  const before = source.map((row) => ({ ...row }));
  let indexedReads = 0;
  const counted = new Proxy(source, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) indexedReads++;
      return Reflect.get(target, property, receiver);
    },
  });
  const index = narrative.buildSummarySelectionIndex(counted);
  assert.equal(indexedReads, source.length);
  for (let i = 0; i < 50; i++) {
    const id = `session-${i}`;
    assert.strictEqual(index.get(id) ?? null, narrative.pickSummaryForSession(source, id));
  }
  assert.equal(indexedReads, source.length, "indexed lookups must not scan source rows");

  let selectorReads = 0;
  const countedSelectors = source.slice();
  countedSelectors.filter = (predicate) => source.filter((row, index) => {
    selectorReads++;
    return predicate(row, index, source);
  });
  for (let i = 0; i < 50; i++) narrative.pickSummaryForSession(countedSelectors, `session-${i}`);
  assert.equal(indexedReads, source.length, "index build examined exactly one source row per entry");
  assert.equal(selectorReads, source.length * 50, "legacy per-session selection rescans every source row");
  assert.deepEqual(source, before);
});

test("index builders handle invalid array inputs and empty/no-match lists", () => {
  assert.equal(narrative.buildSummarySelectionIndex(null).size, 0);
  assert.equal(narrative.buildPromptSelectionIndex(undefined).size, 0);
  assert.equal(narrative.buildSummarySelectionIndex([{ id: "x", session_id: "other" }]).get("none"), undefined);
});

test("batch handler fetches and indexes each project once and lazily fetches fallback prompts", () => {
  const calls = [];
  const builds = { summaries: 0, prompts: 0 };
  const instrumented = {
    ...narrative,
    buildSummarySelectionIndex(rows) {
      builds.summaries++;
      return narrative.buildSummarySelectionIndex(rows);
    },
    buildPromptSelectionIndex(rows) {
      builds.prompts++;
      return narrative.buildPromptSelectionIndex(rows);
    },
  };
  const projectRows = {
    alpha: {
      observations: [{ id: "summary-a", session_id: "a1", created_at: "2026-03-02", content: "Goal: alpha" }],
      prompts: [{ id: "prompt-a2", session_id: "a2", created_at: "2026-03-01", content: "fallback alpha" }],
    },
    beta: {
      observations: [{ id: "summary-b", session_id: "b1", created_at: "2026-03-01", content: "Goal: beta" }],
      prompts: [],
    },
  };
  const response = { status: null, body: null };
  const handlerRegistry = [];
  const context = {
    routerAdd(_method, route, handler) { handlerRegistry.push({ route, handler }); },
    require: () => instrumented,
    __hooks: "/hooks",
    $apis: { requireAuth: () => "auth" },
    $os: { getenv: (key) => key === "KANKAKU_ENGRAM_URL" ? "http://engram" : "" },
    $http: {
      send({ url }) {
        calls.push(url);
        const sessionMatch = /\/sessions\/([^/]+)$/.exec(url);
        if (sessionMatch) {
          const id = decodeURIComponent(sessionMatch[1]);
          return { statusCode: 200, json: { project: id === "b1" ? "beta" : "alpha" } };
        }
        const observationsMatch = /\/observations\?project=([^&]+)/.exec(url);
        if (observationsMatch) return { statusCode: 200, json: projectRows[decodeURIComponent(observationsMatch[1])].observations };
        const promptsMatch = /\/prompts\/recent\?project=([^&]+)/.exec(url);
        if (promptsMatch) return { statusCode: 200, json: projectRows[decodeURIComponent(promptsMatch[1])].prompts };
        throw new Error(`unexpected URL ${url}`);
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "engram.pb.js"), "utf8"), context);
  const route = handlerRegistry.find((entry) => entry.route === "/api/kankaku/engram/sessions");
  const result = route.handler({ requestInfo: () => ({ body: { ids: ["a1", "a2", "b1"] } }), json(status, body) {
    response.status = status;
    response.body = body;
    return body;
  } });
  assert.strictEqual(result, response.body);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(response.body)), {
    sessions: {
      a1: { project: "alpha", title: "alpha", goal: "alpha", summary: "Goal: alpha", source: "summary", created_at: "2026-03-02" },
      a2: { project: "alpha", title: "fallback alpha", first_prompt: "fallback alpha", source: "prompt", created_at: "2026-03-01" },
      b1: { project: "beta", title: "beta", goal: "beta", summary: "Goal: beta", source: "summary", created_at: "2026-03-01" },
    },
  });
  assert.equal(calls.length, 6, "three session requests plus one observation fetch per project and one lazy prompt fetch");
  assert.equal(calls.filter((url) => url.includes("/observations?")).length, 2);
  assert.equal(calls.filter((url) => url.includes("/prompts/recent?")).length, 1);
  assert.deepEqual(builds, { summaries: 2, prompts: 1 });
});
