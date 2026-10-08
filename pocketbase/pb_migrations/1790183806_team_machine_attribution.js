/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const owner = "@request.auth.role = 'owner'";
  function catalog(name, fields, indexes) {
    const collection = new Collection({
      type: 'base', name: name,
      listRule: owner, viewRule: owner, createRule: owner, updateRule: owner,
      // Deactivate instead: deleting identities would destroy historical meaning.
      deleteRule: null,
      fields: fields.concat([
        { name: 'active', type: 'bool' },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ]), indexes: indexes || [],
    });
    app.save(collection);
    return collection;
  }
  function relation(name, collection) {
    return { name: name, type: 'relation', collectionId: collection.id,
      maxSelect: 1, cascadeDelete: false };
  }
  const departments = catalog('departments', [
    { name: 'name', type: 'text', required: true, max: 200 },
  ]);
  const members = catalog('team_members', [
    { name: 'name', type: 'text', required: true, max: 200 },
    relation('department', departments),
    { name: 'department_history', type: 'json', maxSize: 2000000 },
  ]);
  const machines = catalog('machines', [
    { name: 'key', type: 'text', required: true, max: 200 },
    { name: 'name', type: 'text', max: 200 },
    relation('member', members),
    { name: 'assignment_history', type: 'json', maxSize: 2000000 },
  ], ['CREATE UNIQUE INDEX idx_machines_key ON machines (key)']);
  const entries = app.findCollectionByNameOrId('task_entries');
  entries.fields.add(new RelationField(relation('attributed_machine', machines)));
  entries.fields.add(new RelationField(relation('member', members)));
  entries.fields.add(new RelationField(relation('department', departments)));
  entries.indexes.push('CREATE INDEX idx_entries_member_started ON task_entries (member, started_at)');
  entries.indexes.push('CREATE INDEX idx_entries_department_started ON task_entries (department, started_at)');
  app.save(entries);
}, (app) => {
  const entries = app.findCollectionByNameOrId('task_entries');
  for (const name of ['attributed_machine', 'member', 'department']) entries.fields.removeByName(name);
  entries.indexes = entries.indexes.filter((index) =>
    !index.includes('idx_entries_member_started') && !index.includes('idx_entries_department_started'));
  app.save(entries);
  for (const name of ['machines', 'team_members', 'departments']) {
    app.delete(app.findCollectionByNameOrId(name));
  }
});
