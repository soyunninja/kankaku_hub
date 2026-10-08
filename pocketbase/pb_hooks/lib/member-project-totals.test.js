"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { validateRequest, buildQueries } = require("./totals-query.js");

function memberProjectRows() {
  const request = validateRequest({ group_by: "member", page: 1, per_page: 200 });
  assert.equal(request.ok, true);
  const query = buildQueries(request.value).page;
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE task_entries (
      member TEXT, project TEXT, client TEXT, wall_ms INTEGER, work_ms INTEGER,
      waiting_ms INTEGER, input INTEGER, output INTEGER, cache_read INTEGER,
      cache_write INTEGER, cost REAL, waiting_quality TEXT, cost_quality TEXT,
      subagent_linkage TEXT, session_id TEXT, started_at TEXT, ended_at TEXT
    );
    CREATE TABLE projects (id TEXT PRIMARY KEY, client TEXT, active INTEGER);
    CREATE TABLE clients (id TEXT PRIMARY KEY, unassigned INTEGER);
    INSERT INTO clients VALUES ('real-a', 0), ('real-b', 0), ('sentinel', 1);
    INSERT INTO projects VALUES
      ('active-a', 'real-a', 1), ('active-b', 'real-a', 1),
      ('archived', 'real-a', 0), ('other-client', 'real-b', 1),
      ('sentinel-project', 'sentinel', 1), ('', 'real-a', 1);
    INSERT INTO task_entries VALUES
      ('m1', 'active-a', 'real-a', 10, 8, 2, 1, 1, 0, 0, 1.5, '', '', '', 's1', '2020', '2020'),
      ('m1', 'active-a', 'real-a', 20, 16, 4, 2, 2, 0, 0, 2.5, '', '', '', 's2', '2021', '2021'),
      ('m1', 'active-b', 'real-a', 30, 24, 6, 3, 3, 0, 0, 3.5, '', '', '', 's3', '2022', '2022'),
      ('m1', 'archived', 'real-a', 40, 32, 8, 4, 4, 0, 0, 4.5, '', '', '', 's4', '2023', '2023'),
      ('m1', 'missing-project', 'real-a', 50, 40, 10, 5, 5, 0, 0, 5.5, '', '', '', 's5', '2024', '2024'),
      ('m1', '', 'real-a', 60, 48, 12, 6, 6, 0, 0, 6.5, '', '', '', 's6', '2025', '2025'),
      ('m1', '   ', 'real-a', 65, 52, 13, 6, 6, 0, 0, 6.75, '', '', '', 's7', '2025', '2025'),
      ('m1', 'other-client', 'real-a', 70, 56, 14, 7, 7, 0, 0, 7.5, '', '', '', 's8', '2026', '2026'),
      ('m1', 'sentinel-project', 'sentinel', 80, 64, 16, 8, 8, 0, 0, 8.5, '', '', '', 's9', '2027', '2027'),
      ('m2', '', 'real-a', 90, 72, 18, 9, 9, 0, 0, 9.5, '', '', '', 's10', '2028', '2028');
  `);
  const sql = query.sql.replace(/\{:(\w+)\}/g, ":$1");
  const row = db.prepare(sql).all(query.params).map(r => ({ ...r }));
  db.close();
  return row;
}

function sessionRows(includeIgnoredSessions) {
  const request = validateRequest({
    group_by: "session", include_ignored_sessions: includeIgnoredSessions, page: 1, per_page: 200,
  });
  assert.equal(request.ok, true);
  const query = buildQueries(request.value, { memberColumnAvailable: false });
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE ignored_sessions (session_id TEXT PRIMARY KEY);
    CREATE TABLE task_entries (
      client TEXT, project TEXT, task TEXT, agent TEXT, status TEXT, machine TEXT,
      member TEXT, department TEXT, session_id TEXT, session_name TEXT,
      started_at TEXT, ended_at TEXT, wall_ms INTEGER, work_ms INTEGER,
      waiting_ms INTEGER, input INTEGER, output INTEGER, cache_read INTEGER,
      cache_write INTEGER, cost REAL, waiting_quality TEXT, cost_quality TEXT,
      subagent_linkage TEXT
    );
    INSERT INTO ignored_sessions VALUES ('ignored-session');
    INSERT INTO task_entries VALUES
      ('c1','p1','task-a','pi','completed','host','m1','d1','active-session','Active','2020-01-01 00:00:00.000Z','2020-01-01 00:01:00.000Z',60,50,10,2,3,0,0,0.1,'measured','measured','linked'),
      ('c1','p1','task-b','pi','completed','host','m1','d1','ignored-session','Ignored','2019-01-01 00:00:00.000Z','2019-01-01 00:01:00.000Z',60,40,20,4,5,0,0,0.2,'measured','measured','linked'),
      ('c1','p1','','pi','completed','host','m1','d1','ignored-session','Ignored','2019-01-02 00:00:00.000Z','2019-01-02 00:01:00.000Z',60,30,30,6,7,0,0,0.3,'measured','measured','linked');
  `);
  const sql = query.page.sql.replace(/\{:(\w+)\}/g, ":$1");
  const rows = db.prepare(sql).all(query.page.params).map(row => ({ ...row }));
  const totalSql = query.grandTotal.sql.replace(/\{:(\w+)\}/g, ":$1");
  const total = db.prepare(totalSql).get(query.grandTotal.params);
  db.close();
  return { rows, total };
}

test("member totals count distinct active real projects from all attributed entry history", () => {
  const rows = memberProjectRows();
  const ada = rows.find(row => row.group_key === "m1");
  const empty = rows.find(row => row.group_key === "m2");
  assert.equal(ada.active_projects, 2);
  assert.equal(ada.entries, 9);
  assert.equal(ada.work_ms, 340);
  assert.equal(ada.cost, 46.75);
  assert.equal(empty.active_projects, 0);
  assert.equal(ada.distinct_project, 0);
  assert.equal(ada.sample_project, "");
  assert.equal(ada.distinct_client, 0);
  assert.equal(ada.sample_client, "");
  assert.equal(JSON.stringify(ada).includes("active-a"), false);
});

test("opt-in session SQL includes ignored rows, labels them, and excludes blank task sentinels", () => {
  const legacy = sessionRows(false);
  assert.equal(legacy.total.entries, 1);
  assert.equal(legacy.rows.length, 1);
  assert.equal(legacy.rows[0].group_key, "active-session");
  assert.equal(legacy.rows[0].ignored_session, 0);
  assert.equal(legacy.rows[0].distinct_task, 1);

  const included = sessionRows(true);
  assert.equal(included.total.entries, 3);
  assert.equal(included.rows.length, 2);
  const ignored = included.rows.find(row => row.group_key === "ignored-session");
  assert.equal(ignored.ignored_session, 1);
  assert.equal(ignored.entries, 2);
  assert.equal(ignored.distinct_task, 1);
  assert.equal(included.rows.reduce((sum, row) => sum + row.entries, 0), included.total.entries);
});
