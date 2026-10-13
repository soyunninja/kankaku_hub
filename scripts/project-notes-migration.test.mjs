import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const migrationPath = new URL('../pocketbase/pb_migrations/1790183807_projects_notes.js', import.meta.url)

function loadMigration() {
  const source = readFileSync(migrationPath, 'utf8')
  let up
  let down
  class TextField {
    constructor(options) { Object.assign(this, options, { type: 'text' }) }
  }
  runInNewContext(source, { TextField, migrate: (upFn, downFn) => { up = upFn; down = downFn } })
  return { up, down }
}

function mockApp() {
  const originalField = { name: 'name', type: 'text', required: true, max: 200 }
  const collection = {
    name: 'projects',
    listRule: '@request.auth.id != \'\'',
    viewRule: '@request.auth.id != \'\'',
    createRule: "@request.auth.role = 'owner'",
    updateRule: "@request.auth.role = 'owner'",
    deleteRule: "@request.auth.role = 'owner'",
    indexes: ['CREATE INDEX idx_projects_client ON projects (client)'],
    fields: {
      items: [originalField, { name: 'client', type: 'relation' }],
      add(field) { this.items.push(field) },
      removeByName(name) { this.items = this.items.filter((field) => field.name !== name) },
    },
  }
  const records = [{ id: 'legacy', name: 'Existing project' }]
  const app = {
    findCollectionByNameOrId(name) {
      assert.equal(name, 'projects')
      return collection
    },
    save(saved) { assert.equal(saved, collection); return saved },
  }
  return { app, collection, originalField, records }
}

test('projects notes migration adds and removes only an optional max-5000 text field', () => {
  const { up, down } = loadMigration()
  const { app, collection, originalField, records } = mockApp()
  const rules = [collection.listRule, collection.viewRule, collection.createRule, collection.updateRule, collection.deleteRule]
  const indexes = [...collection.indexes]

  up(app)
  const notes = collection.fields.items.find((field) => field.name === 'notes')
  assert.ok(notes, 'up adds notes')
  assert.equal(notes.type, 'text')
  assert.equal(notes.required, false)
  assert.equal(notes.max, 5000)
  assert.deepEqual(collection.fields.items.filter((field) => field !== notes), [originalField, { name: 'client', type: 'relation' }])
  assert.deepEqual([collection.listRule, collection.viewRule, collection.createRule, collection.updateRule, collection.deleteRule], rules)
  assert.deepEqual(collection.indexes, indexes)

  down(app)
  assert.deepEqual(collection.fields.items, [originalField, { name: 'client', type: 'relation' }])
  assert.deepEqual([collection.listRule, collection.viewRule, collection.createRule, collection.updateRule, collection.deleteRule], rules)
  assert.deepEqual(collection.indexes, indexes)
  assert.deepEqual(records, [{ id: 'legacy', name: 'Existing project' }])
})
