/// <reference path="../pb_data/types.d.ts" />

// GET /api/kankaku/last-activity
//
// Anonymous, read-only presence signal for public sites (soyun.ninja shows
// whether the owner is coding right now). It answers only
//   { "last_activity_at": "<ISO-8601 UTC>" | null }
// computed from the newest work_records started_at/settled_at. No prompt,
// model, machine, cost, client or id ever leaves this route; the
// work_records collection rules stay unchanged (auth required).
//
// GOJA/POCKETBASE HOOKS CONSTRAINT: a routerAdd(...) handler closure does
// not see this file's top-level scope, so require(...) lives inside it.
routerAdd("GET", "/api/kankaku/last-activity", (e) => {
  const { lastActivityAt } = require(`${__hooks}/lib/last-activity.js`);

  function newest(field) {
    try {
      const rows = e.app.findRecordsByFilter("work_records", `${field} != ''`, `-${field}`, 1, 0);
      return rows && rows.length > 0 ? rows[0].getString(field) : null;
    } catch (err) {
      // Fail closed (null = "not active") but leave a trace for the operator.
      try { e.app.logger().error("last-activity query failed", "error", String(err)); } catch (_e) { /* never throw */ }
      return null;
    }
  }

  e.response.header().set("Cache-Control", "public, max-age=60");
  return e.json(200, {
    last_activity_at: lastActivityAt(newest("started_at"), newest("settled_at")),
  });
});
