const { test } = require('node:test');
const assert = require('node:assert/strict');
const rule = require('./client-attribution.js');

const selected = { client_id: 'client123456789', member: 'member123456789', entry_ids: ['entry1234567890'] };

test('preview and apply requests have exact shapes, bounded unique ids and opaque digest', () => {
  assert.equal(rule.validRequest(selected, false), true);
  assert.equal(rule.validRequest({ ...selected, extra: true }, false), false);
  assert.equal(rule.validRequest({ ...selected, entry_ids: [selected.entry_ids[0], selected.entry_ids[0]] }, false), false);
  assert.equal(rule.validRequest({ ...selected, entry_ids: [] }, false), false);
  assert.equal(rule.validRequest({ ...selected, member: 'short' }, false), false);
  assert.equal(rule.validRequest({ ...selected, client_id: [selected.client_id] }, false), false);
  assert.equal(rule.validRequest({ ...selected, member: [selected.member] }, false), false);
  const twoHundred = Array.from({ length: 200 }, (_, i) => String(i).padStart(15, '0'));
  assert.equal(rule.validRequest({ ...selected, entry_ids: twoHundred }, false), true);
  assert.equal(rule.validRequest({ ...selected, entry_ids: [...twoHundred, '000000000000200'] }, false), false);
  assert.equal(rule.validRequest({ ...selected, snapshot: 'a'.repeat(64) }, true), true);
  assert.equal(rule.validRequest({ ...selected, snapshot: 'a'.repeat(64), count: 1 }, true), false);
});

test('optional project scope is a strict request dimension and binds only direct project entries', () => {
  const scoped = { ...selected, project_id: 'project12345678' };
  assert.equal(rule.validRequest(scoped, false), true);
  assert.equal(rule.validRequest({ ...scoped, project_id: '' }, false), false);
  assert.equal(rule.validRequest({ ...scoped, project_id: null }, false), false);
  assert.equal(rule.validRequest({ ...scoped, project_id: 42 }, false), false);
  assert.equal(rule.validRequest({ ...scoped, extra: true }, false), false);
  assert.equal(rule.validRequest({ ...scoped, snapshot: 'a'.repeat(64) }, true), true);
  assert.equal(rule.validRequest({ ...scoped, snapshot: 'a'.repeat(64), project_id: null }, true), false);
  const query = rule.select(scoped);
  assert.ok(query.sql.includes('project = {:project}'));
  assert.equal(query.params.project, scoped.project_id);
  const update = rule.update(scoped, { id: selected.entry_ids[0], project: scoped.project_id }, '');
  assert.ok(update.sql.includes('project = {:project}'));
  assert.equal(update.params.project, scoped.project_id);
});

test('selection and update queries bind exact selected ids and guard unchanged eligibility', () => {
  const query = rule.select(selected);
  assert.match(query.sql, /client = \{:client\}/);
  assert.match(query.sql, /member = ''/);
  assert.doesNotMatch(query.sql, /project =/);
  assert.doesNotMatch(query.sql, /machine\s*=|attributed_machine\s*=/);
  assert.equal(query.params.client, selected.client_id);
  assert.equal(query.params.id0, selected.entry_ids[0]);
  const update = rule.update(selected, { id: selected.entry_ids[0] }, '');
  assert.match(update.sql, /SET member = \{:member\}/);
  assert.match(update.sql, /CASE WHEN department = '' THEN \{:department\} ELSE department END/);
  assert.match(update.sql, /client = \{:client\}/);
  assert.match(update.sql, /member = ''/);
  assert.doesNotMatch(update.sql.split(' WHERE ')[0], /machine\s*=|attributed_machine\s*=/);
});

test('strict dated department resolution validates and chooses the latest qualifying transition', () => {
  const history = [
    { at: '2026-03-01T00:00:00.000Z', value: '' },
    { at: '2026-02-01T00:00:00.000Z', value: 'department12345' },
    { at: '2026-01-01T00:00:00.000Z', value: 'department56789' },
  ];
  assert.equal(rule.historicalDepartment(history, '2026-02-15T00:00:00.000Z'), 'department12345');
  assert.equal(rule.historicalDepartment(history, '2025-12-31T23:59:59.999Z'), '');
  assert.equal(rule.historicalDepartment([], '2026-02-15T00:00:00.000Z'), '');
  for (const invalid of [
    '{broken', 'null', '{}', '[{"at":"invalid","value":"department12345"}]',
    '[{"at":"2026-01-01T00:00:00.000Z","value":{}}]',
    '[null]', '[{"at":4,"value":""}]', '[{"at":"2026-01-01T00:00:00.000Z","value":4}]',
    '[{"at":"2026-01-01T00:00:00.000Z","value":"bad-id"}]',
    '[{"at":"2026-01-01T00:00:00.000Z","value":"department12345"},{"at":"2026-01-01T00:00:00.000Z","value":"department56789"}]',
  ]) assert.throws(() => rule.historicalDepartment(invalid, '2026-02-15T00:00:00.000Z'));
});

test('snapshot covers selection and freshness compares the full preview', () => {
  const rows = [{ id: 'entry1234567890', started_at: '2001-01-01Z', member: '', department: 'old' }];
  const state = { client: { id: selected.client_id, active: false }, member: { id: selected.member, active: false, history: [] }, rows };
  const preview = rule.preview(selected, state, (value) => value);
  assert.equal(preview.count, 1);
  assert.equal(preview.client_id, selected.client_id);
  assert.equal(preview.member, selected.member);
  assert.equal(typeof preview.snapshot, 'string');
  assert.doesNotThrow(() => rule.assertFresh(preview, preview));
  assert.throws(() => rule.assertFresh({ ...preview, snapshot: 'changed' }, preview));
  const changedRow = rule.preview(selected, { ...state, rows: [{ ...rows[0], department: 'changed' }] }, (value) => value);
  assert.notEqual(changedRow.snapshot, preview.snapshot);
  const changedHistory = rule.preview(selected, { ...state, member: { ...state.member, history: [{ at: '2000-01-01Z', value: 'changed' }] } }, (value) => value);
  assert.notEqual(changedHistory.snapshot, preview.snapshot);
  const scoped = { ...selected, project_id: 'project12345678' };
  const projectState = { ...state, project: { id: scoped.project_id, client: selected.client_id, updated: 'before' }, rows: [{ ...rows[0], project: scoped.project_id }] };
  const projectPreview = rule.preview(scoped, projectState, (value) => value);
  assert.equal(projectPreview.project_id, scoped.project_id);
  assert.notEqual(rule.preview(scoped, { ...projectState, rows: [{ ...projectState.rows[0], project: 'project98765432' }] }, (value) => value).snapshot, projectPreview.snapshot);
  assert.notEqual(rule.preview(scoped, { ...projectState, project: { ...projectState.project, updated: 'after' } }, (value) => value).snapshot, projectPreview.snapshot);
  assert.throws(() => rule.assertFresh({ ...projectPreview, project_id: undefined }, projectPreview));
});
