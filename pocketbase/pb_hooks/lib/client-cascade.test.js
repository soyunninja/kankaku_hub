const { test } = require('node:test');
const assert = require('node:assert/strict');
const cascade = require('./client-cascade.js');

test('only an active-to-inactive transition cascades; repeated deactivation and reactivation do not', () => {
  assert.equal(cascade.shouldCascade(true, false), true);
  assert.equal(cascade.shouldCascade(false, false), false);
  assert.equal(cascade.shouldCascade(false, true), false);
});

test('the client update restores its original app after a successful transaction', () => {
  const calls = [];
  const current = { getBool: () => true };
  const client = { id: 'c1', getBool: (field) => field === 'active' ? false : false };
  const project = { id: 'p1', getString: () => 'c1', getBool: () => true, set: (...args) => calls.push(['set', ...args]) };
  const tx = {
    findRecordById: () => current,
    findRecordsByFilter: (collection) => collection === 'projects' ? [project] : [],
    save: (record) => calls.push(['save', record.id]),
  };
  const original = { runInTransaction(fn) { calls.push(['begin']); fn(tx); calls.push(['commit']); } };
  const event = { record: client, app: original, next() { assert.equal(event.app, tx); calls.push(['next']); } };
  cascade.handleClientUpdate(event);
  assert.equal(event.app, original);
  assert.deepEqual(calls.map((call) => call[0]), ['begin', 'set', 'save', 'next', 'commit']);
});

test('the client update restores its original app when the transaction fails', () => {
  const tx = { findRecordById: () => ({ getBool: () => false }) };
  const original = { runInTransaction(fn) { fn(tx); } };
  const event = { record: { id: 'c1', getBool: () => false }, app: original, next() { throw new Error('transaction failed'); } };
  assert.throws(() => cascade.handleClientUpdate(event), /transaction failed/);
  assert.equal(event.app, original);
});
