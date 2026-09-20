/// <reference path="../pb_data/types.d.ts" />

// pi's own resume hint is `pi [--session-dir <dir>] --session <id>` — when
// pi was invoked with a non-default session directory, kankaku now sends
// that directory as `session_dir` on `task_entries` create AND update, the
// same way it already sends `repo_project`. One optional text field, same
// category as `repo_project`: an absolute local path (privacy note in
// docs/contract.md applies here too), no index (not filtered/sorted on).
//
// `work_records` does NOT get this field: its rows are per-subagent/
// orchestrator spans within a task, not sessions, and `session_dir` is a
// session-level property that every span within one task already shares —
// there is no established per-span resume path (resume is always task/
// session-level, computed from `task_entries`).
migrate((app) => {
  const collection = app.findCollectionByNameOrId("task_entries");

  collection.fields.add(new TextField({ name: "session_dir", required: false, max: 1000 }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("task_entries");

  collection.fields.removeByName("session_dir");

  return app.save(collection);
});
