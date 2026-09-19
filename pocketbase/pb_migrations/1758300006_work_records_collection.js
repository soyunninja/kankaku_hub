/// <reference path="../pb_data/types.d.ts" />

// work_records: optional raw detail, one row per kankaku WorkRecord.
// rollup is always false and is a standing warning: these rows overlap
// each other and must NEVER be summed. Only task_entries is summable.
// See docs/proposal.md §4, AGENTS.md (rule D6).
migrate((app) => {
  const taskEntries = app.findCollectionByNameOrId("task_entries");

  const collection = new Collection({
    type: "base",
    name: "work_records",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id != ''",
    deleteRule: "@request.auth.role = 'owner'",
    fields: [
      {
        // Idempotency key: the kankaku WorkRecord id.
        name: "kankaku_id",
        type: "text",
        required: true,
        max: 200,
      },
      {
        name: "task_entry",
        type: "relation",
        required: true,
        collectionId: taskEntries.id,
        cascadeDelete: true,
        maxSelect: 1,
      },
      { name: "rollup", type: "bool" },
      { name: "role", type: "select", maxSelect: 1, values: ["orchestrator", "subagent"] },
      { name: "pid", type: "number", onlyInt: true },
      { name: "parent_pid", type: "number", onlyInt: true },
      { name: "started_at", type: "date", required: true },
      { name: "settled_at", type: "date" },
      { name: "wall_ms", type: "number", onlyInt: true },
      { name: "waiting_ms", type: "number", onlyInt: true },
      { name: "work_ms", type: "number", onlyInt: true },
      { name: "runs", type: "number", onlyInt: true },
      { name: "turns", type: "number", onlyInt: true },
      {
        name: "status",
        type: "select",
        maxSelect: 1,
        values: ["completed", "aborted", "interrupted"],
      },
      { name: "model", type: "text", max: 200 },
      { name: "input", type: "number", onlyInt: true },
      { name: "output", type: "number", onlyInt: true },
      { name: "cache_read", type: "number", onlyInt: true },
      { name: "cache_write", type: "number", onlyInt: true },
      { name: "cost", type: "number" },
      { name: "segments", type: "json", maxSize: 200000 },
      { name: "tools", type: "json", maxSize: 200000 },
      { name: "session_id", type: "text", max: 200 },
      { name: "prompt", type: "text", max: 20000 },
      { name: "machine", type: "text", max: 200 },
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
      "CREATE UNIQUE INDEX idx_work_records_kankaku_id ON work_records (kankaku_id)",
      "CREATE INDEX idx_work_records_task_entry ON work_records (task_entry)",
    ],
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("work_records");
  return app.delete(collection);
});
