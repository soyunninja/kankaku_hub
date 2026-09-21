/* eslint-disable */
// Runs the SQL `buildQueries` emits against a real SQLite, with the barest
// row a real sync produces: no session name, no session dir, no model, no
// task. PocketBase scans every selected column into a Go string/number, so a
// single NULL anywhere is a 500 ("converting NULL to string is unsupported").
// The demo seed never caught this: every seeded session has a name.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { validateRequest, buildQueries } = require("./totals-query.js");

const NUMERIC = new Set(["wall_ms", "work_ms", "waiting_ms", "input", "output", "cache_read", "cache_write", "cost"]);

function run(db, query) {
  const names = [];
  const sql = query.sql.replace(/\{:(\w+)\}/g, (_, name) => { names.push(name); return "?"; });
  return db.prepare(sql).all(...names.map((name) => query.params[name]));
}

function bareDatabase(sqlTexts) {
  const columns = new Set(["id", "session_id", "task", "started_at", "ended_at", "client"]);
  for (const sql of sqlTexts) for (const m of sql.matchAll(/\bte\w*\.(\w+)/g)) columns.add(m[1]);
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE task_entries (${[...columns].map((c) => `${c} ${NUMERIC.has(c) ? "NUMERIC DEFAULT 0" : "TEXT DEFAULT ''"}`).join(", ")})`);
  db.exec("CREATE TABLE ignored_sessions (session_id TEXT)");
  db.exec("INSERT INTO task_entries (id, session_id, started_at, ended_at, client) VALUES ('e1', 's1', '2026-09-21 10:00:00.000Z', '2026-09-21 10:01:00.000Z', 'c1')");
  return db;
}

const GROUPS = ["none", "client", "project", "task", "session", "agent", "model", "legacy_label"];

for (const groupBy of GROUPS) {
  test(`group_by=${groupBy}: no column is NULL for a row with no optional data`, () => {
    const validated = validateRequest({ group_by: groupBy });
    assert.equal(validated.ok, true);
    const queries = buildQueries(validated.value);
    const present = Object.values(queries).filter(Boolean);
    const db = bareDatabase(present.map((q) => q.sql));
    for (const query of present) {
      for (const row of run(db, query)) {
        for (const [column, value] of Object.entries(row)) {
          assert.notEqual(value, null, `${groupBy}: column "${column}" came back NULL`);
        }
      }
    }
  });
}

test("the sessions-without-task queue query survives a nameless session", () => {
  const validated = validateRequest({ group_by: "session", filters: { without_task: true, session_fully_unassigned: true } });
  const queries = buildQueries(validated.value);
  const db = bareDatabase(Object.values(queries).filter(Boolean).map((q) => q.sql));
  const rows = run(db, queries.page);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session_name, "");
});
