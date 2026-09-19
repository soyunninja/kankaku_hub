/// <reference path="../pb_data/types.d.ts" />

// task_entries: the reporting unit. One row per orchestrator run, already
// consolidated by kankaku's buildTasks (union of orchestrator + subagent
// intervals, D6). These rows are always safe to SUM/GROUP BY.
// See docs/proposal.md §4, §6, AGENTS.md (rule D6).
migrate((app) => {
  const clients = app.findCollectionByNameOrId("clients");
  const projects = app.findCollectionByNameOrId("projects");
  const tasks = app.findCollectionByNameOrId("tasks");

  const collection = new Collection({
    type: "base",
    name: "task_entries",
    // Single-user tool: any authenticated account (owner or service) may
    // read and write task_entries. Only the owner may delete.
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.role = 'owner'",
    fields: [
      {
        // Idempotency key: the orchestrator record's kankaku id.
        name: "task_id",
        type: "text",
        required: true,
        max: 200,
      },
      {
        name: "client",
        type: "relation",
        required: true,
        collectionId: clients.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: "project",
        type: "relation",
        collectionId: projects.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: "task",
        type: "relation",
        collectionId: tasks.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      { name: "started_at", type: "date", required: true },
      { name: "ended_at", type: "date", required: true },
      { name: "wall_ms", type: "number", onlyInt: true },
      { name: "waiting_ms", type: "number", onlyInt: true },
      { name: "work_ms", type: "number", onlyInt: true },
      { name: "input", type: "number", onlyInt: true },
      { name: "output", type: "number", onlyInt: true },
      { name: "cache_read", type: "number", onlyInt: true },
      { name: "cache_write", type: "number", onlyInt: true },
      { name: "cost", type: "number" },
      { name: "segments", type: "json", maxSize: 200000 },
      { name: "subagent_count", type: "number", onlyInt: true },
      { name: "runs", type: "number", onlyInt: true },
      { name: "turns", type: "number", onlyInt: true },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["completed", "aborted", "interrupted"],
      },
      { name: "session_id", type: "text", max: 200 },
      { name: "session_name", type: "text", max: 300 },
      { name: "machine", type: "text", max: 200 },
      { name: "model", type: "text", max: 200 },
      // Subject to kankaku's KANKAKU_SYNC_PROMPT privacy setting (proposal §8).
      { name: "prompt", type: "text", max: 20000 },
      // Original free-text client label for pre-migration rows routed to
      // "Sin determinar" (proposal §5.3). Powers the reassignment queue.
      { name: "legacy_client_label", type: "text", max: 200 },
      // kankaku's local `project` field/path, kept even when `project`
      // relation cannot be resolved.
      { name: "repo_project", type: "text", max: 500 },
      { name: "schema", type: "number", onlyInt: true },
      {
        name: "created",
        type: "autodate",
        onCreate: true,
      },
      {
        name: "updated",
        type: "autodate",
        onCreate: true,
        onUpdate: true,
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_task_entries_task_id ON task_entries (task_id)",
      "CREATE INDEX idx_task_entries_project_started ON task_entries (project, started_at)",
      "CREATE INDEX idx_task_entries_client_started ON task_entries (client, started_at)",
      "CREATE INDEX idx_task_entries_started ON task_entries (started_at)",
    ],
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("task_entries");
  return app.delete(collection);
});
