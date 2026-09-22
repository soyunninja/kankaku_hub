/// <reference path="../pb_data/types.d.ts" />

// SECURITY. Adds a read-only `viewer` role for a public demo instance
// (fictional, rich-seeded data — see docs/adr/0029-viewer-role-read-only.md)
// and tightens `task_entries`/`work_records` writes to match.
//
// Before this migration `task_entries.createRule`/`updateRule` and
// `work_records.createRule`/`updateRule` were `@request.auth.id != ''` —
// ANY authenticated user could create or update these rows, including a
// future `viewer` account meant to be read-only. `clients`/`projects`/
// `tasks`/`ignored_sessions` already restrict writes to `role = 'owner'`
// (1758300007 and friends); `task_entries`/`work_records` are the two
// collections `service` (kankaku's sync client, see docs/contract.md
// "Authentication") also needs to write, so they get their own rule
// instead of the plain owner-only one: `role = 'owner' || role =
// 'service'`. A `viewer` account satisfies `@request.auth.id != ''` but
// neither side of that OR, so create/update now correctly 403 for it.
// `list`/`view`/`delete` rules are untouched — every authenticated role
// (including `viewer`) can still read; only `owner` can delete.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const roleField = users.fields.getByName("role");
  roleField.values = ["owner", "service", "viewer"];
  app.save(users);

  const taskEntries = app.findCollectionByNameOrId("task_entries");
  taskEntries.createRule = "@request.auth.role = 'owner' || @request.auth.role = 'service'";
  taskEntries.updateRule = "@request.auth.role = 'owner' || @request.auth.role = 'service'";
  app.save(taskEntries);

  const workRecords = app.findCollectionByNameOrId("work_records");
  workRecords.createRule = "@request.auth.role = 'owner' || @request.auth.role = 'service'";
  workRecords.updateRule = "@request.auth.role = 'owner' || @request.auth.role = 'service'";
  return app.save(workRecords);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  const roleField = users.fields.getByName("role");
  roleField.values = ["owner", "service"];
  app.save(users);

  const taskEntries = app.findCollectionByNameOrId("task_entries");
  taskEntries.createRule = "@request.auth.id != ''";
  taskEntries.updateRule = "@request.auth.id != ''";
  app.save(taskEntries);

  const workRecords = app.findCollectionByNameOrId("work_records");
  workRecords.createRule = "@request.auth.id != ''";
  workRecords.updateRule = "@request.auth.id != ''";
  return app.save(workRecords);
});
