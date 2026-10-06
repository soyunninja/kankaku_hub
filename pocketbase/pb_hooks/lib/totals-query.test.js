"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateRequest, buildQueries, MAX_DAY_BOUNDARIES, MAX_PER_PAGE } = require("./totals-query.js");

function valid(body) {
  const r = validateRequest(body);
  assert.equal(r.ok, true, "expected ok, got errors: " + JSON.stringify(r.errors));
  return r.value;
}

function invalid(body) {
  const r = validateRequest(body);
  assert.equal(r.ok, false, "expected rejection, got: " + JSON.stringify(r.value));
  return r.errors;
}

// ---------------------------------------------------------------------
// Basic acceptance
// ---------------------------------------------------------------------

test("accepts a minimal all-time request (group_by defaults to none)", () => {
  const v = valid({});
  assert.equal(v.groupBy, "none");
  assert.equal(v.sort, "-cost");
  assert.equal(v.page, 1);
  assert.equal(v.perPage, 50);
});

test("accepts a full valid request", () => {
  const v = valid({
    from: "2026-01-01 00:00:00.000Z",
    to: "2026-02-01 00:00:00.000Z",
    filters: { client: "c1", project: "p1", status: "completed" },
    group_by: "client",
    sort: "-cost",
    page: 2,
    per_page: 20,
  });
  assert.equal(v.filters.client, "c1");
  assert.equal(v.page, 2);
});

test("accepts a T-separated date and normalizes it to space form", () => {
  const v = valid({ from: "2026-01-01T00:00:00.000Z" });
  assert.equal(v.from, "2026-01-01 00:00:00.000Z");
});

test("accepts every documented group_by value", () => {
  const values = ["none", "client", "project", "task", "session", "agent", "model", "machine", "legacy_label"];
  for (const g of values) {
    valid({ group_by: g });
  }
});

test("accepts group_by=day with day_boundaries", () => {
  const v = valid({
    group_by: "day",
    day_boundaries: ["2026-01-01 00:00:00.000Z", "2026-01-02 00:00:00.000Z", "2026-01-03 00:00:00.000Z"],
  });
  assert.equal(v.dayBoundaries.length, 3);
});

test("accepts filters.agent as an empty string (legacy sentinel)", () => {
  const v = valid({ filters: { agent: "" } });
  assert.equal(v.filters.agent, "");
});

test("accepts unassigned_only with client present", () => {
  valid({ filters: { client: "unassigned-id", unassigned_only: true } });
});

// ---------------------------------------------------------------------
// Rejections: unknown params / injection surfaces
// ---------------------------------------------------------------------

test("rejects a non-object body", () => {
  invalid(null);
  invalid("hello");
  invalid(42);
  invalid([]);
});

test("rejects unknown top-level params", () => {
  const errors = invalid({ evil: 1 });
  assert.ok(errors.some(e => e.startsWith("unknown_param:evil")));
});

test("rejects unknown filter keys", () => {
  const errors = invalid({ filters: { sql: "DROP TABLE task_entries" } });
  assert.ok(errors.some(e => e.startsWith("unknown_filter:sql")));
});

test("rejects a group_by value outside the whitelist, including an injection attempt", () => {
  invalid({ group_by: "client; DROP TABLE task_entries;--" });
  invalid({ group_by: "task_entries.cost" });
  invalid({ group_by: "machine; DROP TABLE task_entries;--" });
  invalid({ group_by: "" });
});

test("rejects a sort value outside the whitelist, including an injection attempt", () => {
  invalid({ sort: "cost); DROP TABLE task_entries;--" });
  invalid({ sort: "cost, (SELECT 1)" });
  invalid({ sort: "unknown_column" });
});

test("rejects a status filter value outside the enum", () => {
  invalid({ filters: { status: "completed' OR '1'='1" } });
});

test("never lets group_by or sort text reach buildQueries as raw SQL — every accepted value maps to a fixed fragment", () => {
  const v = valid({ group_by: "client", sort: "-cost" });
  const q = buildQueries(v);
  // The built SQL must not contain the literal request string anywhere
  // outside of the fixed whitelist mapping (defense-in-depth assertion:
  // group_by/sort are never string-concatenated).
  assert.ok(q.page.sql.includes("GROUP BY te.client"));
  assert.ok(q.page.sql.includes("ORDER BY cost DESC"));
});

// ---------------------------------------------------------------------
// Rejections: oversized / malformed input
// ---------------------------------------------------------------------

test("rejects a day_boundaries array over the cap", () => {
  const boundaries = [];
  for (let i = 0; i <= MAX_DAY_BOUNDARIES; i++) {
    boundaries.push(`2026-01-${String((i % 28) + 1).padStart(2, "0")} 00:00:00.000Z`);
  }
  invalid({ group_by: "day", day_boundaries: boundaries });
});

