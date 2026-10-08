const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const rule = require('./lib/team-attribution.js');

function record(values, original = {}, collection = 'machines') {
  return { id: 'id1', get: (key) => values[key], getString: (key) => values[key] || '',
    set: (key, value) => { values[key] = value; },
    original: () => record(original), collection: () => ({ name: collection }) };
}
function handlers() {
  const create = {}, update = {};
  runInNewContext(readFileSync(__dirname + '/team-attribution.pb.js', 'utf8'), {
    onRecordCreate: (fn, ...names) => names.forEach((name) => { create[name] = fn; }),
    onRecordUpdate: (fn, ...names) => names.forEach((name) => { update[name] = fn; }),
    __hooks: '/hooks', require: () => rule, BadRequestError: Error,
  });
  return { create, update };
}
const hooks = handlers();

// PocketBase JSONRaw is a byte-like Go slice with a string() method.
function jsonRaw(value) {
  const bytes = Array.from(Buffer.from(JSON.stringify(value)));
  bytes.string = () => JSON.stringify(value);
  return bytes;
}

test('deactivation decodes JSONRaw history without changing assignment', () => {
  const history = [{ at: '2026-01-01T00:00:00.000Z', value: 'alice' }];
  const values = { key: 'host', member: 'alice', active: false };
  const tx = { findRecordById: () => record({ key: 'host', member: 'alice', assignment_history: jsonRaw(history) }) };
  let saved = false;
  hooks.update.machines({ record: record(values), app: { runInTransaction: (fn) => fn(tx) }, next() { saved = true; } });
  assert.deepEqual(values.assignment_history, history);
  assert.equal(saved, true);
});

test('member department changes preserve old JSONRaw values and tolerate invalid timestamps', () => {
  const history = [{ at: 'invalid', value: 'old' }];
  const values = { department: 'new', department_history: [{ value: 'forged' }] };
  const tx = { findRecordById: () => record({ department: 'old', department_history: jsonRaw(history) }) };
  hooks.update.team_members({ record: record(values, {}, 'team_members'),
    app: { runInTransaction: (fn) => fn(tx) }, next() {} });
  assert.deepEqual(values.department_history[0], history[0]);
  assert.equal(values.department_history[1].value, 'new');
  assert.ok(Number.isFinite(Date.parse(values.department_history[1].at)));
});

test('empty legacy histories allow assignment without inventing historical attribution', () => {
  for (const history of [undefined, null, '', jsonRaw(null), jsonRaw([])]) {
    const values = { key: 'host', member: 'alice' };
    const tx = { findRecordById: () => record({ key: 'host', member: '', assignment_history: history }) };
    hooks.update.machines({ record: record(values), app: { runInTransaction: (fn) => fn(tx) }, next() {} });
    assert.equal(values.assignment_history.length, 1);
    assert.equal(values.assignment_history[0].value, 'alice');
    assert.equal(rule.at(history, '2026-01-01T00:00:00.000Z'), '');
  }
});

test('late entry uses both effective histories, not current member or department', () => {
  const values = { machine: 'host', started_at: '2026-01-15 00:00:00.000Z', member: 'forged', department: 'forged' };
  const machine = record({ member: 'bob', assignment_history: jsonRaw([
    { at: '2026-01-01T00:00:00.000Z', value: 'alice' },
    { at: '2026-02-01T00:00:00.000Z', value: 'bob' },
  ]) });
  let continued = false;
  hooks.create.task_entries({ record: record(values), app: {
    findRecordsByFilter: () => [machine],
    findRecordById: (_, id) => {
      assert.equal(id, 'alice');
      return record({ department: 'new', department_history: jsonRaw([
        { at: '2026-01-01T00:00:00.000Z', value: 'old' },
        { at: '2026-02-01T00:00:00.000Z', value: 'new' },
      ]) });
    },
  }, next: () => { continued = true; } });
  assert.equal(values.member, 'alice');
  assert.equal(values.department, 'old');
  assert.equal(continued, true);
});

test('unknown machine stays visible and cannot forge attribution', () => {
  const values = { machine: 'unknown', member: 'forged', department: 'forged', attributed_machine: 'forged' };
  hooks.create.task_entries({ record: record(values), app: { findRecordsByFilter: () => [] }, next() {} });
  assert.equal(values.machine, 'unknown');
  for (const field of ['member', 'department', 'attributed_machine']) assert.equal(values[field], '');
});

test('retry preserves even empty historical attribution and rejects changed identity', () => {
  const original = { task_id: 'task', machine: 'host', started_at: 'date', member: '', department: '' };
  const values = { ...original, member: 'forged', department: 'forged', ended_at: 'later' };
  hooks.update.task_entries({ record: record(values, original), next() {} });
  assert.equal(values.member, '');
  assert.equal(values.department, '');
  for (const field of ['task_id', 'machine', 'started_at']) {
    assert.throws(() => hooks.update.task_entries({ record: record({ ...original, [field]: 'changed' }, original), next() {} }), /immutable/);
  }
});

test('assignment writes replace forged history with transactional current history', () => {
  const history = [{ at: '2026-01-01T00:00:00.000Z', value: 'alice' }];
  const values = { key: 'host', member: 'bob', assignment_history: [{ value: 'forged' }] };
  const tx = { findRecordById: () => record({ key: 'host', member: 'alice', assignment_history: jsonRaw(history) }) };
  const event = { record: record(values), app: { runInTransaction: (fn) => fn(tx) }, next() { assert.equal(event.app, tx); } };
  hooks.update.machines(event);
  assert.equal(values.assignment_history.length, 2);
  assert.equal(values.assignment_history[0].value, 'alice');
  assert.equal(values.assignment_history[1].value, 'bob');
});

test('catalog create ignores supplied history and machine keys cannot change', () => {
  const values = { member: 'alice', assignment_history: [{ value: 'forged' }] };
  hooks.create.machines({ record: record(values), next() {} });
  assert.equal(values.assignment_history.length, 1);
  assert.equal(values.assignment_history[0].value, 'alice');
  assert.ok(Number.isFinite(Date.parse(values.assignment_history[0].at)));
  const tx = { findRecordById: () => record({ key: 'old' }) };
  assert.throws(() => hooks.update.machines({ record: record({ key: 'new' }),
    app: { runInTransaction: (fn) => fn(tx) }, next() { assert.fail('must not save'); } }), /immutable/);
});

test('lookup errors fail closed rather than saving misleading attribution', () => {
  assert.throws(() => hooks.create.task_entries({ record: record({ machine: 'host' }),
    app: { findRecordsByFilter() { throw new Error('database unavailable'); } },
    next() { assert.fail('must not save'); } }), /database unavailable/);
});

test('migration locks catalog reads/writes to owner and disables deletion', () => {
  const collections = [];
  const entries = { fields: { add() {} }, indexes: [] };
  runInNewContext(readFileSync(__dirname + '/../pb_migrations/1790183806_team_machine_attribution.js', 'utf8'), {
    migrate: (up) => up({ save: (collection) => collections.push(collection), findCollectionByNameOrId: () => entries }),
    Collection: function (spec) { Object.assign(this, spec); this.id = spec.name; },
    RelationField: function (spec) { Object.assign(this, spec); },
  });
  for (const catalog of collections.filter((item) => item !== entries)) {
    for (const field of ['listRule', 'viewRule', 'createRule', 'updateRule']) assert.equal(catalog[field], "@request.auth.role = 'owner'");
    assert.equal(catalog.deleteRule, null);
    assert.equal(catalog.type, 'base');
  }
});
