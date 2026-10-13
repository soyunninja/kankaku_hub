const { test } = require('node:test');
const assert = require('node:assert/strict');
const lifecycle = require('./project-lifecycle.js');

test('only active projects require an active parent client', () => {
  assert.equal(lifecycle.requiresActiveParent(true, true), false);
  assert.equal(lifecycle.requiresActiveParent(true, false), true);
  assert.equal(lifecycle.requiresActiveParent(false, false), false);
});

test('an active-to-inactive transition closes tasks and saves project in one transaction', () => {
  const calls = [];
  const current = { getBool: () => true };
  const project = { id: 'p1', getString: () => 'c1', getBool: () => false };
  const task = { id: 't1', get: () => 'doing', set: (field, value) => calls.push(['task-status', field, value]) };
  const tx = {
    findRecordById(collection) { return collection === 'projects' ? current : { getBool: () => true }; },
    findRecordsByFilter(collection) { assert.equal(collection, 'tasks'); return [task]; },
    save(record) { calls.push(['save', record.id]); },
  };
  const original = { runInTransaction(fn) { calls.push(['begin']); fn(tx); calls.push(['commit']); } };
  const event = { record: project, app: original, next() { assert.equal(event.app, tx); calls.push(['next']); } };
  lifecycle.handleProjectUpdate(event);
  assert.equal(event.app, original);
  assert.deepEqual(calls.map((call) => call[0]), ['begin', 'task-status', 'save', 'next', 'commit']);
});

test('an already inactive project update does not rewrite its closed tasks', () => {
  const calls = [];
  const tx = {
    findRecordById: () => ({ getBool: () => false }),
    findRecordsByFilter() { assert.fail('no cascade on repeated archive'); },
  };
  const original = { runInTransaction(fn) { fn(tx); } };
  lifecycle.handleProjectUpdate({ record: { id: 'p1', getString: () => 'c1', getBool: () => false }, app: original, next() {} });
  assert.equal(calls.length, 0);
});

test('active project validation uses the given app and fails closed on lookup errors', () => {
  const calls = [];
  const project = { getString: () => 'client-1' };
  const activeApp = { findRecordById(collection, id) {
    calls.push([collection, id]);
    return { getBool: () => false };
  } };
  assert.equal(lifecycle.isActiveParent(project, activeApp), false);
  assert.deepEqual(calls, [['clients', 'client-1']]);
  assert.throws(() => lifecycle.isActiveParent(project, {
    findRecordById() { throw new Error('client lookup failed'); },
  }), /client lookup failed/);
});
