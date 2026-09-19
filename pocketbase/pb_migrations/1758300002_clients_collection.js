/// <reference path="../pb_data/types.d.ts" />

// clients: the top-level billing entity. See docs/proposal.md §4.
migrate((app) => {
  const collection = new Collection({
    type: "base",
    name: "clients",
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
        name: "code",
        type: "text",
        required: true,
        max: 60,
      },
      {
        name: "active",
        type: "bool",
      },
      {
        name: "unassigned",
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
      "CREATE UNIQUE INDEX idx_clients_code ON clients (code)",
    ],
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("clients");
  return app.delete(collection);
});
