/// <reference path="../pb_data/types.d.ts" />

// Tighten the built-in `users` auth collection: this is a single-user tool
// (one owner + one kankaku service account), not a multi-tenant app.
// - No public self-registration: accounts are provisioned only via the
//   superuser CLI/API (see scripts/dev.sh).
// - Each account can only see/update itself.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");

  collection.listRule = "id = @request.auth.id";
  collection.viewRule = "id = @request.auth.id";
  collection.createRule = null; // superuser-only
  collection.updateRule = "id = @request.auth.id";
  collection.deleteRule = null; // superuser-only

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("users");

  collection.listRule = null;
  collection.viewRule = null;
  collection.createRule = "";
  collection.updateRule = "id = @request.auth.id";
  collection.deleteRule = "id = @request.auth.id";

  return app.save(collection);
});
