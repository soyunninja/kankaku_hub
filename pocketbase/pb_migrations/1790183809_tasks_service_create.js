/// <reference path="../pb_data/types.d.ts" />

// Lets the sync client's `service` account create a task, and only an open
// one: kankaku's explicit "new task" commands (pi `/kankaku task new`,
// Claude Code `/kankaku:task new`) POST `{ title, project, status: "open" }`.
// Update and delete stay owner-only, so the service role still cannot edit,
// close or remove a task through the API. See SCHEMA-REQ-021.
migrate((app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  tasks.createRule = "@request.auth.role = 'owner' || (@request.auth.role = 'service' && @request.body.status = 'open')";
  return app.save(tasks);
}, (app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  tasks.createRule = "@request.auth.role = 'owner'";
  return app.save(tasks);
});
