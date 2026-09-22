"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  readConfig,
  authHeaders,
  validateSessionIdsBody,
  parseGoal,
  pickSummaryForSession,
  pickFirstPromptForSession,
  titleFrom,
  buildNarrative,
  buildStatus,
  sessionUrl,
  observationsUrl,
  promptsUrl,
  MAX_SESSION_IDS,
} = require("./engram-narrative.js");

// ---------------------------------------------------------------------
// readConfig
// ---------------------------------------------------------------------

function fakeGetenv(map) {
  return (key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : "");
}

test("readConfig: empty url and default timeout when unset", () => {
  const cfg = readConfig(fakeGetenv({}));
  assert.equal(cfg.url, "");
  assert.equal(cfg.timeoutSeconds, 2);
});

test("readConfig: trims a trailing slash from the url", () => {
  const cfg = readConfig(fakeGetenv({ KANKAKU_ENGRAM_URL: "http://127.0.0.1:7437/" }));
  assert.equal(cfg.url, "http://127.0.0.1:7437");
});

test("readConfig: trims multiple trailing slashes and surrounding whitespace", () => {
  const cfg = readConfig(fakeGetenv({ KANKAKU_ENGRAM_URL: "  http://127.0.0.1:7437//  " }));
  assert.equal(cfg.url, "http://127.0.0.1:7437");
});

test("readConfig: parses a valid custom timeout", () => {
  const cfg = readConfig(fakeGetenv({ KANKAKU_ENGRAM_URL: "http://x", KANKAKU_ENGRAM_TIMEOUT_SECONDS: "5" }));
  assert.equal(cfg.timeoutSeconds, 5);
});

test("readConfig: falls back to the default timeout for invalid/non-positive values", () => {
  assert.equal(readConfig(fakeGetenv({ KANKAKU_ENGRAM_TIMEOUT_SECONDS: "not-a-number" })).timeoutSeconds, 2);
  assert.equal(readConfig(fakeGetenv({ KANKAKU_ENGRAM_TIMEOUT_SECONDS: "0" })).timeoutSeconds, 2);
  assert.equal(readConfig(fakeGetenv({ KANKAKU_ENGRAM_TIMEOUT_SECONDS: "-3" })).timeoutSeconds, 2);
  assert.equal(readConfig(fakeGetenv({ KANKAKU_ENGRAM_TIMEOUT_SECONDS: "" })).timeoutSeconds, 2);
});

test("readConfig: never throws when getenv itself throws", () => {
  const throwingGetenv = () => {
    throw new Error("boom");
  };
  const cfg = readConfig(throwingGetenv);
  assert.equal(cfg.url, "");
  assert.equal(cfg.timeoutSeconds, 2);
});

test("readConfig: empty token when unset", () => {
  const cfg = readConfig(fakeGetenv({}));
  assert.equal(cfg.token, "");
});

test("readConfig: reads and trims KANKAKU_ENGRAM_TOKEN", () => {
  const cfg = readConfig(fakeGetenv({ KANKAKU_ENGRAM_TOKEN: "  s3cr3t  " }));
  assert.equal(cfg.token, "s3cr3t");
});

test("readConfig: never throws when getenv throws only for the token key", () => {
  const cfg = readConfig((key) => {
    if (key === "KANKAKU_ENGRAM_TOKEN") throw new Error("boom");
    return "";
  });
  assert.equal(cfg.token, "");
});

// ---------------------------------------------------------------------
// authHeaders
// ---------------------------------------------------------------------

test("authHeaders: empty object when no token is configured", () => {
  assert.deepEqual(authHeaders({ token: "" }), {});
  assert.deepEqual(authHeaders({}), {});
});

test("authHeaders: Bearer header when a token is configured", () => {
  assert.deepEqual(authHeaders({ token: "s3cr3t" }), { Authorization: "Bearer s3cr3t" });
});

// ---------------------------------------------------------------------
// validateSessionIdsBody
// ---------------------------------------------------------------------

