/// <reference path="../pb_data/types.d.ts" />

// POST /api/kankaku/clients/{id}/favicon/refresh — owner-only, explicit
// action that fetches a client's site once and stores the icon on the
// `clients.favicon` file field. See
// docs/adr/0019-hub-fetches-and-stores-client-favicons.md for why this is
// a server-side, explicitly-triggered fetch rather than hot-linking or a
// third-party favicon service (both would leak the owner's confidential
// client list to a third party on every page view).
//
// This route is the ONLY place in this backend that fetches a client's
// third-party site. Saving a `clients` record itself must stay instant
// and must never fail because a client's site is slow or down — do not
// move any of this into a clients create/update hook.
//
// All the parsing/validation/ranking logic lives in pure, goja-and-Node
// compatible lib files under ./lib so it can be unit tested with
// `node --test` (see package.json's `hooks:test` script).
//
// GOJA/POCKETBASE HOOKS CONSTRAINT (verified against a real running
// instance, not guessed): a `routerAdd(...)` handler closure does NOT see
// this file's top-level scope at all — not `function` declarations, not
// `var`/`const` bindings, and not the result of a top-level `require(...)`
// call. Referencing any of them from inside the handler throws
// `ReferenceError: <name> is not defined` at request time, even though the
// same code runs correctly in Node. The fix, confirmed by testing all four
// variants against this instance, is to declare/require everything the
// handler needs INSIDE the handler function body (nested `function`
// declarations and `require(...)` calls both work fine there — normal
// intra-function hoisting is unaffected, only the top-level-to-handler
// boundary is). Every helper below is therefore nested inside the single
// `routerAdd` callback rather than declared at module scope.
routerAdd("POST", "/api/kankaku/clients/{id}/favicon/refresh", (e) => {
  const faviconHtml = require(`${__hooks}/lib/favicon-html.js`);
  const faviconSniff = require(`${__hooks}/lib/favicon-sniff.js`);
  const faviconSsrfGuard = require(`${__hooks}/lib/favicon-ssrf-guard.js`);

  const FAVICON_MAX_BYTES = 512000; // 500 KB, matches the migration's maxSize
  const HTML_PARSE_CAP_BYTES = 200000; // only the first ~200KB of HTML is parsed
  const FETCH_TIMEOUT_SECONDS = 5;

  /**
   * Clears favicon/favicon_source and stamps favicon_checked_at with the
   * current time — used for every real failure (fetch_failed,
   * no_icon_found, unsupported_type, too_large, blocked_host, or an
   * unanticipated error). Chosen deliberately over leaving a stale icon in
   * place: a leftover icon for a site that just failed to fetch is more
   * misleading than no icon at all. Stamping "now" lets the web UI show
   * "checked just now, nothing found" instead of silence.
   */
  function clearForFailure(clientRecord) {
    clientRecord.set("favicon", "");
    clientRecord.set("favicon_source", "");
    clientRecord.set("favicon_checked_at", new Date().toISOString());
  }

  /**
   * Clears all three favicon fields, including favicon_checked_at — used
   * only for the "no_website" outcome, which is not a failed check attempt
   * (there was nothing to check), so no check timestamp is recorded.
   */
  function clearForNoWebsite(clientRecord) {
    clientRecord.set("favicon", "");
    clientRecord.set("favicon_source", "");
    clientRecord.set("favicon_checked_at", "");
  }

  function firstHeader(headers, name) {
    if (!headers) {
      return null;
    }
    const lowerName = name.toLowerCase();
    const keys = Object.keys(headers);
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].toLowerCase() === lowerName) {
        const values = headers[keys[i]];
        return values && values.length ? values[0] : null;
      }
    }
    return null;
  }

  function bytesToString(bytes) {
    // $http.send returns the body as a plain array of byte values;
    // PocketBase exposes a global `toString(bytes)` helper (UTF-8 decode)
    // for exactly this — see the js-sending-http-requests docs' own
    // `toString(result.body)` example. We only need to find <link> tags,
    // not render the page, so best-effort UTF-8 decoding is enough.
    return toString(bytes);
  }

  function logError(message, err) {
    try {
      if (e.app && e.app.logger && typeof e.app.logger === "function") {
        e.app.logger().error(message, "error", String(err));
      }
    } catch (_e) {
      // logging must never itself throw
    }
  }

  /**
   * Downloads and validates one candidate icon URL. Returns
   * { ok: true, bytes, filename } on success, or
   * { ok: false, reason } with reason one of "fetch_failed" |
   * "too_large" | "unsupported_type" on failure. Never throws.
   */
  function downloadIcon(url) {
    let res;
    try {
      res = $http.send({
        url: url,
        method: "GET",
        timeout: FETCH_TIMEOUT_SECONDS,
        headers: { "User-Agent": "kankaku-hub-favicon-fetcher/1.0" },
      });
    } catch (_err) {
      return { ok: false, reason: "fetch_failed" };
    }
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
      return { ok: false, reason: "fetch_failed" };
    }

    // KNOWN LIMITATION: $http.send has no streaming mode (it blocks and
    // returns the entire body at once — see js-sending-http-requests
    // docs), so neither of the checks below can abort an oversized
    // download in-flight; they only reject it after the fact. A
    // malicious/huge response still costs the full download's bandwidth
    // and memory once.
    const declaredLength = firstHeader(res.headers, "Content-Length");
    if (declaredLength && parseInt(declaredLength, 10) > FAVICON_MAX_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    const body = res.body || [];
    if (body.length > FAVICON_MAX_BYTES) {
      return { ok: false, reason: "too_large" };
    }

    const contentType = firstHeader(res.headers, "Content-Type") || "";
    const sniffed = faviconSniff.sniffFavicon(body, contentType);
    if (!sniffed.ok) {
      return { ok: false, reason: "unsupported_type" };
    }

    return { ok: true, bytes: body, filename: "favicon." + sniffed.type };
  }

  function failClean(clientRecord, reason) {
    clearForFailure(clientRecord);
    e.app.save(clientRecord);
    return e.json(200, { ok: false, reason: reason });
  }

  function refreshFavicon(clientRecord) {
    const unassigned = !!clientRecord.get("unassigned");
    const website = (clientRecord.get("website") || "").trim();

    if (unassigned || !website) {
      // Product decision: the "no_website" outcome is not a failed check —
      // there was nothing to check — so favicon_checked_at is cleared to
      // unset rather than stamped with "now" (contrast with failClean,
      // which stamps a real attempt time).
      clearForNoWebsite(clientRecord);
      e.app.save(clientRecord);
      return e.json(200, { ok: false, reason: "no_website" });
    }

    if (!faviconSsrfGuard.isUrlAllowed(website)) {
      return failClean(clientRecord, "blocked_host");
    }

    let pageRes;
    try {
      pageRes = $http.send({
        url: website,
        method: "GET",
        timeout: FETCH_TIMEOUT_SECONDS,
        headers: { "User-Agent": "kankaku-hub-favicon-fetcher/1.0" },
      });
    } catch (_err) {
      return failClean(clientRecord, "fetch_failed");
    }

    if (!pageRes || pageRes.statusCode < 200 || pageRes.statusCode >= 300) {
      return failClean(clientRecord, "fetch_failed");
    }

    // KNOWN LIMITATION: $http.send follows redirects itself with no hook
    // to inspect intermediate hops, so we cannot re-validate the SSRF
    // guard against each redirect target individually — only the
    // originally requested URL is checked before the request is sent. See
    // docs/architecture/hub-backend.md for the full writeup.
    const finalUrl = website;

    const bodyBytes = pageRes.body || [];
    const htmlBytes = bodyBytes.length > HTML_PARSE_CAP_BYTES
      ? bodyBytes.slice(0, HTML_PARSE_CAP_BYTES)
      : bodyBytes;
    const html = bytesToString(htmlBytes);

    let candidates = faviconHtml.extractFaviconCandidates(html, finalUrl);

    const origin = faviconHtml.originOf(finalUrl);
    if (origin) {
      const fallback = origin + "/favicon.ico";
      if (candidates.indexOf(fallback) === -1) {
        candidates = candidates.concat([fallback]);
      }
    }

    if (candidates.length === 0) {
      return failClean(clientRecord, "no_icon_found");
    }

    // Try each ranked candidate (then the favicon.ico fallback) in order;
    // the first one that downloads and sniffs clean wins. If every
    // candidate fails, the LAST attempted candidate's specific reason
    // (too_large / unsupported_type / fetch_failed) is the most useful one
    // to surface — a candidate skipped by the SSRF guard doesn't count as
    // an attempt, so `blocked_host` only wins when every single candidate
    // was blocked.
    let lastReason = "no_icon_found";
    let attemptedAny = false;

    for (let i = 0; i < candidates.length; i++) {
      const candidateUrl = candidates[i];
      if (!faviconSsrfGuard.isUrlAllowed(candidateUrl)) {
        lastReason = attemptedAny ? lastReason : "blocked_host";
        continue;
      }
      attemptedAny = true;

      const downloaded = downloadIcon(candidateUrl);
      if (downloaded.ok) {
        clientRecord.set(
          "favicon",
          $filesystem.fileFromBytes(downloaded.bytes, downloaded.filename)
        );
        clientRecord.set("favicon_source", candidateUrl);
        clientRecord.set("favicon_checked_at", new Date().toISOString());
        e.app.save(clientRecord);
        return e.json(200, { ok: true });
      }
      lastReason = downloaded.reason;
    }

    return failClean(clientRecord, lastReason);
  }

  if (!e.auth) {
    throw new UnauthorizedError("Authentication required.");
  }
  if (e.auth.get("role") !== "owner") {
    throw new ForbiddenError("Only the owner can refresh a client's favicon.");
  }

  const id = e.request.pathValue("id");

  let client;
  try {
    client = e.app.findRecordById("clients", id);
  } catch (_e) {
    throw new NotFoundError("Client not found.");
  }

  try {
    return refreshFavicon(client);
  } catch (err) {
    // Belt-and-braces: never let an unanticipated error escape as a 500
    // with a stack trace. Record the attempt and fail closed.
    logError("favicon refresh: unexpected error", err);
    try {
      clearForFailure(client);
      e.app.save(client);
    } catch (_saveErr) {
      // If even the cleanup save fails, there is nothing further we can
      // do from inside the request — the response already reports
      // ok:false.
    }
    return e.json(200, { ok: false, reason: "fetch_failed" });
  }
}, $apis.requireAuth());
