/// <reference path="../pb_data/types.d.ts" />

// Adds a distinct terminal workflow state without changing any existing tasks.
migrate((app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  const status = tasks.fields.getByName("status");
  status.values = ["open", "doing", "done", "closed"];
  return app.save(tasks);
}, (app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  const status = tasks.fields.getByName("status");
  status.values = ["open", "doing", "done"];
  return app.save(tasks);
});
