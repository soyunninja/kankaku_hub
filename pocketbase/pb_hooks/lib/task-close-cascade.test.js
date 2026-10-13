const { test } = require('node:test');
const assert = require('node:assert/strict');
const cascade = require('./task-close-cascade.js');

function record(id, status) {
  return { id, status, get(field) { return this[field]; }, set(field, value) { this[field] = value; } };
}

test('closes every non-closed task for a project, including done, and skips already closed rows', () => {
  const tasks = [record('open', 'open'), record('doing', 'doing'), record('done', 'done'), record('closed', 'closed')];
  const saved = [];
  const app = {
    findRecordsByFilter(collection, filter, sort, limit, offset, params) {
      assert.equal(collection, 'tasks');
      assert.match(filter, /project/);
      assert.match(filter, /status/);
      assert.equal(params.project, 'p1');
      return tasks.filter((task) => task.status !== 'closed');
    },
    save(task) { saved.push(task.id); },
  };
  assert.equal(cascade.closeProjectTasks(app, 'p1'), 3);
  assert.deepEqual(saved, ['open', 'doing', 'done']);
  assert.deepEqual(tasks.map((task) => task.status), ['closed', 'closed', 'closed', 'closed']);
});

test('client closure includes descendant tasks regardless of project active state', () => {
  const saved = [];
  const tasks = [record('current', 'doing'), record('archived', 'open'), record('closed', 'closed')];
  const app = {
    findRecordsByFilter(collection, filter) {
      if (collection === 'projects') return [{ id: 'active-project' }, { id: 'old-project' }];
      assert.equal(collection, 'tasks');
      assert.match(filter, /project/);
      return tasks.filter((task) => task.status !== 'closed');
    },
    save(task) { saved.push(task.id); },
  };
  assert.equal(cascade.closeClientTasks(app, 'c1'), 2);
  assert.deepEqual(saved, ['current', 'archived']);
  assert.deepEqual(tasks.map((task) => task.status), ['closed', 'closed', 'closed']);
});

test('linked work only moves open tasks to doing, never reopening closed tasks', () => {
  const { nextStatusOnLinkedWork } = require('./task-status-rule.js');
  assert.equal(nextStatusOnLinkedWork('open'), 'doing');
  assert.equal(nextStatusOnLinkedWork('closed'), null);
});
