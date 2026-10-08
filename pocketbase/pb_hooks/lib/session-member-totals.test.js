"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { validateRequest, buildQueries, hasMemberColumn } = require("./totals-query.js");

function createEntriesTable(db, includeMember) {
  const member = includeMember ? ", member TEXT" : "";
  db.exec(`CREATE TABLE task_entries (
    id TEXT, wall_ms INTEGER, work_ms INTEGER, waiting_ms INTEGER,
    input INTEGER, output INTEGER, cache_read INTEGER, cache_write INTEGER,
    cost REAL, waiting_quality TEXT, cost_quality TEXT, subagent_linkage TEXT,
    session_id TEXT, session_name TEXT, started_at TEXT, ended_at TEXT,
    client TEXT, project TEXT, task TEXT, machine TEXT, agent TEXT${member}
  )`);
  db.exec("CREATE TABLE ignored_sessions (session_id TEXT)");
}

function sessionRows(db, memberColumnAvailable) {
  const request = validateRequest({ group_by: "session", page: 1, per_page: 20 });
  assert.equal(request.ok, true);
  const query = buildQueries(request.value, { memberColumnAvailable }).page;
  const sql = query.sql.replace(/\{:(\w+)\}/g, ":$1");
  return db.prepare(sql).all(query.params);
}

test("session member totals distinguish single, multiple, mixed and all-unassigned attribution", () => {
  const db = new DatabaseSync(":memory:");
  try {
    createEntriesTable(db, true);
    const insert = db.prepare(`INSERT INTO task_entries
      (id, wall_ms, work_ms, waiting_ms, input, output, cache_read, cache_write,
       cost, waiting_quality, cost_quality, subagent_linkage, session_id, session_name,
       started_at, ended_at, client, project, task, machine, agent, member)
      VALUES (?, 1, 1, 0, 0, 0, 0, 0, 0, '', '', '', ?, '', ?, ?, '', '', '', '', '', ?)`);
    const rows = [
      ["single", "single", "m1"],
      ["multiple-a", "multiple", "m1"], ["multiple-b", "multiple", "m2"],
      ["mixed-a", "mixed", "m1"], ["mixed-b", "mixed", ""],
      ["empty-a", "empty", ""], ["empty-b", "empty", ""],
    ];
    rows.forEach(([id, session, member], index) => insert.run(id, session, `2026-01-0${index + 1}`, "2026-01-01", member));

    const groups = Object.fromEntries(sessionRows(db, true).map(row => [row.group_key, row]));
    assert.deepEqual(
      [groups.single.distinct_member, groups.single.sample_member, groups.single.unassigned_member_entries],
      [1, "m1", 0],
    );
    assert.deepEqual(
      [groups.multiple.distinct_member, groups.multiple.sample_member, groups.multiple.unassigned_member_entries],
      [2, "", 0],
    );
    assert.deepEqual(
      [groups.mixed.distinct_member, groups.mixed.sample_member, groups.mixed.unassigned_member_entries],
      [1, "m1", 1],
    );
    assert.deepEqual(
      [groups.empty.distinct_member, groups.empty.sample_member, groups.empty.unassigned_member_entries],
      [0, "", 2],
    );
  } finally {
    db.close();
  }
});

test("old task_entries schemas remain queryable and report member capability as unavailable", () => {
  const db = new DatabaseSync(":memory:");
  try {
    createEntriesTable(db, false);
    const columns = db.prepare("SELECT name FROM pragma_table_info('task_entries')").all();
    assert.equal(hasMemberColumn(columns), false);
    assert.equal(hasMemberColumn([{ name: "member" }]), true);
    db.prepare("INSERT INTO task_entries (session_id, started_at, ended_at) VALUES (?, ?, ?)")
      .run("legacy-session", "2026-01-01", "2026-01-01");
    const groups = sessionRows(db, hasMemberColumn(columns));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].group_key, "legacy-session");
    assert.equal("distinct_member" in groups[0], false);
  } finally {
    db.close();
  }
});
