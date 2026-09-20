// Pure HTML parsing for favicon <link> discovery. No PocketBase/goja
// globals — this file runs unmodified under both goja (pb_hooks) and plain
// Node (`node --test`). ES5/ES6-safe: no optional chaining, no nullish
// coalescing, no async/await, and deliberately NO `new URL(...)` — goja's
// sandbox does not expose a global URL/URLSearchParams implementation (it
// is a Web/Node API, not part of the ES5 spec PocketBase's docs promise),
// so URL parsing/resolution below is hand-rolled instead.
"use strict";

var ICON_REL_VALUES = {
  "icon": true,
  "shortcut icon": true,
  "apple-touch-icon": true,
  "apple-touch-icon-precomposed": true,
};

// Rank score per rel value: a plain "icon" is the most broadly supported
// raster favicon; apple-touch-icon entries are usually PNG at a fixed size
// intended for home-screen icons, still useful as a fallback.
var REL_RANK = {
  "icon": 0,
  "shortcut icon": 0,
  "apple-touch-icon": 1,
  "apple-touch-icon-precomposed": 1,
};

// Matches "scheme://" at the start of a string (RFC 3986 scheme syntax).
var ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
// Matches any "scheme:" prefix, including non-"//)" ones like "data:" or
// "mailto:" that we deliberately do not try to resolve as favicon links.
var ANY_SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
var SPLIT_URL_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/;

/**
 * Minimal hand-rolled URL parser — only supports the absolute
 * "scheme://host[:port][/path][?query][#hash]" form. Returns null for
 * anything else (relative URLs are resolved separately below).
 */
function parseAbsoluteUrl(str) {
  var m = SPLIT_URL_RE.exec(str);
  if (!m) {
    return null;
  }
  var protocol = m[1].toLowerCase() + ":";
  var authority = m[2] || "";
  var pathname = m[3] || "";

  var atIdx = authority.lastIndexOf("@");
  var hostport = atIdx >= 0 ? authority.slice(atIdx + 1) : authority;
  if (!hostport) {
    return null;
  }

  if (pathname === "") {
    pathname = "/";
  }

  return {
    protocol: protocol,
    hostport: hostport,
    pathname: pathname,
    origin: protocol + "//" + hostport,
  };
}

function normalizePath(path) {
  var segments = path.split("/");
  var out = [];
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (seg === "." ) {
      continue;
    }
    if (seg === "..") {
      if (out.length > 0) {
        out.pop();
      }
      continue;
    }
    out.push(seg);
  }
  var joined = out.join("/");
  if (joined.charAt(0) !== "/") {
    joined = "/" + joined;
  }
  return joined;
}

/**
 * Resolves a possibly relative/protocol-relative href against a base URL.
 * Returns null if resolution fails (malformed input, unsupported scheme).
 */
function resolveUrl(href, baseUrl) {
  if (!href) {
    return null;
  }
  var trimmed = href.trim();
  if (trimmed === "") {
    return null;
  }

  if (ABSOLUTE_URL_RE.test(trimmed)) {
    return trimmed;
  }
  if (ANY_SCHEME_RE.test(trimmed)) {
    // A non-http(s)-shaped scheme (data:, mailto:, javascript:, ...) — not
    // something we resolve or ever want to fetch as a favicon.
    return null;
  }

  var base = parseAbsoluteUrl(baseUrl);
  if (!base) {
    return null;
  }

  if (trimmed.slice(0, 2) === "//") {
    return base.protocol + trimmed;
  }

  if (trimmed.charAt(0) === "/") {
    return base.origin + normalizePath(trimmed);
  }

  var basePath = base.pathname;
  var dirEnd = basePath.lastIndexOf("/");
  var baseDir = dirEnd >= 0 ? basePath.slice(0, dirEnd + 1) : "/";
  return base.origin + normalizePath(baseDir + trimmed);
}

/**
 * Returns the "scheme://host[:port]" origin of an absolute URL, or null.
 * Used by the route handler to build the `{origin}/favicon.ico` fallback
 * from the final post-redirect page URL.
 */
function originOf(urlString) {
  var parsed = parseAbsoluteUrl(urlString);
  return parsed ? parsed.origin : null;
}

/**
 * Extracts the value of a given attribute from a single tag's raw text
 * (e.g. the full `<link ...>` match), handling both single- and
 * double-quoted values, case-insensitively. Returns null when the
 * attribute is absent (distinct from an attribute present but empty,
 * which returns "").
 */
