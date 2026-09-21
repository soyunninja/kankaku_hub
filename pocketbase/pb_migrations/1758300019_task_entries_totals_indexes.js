/// <reference path="../pb_data/types.d.ts" />

// Indexes for POST /api/kankaku/totals (pocketbase/pb_hooks/totals.pb.js):
// GROUP BY/WHERE columns that had no existing index. `(project,
// started_at)`, `(client, started_at)`, `(started_at)` and `(agent,
// started_at)` already exist (migrations 1758300005, 1758300013) and
// cover the client/project/day/agent group_bys' WHERE+GROUP BY together.
// This migration adds the remaining group_by dimensions:
// - `task` (group_by=task, the tasks board's all-time per-task totals —
//   the worst offender this feature replaces, see docs/adr/0027).
// - `session_id` (group_by=session, the sessions-without-task queue).
// - `model` (group_by=model, project detail's breakdown by model).
// - `(legacy_client_label, repo_project)` (group_by=legacy_label, the
//   unassigned queue).
// See docs/architecture/hub-backend.md "The totals endpoint" for the
// measured EXPLAIN QUERY PLAN this was verified against on a bulk
// dataset (pocketbase/seed/bulk.js).
migrate((app) => {
  const collection = app.findCollectionByNameOrId("task_entries");

  collection.indexes = collection.indexes.concat([
    "CREATE INDEX idx_task_entries_task_started ON task_entries (task, started_at)",
    "CREATE INDEX idx_task_entries_session_id ON task_entries (session_id, started_at)",
    "CREATE INDEX idx_task_entries_model_started ON task_entries (model, started_at)",
    "CREATE INDEX idx_task_entries_legacy_label_repo ON task_entries (legacy_client_label, repo_project)",
  ]);

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("task_entries");

  collection.indexes = collection.indexes.filter((idx) =>
    !idx.includes("idx_task_entries_task_started")
    && !idx.includes("idx_task_entries_session_id")
    && !idx.includes("idx_task_entries_model_started")
    && !idx.includes("idx_task_entries_legacy_label_repo"));

  return app.save(collection);
});
