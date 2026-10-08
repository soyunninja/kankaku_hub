/// <reference path="../pb_data/types.d.ts" />

// POST /api/kankaku/totals — server-side aggregation over `task_entries`
// (D6: SUM/COUNT/MIN/MAX only, never `work_records`). Replaces the
// unbounded getFullList()+client-side-sum pattern the web previously used
// for the dashboard, tasks board, sessions queues, unassigned queue and
// entries explorer's agent filter — see docs/architecture/aggregation.md
// "the server sums; the browser displays" and
// docs/adr/0027-totals-computed-server-side.md.
//
// All request validation and SQL building lives in the pure, goja-and-Node
// compatible pocketbase/pb_hooks/lib/totals-query.js (unit tested with
// `npm run hooks:test`) so the security-critical whitelisting logic is
// verified independent of a running PocketBase instance. This file only
// wires that module to `$app.db()`.
//
// GOJA/POCKETBASE HOOKS CONSTRAINT (see pb_hooks/favicon.pb.js's header
// comment for the full story, reconfirmed here): a routerAdd(...) handler
// closure does not see this file's top-level scope, so every require(...)
// call and helper function lives inside the handler body.
//
// GOJA SQL API (verified against a real running PocketBase 0.40.4
// instance, not guessed — see docs/architecture/hub-backend.md): raw SQL
// with bound named parameters is
//   const rows = arrayOf(new DynamicModel({ col: "", n: 0, f: -0 }))
//   $app.db().newQuery(sql).bind({ name: value }).all(rows)
// `arrayOf`/`DynamicModel` are goja-only globals with no Node equivalent
// (hence this route file, unlike totals-query.js, cannot run under plain
// Node — it is exercised via a live isolated PocketBase instance instead,
// see docs/contract.md "POST /api/kankaku/totals" for captured examples).
// `dbx` bind params do NOT support a JS array value for an IN(...) clause
// (`sql: converting argument $1 type: unsupported type []interface {}`) —
// not used by this route since every filter here is a scalar equality or
// a bounded day-boundary CASE (see totals-query.js#buildDayCase, one named
// param per boundary instant, never a bound array).
routerAdd("POST", "/api/kankaku/totals", (e) => {
  const totalsQuery = require(`${__hooks}/lib/totals-query.js`);

  const MAX_BODY_BYTES = 100000; // defense in depth; totals-query.js also caps JSON.stringify length

  function runQuery(descriptor, shape) {
    const rows = arrayOf(new DynamicModel(shape));
    $app.db().newQuery(descriptor.sql).bind(descriptor.params).all(rows);
    return rows;
  }

  const AGG_SHAPE = {
    entries: 0,
    wall_ms: 0,
    work_ms: 0,
    waiting_ms: 0,
    input: 0,
    output: 0,
    cache_read: 0,
    cache_write: 0,
    cost: -0,
    waiting_unavailable_entries: 0,
    cost_unknown_entries: 0,
    cost_estimated_entries: 0,
    cost_known_entries: 0,
    cost_known_sum: -0,
    unlinked_entries: 0,
    distinct_sessions: 0,
  };

  const GROUP_ROW_SHAPE = Object.assign({
    group_key: "",
    group_key2: "",
    day_index: 0,
    session_name: "",
    min_started_at: "",
    max_ended_at: "",
    distinct_client: 0,
    sample_client: "",
    distinct_project: 0,
    sample_project: "",
    distinct_task: 0,
    sample_task: "",
    machine_out: "",
    distinct_agent: 0,
    sample_agent: "",
    active_projects: 0,
    ignored_session: 0,
    distinct_member: 0,
    sample_member: "",
    unassigned_member_entries: 0,
    total_groups_window: 0,
  }, AGG_SHAPE);

  /** Reshapes one raw SQL row into the wire response shape (renames the
   * internal `machine_out` alias back to `machine`, drops the
   * placeholder `day_index` field for non-day group_bys handled by the
   * caller). */
  function toGroupJson(row) {
    const group = {
      group_key: row.group_key,
      group_key2: row.group_key2,
      entries: row.entries,
      wall_ms: row.wall_ms,
      work_ms: row.work_ms,
      waiting_ms: row.waiting_ms,
      input: row.input,
      output: row.output,
      cache_read: row.cache_read,
      cache_write: row.cache_write,
      cost: row.cost,
      waiting_unavailable_entries: row.waiting_unavailable_entries,
      cost_unknown_entries: row.cost_unknown_entries,
      cost_estimated_entries: row.cost_estimated_entries,
      cost_known_entries: row.cost_known_entries,
      cost_known_sum: row.cost_known_sum,
      unlinked_entries: row.unlinked_entries,
      distinct_sessions: row.distinct_sessions,
      session_name: row.session_name,
      min_started_at: row.min_started_at,
      max_ended_at: row.max_ended_at,
      distinct_client: row.distinct_client,
      sample_client: row.sample_client,
      distinct_project: row.distinct_project,
      sample_project: row.sample_project,
      distinct_task: row.distinct_task,
      sample_task: row.sample_task,
      machine: row.machine_out,
      distinct_agent: row.distinct_agent,
      sample_agent: row.sample_agent,
      active_projects: row.active_projects,
      ignored_session: row.ignored_session === 1,
    };
    if (req.groupBy === "session" && memberColumnAvailable) {
      group.distinct_member = row.distinct_member;
      group.unassigned_member_entries = row.unassigned_member_entries;
      if (isOwner) group.sample_member = row.sample_member;
    }
    return group;
  }

  function toTotalJson(row) {
    return {
      entries: row.entries,
      wall_ms: row.wall_ms,
      work_ms: row.work_ms,
      waiting_ms: row.waiting_ms,
      input: row.input,
      output: row.output,
      cache_read: row.cache_read,
      cache_write: row.cache_write,
      cost: row.cost,
      waiting_unavailable_entries: row.waiting_unavailable_entries,
      cost_unknown_entries: row.cost_unknown_entries,
      cost_estimated_entries: row.cost_estimated_entries,
      cost_known_entries: row.cost_known_entries,
      cost_known_sum: row.cost_known_sum,
      unlinked_entries: row.unlinked_entries,
      distinct_sessions: row.distinct_sessions,
    };
  }

  let rawBody;
  try {
    const info = e.requestInfo();
    rawBody = info.body || {};
  }
  catch (err) {
    return e.json(400, { data: {}, message: "Invalid JSON body.", status: 400 });
  }

  const validated = totalsQuery.validateRequest(rawBody);
  if (!validated.ok) {
    return e.json(400, { data: { errors: validated.errors }, message: "Invalid totals request.", status: 400 });
  }

  const req = validated.value;
  const isOwner = !!e.auth && e.auth.collection().name === "users" && e.auth.getString("role") === "owner";
  let memberColumnAvailable = false;
  if (req.groupBy === "session") {
    try {
      const memberColumn = runQuery({
        sql: "SELECT name FROM pragma_table_info('task_entries') WHERE name = 'member'",
        params: {},
      }, { name: "" });
      memberColumnAvailable = totalsQuery.hasMemberColumn(memberColumn);
    }
    catch (_err) {
      // Older SQLite/PocketBase schemas keep the legacy session response
      // usable; the explicit false marker means attribution is unknown.
      memberColumnAvailable = false;
    }
  }
  let queries;
  try {
    queries = totalsQuery.buildQueries(req, { memberColumnAvailable: memberColumnAvailable });
  }
  catch (err) {
    return e.json(400, { data: {}, message: "Could not build totals query.", status: 400 });
  }

  let grandTotalRows;
  try {
    grandTotalRows = runQuery(queries.grandTotal, AGG_SHAPE);
  }
  catch (err) {
    try { e.app.logger().error("totals: grand total query failed", "error", String(err)); } catch (_e) {}
    return e.json(500, { data: {}, message: "Failed to compute totals.", status: 500 });
  }
  const total = grandTotalRows.length > 0 ? toTotalJson(grandTotalRows[0]) : toTotalJson(new DynamicModel(AGG_SHAPE));

  if (req.groupBy === "none" || !queries.page) {
    return e.json(200, {
      groups: [],
      total: total,
      page: req.page,
      per_page: req.perPage,
      total_groups: 0,
      total_pages: 0,
    });
  }

  let pageRows;
  try {
    pageRows = runQuery(queries.page, GROUP_ROW_SHAPE);
  }
  catch (err) {
    try { e.app.logger().error("totals: page query failed", "error", String(err)); } catch (_e) {}
    return e.json(500, { data: {}, message: "Failed to compute totals.", status: 500 });
  }

  // Common case: the page query's `COUNT(*) OVER()` window carries
  // total_groups for free. Fallback (page past the last page, so the
  // window value has no row to attach to, or a genuinely empty result
  // set): run the separate groupCount query — see totals-query.js's
  // pageSql comment.
  let totalGroups;
  if (pageRows.length > 0) {
    totalGroups = pageRows[0].total_groups_window;
  }
  else {
    let groupCountRows;
    try {
      groupCountRows = runQuery(queries.groupCount, { cnt: 0 });
    }
    catch (err) {
      try { e.app.logger().error("totals: group count fallback query failed", "error", String(err)); } catch (_e) {}
      return e.json(500, { data: {}, message: "Failed to compute totals.", status: 500 });
    }
    totalGroups = groupCountRows.length > 0 ? groupCountRows[0].cnt : 0;
  }
  const totalPages = totalGroups === 0 ? 0 : Math.ceil(totalGroups / req.perPage);

  const response = {
    groups: pageRows.map(toGroupJson),
    total: total,
    page: req.page,
    per_page: req.perPage,
    total_groups: totalGroups,
    total_pages: totalPages,
  };
  if (req.groupBy === "member") response.active_projects_available = true;
  if (req.groupBy === "session") {
    response.session_member_summary_available = memberColumnAvailable;
    response.ignored_sessions_included = req.includeIgnoredSessions === true;
    if (!memberColumnAvailable) {
      response.groups = response.groups.map((group) => {
        delete group.distinct_member;
        delete group.unassigned_member_entries;
        return group;
      });
    }
  }
  return e.json(200, response);
}, $apis.requireAuth());