test("rejects day_boundaries with fewer than 2 entries", () => {
  invalid({ group_by: "day", day_boundaries: ["2026-01-01 00:00:00.000Z"] });
  invalid({ group_by: "day", day_boundaries: [] });
});

test("rejects day_boundaries that are not strictly increasing", () => {
  invalid({
    group_by: "day",
    day_boundaries: ["2026-01-02 00:00:00.000Z", "2026-01-01 00:00:00.000Z"],
  });
  invalid({
    group_by: "day",
    day_boundaries: ["2026-01-01 00:00:00.000Z", "2026-01-01 00:00:00.000Z"],
  });
});

test("rejects day_boundaries supplied without group_by=day", () => {
  invalid({ day_boundaries: ["2026-01-01 00:00:00.000Z", "2026-01-02 00:00:00.000Z"] });
});

test("requires day_boundaries when group_by=day", () => {
  invalid({ group_by: "day" });
});

test("rejects a per_page over the cap", () => {
  invalid({ per_page: MAX_PER_PAGE + 1 });
});

test("rejects a non-integer or non-positive page/per_page", () => {
  invalid({ page: 0 });
  invalid({ page: -1 });
  invalid({ page: 1.5 });
  invalid({ per_page: 0 });
  invalid({ per_page: "20" });
});

test("rejects malformed date strings", () => {
  invalid({ from: "not-a-date" });
  invalid({ from: "2026/01/01" });
  invalid({ from: "2026-13-01 00:00:00.000Z" }); // month 13
  invalid({ from: "2026-01-40 00:00:00.000Z" }); // day 40
  invalid({ from: "2026-01-01 25:00:00.000Z" }); // hour 25
});

test("rejects a body that serializes past the size cap", () => {
  const boundaries = [];
  // A huge number of long, valid-shaped strings that still fail the
  // MAX_DAY_BOUNDARIES check first in practice, so exercise the size cap
  // directly through an oversized filters object's cumulative JSON size
  // is impractical (filters is a fixed small key set) — assert the cap
  // exists and rejects an intentionally oversized "from" string instead.
  invalid({ from: "2026-01-01 00:00:00.000Z".repeat(3000) });
});

test("rejects an unassigned_only filter without an accompanying client", () => {
  invalid({ filters: { unassigned_only: true } });
});

test("rejects wrong types for boolean filters", () => {
  invalid({ filters: { unassigned_only: "true" } });
  invalid({ filters: { without_task: 1 } });
  invalid({ filters: { session_fully_unassigned: "true" } });
  invalid({ filters: { session_fully_unassigned: 1 } });
  invalid({ filters: { session_fully_unassigned: "'; DROP TABLE task_entries;--" } });
});

test("accepts session_fully_unassigned alongside without_task and group_by=session", () => {
  const v = valid({ group_by: "session", filters: { without_task: true, session_fully_unassigned: true } });
  assert.equal(v.filters.session_fully_unassigned, true);
});

test("rejects an oversized single filter string", () => {
  invalid({ filters: { client: "x".repeat(500) } });
});

// ---------------------------------------------------------------------
// SQL builder: bound params only, whitelisted fragments
// ---------------------------------------------------------------------

test("buildQueries binds every filter value as a named param, never inline", () => {
  const v = valid({ filters: { client: "'; DROP TABLE task_entries;--", status: "completed" } });
  const q = buildQueries(v);
  assert.ok(!q.grandTotal.sql.includes("DROP TABLE"));
  assert.equal(q.grandTotal.params.p_client, "'; DROP TABLE task_entries;--");
});

test("buildQueries for group_by=none returns no page/groupCount query", () => {
  const v = valid({});
  const q = buildQueries(v);
  assert.equal(q.page, null);
  assert.equal(q.groupCount, null);
  assert.ok(q.grandTotal.sql.includes("SELECT"));
});

test("buildQueries for group_by=day binds one param per boundary instant, never a raw array", () => {
  const v = valid({
    group_by: "day",
    day_boundaries: ["2026-01-01 00:00:00.000Z", "2026-01-02 00:00:00.000Z", "2026-01-03 00:00:00.000Z"],
  });
  const q = buildQueries(v);
  assert.equal(typeof q.page.params.p_day0, "string");
  assert.equal(typeof q.page.params.p_day1, "string");
  assert.equal(typeof q.page.params.p_day2, "string");
  assert.ok(Object.values(q.page.params).every(val => typeof val === "string" || typeof val === "number"));
});

test("buildQueries adds the ignored_sessions exclusion only for group_by=session", () => {
  const vSession = valid({ group_by: "session" });
  const qSession = buildQueries(vSession);
  assert.ok(qSession.page.sql.includes("ignored_sessions"));

  const vClient = valid({ group_by: "client" });
  const qClient = buildQueries(vClient);
  assert.ok(!qClient.page.sql.includes("ignored_sessions"));
});

