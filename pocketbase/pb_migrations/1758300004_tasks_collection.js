/// <reference path="../pb_data/types.d.ts" />

// tasks: created by the manager, linked to (never invented by) kankaku.
// See docs/proposal.md §4, D4.
migrate((app) => {
  const projects = app.findCollectionByNameOrId("projects");

  const collection = new Collection({
    type: "base",
    name: "tasks",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.role = 'owner'",
    updateRule: "@request.auth.role = 'owner'",
    deleteRule: "@request.auth.role = 'owner'",
    fields: [
      {
        name: "title",
        type: "text",
        required: true,
        max: 300,
      },
      {
        name: "project",
        type: "relation",
        required: true,
        collectionId: projects.id,
        cascadeDelete: false,
        maxSelect: 1,
      },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["open", "doing", "done"],
      },
      {
        name: "external_ref",
        type: "text",
        max: 200,
      },
      {
        name: "description",
        type: "text",
        max: 20000,
      },
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
      "CREATE INDEX idx_tasks_project ON tasks (project)",
      "CREATE INDEX idx_tasks_status ON tasks (status)",
    ],
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("tasks");
  return app.delete(collection);
});
