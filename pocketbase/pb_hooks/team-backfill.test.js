const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { createHash } = require('node:crypto');
const rule = require('./lib/team-backfill.js');
const history = require('./lib/team-attribution.js');

function fixture() {
  let handler;
  const events = [];
  let changes = 1;
  const record = (id, fields) => ({ id, getString: (k) => fields[k] || '', get: (k) => fields[k] });
  const machineFields = { key: "host' OR 1=1--", member: 'alice', updated: 'v1', assignment_history: [] };
  const machine = record('machine1', machineFields);
  let missingMachine = false;
  const member = record('alice', { updated: 'v2', department_history: [{ at: '2025-01-01T00:00:00Z', value: 'dept' }] });
  const rows = [{ id: 'early', started_at: '2020-01-01', department: '', attributed_machine: '' },
    { id: 'later', started_at: '2026-01-01', department: '', attributed_machine: '' }];
  const writes = [];
  const tx = { findRecordsByFilter: () => missingMachine ? [] : [machine], findRecordById: (_, id) => ({ ...member, id }),
    db: () => ({ newQuery(sql) {
      let params;
      return { bind(p) { params = p; return this; }, all(out) {
        assert.equal(params.machine, 'machine1');
        assert.match(sql, /AND \(attributed_machine = '' OR attributed_machine = \{:machine\}\)/);
        out.push(...rows);
      },
        execute() { writes.push({ sql, params }); }, one(out) { out.n = changes; } };
    } }) };
  runInNewContext(readFileSync(__dirname + '/team-backfill.pb.js', 'utf8'), {
    routerAdd: (method, path, fn) => { handler = fn; assert.equal(method, 'POST'); },
    __hooks: '/hooks', require: (path) => path.endsWith('/team-backfill.js') ? rule : history,
    $apis: { requireAuth: (name) => { assert.equal(name, 'users'); } },
    $security: { sha256: (s) => createHash('sha256').update(s).digest('hex') },
    arrayOf: () => [], DynamicModel: function (shape) { Object.assign(this, shape); },
    ForbiddenError: Error,
    NotFoundError: function (message) { this.status = 404; this.message = message; },
    BadRequestError: function (message) { this.status = 400; this.message = message; },
    ApiError: function (status, message) { this.status = status; this.message = message; },
  });
  function call(action, body, role = 'owner', collection = 'users') {
    return handler({ auth: { collection: () => ({ name: collection }), getString: () => role },
      request: { pathValue: () => action }, requestInfo: () => ({ body }),
      app: { runInTransaction(fn) { events.push('begin'); fn(tx); events.push('commit'); } },
      json(status, value) { assert.equal(events.at(-1), 'commit'); assert.equal(status, 200); return value; } });
  }
  return { call, rows, writes, events, setChanges: (n) => { changes = n; },
    setMember: (id) => { machineFields.member = id; },
    deleteMachine: () => { missingMachine = true; } };
}

test('preview is read-only; apply uses dated department and reports exact count after commit', () => {
  const f = fixture();
  const p = f.call('preview', { machine_id: 'machine1' });
  assert.equal(f.writes.length, 0);
  assert.equal(p.count, 2);
  const result = f.call('apply', p);
  assert.equal(result.updated_count, 2);
  assert.deepEqual(f.writes.map((w) => w.params.department), ['', 'dept']);
  assert.ok(f.writes.every((w) => w.params.machine === 'machine1' && w.params.member === 'alice'));
});

test('service, viewer and foreign auth collections cannot preview or apply', () => {
  const f = fixture();
  for (const action of ['preview', 'apply']) {
    for (const role of ['service', 'viewer']) assert.throws(() => f.call(action, {}, role), /owner/);
    assert.throws(() => f.call(action, {}, 'owner', 'other'), /owner/);
  }
  assert.equal(f.events.length, 0);
});

test('same-count replacement invalidates snapshot before any write', () => {
  const f = fixture();
  const p = f.call('preview', { machine_id: 'machine1' });
  f.rows[0] = { ...f.rows[0], id: 'replacement' };
  assert.throws(() => f.call('apply', p), (e) => e.status === 409);
  assert.equal(f.writes.length, 0);
});

test('cleared, reassigned and missing machines make apply stale without writes', () => {
  for (const change of [(f) => f.setMember(''), (f) => f.setMember('bob'), (f) => f.deleteMachine()]) {
    const f = fixture();
    const preview = f.call('preview', { machine_id: 'machine1' });
    change(f);
    assert.throws(() => f.call('apply', preview), (e) => e.status === 409);
    assert.equal(f.writes.length, 0);
    assert.equal(f.events.at(-1), 'begin');
  }
});

test('preview retains unassigned 400 and missing/deleted machine 404', () => {
  const unassigned = fixture();
  unassigned.setMember('');
  assert.throws(() => unassigned.call('preview', { machine_id: 'machine1' }), (e) => e.status === 400);
  const missing = fixture();
  missing.deleteMachine();
  assert.throws(() => missing.call('preview', { machine_id: 'machine1' }), (e) => e.status === 404);
});

test('failed row aborts without success response or commit', () => {
  const f = fixture();
  const p = f.call('preview', { machine_id: 'machine1' });
  f.setChanges(0);
  assert.throws(() => f.call('apply', p), (e) => e.status === 409);
  assert.equal(f.events.at(-1), 'begin');
  // This mock proves error propagation, not real SQLite rollback.
});