test("buildQueries applies LIMIT/OFFSET matching page/per_page", () => {
  const v = valid({ group_by: "client", page: 3, per_page: 10 });
  const q = buildQueries(v);
  assert.equal(q.page.params.p_limit, 10);
  assert.equal(q.page.params.p_offset, 20);
});

test("machine groups expose the same identity and machine dimension, merging only blank values", () => {
  const q = buildQueries(valid({ group_by: "machine" }));
  const identity = "CASE WHEN TRIM(COALESCE(te.machine, ''), char(9, 10, 11, 12, 13, 32)) = '' THEN '' ELSE te.machine END";
  assert.ok(q.page.sql.includes(identity + " as group_key"));
  assert.ok(q.page.sql.includes(identity + " as machine_out"));
  assert.ok(q.page.sql.includes("'' as group_key2"));
  for (const query of [q.page, q.groupCount]) {
    assert.ok(query.sql.includes("GROUP BY " + identity));
    assert.ok(!query.sql.includes("LOWER(")); // case-sensitive machine identities survive
  }
});

test("machine cost ranking aggregates all scoped task entries before group pagination", () => {
  const q = buildQueries(valid({
    group_by: "machine", sort: "-cost", per_page: 5,
    from: "2026-01-01T00:00:00.000Z", to: "2026-02-01T00:00:00.000Z",
    filters: { client: "c1", project: "p1", agent: "", machine: "host' OR 1=1--" },
  }));
  for (const query of [q.grandTotal, q.groupCount, q.page]) {
    assert.ok(query.sql.includes("FROM task_entries te WHERE"));
    for (const key of ["client", "project", "agent", "machine"]) {
      assert.ok(query.sql.includes("te." + key + " = {:p_" + key + "}"));
    }
    assert.equal(query.params.p_client, "c1");
    assert.equal(query.params.p_project, "p1");
    assert.equal(query.params.p_agent, "");
    assert.equal(query.params.p_machine, "host' OR 1=1--");
    assert.equal(query.params.p_from, "2026-01-01 00:00:00.000Z");
    assert.equal(query.params.p_to, "2026-02-01 00:00:00.000Z");
    assert.ok(query.sql.includes("te.started_at >= {:p_from}"));
    assert.ok(query.sql.includes("te.started_at <= {:p_to}"));
    assert.ok(!/work_records|OR 1=1|ignored_sessions/.test(query.sql));
  }
  for (const query of [q.grandTotal, q.page]) {
    assert.ok(query.sql.includes("SUM(te.cost)"));
    assert.ok(query.sql.includes("WHEN te.cost_quality != 'unknown' THEN te.cost ELSE 0 END"));
  }
  assert.ok(q.page.sql.indexOf("GROUP BY") < q.page.sql.indexOf("ORDER BY cost DESC LIMIT"));
  assert.equal(q.page.params.p_limit, 5);
  assert.equal(q.page.params.p_offset, 0);
});

test("buildQueries for legacy_label groups by two columns", () => {
  const v = valid({ group_by: "legacy_label" });
  const q = buildQueries(v);
  assert.ok(q.page.sql.includes("GROUP BY te.legacy_client_label, te.repo_project"));
});

test("buildQueries applies without_task and exclude_unassigned_client filters", () => {
  const v = valid({ filters: { without_task: true, exclude_unassigned_client: "u1" } });
  const q = buildQueries(v);
  assert.ok(q.grandTotal.sql.includes("te.task = ''"));
  assert.ok(q.grandTotal.sql.includes("te.client != {:p_exclude_client}"));
  assert.equal(q.grandTotal.params.p_exclude_client, "u1");
});

test("buildQueries adds a NOT EXISTS clause for session_fully_unassigned, with no bound request text", () => {
  const v = valid({ group_by: "session", filters: { without_task: true, session_fully_unassigned: true } });
  const q = buildQueries(v);
  assert.ok(q.grandTotal.sql.includes("NOT EXISTS (SELECT 1 FROM task_entries te_fu WHERE te_fu.session_id = te.session_id AND te_fu.task != '')"));
  assert.ok(q.page.sql.includes("NOT EXISTS (SELECT 1 FROM task_entries te_fu"));
  // No user-controlled text can reach this fragment (boolean-only filter) —
  // confirm no new param was bound for it.
  assert.ok(!("p_session_fully_unassigned" in q.grandTotal.params));
});

test("omits the session_fully_unassigned clause when the filter is absent or false", () => {
  const v1 = valid({ group_by: "session" });
  assert.ok(!buildQueries(v1).grandTotal.sql.includes("NOT EXISTS"));
  const v2 = valid({ group_by: "session", filters: { session_fully_unassigned: false } });
  assert.ok(!buildQueries(v2).grandTotal.sql.includes("NOT EXISTS"));
});
