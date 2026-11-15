import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const migrationPath = new URL('../pocketbase/pb_migrations/1790183809_tasks_service_create.js', import.meta.url)

const AUTHENTICATED = "@request.auth.id != ''"
const OWNER_ONLY = "@request.auth.role = 'owner'"
const OWNER_OR_SERVICE_OPEN = "@request.auth.role = 'owner' || (@request.auth.role = 'service' && @request.body.status = 'open')"

function loadMigration() {
  const source = readFileSync(migrationPath, 'utf8')
  let up
  let down
  runInNewContext(source, { migrate: (upFn, downFn) => { up = upFn; down = downFn } })
  return { up, down }
}

function mockApp() {
  const collection = {
    name: 'tasks',
    listRule: AUTHENTICATED,
    viewRule: AUTHENTICATED,
    createRule: OWNER_ONLY,
    updateRule: OWNER_ONLY,
    deleteRule: OWNER_ONLY,
    indexes: ['CREATE INDEX idx_tasks_project ON tasks (project)', 'CREATE INDEX idx_tasks_status ON tasks (status)'],
    fields: [{ name: 'title' }, { name: 'project' }, { name: 'status' }, { name: 'external_ref' }, { name: 'description' }],
  }
  let saves = 0
  const app = {
    findCollectionByNameOrId(name) {
      assert.equal(name, 'tasks')
      return collection
    },
    save(saved) { assert.equal(saved, collection); saves++; return saved },
  }
  return { app, collection, saveCount: () => saves }
}

test('tasks service-create migration lets the service role create open tasks and nothing else', () => {
  const { up, down } = loadMigration()
  const { app, collection, saveCount } = mockApp()
  const fields = structuredClone(collection.fields)
  const indexes = [...collection.indexes]

  up(app)
  assert.equal(collection.createRule, OWNER_OR_SERVICE_OPEN)
  assert.equal(collection.updateRule, OWNER_ONLY, 'update stays owner-only')
  assert.equal(collection.deleteRule, OWNER_ONLY, 'delete stays owner-only')
  assert.equal(collection.listRule, AUTHENTICATED)
  assert.equal(collection.viewRule, AUTHENTICATED)
  assert.deepEqual(collection.fields, fields)
  assert.deepEqual(collection.indexes, indexes)
  assert.equal(saveCount(), 1)

  down(app)
  assert.equal(collection.createRule, OWNER_ONLY, 'down restores the owner-only create rule')
  assert.equal(collection.updateRule, OWNER_ONLY)
  assert.equal(collection.deleteRule, OWNER_ONLY)
  assert.equal(collection.listRule, AUTHENTICATED)
  assert.equal(collection.viewRule, AUTHENTICATED)
  assert.deepEqual(collection.fields, fields)
  assert.deepEqual(collection.indexes, indexes)
  assert.equal(saveCount(), 2)
})