test("validateSessionIdsBody: accepts a normal list of ids", () => {
  const r = validateSessionIdsBody({ ids: ["s1", "s2", "s3"] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ["s1", "s2", "s3"]);
});

test("validateSessionIdsBody: trims whitespace and dedupes preserving first-seen order", () => {
  const r = validateSessionIdsBody({ ids: [" s1 ", "s2", "s1", "s3", "s2"] });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ids, ["s1", "s2", "s3"]);
});

test("validateSessionIdsBody: rejects a non-object body", () => {
  assert.equal(validateSessionIdsBody(null).ok, false);
  assert.equal(validateSessionIdsBody("nope").ok, false);
  assert.equal(validateSessionIdsBody([]).ok, false);
});

test("validateSessionIdsBody: rejects a missing or non-array ids field", () => {
  assert.equal(validateSessionIdsBody({}).ok, false);
  assert.equal(validateSessionIdsBody({ ids: "s1" }).ok, false);
  assert.equal(validateSessionIdsBody({ ids: 123 }).ok, false);
});

test("validateSessionIdsBody: rejects an empty ids array", () => {
  assert.equal(validateSessionIdsBody({ ids: [] }).ok, false);
});

test("validateSessionIdsBody: rejects ids made entirely of blank strings", () => {
  const r = validateSessionIdsBody({ ids: ["   ", ""] });
  assert.equal(r.ok, false);
});

test("validateSessionIdsBody: rejects a non-string element", () => {
  const r = validateSessionIdsBody({ ids: ["s1", 42] });
  assert.equal(r.ok, false);
});

test("validateSessionIdsBody: enforces the max of 50 ids", () => {
  assert.equal(MAX_SESSION_IDS, 50);
  const ids50 = [];
  for (let i = 0; i < 50; i++) ids50.push("s" + i);
  assert.equal(validateSessionIdsBody({ ids: ids50 }).ok, true);

  const ids51 = ids50.concat(["s50"]);
  assert.equal(validateSessionIdsBody({ ids: ids51 }).ok, false);
});

// ---------------------------------------------------------------------
// parseGoal
// ---------------------------------------------------------------------

test("parseGoal: '## Goal' heading format (real daemon sample)", () => {
  const content = "## Goal\nExplain a hub-vs-pi cost mismatch to the operator.\n\nMore detail below.";
  assert.equal(parseGoal(content), "Explain a hub-vs-pi cost mismatch to the operator.");
});

test("parseGoal: 'Goal: ...' inline format (real daemon sample)", () => {
  const content = "Goal: Compare Codex Gentle AI model/effort tiers.\n\nRest of the summary.";
  assert.equal(parseGoal(content), "Compare Codex Gentle AI model/effort tiers.");
});

test("parseGoal: '**Goal**' bold heading followed by a separate line", () => {
  const content = "**Goal**\nShip the engram narrative feature.\n";
  assert.equal(parseGoal(content), "Ship the engram narrative feature.");
});

test("parseGoal: '**Goal:** ...' bold inline variant", () => {
  const content = "**Goal:** Ship the engram narrative feature.\n";
  assert.equal(parseGoal(content), "Ship the engram narrative feature.");
});

test("parseGoal: heading with a deeper level (### Goal) still matches", () => {
  const content = "### Goal\n\nSkip blank lines to find the text.";
  assert.equal(parseGoal(content), "Skip blank lines to find the text.");
});

test("parseGoal: returns '' when there is no goal line", () => {
  assert.equal(parseGoal("Just some free-form notes with no goal marker."), "");
  assert.equal(parseGoal(""), "");
  assert.equal(parseGoal(null), "");
  assert.equal(parseGoal(undefined), "");
});

// ---------------------------------------------------------------------
// pickSummaryForSession
// ---------------------------------------------------------------------

test("pickSummaryForSession: picks the newest matching row by created_at desc", () => {
  const observations = [
    { id: "o1", session_id: "s1", created_at: "2026-09-01T00:00:00Z", content: "old" },
    { id: "o2", session_id: "s1", created_at: "2026-09-03T00:00:00Z", content: "newest" },
    { id: "o3", session_id: "s1", created_at: "2026-09-02T00:00:00Z", content: "mid" },
  ];
  const picked = pickSummaryForSession(observations, "s1");
  assert.equal(picked.id, "o2");
});

