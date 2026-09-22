"use strict";

// Pure helpers for the Engram narrative read-only proxy
// (pocketbase/pb_hooks/engram.pb.js). No PocketBase/goja globals — every
// function here is a plain, deterministic transform so it can be unit
// tested with plain `node --test`
// (pocketbase/pb_hooks/lib/engram-narrative.test.js, `npm run hooks:test`)
// independent of a running PocketBase instance and independent of an
// actual Engram daemon, same pattern as totals-query.js/favicon-*.js.
//
// See odd/tasks/engram-narrative.md for the full feature contract and
// docs/architecture/hub-backend.md's "Engram narrative" section for the
// route-level writeup.

var DEFAULT_TIMEOUT_SECONDS = 2;
var MAX_SESSION_IDS = 50;
var TITLE_MAX_CHARS = 120;
var ELLIPSIS = "…";

/**
 * Reads the two Engram env vars through an injected `getenv(key) => string`
 * function (goja's `$os.getenv` or Node's `process.env` lookup under
 * test) — never reads `process.env`/`$os` directly, so this stays pure
 * and Node-testable. Never throws, even if `getenv` itself throws.
 *
 * @returns {{url: string, timeoutSeconds: number, token: string}} `url` is
 *   trimmed with trailing slashes stripped, empty string when unset.
 *   `timeoutSeconds` defaults to 2 for anything missing, blank,
 *   non-numeric or <= 0. `token` is trimmed, empty string when unset —
 *   see `authHeaders`.
 */
function readConfig(getenv) {
  var rawUrl = "";
  try {
    rawUrl = getenv("KANKAKU_ENGRAM_URL");
  } catch (_err) {
    rawUrl = "";
  }
  var url = String(rawUrl || "").trim();
  while (url.length > 0 && url.charAt(url.length - 1) === "/") {
    url = url.slice(0, -1);
  }

  var rawTimeout = "";
  try {
    rawTimeout = getenv("KANKAKU_ENGRAM_TIMEOUT_SECONDS");
  } catch (_err) {
    rawTimeout = "";
  }
  var timeoutSeconds = DEFAULT_TIMEOUT_SECONDS;
  var trimmedTimeout = String(rawTimeout || "").trim();
  if (trimmedTimeout !== "") {
    var parsed = parseFloat(trimmedTimeout);
    if (!isNaN(parsed) && isFinite(parsed) && parsed > 0) {
      timeoutSeconds = parsed;
    }
  }

  var rawToken = "";
  try {
    rawToken = getenv("KANKAKU_ENGRAM_TOKEN");
  } catch (_err) {
    rawToken = "";
  }
  var token = String(rawToken || "").trim();

  return { url: url, timeoutSeconds: timeoutSeconds, token: token };
}

/**
 * Builds the `Authorization` header to send with every daemon request,
 * per the optional-bearer-token contract: the Engram daemon (`engram
 * serve`) rejects every request with 401 when it was started with
 * `ENGRAM_HTTP_TOKEN` set and the request carries no matching
 * `Authorization: Bearer <token>` header. Never throws.
 *
 * @param {{token?: string}} config As returned by `readConfig`.
 * @returns {{Authorization?: string}} `{}` when no token is configured.
 */
function authHeaders(config) {
  var token = (config && config.token) || "";
  if (!token) {
    return {};
  }
  return { Authorization: "Bearer " + token };
}

/**
 * Validates the POST /api/kankaku/engram/sessions request body.
 *
 * @param {*} body Parsed JSON body.
 * @returns {{ok: true, ids: string[]} | {ok: false, error: string}}
 *   `ids` is deduped (first occurrence wins), trimmed, non-empty, and
 *   capped at MAX_SESSION_IDS entries.
 */
function validateSessionIdsBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }

  var rawIds = body.ids;
  if (!Array.isArray(rawIds)) {
    return { ok: false, error: "ids must be an array" };
  }
  if (rawIds.length === 0) {
    return { ok: false, error: "ids must not be empty" };
  }
  if (rawIds.length > MAX_SESSION_IDS) {
    return { ok: false, error: "ids must not exceed " + MAX_SESSION_IDS + " entries" };
  }

  var seen = {};
  var ids = [];
  for (var i = 0; i < rawIds.length; i++) {
    var raw = rawIds[i];
    if (typeof raw !== "string") {
      return { ok: false, error: "ids must be strings" };
    }
    var trimmed = raw.trim();
    if (!trimmed) {
      return { ok: false, error: "ids must not be empty strings" };
    }
    if (!Object.prototype.hasOwnProperty.call(seen, trimmed)) {
      seen[trimmed] = true;
      ids.push(trimmed);
    }
  }

  if (ids.length === 0) {
    return { ok: false, error: "ids must not be empty" };
  }

  return { ok: true, ids: ids };
}

