/// <reference path="../pb_data/types.d.ts" />

// Adds a `role` select field to the built-in `users` auth collection so the
// same auth collection can hold both the human owner and the kankaku
// service account (see docs/proposal.md §8 and AGENTS.md).
migrate((app) => {
  const collection = app.findCollectionByNameOrId("users");

  collection.fields.add(new SelectField({
    name: "role",
    type: "select",
    required: true,
    maxSelect: 1,
    values: ["owner", "service"],
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("users");

  collection.fields.removeByName("role");

  return app.save(collection);
});
