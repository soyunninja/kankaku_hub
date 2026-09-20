/// <reference path="../pb_data/types.d.ts" />

// Adds three fields to `clients` for the owner-triggered favicon fetch (see
// docs/adr/0019-hub-fetches-and-stores-client-favicons.md). PocketBase
// fetches and stores the icon bytes itself, once, from an explicit owner
// action — the web app never hot-links to a client's own site or a
// third-party favicon service. `favicon` intentionally excludes
// `image/svg+xml` from its mime allow-list: an SVG can carry inline
// script, so it is never an accepted favicon type, raster-only.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("clients");

  collection.fields.add(new FileField({
    name: "favicon",
    required: false,
    maxSelect: 1,
    maxSize: 512000,
    mimeTypes: [
      "image/png",
      "image/x-icon",
      "image/vnd.microsoft.icon",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ],
  }));

  collection.fields.add(new TextField({
    name: "favicon_source",
    required: false,
    max: 2000,
  }));

  collection.fields.add(new DateField({
    name: "favicon_checked_at",
    required: false,
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("clients");

  collection.fields.removeByName("favicon");
  collection.fields.removeByName("favicon_source");
  collection.fields.removeByName("favicon_checked_at");

  return app.save(collection);
});