/**
 * Extracts the goal line from an Engram session-summary's `content`.
 * Handles the formats actually seen from the daemon (see
 * odd/tasks/engram-narrative.md "Facts (verified)"):
 *   - "## Goal\n<text>"  (any heading level, the first non-empty line
 *     after the heading is the goal)
 *   - "Goal: <text>"     (inline)
 *   - "**Goal**\n<text>" / "**Goal:** <text>" (bold heading variants,
 *     inline or on the next non-empty line)
 *
 * @returns {string} The goal text, or '' when no goal marker is found.
 */
function parseGoal(content) {
  if (!content || typeof content !== "string") {
    return "";
  }

  var lines = content.split("\n");

  function firstNonEmptyAfter(index) {
    for (var j = index + 1; j < lines.length; j++) {
      var next = lines[j].trim();
      if (next) {
        return next;
      }
    }
    return "";
  }

  for (var i = 0; i < lines.length; i++) {
    var trimmed = lines[i].trim();
    if (!trimmed) {
      continue;
    }

    // "## Goal", "### Goal", optionally bolded/colon-suffixed heading.
    var headingMatch = /^#{1,6}\s*\**\s*Goal\s*\**\s*:?\s*$/i.exec(trimmed);
    if (headingMatch) {
      return firstNonEmptyAfter(i);
    }

    // "**Goal**", "**Goal:**", "**Goal** text", "**Goal:** text" — the
    // colon may land either inside or outside the closing "**".
    var boldMatch = /^\*\*\s*Goal\s*:?\s*\*\*\s*:?\s*(.*)$/i.exec(trimmed);
    if (boldMatch) {
      var boldRest = boldMatch[1] ? boldMatch[1].trim() : "";
      return boldRest || firstNonEmptyAfter(i);
    }

    // "Goal: text" (no markdown at all)
    var inlineMatch = /^Goal\s*:\s*(.+)$/i.exec(trimmed);
    if (inlineMatch) {
      return inlineMatch[1].trim();
    }

    // Any other non-empty line before a goal marker means there is no
    // goal marker at the top of the content — stop looking rather than
    // matching something deep inside unrelated prose.
    return "";
  }

  return "";
}

function compareDescByCreatedThenId(a, b) {
  var ca = (a && a.created_at) || "";
  var cb = (b && b.created_at) || "";
  if (ca !== cb) {
    return ca < cb ? 1 : -1;
  }
  var ida = String((a && a.id) || "");
  var idb = String((b && b.id) || "");
  if (ida === idb) {
    return 0;
  }
  return ida < idb ? 1 : -1;
}

function compareAscByCreatedThenId(a, b) {
  return -compareDescByCreatedThenId(a, b);
}

/**
 * Picks the newest observation belonging to `sessionId` (by `created_at`
 * desc, then `id` desc). The daemon's `?project=` filter on
 * /observations does not filter by session, so callers MUST pass every
 * row from the project and this function does the session_id filtering.
 *
 * @returns {object|null}
 */
function pickSummaryForSession(observations, sessionId) {
  if (!Array.isArray(observations)) {
    return null;
  }
  var matches = observations.filter(function (row) {
    return !!row && row.session_id === sessionId;
  });
  if (matches.length === 0) {
    return null;
  }
  matches.sort(compareDescByCreatedThenId);
  return matches[0];
}

/**
 * Picks the earliest prompt belonging to `sessionId` (by `created_at`
 * asc, then `id` asc). Same session_id-filtering requirement as
 * pickSummaryForSession — the daemon does not filter /prompts/recent by
 * session either.
 *
 * @returns {object|null}
 */
function pickFirstPromptForSession(prompts, sessionId) {
  if (!Array.isArray(prompts)) {
    return null;
  }
  var matches = prompts.filter(function (row) {
    return !!row && row.session_id === sessionId;
  });
  if (matches.length === 0) {
    return null;
  }
  matches.sort(compareAscByCreatedThenId);
  return matches[0];
}