test("pickSummaryForSession: ties on created_at break by id desc", () => {
  const observations = [
    { id: "o1", session_id: "s1", created_at: "2026-09-01T00:00:00Z" },
    { id: "o2", session_id: "s1", created_at: "2026-09-01T00:00:00Z" },
  ];
  assert.equal(pickSummaryForSession(observations, "s1").id, "o2");
});

test("pickSummaryForSession: ignores rows belonging to other sessions (daemon ignores the query param)", () => {
  const observations = [
    { id: "o1", session_id: "other-session", created_at: "2026-09-05T00:00:00Z" },
    { id: "o2", session_id: "s1", created_at: "2026-09-01T00:00:00Z" },
  ];
  assert.equal(pickSummaryForSession(observations, "s1").id, "o2");
});

test("pickSummaryForSession: returns null when nothing matches or input is invalid", () => {
  assert.equal(pickSummaryForSession([], "s1"), null);
  assert.equal(pickSummaryForSession([{ id: "o1", session_id: "other" }], "s1"), null);
  assert.equal(pickSummaryForSession(null, "s1"), null);
  assert.equal(pickSummaryForSession(undefined, "s1"), null);
});

// ---------------------------------------------------------------------
// pickFirstPromptForSession
// ---------------------------------------------------------------------

test("pickFirstPromptForSession: picks the earliest matching prompt by created_at asc", () => {
  const prompts = [
    { id: "p3", session_id: "s1", created_at: "2026-09-03T00:00:00Z" },
    { id: "p1", session_id: "s1", created_at: "2026-09-01T00:00:00Z" },
    { id: "p2", session_id: "s1", created_at: "2026-09-02T00:00:00Z" },
  ];
  assert.equal(pickFirstPromptForSession(prompts, "s1").id, "p1");
});

test("pickFirstPromptForSession: ties on created_at break by id asc", () => {
  const prompts = [
    { id: "p2", session_id: "s1", created_at: "2026-09-01T00:00:00Z" },
    { id: "p1", session_id: "s1", created_at: "2026-09-01T00:00:00Z" },
  ];
  assert.equal(pickFirstPromptForSession(prompts, "s1").id, "p1");
});

test("pickFirstPromptForSession: ignores rows belonging to other sessions", () => {
  const prompts = [
    { id: "p1", session_id: "other-session", created_at: "2026-09-01T00:00:00Z" },
    { id: "p2", session_id: "s1", created_at: "2026-09-02T00:00:00Z" },
  ];
  assert.equal(pickFirstPromptForSession(prompts, "s1").id, "p2");
});

test("pickFirstPromptForSession: returns null when nothing matches or input is invalid", () => {
  assert.equal(pickFirstPromptForSession([], "s1"), null);
  assert.equal(pickFirstPromptForSession(null, "s1"), null);
  assert.equal(pickFirstPromptForSession(undefined, "s1"), null);
});

// ---------------------------------------------------------------------
// titleFrom
// ---------------------------------------------------------------------

test("titleFrom: prefers a non-empty goal", () => {
  assert.equal(titleFrom({ goal: "Ship the feature.", firstPrompt: "irrelevant prompt text" }), "Ship the feature.");
});

test("titleFrom: falls back to the first prompt collapsed to one line", () => {
  assert.equal(titleFrom({ goal: "", firstPrompt: "line one\nline two\n  line three" }), "line one line two line three");
});

test("titleFrom: truncates a long first prompt to 120 chars with an ellipsis", () => {
  const long = "x".repeat(200);
  const title = titleFrom({ goal: "", firstPrompt: long });
  assert.equal(title.length, 120);
  assert.ok(title.endsWith("…"));
  assert.equal(title.slice(0, 119), "x".repeat(119));
});

test("titleFrom: returns '' when neither goal nor firstPrompt is usable", () => {
  assert.equal(titleFrom({}), "");
  assert.equal(titleFrom({ goal: "", firstPrompt: "" }), "");
  assert.equal(titleFrom({ goal: "  ", firstPrompt: "   " }), "");
  assert.equal(titleFrom(undefined), "");
});

