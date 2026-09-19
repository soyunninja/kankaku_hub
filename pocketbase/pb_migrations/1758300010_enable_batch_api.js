/// <reference path="../pb_data/types.d.ts" />

// Enable the /api/batch endpoint so kankaku's sync client can upsert many
// task_entries/work_records rows in one request instead of one per row.
// See docs/proposal.md §6.2 and docs/contract.md.
migrate((app) => {
  const settings = app.settings();
  settings.batch.enabled = true;
  settings.batch.maxRequests = 100;
  return app.save(settings);
}, (app) => {
  const settings = app.settings();
  settings.batch.enabled = false;
  return app.save(settings);
});
