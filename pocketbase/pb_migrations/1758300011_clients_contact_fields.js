/// <reference path="../pb_data/types.d.ts" />

// Adds four optional contact/detail fields to `clients`. No money-related
// fields (AGENTS.md "No money in the database" / ADR 0018) — this is
// display/contact metadata only, never rates or invoicing.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("clients");

  collection.fields.add(new URLField({
    name: "website",
    required: false,
  }));

  collection.fields.add(new EmailField({
    name: "contact_email",
    required: false,
  }));

  collection.fields.add(new TextField({
    name: "contact_phone",
    required: false,
    max: 40,
  }));

  collection.fields.add(new TextField({
    name: "notes",
    required: false,
    max: 5000,
  }));

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("clients");

  collection.fields.removeByName("website");
  collection.fields.removeByName("contact_email");
  collection.fields.removeByName("contact_phone");
  collection.fields.removeByName("notes");

  return app.save(collection);
});
