/// <reference path="../pb_data/types.d.ts" />

// GET  /api/kankaku/engram/status
// POST /api/kankaku/engram/sessions
//
// Read-only server-side proxy in front of an operator-run Engram daemon
// (`engram serve`, default :7437) — see
// docs/architecture/hub-backend.md's "Engram narrative" section and
// odd/tasks/engram-narrative.md for the full contract. The daemon sends
// no CORS headers, so the browser cannot call it directly; every request
// goes through PocketBase (`$http.send`, same pattern as
// pb_hooks/favicon.pb.js) and is auth-gated the same way
// pb_hooks/totals.pb.js is (`$apis.requireAuth()` — any authenticated
// hub user, no new privilege beyond what task_entries already grants).
//
// All parsing/validation/URL-building logic lives in the pure, goja-and-
// Node compatible pocketbase/pb_hooks/lib/engram-narrative.js (unit
// tested with `npm run hooks:test`) — this file only wires that module to
// `$os.getenv`/`$http.send`.
//
// GOJA/POCKETBASE HOOKS CONSTRAINT (see pb_hooks/favicon.pb.js's header
// comment for the full story): a routerAdd(...) handler closure does not
// see this file's top-level scope, so every require(...) call and helper
// function lives inside the handler body.
//
// Both handlers are wrapped in an outer try/catch, same as
// pb_hooks/favicon.pb.js's refreshFavicon() call — an unanticipated error
// (e.g. a malformed daemon response) must never escape as a 500.
routerAdd("GET", "/api/kankaku/engram/status", (e) => {
  const engramNarrative = require(`${__hooks}/lib/engram-narrative.js`);

  function logError(message, err) {
    try {
      e.app.logger().error(message, "error", String(err));
    } catch (_e) {
      // logging must never itself throw
    }
  }

  function run() {
    const config = engramNarrative.readConfig($os.getenv);
    if (!config.url) {
      return e.json(404, { code: "engram_not_configured" });
    }

    let healthOk = false;
    try {
      const res = $http.send({
        url: config.url + "/health",
        method: "GET",
        timeout: config.timeoutSeconds,
      });
      healthOk = !!res && res.statusCode >= 200 && res.statusCode < 300;
    } catch (_err) {
      // Daemon unreachable/timed out — reported as configured but not
      // reachable, never a hub-side failure.
      healthOk = false;
    }

    return e.json(200, engramNarrative.buildStatus({ configured: true, healthOk: healthOk }));
  }

  try {
    return run();
  } catch (err) {
    logError("engram status: unexpected error", err);
    return e.json(200, { configured: false, reachable: false });
  }
}, $apis.requireAuth());

routerAdd("POST", "/api/kankaku/engram/sessions", (e) => {
  const engramNarrative = require(`${__hooks}/lib/engram-narrative.js`);

  const OBSERVATIONS_LIMIT = 200;
  const PROMPTS_LIMIT = 200;

  function logError(message, err) {
    try {
      e.app.logger().error(message, "error", String(err));
    } catch (_e) {
      // logging must never itself throw
    }
  }

  /** GET `url` and return its parsed JSON body, or null on any failure
   * (non-2xx, timeout, network error, malformed JSON) — never throws. */
  function httpGetJson(url, timeoutSeconds) {
    try {
      const res = $http.send({ url: url, method: "GET", timeout: timeoutSeconds });
      if (!res || res.statusCode < 200 || res.statusCode >= 300) {
        return null;
      }
      return res.json;
    } catch (err) {
      logError("engram: request failed: " + url, err);
      return null;
    }
  }

  function asRowArray(json, key) {
    if (Array.isArray(json)) {
      return json;
    }
    if (json && Array.isArray(json[key])) {
      return json[key];
    }
    return [];
  }

  function run() {
    const config = engramNarrative.readConfig($os.getenv);
    if (!config.url) {
      return e.json(404, { code: "engram_not_configured" });
    }

    let rawBody;
    try {
      const info = e.requestInfo();
      rawBody = info.body || {};
    } catch (_err) {
      return e.json(400, { code: "invalid_body", error: "invalid JSON body" });
    }

    const validated = engramNarrative.validateSessionIdsBody(rawBody);
    if (!validated.ok) {
      return e.json(400, { code: "invalid_body", error: validated.error });
    }

    // Cached per request, per project — several session ids commonly
    // belong to the same project, and the daemon has no per-session
    // filter (see engram-narrative.js's pick*ForSession doc comments).
    const observationsCache = {};
    const promptsCache = {};

    function observationsForProject(project) {
      if (Object.prototype.hasOwnProperty.call(observationsCache, project)) {
        return observationsCache[project];
      }
      const url = engramNarrative.observationsUrl(config.url, project, OBSERVATIONS_LIMIT);
      const rows = asRowArray(httpGetJson(url, config.timeoutSeconds), "observations");
      observationsCache[project] = rows;
      return rows;
    }

    function promptsForProject(project) {
      if (Object.prototype.hasOwnProperty.call(promptsCache, project)) {
        return promptsCache[project];
      }
      const url = engramNarrative.promptsUrl(config.url, project, PROMPTS_LIMIT);
      const rows = asRowArray(httpGetJson(url, config.timeoutSeconds), "prompts");
      promptsCache[project] = rows;
      return rows;
    }

    const sessions = {};
    for (let i = 0; i < validated.ids.length; i++) {
      const id = validated.ids[i];
      try {
        const sessionJson = httpGetJson(engramNarrative.sessionUrl(config.url, id), config.timeoutSeconds);
        if (!sessionJson || !sessionJson.project) {
          // Unknown session (404) or a malformed response — skip this
          // id, never fail the whole batch.
          continue;
        }
        const project = sessionJson.project;

        const summary = engramNarrative.pickSummaryForSession(observationsForProject(project), id);
        const prompt = summary ? null : engramNarrative.pickFirstPromptForSession(promptsForProject(project), id);

        const narrative = engramNarrative.buildNarrative({
          sessionId: id,
          project: project,
          summary: summary,
          prompt: prompt,
        });

        if (narrative) {
          sessions[id] = narrative;
        }
      } catch (err) {
        // Belt-and-braces per id: a single malformed/unexpected daemon
        // response must never abort the rest of the batch.
        logError("engram: failed to build narrative for session " + id, err);
      }
    }

    return e.json(200, { sessions: sessions });
  }

  try {
    return run();
  } catch (err) {
    // Belt-and-braces: never let an unanticipated error escape as a 500
    // with a stack trace.
    logError("engram sessions: unexpected error", err);
    return e.json(200, { sessions: {} });
  }
}, $apis.requireAuth());
