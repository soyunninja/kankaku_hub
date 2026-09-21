"use strict";

// Pure request-validation + SQL-building module for POST
// /api/kankaku/totals (pocketbase/pb_hooks/totals.pb.js).
//
// SECURITY CONTRACT (see docs/contract.md "POST /api/kankaku/totals" and
// docs/architecture/hub-backend.md): every dimension the caller can pick
// (group_by, sort, filter keys) is resolved through a fixed whitelist to
// a HARD-CODED SQL fragment — request text NEVER becomes part of a SQL
// identifier or is concatenated into the query string. Every VALUE (a
// client id, a date, a boundary instant, ...) is passed through as a
// bound `dbx` named parameter (`{:name}`), never interpolated. This file
// has no PocketBase/goja globals — it only builds `{ sql, params }`
// descriptors — so it is fully testable with plain `node --test`
// (pocketbase/pb_hooks/lib/totals-query.test.js) independent of a running
// PocketBase instance, same pattern as favicon-html.js/favicon-sniff.js.
//
// D6: the only table this module ever reads is `task_entries` (never
// `work_records`) and the only operations are SUM/COUNT/MIN/MAX — see
// AGENTS.md rule D6 and docs/architecture/aggregation.md.

var MAX_DAY_BOUNDARIES = 401; // up to 400 local-day buckets
var MAX_PER_PAGE = 200;
var MAX_BODY_CHARS = 60000; // generous headroom over a 401-boundary array (~30 chars/entry)
var MAX_STRING_LEN = 400; // generic cap for any single filter value

var GROUP_BY_VALUES = ["none", "day", "client", "project", "task", "session", "agent", "model", "legacy_label"];
var STATUS_VALUES = ["completed", "aborted", "interrupted"];

// sort key -> literal ORDER BY SQL fragment. Never derived from request text.
var SORT_SQL = {
  "-cost": "cost DESC",
  "cost": "cost ASC",
  "-entries": "entries DESC",
  "entries": "entries ASC",
  "-wall_ms": "wall_ms DESC",
  "wall_ms": "wall_ms ASC",
  "-work_ms": "work_ms DESC",
  "work_ms": "work_ms ASC",
  "-waiting_ms": "waiting_ms DESC",
  "waiting_ms": "waiting_ms ASC",
  "-group_key": "group_key DESC",
  "group_key": "group_key ASC",
  "-min_started_at": "min_started_at DESC",
  "min_started_at": "min_started_at ASC",
  "-max_ended_at": "max_ended_at DESC",
  "max_ended_at": "max_ended_at ASC",
};

var DATE_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?Z$/;

/** Range-checks the regex-matched components (month 01-12, day 01-31,
 * hour 00-23, minute/second 00-59) — the regex alone accepts a
 * shape-valid but semantically bogus date like "2026-13-40 25:99:99Z". */
