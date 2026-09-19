/// <reference path="../pb_data/types.d.ts" />

// Read-only view for the web dashboard: totals per project per day, summed
// ONLY from task_entries (already consolidated, D6). Never built from
// work_records. See docs/proposal.md §4, §9.3, AGENTS.md (rule D6).
migrate((app) => {
  const collection = new Collection({
    type: "view",
    name: "task_entries_daily_totals",
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    viewQuery: `
      SELECT
        (te.project || '_' || te.client || '_' || CAST(substr(te.started_at, 1, 10) AS TEXT)) as id,
        te.project as project,
        te.client as client,
        CAST(substr(te.started_at, 1, 10) AS TEXT) as day,
        CAST(COALESCE(SUM(te.wall_ms), 0) AS INTEGER) as wall_ms,
        CAST(COALESCE(SUM(te.work_ms), 0) AS INTEGER) as work_ms,
        CAST(COALESCE(SUM(te.waiting_ms), 0) AS INTEGER) as waiting_ms,
        CAST(COALESCE(SUM(te.input), 0) AS INTEGER) as input,
        CAST(COALESCE(SUM(te.output), 0) AS INTEGER) as output,
        CAST(COALESCE(SUM(te.cache_read), 0) AS INTEGER) as cache_read,
        CAST(COALESCE(SUM(te.cache_write), 0) AS INTEGER) as cache_write,
        CAST(COALESCE(SUM(te.cost), 0) AS REAL) as cost,
        CAST(COUNT(*) AS INTEGER) as entries
      FROM task_entries te
      GROUP BY te.project, te.client, day
    `.trim(),
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("task_entries_daily_totals");
  return app.delete(collection);
});
