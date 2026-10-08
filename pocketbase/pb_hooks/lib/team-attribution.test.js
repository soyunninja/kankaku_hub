const { test } = require('node:test');
const assert = require('node:assert/strict');
const rule = require('./team-attribution.js');

test('history decoding supports legacy strings, native arrays and empty JSONRaw', () => {
  const history = [{ at: '2026-01-01T00:00:00.000Z', value: 'alice' }];
  assert.deepEqual(rule.decodeHistory(JSON.stringify(history)), history);
  assert.deepEqual(rule.decodeHistory(history), history);
  for (const value of [null, undefined, '', 'null', '[]', { string: () => '' }]) {
    assert.deepEqual(rule.decodeHistory(value), []);
  }
  assert.throws(() => rule.decodeHistory('{broken'), /JSON/);
});

test('next instant ignores invalid dates and orders after the latest finite timestamp', () => {
  const history = [{ at: '2026-02-01T00:00:00.000Z', value: 'alice' },
    { at: 'not a date', value: '' }, null];
  assert.equal(rule.nextInstant(history, Date.parse('2026-01-01T00:00:00.000Z')), '2026-02-01T00:00:00.001Z');
  assert.equal(rule.at(history, 'invalid'), '');
  assert.equal(rule.at(history, '2026-03-01T00:00:00.000Z'), 'alice');
  assert.throws(() => rule.nextInstant([], Infinity), /supported date range/);
  assert.throws(() => rule.nextInstant([{ at: '+275760-09-13T00:00:00.000Z' }], 0), /supported date range/);
  assert.equal(rule.nextInstant([], 0), '1970-01-01T00:00:00.000Z');
});

test('effective history uses inclusive boundaries and leaves older activity unassigned', () => {
  const history = [{ at: '2026-01-01T00:00:00.000Z', value: 'alice' },
    { at: '2026-02-01T00:00:00.000Z', value: 'bob' },
    { at: '2026-03-01T00:00:00.000Z', value: '' }];
  assert.equal(rule.at(history, '2025-12-31 23:59:59.999Z'), '');
  assert.equal(rule.at(history, '2026-01-31 23:59:59.999Z'), 'alice');
  assert.equal(rule.at(history, '2026-02-01 00:00:00.000Z'), 'bob');
  assert.equal(rule.at(history, '2026-03-02T00:00:00.000Z'), '');
});

test('unchanged assignments retain history; changes append rather than replace it', () => {
  const history = [{ at: '2026-01-01T00:00:00.000Z', value: 'alice' }];
  assert.deepEqual(rule.append(history, 'alice', 'alice', '2026-02-01T00:00:00.000Z'), history);
  assert.deepEqual(rule.append(history, 'alice', 'bob', '2026-02-01T00:00:00.000Z'),
    [...history, { at: '2026-02-01T00:00:00.000Z', value: 'bob' }]);
});
