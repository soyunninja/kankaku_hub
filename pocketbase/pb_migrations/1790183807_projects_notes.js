/// <reference path="../pb_data/types.d.ts" />

// Adds optional owner-facing display metadata to projects.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("projects");

  collection.fields.add(new TextField({
    name: "notes",
    required: false,
    max: 5000,
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("projects");

  collection.fields.removeByName("notes");

  return app.save(collection);
});