// ---------------------------------------------------------------------
// buildNarrative
// ---------------------------------------------------------------------

test("buildNarrative: builds a summary-sourced narrative with a parsed goal", () => {
  const narrative = buildNarrative({
    sessionId: "s1",
    project: "kankaku-hub",
    summary: { id: "o1", created_at: "2026-09-03T00:00:00Z", content: "## Goal\nShip it.\n\nDetails." },
    prompt: null,
  });
  assert.deepEqual(narrative, {
    project: "kankaku-hub",
    title: "Ship it.",
    goal: "Ship it.",
    summary: "## Goal\nShip it.\n\nDetails.",
    source: "summary",
    created_at: "2026-09-03T00:00:00Z",
  });
});

test("buildNarrative: summary without a parseable goal still returns a narrative with no goal field", () => {
  const narrative = buildNarrative({
    project: "kankaku-hub",
    summary: { id: "o1", created_at: "2026-09-03T00:00:00Z", content: "Just some notes." },
    prompt: null,
  });
  assert.equal(narrative.source, "summary");
  assert.equal(narrative.title, "");
  assert.equal(Object.prototype.hasOwnProperty.call(narrative, "goal"), false);
});

test("buildNarrative: builds a prompt-sourced narrative when there is no summary", () => {
  const narrative = buildNarrative({
    project: "kankaku-hub",
    summary: null,
    prompt: { id: "p1", created_at: "2026-09-01T00:00:00Z", content: "help me fix this bug" },
  });
  assert.deepEqual(narrative, {
    project: "kankaku-hub",
    title: "help me fix this bug",
    first_prompt: "help me fix this bug",
    source: "prompt",
    created_at: "2026-09-01T00:00:00Z",
  });
});

test("buildNarrative: returns null when neither summary nor prompt exists", () => {
  assert.equal(buildNarrative({ project: "kankaku-hub", summary: null, prompt: null }), null);
  assert.equal(buildNarrative({ project: "kankaku-hub" }), null);
});

// ---------------------------------------------------------------------
// buildStatus
// ---------------------------------------------------------------------

test("buildStatus: not configured is always unreachable regardless of healthOk", () => {
  assert.deepEqual(buildStatus({ configured: false, healthOk: true }), { configured: false, reachable: false });
});

test("buildStatus: configured and healthy", () => {
  assert.deepEqual(buildStatus({ configured: true, healthOk: true }), { configured: true, reachable: true });
});

test("buildStatus: configured but unreachable", () => {
  assert.deepEqual(buildStatus({ configured: true, healthOk: false }), { configured: true, reachable: false });
});

test("buildStatus: configured and unauthorized (401/403 from the daemon) reports unauthorized, never reachable", () => {
  assert.deepEqual(buildStatus({ configured: true, healthOk: false, unauthorized: true }), {
    configured: true,
    reachable: false,
    unauthorized: true,
  });
});

test("buildStatus: not configured never reports unauthorized even if the flag is passed", () => {
  assert.deepEqual(buildStatus({ configured: false, healthOk: false, unauthorized: true }), {
    configured: false,
    reachable: false,
  });
});

// ---------------------------------------------------------------------
// URL builders
// ---------------------------------------------------------------------

test("sessionUrl: builds the session lookup url with an encoded id", () => {
  assert.equal(sessionUrl("http://127.0.0.1:7437", "abc def/g"), "http://127.0.0.1:7437/sessions/abc%20def%2Fg");
});

test("observationsUrl: builds the observations url with an encoded project and limit", () => {
  assert.equal(
    observationsUrl("http://127.0.0.1:7437", "kankaku hub", 200),
    "http://127.0.0.1:7437/observations?project=kankaku%20hub&type=session_summary&limit=200"
  );
});

test("promptsUrl: builds the recent-prompts url with an encoded project and limit", () => {
  assert.equal(
    promptsUrl("http://127.0.0.1:7437", "kankaku/hub", 200),
    "http://127.0.0.1:7437/prompts/recent?project=kankaku%2Fhub&limit=200"
  );
});
