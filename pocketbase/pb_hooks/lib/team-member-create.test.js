const { test } = require('node:test');
const assert = require('node:assert/strict');
const rule = require('./team-member-create.js');

test('normalizes a valid request and permits an omitted department', () => {
  assert.deepEqual(rule.validateRequest({ name: '  Ada Lovelace  ', machine_id: 'machine123' }), {
    name: 'Ada Lovelace', department: '', machine_id: 'machine123',
  });
  assert.deepEqual(rule.validateRequest({ name: 'Ada', department: 'dept123', machine_id: 'machine123' }), {
    name: 'Ada', department: 'dept123', machine_id: 'machine123',
  });
  assert.deepEqual(rule.validateRequest({ name: 'Ada', department: '', machine_id: 'machine123' }), {
    name: 'Ada', department: '', machine_id: 'machine123',
  });
});

test('rejects blank, mistyped, oversized, or unexpected request fields', () => {
  for (const body of [
    {}, { name: '  ', machine_id: 'machine123' }, { name: 5, machine_id: 'machine123' },
    { name: 'Ada', machine_id: '' }, { name: 'Ada', machine_id: 5 },
    { name: 'a'.repeat(201), machine_id: 'machine123' },
    { name: 'Ada', machine_id: 'machine123', extra: true },
    { name: 'Ada', machine_id: 'machine123', department: 5 },
  ]) assert.throws(() => rule.validateRequest(body), /Invalid/);
});

test('only an active machine with no current member is claimable', () => {
  const machine = (active, member) => ({ getBool: () => active, getString: () => member });
  assert.doesNotThrow(() => rule.assertClaimable(machine(true, '')));
  for (const value of [null, machine(false, ''), machine(true, 'existing')]) {
    assert.throws(() => rule.assertClaimable(value), (error) => error.status === 409);
  }
});

test('an optional department must resolve to an active record', () => {
  const department = (active) => ({ getBool: () => active });
  assert.doesNotThrow(() => rule.assertActiveDepartment(department(true)));
  for (const value of [null, department(false)]) {
    assert.throws(() => rule.assertActiveDepartment(value), /active department/);
  }
});