function isValidDateShape(match) {
  var month = Number(match[2]);
  var day = Number(match[3]);
  var hour = Number(match[4]);
  var minute = Number(match[5]);
  var second = Number(match[6]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31
    && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
}

function isPlainObject(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0 && v.length <= MAX_STRING_LEN;
}

/** Normalizes an accepted date string to PocketBase's stored
 * "YYYY-MM-DD HH:MM:SS.mmmZ" form (space separator) so it compares
 * correctly against the `started_at` column, which is always stored that
 * way (see app/lib/local-day.ts#toPbDateFilter on the web side). */
function normalizeDate(value) {
  return value.replace("T", " ");
}

function validateDate(value, fieldName, errors) {
  if (typeof value !== "string") {
    errors.push("invalid_" + fieldName);
    return null;
  }
  var match = DATE_RE.exec(value);
  if (!match || !isValidDateShape(match)) {
    errors.push("invalid_" + fieldName);
    return null;
  }
  return normalizeDate(value);
}

var FILTER_KEYS = [
  "client", "project", "task", "agent", "status", "machine",
  "session_id", "unassigned_only", "without_task", "exclude_unassigned_client",
  "session_fully_unassigned",
];

/**
 * Validates a raw parsed JSON body against the fixed contract. Returns
 * `{ ok: true, value: <normalized request> }` or
 * `{ ok: false, errors: string[] }` — never throws on malformed input.
 */
function validateRequest(body) {
  var errors = [];

  if (!isPlainObject(body)) {
    return { ok: false, errors: ["body_must_be_object"] };
  }

  // Body-size guard (defense in depth alongside day_boundaries/per_page
  // caps below, which bound the size structurally too).
  try {
    if (JSON.stringify(body).length > MAX_BODY_CHARS) {
      return { ok: false, errors: ["body_too_large"] };
    }
  }
  catch (e) {
    return { ok: false, errors: ["body_not_serializable"] };
  }

  var allowedTopKeys = { from: 1, to: 1, filters: 1, group_by: 1, day_boundaries: 1, sort: 1, page: 1, per_page: 1 };
  for (var key in body) {
    if (Object.prototype.hasOwnProperty.call(body, key) && !allowedTopKeys[key]) {
      errors.push("unknown_param:" + key);
    }
  }

  var groupBy = body.group_by === undefined ? "none" : body.group_by;
  if (GROUP_BY_VALUES.indexOf(groupBy) === -1) {
    errors.push("invalid_group_by");
  }

  var from = null;
  var to = null;
  if (body.from !== undefined) from = validateDate(body.from, "from", errors);
  if (body.to !== undefined) to = validateDate(body.to, "to", errors);

  var dayBoundaries = null;
  if (groupBy === "day") {
    if (!Array.isArray(body.day_boundaries) || body.day_boundaries.length < 2) {
      errors.push("day_boundaries_required");
    }
    else if (body.day_boundaries.length > MAX_DAY_BOUNDARIES) {
      errors.push("too_many_day_boundaries");
    }
    else {
      dayBoundaries = [];
      var prevValid = null;
      for (var i = 0; i < body.day_boundaries.length; i++) {
        var normalized = validateDate(body.day_boundaries[i], "day_boundaries", errors);
        if (normalized === null) break;
        if (prevValid !== null && normalized <= prevValid) {
          errors.push("day_boundaries_not_increasing");
          break;
        }
        dayBoundaries.push(normalized);
        prevValid = normalized;
      }
      if (dayBoundaries.length !== body.day_boundaries.length) dayBoundaries = null;
    }
  }
  else if (body.day_boundaries !== undefined) {
    errors.push("day_boundaries_only_valid_for_group_by_day");
  }

  var filters = {};
  if (body.filters !== undefined) {
    if (!isPlainObject(body.filters)) {
      errors.push("filters_must_be_object");
    }
    else {
      for (var fkey in body.filters) {
        if (!Object.prototype.hasOwnProperty.call(body.filters, fkey)) continue;
        if (FILTER_KEYS.indexOf(fkey) === -1) {
          errors.push("unknown_filter:" + fkey);
          continue;
        }
        var fval = body.filters[fkey];
        if (fkey === "unassigned_only" || fkey === "without_task" || fkey === "session_fully_unassigned") {
          if (typeof fval !== "boolean") {
            errors.push("invalid_filter_" + fkey);
            continue;
          }
          filters[fkey] = fval;
        }
        else if (fkey === "status") {
          if (typeof fval !== "string" || STATUS_VALUES.indexOf(fval) === -1) {
            errors.push("invalid_filter_status");
            continue;
          }
          filters[fkey] = fval;
        }
        else if (fkey === "agent") {
          // '' is a valid value here (means "legacy / not reported").
          if (typeof fval !== "string" || fval.length > MAX_STRING_LEN) {
            errors.push("invalid_filter_agent");
            continue;
          }
          filters[fkey] = fval;
        }
        else {
          // client / project / task / machine / session_id / exclude_unassigned_client
          if (!isNonEmptyString(fval)) {
            errors.push("invalid_filter_" + fkey);
            continue;
          }
          filters[fkey] = fval;
        }
      }
      if (filters.unassigned_only === true && !filters.client) {
        errors.push("unassigned_only_requires_client");
      }
    }
  }

  var sort = body.sort === undefined ? "-cost" : body.sort;
  if (!Object.prototype.hasOwnProperty.call(SORT_SQL, sort)) {
    errors.push("invalid_sort");
  }

  var page = body.page === undefined ? 1 : body.page;
  if (typeof page !== "number" || !isFinite(page) || Math.floor(page) !== page || page < 1) {
    errors.push("invalid_page");
    page = 1;
  }

  var perPage = body.per_page === undefined ? 50 : body.per_page;
  if (typeof perPage !== "number" || !isFinite(perPage) || Math.floor(perPage) !== perPage || perPage < 1 || perPage > MAX_PER_PAGE) {
    errors.push("invalid_per_page");
    perPage = 50;
  }

  if (errors.length > 0) return { ok: false, errors: errors };

  return {
    ok: true,
    value: {
      from: from,
      to: to,
      filters: filters,
      groupBy: groupBy,
      dayBoundaries: dayBoundaries,
      sort: sort,
      page: page,
      perPage: perPage,
    },
  };
}

/** Builds the WHERE clause (without the leading "WHERE") and its bound
 * params, shared by all three queries (grand total / group count / page). */
function buildWhere(req) {
  var clauses = ["1=1"];
  var params = {};

  if (req.groupBy === "day" && req.dayBoundaries) {
    clauses.push("te.started_at >= {:p_from}");
    clauses.push("te.started_at < {:p_to}");
    params.p_from = req.dayBoundaries[0];
    params.p_to = req.dayBoundaries[req.dayBoundaries.length - 1];
  }
  else {
    if (req.from) {
      clauses.push("te.started_at >= {:p_from}");
      params.p_from = req.from;
    }
    if (req.to) {
      clauses.push("te.started_at <= {:p_to}");
      params.p_to = req.to;
    }
  }

  var f = req.filters;
  if (f.client) { clauses.push("te.client = {:p_client}"); params.p_client = f.client; }
  if (f.project) { clauses.push("te.project = {:p_project}"); params.p_project = f.project; }
  if (f.task) { clauses.push("te.task = {:p_task}"); params.p_task = f.task; }
  if (f.agent !== undefined) { clauses.push("te.agent = {:p_agent}"); params.p_agent = f.agent; }
  if (f.status) { clauses.push("te.status = {:p_status}"); params.p_status = f.status; }
  if (f.machine) { clauses.push("te.machine = {:p_machine}"); params.p_machine = f.machine; }
  if (f.session_id) { clauses.push("te.session_id = {:p_session_id}"); params.p_session_id = f.session_id; }
  if (f.without_task === true) { clauses.push("te.task = ''"); }
  if (f.exclude_unassigned_client) {
    clauses.push("te.client != {:p_exclude_client}");
    params.p_exclude_client = f.exclude_unassigned_client;
  }
  // Sessions-without-task queue parity: the pre-totals client-side path
  // (web/app/composables/useSessions.ts#fetchUnassignedSessions) only ever
  // showed a session once EVERY one of its entries was unassigned — a
  // session with even one triaged (task != '') entry elsewhere was
  // excluded outright, not just filtered down to its unassigned rows. A
  // plain `without_task` filter can't express that (it already narrows
  // the row set to task=='' before grouping, so it can never see a
  // sibling assigned row in the same session). This filter is evaluated
  // independent of the WHERE narrowing above via a correlated NOT EXISTS
  // against the whole table (no bound request text — the identifier and
  // shape are fixed, only ever a fixed SQL fragment). Always combine with
  // `without_task: true` at the call site so the WHERE clause still
  // narrows to task=='' rows for aggregation; this filter only adds the
  // "and no sibling row anywhere has a task" exclusion.
  if (f.session_fully_unassigned === true) {
    clauses.push("NOT EXISTS (SELECT 1 FROM task_entries te_fu WHERE te_fu.session_id = te.session_id AND te_fu.task != '')");
  }

  return { where: clauses.join(" AND "), params: params };
}

/** Day-bucket CASE expression, bound safely (one named param per
 * boundary instant, never interpolated). Buckets are half-open:
 * `[boundaries[i], boundaries[i+1])`. */
function buildDayCase(dayBoundaries, params) {
  var whens = [];
  for (var i = 0; i < dayBoundaries.length - 1; i++) {
    var startKey = "p_day" + i;
    var endKey = "p_day" + (i + 1);
    params[startKey] = dayBoundaries[i];
    if (params[endKey] === undefined) params[endKey] = dayBoundaries[i + 1];
    whens.push("WHEN te.started_at >= {:" + startKey + "} AND te.started_at < {:" + endKey + "} THEN " + i);
  }
  return "CASE " + whens.join(" ") + " ELSE -1 END";
}

// Aggregate columns shared by every group_by branch.
var AGG_COLUMNS =
  "CAST(COUNT(*) AS INTEGER) as entries," +
  "CAST(COALESCE(SUM(te.wall_ms), 0) AS INTEGER) as wall_ms," +
  "CAST(COALESCE(SUM(te.work_ms), 0) AS INTEGER) as work_ms," +
  "CAST(COALESCE(SUM(te.waiting_ms), 0) AS INTEGER) as waiting_ms," +
  "CAST(COALESCE(SUM(te.input), 0) AS INTEGER) as input," +
  "CAST(COALESCE(SUM(te.output), 0) AS INTEGER) as output," +
  "CAST(COALESCE(SUM(te.cache_read), 0) AS INTEGER) as cache_read," +
  "CAST(COALESCE(SUM(te.cache_write), 0) AS INTEGER) as cache_write," +
  "CAST(COALESCE(SUM(te.cost), 0) AS REAL) as cost," +
  "CAST(COALESCE(SUM(CASE WHEN te.waiting_quality = 'unavailable' THEN 1 ELSE 0 END), 0) AS INTEGER) as waiting_unavailable_entries," +
  "CAST(COALESCE(SUM(CASE WHEN te.cost_quality = 'unknown' THEN 1 ELSE 0 END), 0) AS INTEGER) as cost_unknown_entries," +
  "CAST(COALESCE(SUM(CASE WHEN te.cost_quality = 'estimated' THEN 1 ELSE 0 END), 0) AS INTEGER) as cost_estimated_entries," +
  "CAST(COALESCE(SUM(CASE WHEN te.cost_quality != 'unknown' THEN 1 ELSE 0 END), 0) AS INTEGER) as cost_known_entries," +
  "CAST(COALESCE(SUM(CASE WHEN te.cost_quality != 'unknown' THEN te.cost ELSE 0 END), 0) AS REAL) as cost_known_sum," +
  "CAST(COALESCE(SUM(CASE WHEN te.subagent_linkage = 'unlinked' THEN 1 ELSE 0 END), 0) AS INTEGER) as unlinked_entries," +
  "CAST(COUNT(DISTINCT te.session_id) AS INTEGER) as distinct_sessions";

// Placeholder columns for fields only meaningful under group_by=session,
// kept in every branch so every query returns the SAME column shape (the
// DynamicModel scan shape in totals.pb.js is fixed).
var SESSION_PLACEHOLDER_COLUMNS =
  "'' as session_name, '' as min_started_at, '' as max_ended_at," +
  "0 as distinct_client, '' as sample_client," +
  "0 as distinct_project, '' as sample_project," +
  "0 as distinct_task, '' as sample_task," +
  "'' as machine_out, 0 as distinct_agent, '' as sample_agent";

var SESSION_REAL_COLUMNS =
  // COALESCE: a session where no entry carries a name makes the subquery
  // return NULL, and PocketBase cannot scan NULL into a string (a 500).
  "COALESCE((SELECT te2.session_name FROM task_entries te2 WHERE te2.session_id = te.session_id AND te2.session_name != '' ORDER BY te2.started_at DESC LIMIT 1), '') as session_name," +
  "MIN(te.started_at) as min_started_at," +
  "MAX(te.ended_at) as max_ended_at," +
  "COUNT(DISTINCT te.client) as distinct_client, MIN(te.client) as sample_client," +
  "COUNT(DISTINCT te.project) as distinct_project, MIN(te.project) as sample_project," +
  "COUNT(DISTINCT te.task) as distinct_task, MIN(te.task) as sample_task," +
  "(SELECT te3.machine FROM task_entries te3 WHERE te3.session_id = te.session_id ORDER BY te3.started_at DESC LIMIT 1) as machine_out," +
  "COUNT(DISTINCT te.agent) as distinct_agent, MIN(te.agent) as sample_agent";

/**
 * Builds the group-by SELECT/GROUP BY fragment for one branch. Returns
 * `{ selectExtra, groupBy, having }` — `selectExtra` always starts with
 * `group_key` (text) and `group_key2` (text, '' when unused).
 */
function buildGroupBranch(groupBy, params) {
  switch (groupBy) {
    case "none":
      return { selectExtra: "'' as group_key, '' as group_key2, -1 as day_index," + SESSION_PLACEHOLDER_COLUMNS, groupBy: "", having: "" };
    case "day":
      return { selectExtra: "CAST(day_index AS TEXT) as group_key, '' as group_key2, day_index," + SESSION_PLACEHOLDER_COLUMNS, groupBy: "day_index", having: "day_index >= 0" };
    case "client":
      return { selectExtra: "te.client as group_key, '' as group_key2, -1 as day_index," + SESSION_PLACEHOLDER_COLUMNS, groupBy: "te.client", having: "" };
    case "project":
      return { selectExtra: "te.project as group_key, '' as group_key2, -1 as day_index," + SESSION_PLACEHOLDER_COLUMNS, groupBy: "te.project", having: "" };
    case "task":
      return { selectExtra: "te.task as group_key, '' as group_key2, -1 as day_index," + SESSION_PLACEHOLDER_COLUMNS, groupBy: "te.task", having: "" };
    case "agent":
      return { selectExtra: "te.agent as group_key, '' as group_key2, -1 as day_index," + SESSION_PLACEHOLDER_COLUMNS, groupBy: "te.agent", having: "" };
    case "model":
      return { selectExtra: "te.model as group_key, '' as group_key2, -1 as day_index," + SESSION_PLACEHOLDER_COLUMNS, groupBy: "te.model", having: "" };
    case "session":
      return { selectExtra: "te.session_id as group_key, '' as group_key2, -1 as day_index," + SESSION_REAL_COLUMNS, groupBy: "te.session_id", having: "" };
    case "legacy_label":
      return { selectExtra: "te.legacy_client_label as group_key, te.repo_project as group_key2, -1 as day_index," + SESSION_PLACEHOLDER_COLUMNS, groupBy: "te.legacy_client_label, te.repo_project", having: "" };
    default:
      throw new Error("unreachable group_by: " + groupBy);
  }
}

/**
 * Builds the three SQL statements needed to answer a validated request:
 * - `grandTotal`: single-row aggregate over the whole filtered set (no GROUP BY)
 * - `groupCount`: number of distinct groups (for pagination), omitted for group_by=none
 * - `page`: the paginated, sorted grouped rows, omitted for group_by=none
 *
 * `req` must be the `.value` of a successful `validateRequest(...)` call.
 * Every returned `params` object binds via `dbx`'s `{:name}` syntax —
 * see pocketbase/pb_hooks/totals.pb.js.
 */
function buildQueries(req) {
  var whereParams = {};
  var whereInfo = buildWhere(req);
  var where = whereInfo.where;
  for (var k in whereInfo.params) whereParams[k] = whereInfo.params[k];

  var isSessionExclusion = req.groupBy === "session";
  var sessionExclusionClause = isSessionExclusion
    ? " AND te.session_id NOT IN (SELECT session_id FROM ignored_sessions)"
    : "";

  var grandTotalSql =
    "SELECT " + AGG_COLUMNS + " FROM task_entries te WHERE " + where + sessionExclusionClause;
  var grandTotal = { sql: grandTotalSql, params: shallowCopy(whereParams) };

  if (req.groupBy === "none") {
    return { grandTotal: grandTotal, groupCount: null, page: null };
  }

  var dayParams = {};
  var dayCaseSql = "-1";
  if (req.groupBy === "day" && req.dayBoundaries) {
    dayCaseSql = buildDayCase(req.dayBoundaries, dayParams);
  }

  var branch = buildGroupBranch(req.groupBy, dayParams);

  // For group_by=day, `day_index` must be computed once via a subquery
  // (CASE referencing only bound params, no request text) so both the
  // outer SELECT and GROUP BY/HAVING can reference the same computed
  // value without repeating the (potentially long, up to 400-branch)
  // CASE expression 3 times per row.
  var fromClause;
  var whereForGrouped;
  if (req.groupBy === "day") {
    fromClause = "(SELECT te.*, (" + dayCaseSql + ") as day_index FROM task_entries te WHERE " + where + ") te";
    whereForGrouped = "1=1";
  }
  else {
    fromClause = "task_entries te";
    whereForGrouped = where + sessionExclusionClause;
  }

  var groupCountSql =
    "SELECT CAST(COUNT(*) AS INTEGER) as cnt FROM (" +
    "SELECT 1 FROM " + fromClause + " WHERE " + whereForGrouped +
    (branch.groupBy ? " GROUP BY " + branch.groupBy : "") +
    (branch.having ? " HAVING " + branch.having : "") +
    ") x";
  var groupCountParams = shallowCopy(whereParams);
  for (var dk in dayParams) groupCountParams[dk] = dayParams[dk];

  var orderSql = SORT_SQL[req.sort];
  var offset = (req.page - 1) * req.perPage;
  // `COUNT(*) OVER()` (computed over the full grouped result, before
  // LIMIT/OFFSET is applied) lets the common case (page within range)
  // read `total_groups` off the SAME query as the page rows, cutting the
  // 3-query design down to 2 — see docs/architecture/hub-backend.md "The
  // totals endpoint" for the measured before/after. This only fails to
  // carry a value when `page` is past the last page (LIMIT/OFFSET yields
  // zero rows, so the window value has nowhere to attach) — totals.pb.js
  // falls back to the separate `groupCount` query (still built below)
  // only in that rare case.
  var pageSql =
    "SELECT " + branch.selectExtra + ", " + AGG_COLUMNS + ", CAST(COUNT(*) OVER() AS INTEGER) as total_groups_window" +
    " FROM " + fromClause +
    " WHERE " + whereForGrouped +
    (branch.groupBy ? " GROUP BY " + branch.groupBy : "") +
    (branch.having ? " HAVING " + branch.having : "") +
    " ORDER BY " + orderSql +
    " LIMIT {:p_limit} OFFSET {:p_offset}";
  var pageParams = shallowCopy(whereParams);
  for (var dk2 in dayParams) pageParams[dk2] = dayParams[dk2];
  pageParams.p_limit = req.perPage;
  pageParams.p_offset = offset;

  return {
    grandTotal: grandTotal,
    groupCount: { sql: groupCountSql, params: groupCountParams },
    page: { sql: pageSql, params: pageParams },
  };
}

function shallowCopy(obj) {
  var out = {};
  for (var k in obj) out[k] = obj[k];
  return out;
}

module.exports = {
  validateRequest: validateRequest,
  buildQueries: buildQueries,
  GROUP_BY_VALUES: GROUP_BY_VALUES,
  FILTER_KEYS: FILTER_KEYS,
  MAX_DAY_BOUNDARIES: MAX_DAY_BOUNDARIES,
  MAX_PER_PAGE: MAX_PER_PAGE,
};