/**
 * Derives the display title: the goal line when present, otherwise the
 * first prompt collapsed to a single line and truncated to
 * TITLE_MAX_CHARS with a trailing ellipsis, otherwise ''.
 *
 * @param {{goal?: string, firstPrompt?: string}} input
 * @returns {string}
 */
function titleFrom(input) {
  input = input || {};
  var goal = typeof input.goal === "string" ? input.goal.trim() : "";
  if (goal) {
    return goal;
  }

  var firstPrompt = typeof input.firstPrompt === "string" ? input.firstPrompt : "";
  var collapsed = firstPrompt.replace(/\s+/g, " ").trim();
  if (!collapsed) {
    return "";
  }
  if (collapsed.length <= TITLE_MAX_CHARS) {
    return collapsed;
  }
  return collapsed.slice(0, TITLE_MAX_CHARS - ELLIPSIS.length) + ELLIPSIS;
}

/**
 * Builds the Narrative object the hub sends back for one session id, or
 * null when there is nothing to show (contract: "only ids that have
 * data" appear in the response map). A summary, when present, always
 * wins over a prompt (the route only fetches prompts when no summary was
 * found for that session — see engram.pb.js).
 *
 * @param {{project: string, summary: object|null, prompt: object|null}} input
 * @returns {object|null}
 */
function buildNarrative(input) {
  input = input || {};
  var summary = input.summary;
  var prompt = input.prompt;

  if (!summary && !prompt) {
    return null;
  }

  if (summary) {
    var content = typeof summary.content === "string" ? summary.content : "";
    var goal = parseGoal(content);
    var narrative = {
      project: input.project,
      title: titleFrom({ goal: goal }),
      summary: content,
      source: "summary",
      created_at: summary.created_at,
    };
    if (goal) {
      narrative.goal = goal;
    }
    return narrative;
  }

  var promptContent = typeof prompt.content === "string" ? prompt.content : "";
  return {
    project: input.project,
    title: titleFrom({ firstPrompt: promptContent }),
    first_prompt: promptContent,
    source: "prompt",
    created_at: prompt.created_at,
  };
}

/**
 * Shapes the /api/kankaku/engram/status response body.
 *
 * @param {{configured: boolean, healthOk: boolean, unauthorized?: boolean}} input
 *   `unauthorized` is true when the daemon's `/health` answered 401/403
 *   (an `ENGRAM_HTTP_TOKEN` is set on the daemon and either no
 *   `KANKAKU_ENGRAM_TOKEN` was configured here or it does not match).
 * @returns {{configured: boolean, reachable: boolean, unauthorized?: true}}
 *   `unauthorized` is only ever present (and true) when `configured` is
 *   true and the daemon rejected the request as unauthenticated —
 *   reachable is always false in that case.
 */
function buildStatus(input) {
  input = input || {};
  if (!input.configured) {
    return { configured: false, reachable: false };
  }
  if (input.unauthorized) {
    return { configured: true, reachable: false, unauthorized: true };
  }
  return { configured: true, reachable: !!input.healthOk };
}

function sessionUrl(base, id) {
  return base + "/sessions/" + encodeURIComponent(id);
}

function observationsUrl(base, project, limit) {
  return (
    base +
    "/observations?project=" +
    encodeURIComponent(project) +
    "&type=session_summary&limit=" +
    encodeURIComponent(String(limit))
  );
}

function promptsUrl(base, project, limit) {
  return base + "/prompts/recent?project=" + encodeURIComponent(project) + "&limit=" + encodeURIComponent(String(limit));
}

module.exports = {
  readConfig: readConfig,
  authHeaders: authHeaders,
  validateSessionIdsBody: validateSessionIdsBody,
  parseGoal: parseGoal,
  pickSummaryForSession: pickSummaryForSession,
  pickFirstPromptForSession: pickFirstPromptForSession,
  titleFrom: titleFrom,
  buildNarrative: buildNarrative,
  buildStatus: buildStatus,
  sessionUrl: sessionUrl,
  observationsUrl: observationsUrl,
  promptsUrl: promptsUrl,
  DEFAULT_TIMEOUT_SECONDS: DEFAULT_TIMEOUT_SECONDS,
  MAX_SESSION_IDS: MAX_SESSION_IDS,
  TITLE_MAX_CHARS: TITLE_MAX_CHARS,
};
