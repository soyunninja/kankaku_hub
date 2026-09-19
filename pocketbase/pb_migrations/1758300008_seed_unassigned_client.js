/// <reference path="../pb_data/types.d.ts" />

// Seed the single "Sin determinar" client used as the destination for
// historical records that have no canonical client id yet.
// See docs/proposal.md §5.3. Idempotent: skips if the code already exists.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("clients");

  let existing = null;
  try {
    existing = app.findFirstRecordByFilter(
      collection,
      "code = {:code}",
      { code: "sin-determinar" }
    );
  } catch (_e) {
    existing = null;
  }
  if (existing) {
    return; // already seeded
  }

  const record = new Record(collection);
  record.set("name", "Sin determinar");
  record.set("code", "sin-determinar");
  record.set("active", true);
  record.set("unassigned", true);

  return app.save(record);
}, (app) => {
  const collection = app.findCollectionByNameOrId("clients");

  let existing = null;
  try {
    existing = app.findFirstRecordByFilter(
      collection,
      "code = {:code}",
      { code: "sin-determinar" }
    );
  } catch (_e) {
    existing = null;
  }
  if (existing) {
    return app.delete(existing);
  }
});
