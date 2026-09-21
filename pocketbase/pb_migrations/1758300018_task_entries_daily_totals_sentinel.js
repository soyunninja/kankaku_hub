/// <reference path="../pb_data/types.d.ts" />

// Fixes a sentinel collision in task_entries_daily_totals' synthetic `id`
// column. Migration 1758300015 used the bare string 'unreported' to stand
// in for an empty `agent` in the id (`... || COALESCE(NULLIF(te.agent,
// ''), 'unreported')`), which collides with a real `agent` value that
// happens to literally be "unreported" — two different rows (one legacy
// empty-agent row, one genuinely reported as agent "unreported") would
// synthesize the SAME `id`, and PocketBase view rows are keyed by that id.
//
// 'agent' is documented as a lowercase slug (docs/contract.md "Agent and
// measurement quality": "pi", "opencode", ...). '~none' cannot be a valid
// slug (no agent integration would ever send a `~`), so it cannot collide
// with any real reported value, unlike 'unreported' which was itself a
// plausible-looking slug.
//
// Found by an independent review on 2026-09-21 (see
// docs/adr/0026-day-boundaries-are-local.md). This view still has no
// in-app consumer (see that ADR); it is kept as a documented read-only
// aggregation surface, per docs/contract.md.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("task_entries_daily_totals");

  collection.viewQuery = `
    SELECT
      (te.project || '_' || te.client || '_' || CAST(substr(te.started_at, 1, 10) AS TEXT) || '_' || COALESCE(NULLIF(te.agent, ''), '~none')) as id,
      te.project as project,
      te.client as client,
      CAST(substr(te.started_at, 1, 10) AS TEXT) as day,
      te.agent as agent,
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
    GROUP BY te.project, te.client, day, te.agent
  `.trim();

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("task_entries_daily_totals");

  collection.viewQuery = `
    SELECT
      (te.project || '_' || te.client || '_' || CAST(substr(te.started_at, 1, 10) AS TEXT) || '_' || COALESCE(NULLIF(te.agent, ''), 'unreported')) as id,
      te.project as project,
      te.client as client,
      CAST(substr(te.started_at, 1, 10) AS TEXT) as day,
      te.agent as agent,
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
    GROUP BY te.project, te.client, day, te.agent
  `.trim();

  return app.save(collection);
});
