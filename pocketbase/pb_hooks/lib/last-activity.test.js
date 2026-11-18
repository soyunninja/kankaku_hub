const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lastActivityAt } = require('./last-activity.js');

test('returns null when there are no records', () => {
  assert.equal(lastActivityAt(null, null), null);
  assert.equal(lastActivityAt('', ''), null);
});

test('returns the latest of started_at and settled_at as ISO UTC', () => {
  assert.equal(
    lastActivityAt('2026-11-18 10:00:00.000Z', '2026-11-18 10:05:00.000Z'),
    '2026-11-18T10:05:00.000Z',
  );
  assert.equal(
    lastActivityAt('2026-11-18 12:00:00.000Z', '2026-11-18 10:05:00.000Z'),
    '2026-11-18T12:00:00.000Z',
  );
});

test('normalises timezone offsets to UTC', () => {
  assert.equal(lastActivityAt('2026-11-18T10:00:00+02:00', null), '2026-11-18T08:00:00.000Z');
});

test('uses the only available value and ignores unparseable input', () => {
  assert.equal(lastActivityAt('2026-11-18T09:00:00Z', ''), '2026-11-18T09:00:00.000Z');
  assert.equal(lastActivityAt('', '2026-11-18T09:30:00Z'), '2026-11-18T09:30:00.000Z');
  assert.equal(lastActivityAt('not a date', null), null);
});
