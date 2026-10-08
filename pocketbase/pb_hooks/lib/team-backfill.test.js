const { test } = require('node:test');
const assert = require('node:assert/strict');
const rule = require('./team-backfill.js');
const { DatabaseSync } = require('node:sqlite');

test('SQL excludes conflicting machines and preserves historical departments', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE task_entries (id TEXT, machine TEXT, member TEXT, attributed_machine TEXT, department TEXT, started_at TEXT, updated TEXT)');
    const insert = db.prepare('INSERT INTO task_entries VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const [id, machine, member, attributed, department] of [
      ['empty', 'host', '', '', ''], ['same', 'host', '', 'm', 'historical'],
      ['conflict', 'host', '', 'other', 'original'], ['assigned', 'host', 'bob', '', 'old'],
      ['case', 'HOST', '', '', ''],
    ]) insert.run(id, machine, member, attributed, department, '2020-01-01', '');
    function execute(q, read) {
      // dbx uses {:name}; SQLite's Node binding uses :name.
      const stmt = db.prepare(q.sql.replace(/\{:(\w+)\}/g, ':$1'));
      return read ? stmt.all(q.params) : stmt.run(q.params);
    }
    const select = rule.select('host', 'm');
    const rows = execute(select, true);
    assert.deepEqual(rows.map((r) => r.id), ['empty', 'same']);
    const p = { machine_id: 'm', machine_key: 'host', member: 'alice' };
    let updated = 0;
    for (const row of rows) updated += Number(execute(rule.update(p, row, 'dated'), false).changes);
    assert.equal(updated, rows.length);
    assert.equal(execute(rule.update(p, { id: 'conflict' }, 'dated'), false).changes, 0);
    const stored = db.prepare('SELECT * FROM task_entries ORDER BY id').all();
    assert.equal(stored.find((r) => r.id === 'same').department, 'historical');
    assert.equal(stored.find((r) => r.id === 'empty').department, 'dated');
    assert.equal(stored.find((r) => r.id === 'conflict').attributed_machine, 'other');
    assert.equal(stored.find((r) => r.id === 'conflict').department, 'original');
    assert.equal(execute(select, true).length, 0);
  } finally { db.close(); }
});

test('preview captures exact identity, history and eligible row set', () => {
  const machine = { id: 'm', key: "host' OR 1=1--", member: 'alice', updated: 'v1' };
  const member = { id: 'alice', updated: 'v2', history: [] };
  const rows = [{ id: 'e', started_at: '2020-01-01', department: '', attributed_machine: '' }];
  const p = rule.preview(machine, member, rows, (s) => s);
  assert.equal(p.count, 1);
  assert.equal(p.machine_key, machine.key);
  assert.equal(p.member, 'alice');
  assert.notEqual(p.snapshot, rule.preview(machine, member, [{ ...rows[0], id: 'other' }], (s) => s).snapshot);
  assert.notEqual(p.snapshot, rule.preview(machine, { ...member, history: [{ at: '2020-01-01', value: 'd' }] }, rows, (s) => s).snapshot);
  for (const field of ['machine_id', 'machine_key', 'member', 'snapshot', 'count']) {
    assert.throws(() => rule.assertFresh({ ...p, [field]: 'changed' }, p), /stale/);
  }
  assert.notEqual(p.snapshot, rule.preview({ ...machine, updated: 'v3' }, member, rows, (s) => s).snapshot);
  assert.throws(() => rule.preview({ ...machine, member: '' }, member, rows, (s) => s), /assigned/);
});

test('SQL binds hostile values and guards exact key, id and empty member', () => {
  const hostile = "x' OR 1=1--";
  const select = rule.select(hostile, 'm');
  const update = rule.update({ machine_id: 'm', machine_key: hostile, member: 'alice' }, { id: hostile }, 'd');
  for (const q of [select, update]) {
    assert.equal(q.sql.includes(hostile), false);
    assert.match(q.sql, /machine = \{:key\} COLLATE BINARY/);
    assert.match(q.sql, /member = ''/);
  }
  assert.equal(select.params.key, hostile);
  assert.equal(update.params.id, hostile);
  assert.match(update.sql, /id = \{:id\}/);
});

test('strict request validation rejects unknown fields and malformed apply', () => {
  assert.equal(rule.validRequest({ machine_id: 'abc123' }, false), true);
  for (const body of [null, [], {}, { machine_id: 'x', sql: 'evil' }]) assert.equal(rule.validRequest(body, false), false);
  const apply = { machine_id: 'x', machine_key: 'host', member: 'a', count: 0, snapshot: 'a'.repeat(64) };
  assert.equal(rule.validRequest(apply, true), true);
  for (const count of [-1, 1.5, '1']) assert.equal(rule.validRequest({ ...apply, count }, true), false);
});
