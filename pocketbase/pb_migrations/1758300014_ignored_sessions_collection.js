/// <reference path="../pb_data/types.d.ts" />

// ignored_sessions: durable record of a kankaku session the owner dismissed
// from the "sessions without a task" queue WITHOUT creating a task for it.
// A dedicated collection (not a fake `tasks` row) so an ignored session can
// never be mistaken for real work, and durable in PocketBase (not browser
// localStorage) so the decision survives across the owner's machines.
// See docs/adr/0024-sessions-link-to-tasks-by-explicit-action.md.
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "ignored_sessions",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.role = 'owner'",
    updateRule: "@request.auth.role = 'owner'",
    deleteRule: "@request.auth.role = 'owner'",
    fields: [
      {
        // Natural key: same session_id task_entries groups entries by.
        name: "session_id",
        type: "text",
        required: true,
        max: 200,
      },
      {
        // Informational only; not used for matching.
        name: "machine",
        type: "text",
        max: 120,
      },
      {
        name: "ignored_at",
        type: "autodate",
        onCreate: true,
      },
      {
        name: "note",
        type: "text",
        max: 500,
      },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_ignored_sessions_session_id ON ignored_sessions (session_id)",
    ],
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("ignored_sessions");
  return app.delete(collection);
});
