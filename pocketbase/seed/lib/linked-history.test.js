"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const helper = path.resolve(__dirname, "../prepare-linked-history.py");
const setup = String.raw`
import json,sqlite3,sys
p=sys.argv[1]+'/fixturedata.db'; c=sqlite3.connect(p)
c.executescript('CREATE TABLE clients(id TEXT,code TEXT,name TEXT); CREATE TABLE projects(id TEXT,code TEXT,name TEXT,client TEXT); CREATE TABLE tasks(id TEXT,external_ref TEXT,title TEXT,project TEXT); CREATE TABLE departments(id TEXT,name TEXT); CREATE TABLE team_members(id TEXT,name TEXT,department TEXT,department_history TEXT); CREATE TABLE machines(id TEXT,key TEXT,name TEXT,member TEXT,assignment_history TEXT)')
cs=[('linked-juniper','Juniper Workshop'),('linked-copper-finch','Copper Finch Foods'),('linked-tidal-grove','Tidal Grove Library')]
for k,n in cs: c.execute('INSERT INTO clients VALUES (?,?,?)',('c-'+k,k,n))
ps=[('linked-workshop-portal','Workshop Portal','linked-juniper'),('linked-inventory-console','Inventory Console','linked-juniper'),('linked-kitchen-planner','Kitchen Planner','linked-copper-finch'),('linked-supplier-desk','Supplier Desk','linked-copper-finch'),('linked-reading-room','Reading Room','linked-tidal-grove'),('linked-archive-search','Archive Search','linked-tidal-grove')]
for k,n,client in ps: c.execute('INSERT INTO projects VALUES (?,?,?,?)',('p-'+k,k,n,'c-'+client))
titles=['Add workshop dashboard','Improve booking search','Add stock alerts','Export inventory report','Plan weekly menu','Track ingredient orders','Review supplier updates','Add invoice search','Build reading lists','Improve book discovery','Index archive records','Add archive filters']
for i,title in enumerate(titles,1):
 project=ps[(i-1)//2][0]; c.execute('INSERT INTO tasks VALUES (?,?,?,?)',(f't-{i:03}',f'SEED-LINKED-{i:03}',title,'p-'+project))
c.executemany('INSERT INTO departments VALUES (?,?)',[('d-eng','Engineering'),('d-ops','Operations')])
ms=[('mira-chen','Mira Chen','d-eng'),('noah-rivera','Noah Rivera','d-eng'),('leo-martin','Leo Martin','d-ops'),('sana-patel','Sana Patel','d-ops')]
for i,n,d in ms: c.execute('INSERT INTO team_members VALUES (?,?,?,?)',(i,n,d,json.dumps([{'at':'2026-09-22T00:00:00Z','value':d}])))
xs=[('linked-dev-01',"Mira's Dev Machine",'mira-chen'),('linked-dev-02',"Noah's Dev Machine",'noah-rivera'),('linked-ops-01',"Leo's Ops Machine",'leo-martin'),('linked-ops-02',"Sana's Ops Machine",'sana-patel')]
for k,n,m in xs: c.execute('INSERT INTO machines VALUES (?,?,?,?,?)',('m-'+k,k,n,m,json.dumps([{'at':'2026-09-22T00:00:00Z','value':m}])))
`;
function py(code, ...args) { return spawnSync("python3", ["-c", code, ...args], { encoding: "utf8" }); }
function fixture(extra = "") {
  const dir = fs.mkdtempSync(path.join("/tmp", "kankaku-linked-history-test-"));
  fs.writeFileSync(path.join(dir, ".kankaku-linked-history-fixture"), "kankaku-linked-history-fixture-v1\n");
  const result = py(`${setup}\n${extra}\nc.commit(); c.close()`, dir);
  assert.equal(result.status, 0, result.stderr);
  return dir;
}
function run(dir) { return spawnSync("python3", [helper, dir], { encoding: "utf8" }); }
function remove(dir) { fs.rmSync(dir, { recursive: true, force: true }); }
const hasLsof = Boolean(spawnSync("sh", ["-c", "command -v lsof"], { encoding: "utf8" }).stdout.trim());

test("offline helper updates only eight matching fictional history anchors and is idempotent", (t) => {
  if (!hasLsof) return t.skip("lsof unavailable; helper correctly fails closed");
  const dir = fixture(); t.after(() => remove(dir));
  const first = run(dir);
  assert.equal(first.status, 0, first.stderr);
  const inspect = py("import json,sqlite3,sys; c=sqlite3.connect(sys.argv[1]+'/fixturedata.db'); rows=c.execute('SELECT department_history FROM team_members UNION ALL SELECT assignment_history FROM machines').fetchall(); [print(json.loads(r[0])[0]['at']) for r in rows]", dir);
  assert.equal(inspect.status, 0, inspect.stderr);
  assert.equal(inspect.stdout.trim().split("\n").length, 8);
  assert.ok(inspect.stdout.trim().split("\n").every((at) => /^\d{4}-\d\d-\d\dT00:00:00\.000Z$/.test(at)));
  assert.equal(run(dir).status, 0);
});

test("offline helper rejects a hard-linked fixture database without writes", (t) => {
  if (!hasLsof) return t.skip("lsof unavailable");
  const dir = fixture(); t.after(() => remove(dir));
  const database = path.join(dir, "fixturedata.db");
  const alias = path.join(dir, "fixturedata-alias.db");
  fs.linkSync(database, alias);
  const before = crypto.createHash("sha256").update(fs.readFileSync(database)).digest("hex");
  const result = run(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /hard link|link count/i);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(database)).digest("hex"), before);
});

test("offline helper rejects extra transitions without changing fixture", (t) => {
  if (!hasLsof) return t.skip("lsof unavailable");
  const dir = fixture("c.execute(\"UPDATE team_members SET department_history=? WHERE id='mira-chen'\",(json.dumps([{'at':'2026-01-01T00:00:00Z','value':'d-eng'},{'at':'2026-02-01T00:00:00Z','value':'d-eng'}]),))"); t.after(() => remove(dir));
  const result = run(dir);
  assert.notEqual(result.status, 0);
  const inspect = py("import json,sqlite3,sys; c=sqlite3.connect(sys.argv[1]+'/fixturedata.db'); print(len(json.loads(c.execute(\"SELECT department_history FROM team_members WHERE id='mira-chen'\").fetchone()[0])))", dir);
  assert.equal(inspect.stdout.trim(), "2");
});