function extractAttrValue(tagBody, attrName) {
  var re = new RegExp(
    attrName + "\\s*=\\s*\"([^\"]*)\"|" + attrName + "\\s*=\\s*'([^']*)'",
    "i"
  );
  var m = re.exec(tagBody);
  if (!m) {
    return null;
  }
  return m[1] !== undefined ? m[1] : m[2];
}

/**
 * Finds a <base href="..."> override in the document, if present. Only the
 * first occurrence is honored (matches browser behavior).
 */
function findBaseHref(html) {
  var re = /<base\b[^>]*>/i;
  var m = re.exec(html);
  if (!m) {
    return null;
  }
  return extractAttrValue(m[0], "href");
}

/**
 * Parses a "sizes" attribute like "32x32" or "16x16 32x32" and returns the
 * largest declared square-ish dimension found, or 0 if unparseable/"any".
 */
function parseMaxSize(sizesAttr) {
  if (!sizesAttr) {
    return 0;
  }
  var best = 0;
  var parts = sizesAttr.trim().split(/\s+/);
  for (var i = 0; i < parts.length; i++) {
    var m = /^(\d+)x(\d+)$/i.exec(parts[i]);
    if (m) {
      var w = parseInt(m[1], 10);
      var h = parseInt(m[2], 10);
      var dim = Math.min(w, h);
      if (dim > best) {
        best = dim;
      }
    }
  }
  return best;
}

function extExt(url) {
  var m = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(url);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Lower score sorts first (better candidate). Sizes within 32-192 are
 * preferred; a declared size outside that range is penalized but still
 * ranks ahead of "no size declared" (0), which is the least informative.
 */
function sizeScore(size) {
  if (size === 0) {
    return 3;
  }
  if (size >= 32 && size <= 192) {
    return 0;
  }
  if (size < 32) {
    return 2;
  }
  return 1;
}

/**
 * Parses HTML for <link rel="icon" | "shortcut icon" | "apple-touch-icon" |
 * "apple-touch-icon-precomposed"> tags and returns a ranked, deduplicated
 * array of absolute candidate URLs (best candidate first). Never throws —
 * on any parse trouble it simply omits the offending tag. Returns an empty
 * array when nothing is found.
 *
 * @param {string} html
 * @param {string} baseUrl - the final post-redirect page URL, used to
 *   resolve relative/protocol-relative hrefs.
 * @returns {string[]}
 */
function extractFaviconCandidates(html, baseUrl) {
  if (!html || !baseUrl) {
    return [];
  }

  var effectiveBase = baseUrl;
  var baseHref = findBaseHref(html);
  if (baseHref) {
    var resolvedBase = resolveUrl(baseHref, baseUrl);
    if (resolvedBase) {
      effectiveBase = resolvedBase;
    }
  }

  var candidates = [];
  var seen = {};
  var linkRe = /<link\b[^>]*>/gi;
  var m;
  while ((m = linkRe.exec(html)) !== null) {
    var tag = m[0];
    var relRaw = extractAttrValue(tag, "rel");
    if (!relRaw) {
      continue;
    }
    var rel = relRaw.trim().toLowerCase();
    if (!ICON_REL_VALUES[rel]) {
      continue;
    }
    var href = extractAttrValue(tag, "href");
    var resolved = resolveUrl(href, effectiveBase);
    if (!resolved) {
      continue;
    }
    if (seen[resolved]) {
      continue;
    }
    seen[resolved] = true;

    var sizesAttr = extractAttrValue(tag, "sizes");
    var size = parseMaxSize(sizesAttr);
    var ext = extExt(resolved);
    var isPng = ext === "png";
    var isIco = ext === "ico";

    candidates.push({
      url: resolved,
      relRank: REL_RANK[rel] !== undefined ? REL_RANK[rel] : 2,
      size: size,
      isPng: isPng,
      isIco: isIco,
    });
  }

  candidates.sort(function (a, b) {
    var scoreA = sizeScore(a.size);
    var scoreB = sizeScore(b.size);
    if (scoreA !== scoreB) {
      return scoreA - scoreB;
    }
    if (a.relRank !== b.relRank) {
      return a.relRank - b.relRank;
    }
    // png over ico when otherwise equal
    if (a.isPng !== b.isPng) {
      return a.isPng ? -1 : 1;
    }
    if (a.isIco !== b.isIco) {
      return a.isIco ? 1 : -1;
    }
    return 0;
  });

  var out = [];
  for (var i = 0; i < candidates.length; i++) {
    out.push(candidates[i].url);
  }
  return out;
}

module.exports = {
  extractFaviconCandidates: extractFaviconCandidates,
  resolveUrl: resolveUrl,
  originOf: originOf,
  // exported for tests
  _parseMaxSize: parseMaxSize,
  _findBaseHref: findBaseHref,
};
