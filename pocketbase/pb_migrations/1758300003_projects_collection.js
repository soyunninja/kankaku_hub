/// <reference path="../pb_data/types.d.ts" />

// projects: belongs to exactly one client. See docs/proposal.md §4.
migrate((app) => {
  const clients = app.findCollectionByNameOrId("clients");

  const collection = new Collection({
    type: "base",
    name: "projects",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.role = 'owner'",
    updateRule: "@request.auth.role = 'owner'",
    deleteRule: "@request.auth.role = 'owner'",
    fields: [
      {
        name: "name",
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
        name: "code",
        type: "text",
        max: 60,
      },
      {
        name: "repo_paths",
        type: "json",
        maxSize: 20000,
      },
      {
        name: "active",
        type: "bool",
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
      "CREATE INDEX idx_projects_client ON projects (client)",
    ],
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("projects");
  return app.delete(collection);
});
