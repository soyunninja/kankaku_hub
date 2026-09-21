// Pure SSRF guard for the favicon fetcher: decides whether a host/URL is
// safe to fetch from PocketBase's own process. No PocketBase/goja globals
// except a best-effort, try/catch-guarded read of an env var override for
// tests (see readAllowPrivateOverride below) — this file runs unmodified
// under both goja (pb_hooks) and plain Node (`node --test`).
//
// Deliberately does NOT use `new URL(...)`: goja's sandbox exposes no
// global URL/URLSearchParams implementation (confirmed against
// pocketbase/pb_data/types.d.ts and the official js-overview docs — only
// an ES5 baseline plus a partial ES6 subset is available), so a small
// hand-rolled scheme/host extractor is used instead.
//
// KNOWN LIMITATION — DNS rebinding: this guard only inspects the literal
// hostname/IP text in the URL. It cannot see, and PocketBase's `$http.send`
// gives no hook to inspect, the IP address a public-looking hostname
// actually resolves to at connect time. A hostname that passes this check
// today (e.g. a normal public domain) could resolve to a private/loopback
// address at request time (classic DNS rebinding) and this guard would not
// catch it. This is an honest, known gap, not a solved problem — see
// docs/adr/0019-hub-fetches-and-stores-client-favicons.md and
// docs/architecture/hub-backend.md.
"use strict";

var SCHEME_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)/;

/**
 * Extracts { protocol, hostname } from an absolute URL string using a
 * minimal hand-rolled parser (no global URL). Returns null when the input
 * isn't a "scheme://authority..." URL.
 */
function extractSchemeAndHost(urlString) {
  if (!urlString) {
    return null;
  }
  var m = SCHEME_RE.exec(urlString);
  if (!m) {
    return null;
  }
  var protocol = m[1].toLowerCase() + ":";
  var authority = m[2] || "";
  if (!authority) {
    return null;
  }

  var atIdx = authority.lastIndexOf("@");
  var hostport = atIdx >= 0 ? authority.slice(atIdx + 1) : authority;

  var hostname;
  if (hostport.charAt(0) === "[") {
    var closeIdx = hostport.indexOf("]");
    if (closeIdx === -1) {
      return null;
    }
    hostname = hostport.slice(1, closeIdx); // strip brackets
  } else {
    var colonIdx = hostport.indexOf(":");
    hostname = colonIdx >= 0 ? hostport.slice(0, colonIdx) : hostport;
  }

  if (!hostname) {
    return null;
  }

  return { protocol: protocol, hostname: hostname };
}

function truthyEnvValue(v) {
  if (v === undefined || v === null) {
    return false;
  }
  var s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * Test-only escape hatch so integration tests can point the fetcher at a
 * loopback fixture server. Defaults OFF in every environment. Read from
 * Node's `process.env` when running under `node --test`, and from
 * PocketBase's `$os.getenv` when running inside a pb_hooks route handler
 * (goja *can* read process environment variables via $os.getenv — verified
 * against pocketbase/pb_data/types.d.ts). Never throws even if neither
 * runtime global exists.
 */
function readAllowPrivateOverride() {
  try {
    if (typeof process !== "undefined" && process && process.env) {
      var fromNode = process.env.KANKAKU_FAVICON_ALLOW_PRIVATE;
      if (fromNode !== undefined) {
        return truthyEnvValue(fromNode);
      }
    }
  } catch (e) {
    // ignore — fall through to the goja path
  }
  try {
    if (typeof $os !== "undefined" && $os && typeof $os.getenv === "function") {
      var fromGoja = $os.getenv("KANKAKU_FAVICON_ALLOW_PRIVATE");
      if (fromGoja) {
        return truthyEnvValue(fromGoja);
      }
    }
  } catch (e) {
    // ignore — default to disallowed
  }
  return false;
}

function endsWithSuffixLabel(hostLower, suffixWithDot) {
  return (
    hostLower.length > suffixWithDot.length &&
    hostLower.slice(hostLower.length - suffixWithDot.length) === suffixWithDot
  );
}

// ---- IPv4 literal parsing, including decimal/hex/octal bypass tricks ----

function parseIPv4Part(str) {
  if (/^0[xX][0-9a-fA-F]+$/.test(str)) {
    return parseInt(str, 16);
  }
  if (/^0[0-7]+$/.test(str)) {
    return parseInt(str, 8);
  }
  if (/^(0|[1-9][0-9]*)$/.test(str)) {
    return parseInt(str, 10);
  }
  return null;
}

function combineIPv4Parts(parts) {
  var n = parts.length;
  for (var i = 0; i < n - 1; i++) {
    if (parts[i] < 0 || parts[i] > 255) {
      return null;
    }
  }
  var lastMaxBits = 32 - 8 * (n - 1);
  var lastMax = Math.pow(2, lastMaxBits) - 1;
  var last = parts[n - 1];
  if (last < 0 || last > lastMax) {
    return null;
  }
  var value = 0;
  for (i = 0; i < n - 1; i++) {
    value = value * 256 + parts[i];
  }
  value = value * Math.pow(2, lastMaxBits) + last;
  return value;
}

/**
 * Parses an IPv4 "literal" in any of the classic inet_aton-style forms that
 * are used to bypass naive string checks: standard dotted quad
 * ("127.0.0.1"), shorthand ("127.1"), a single decimal integer
 * ("2130706433"), hex per-octet or whole-address ("0x7f.0x0.0x0.0x1",
 * "0x7f000001"), and octal per-octet ("0177.0.0.1"). Returns the address
 * as a plain 0-4294967295 integer, or null if the string isn't
 * IPv4-literal-shaped at all (an ordinary DNS hostname).
 */
function parseIPv4Like(hostname) {
  if (!/^[0-9a-fA-FxX.]+$/.test(hostname)) {
    return null;
  }
  var segs = hostname.split(".");
  if (segs.length < 1 || segs.length > 4) {
    return null;
  }
  var parts = [];
  for (var i = 0; i < segs.length; i++) {
    if (segs[i] === "") {
      return null;
    }
    var p = parseIPv4Part(segs[i]);
    if (p === null) {
      return null;
    }
    parts.push(p);
  }
  return combineIPv4Parts(parts);
}

function ipv4Octets(n) {
  return [
    Math.floor(n / 16777216) % 256,
    Math.floor(n / 65536) % 256,
    Math.floor(n / 256) % 256,
    n % 256,
  ];
}

/**
 * Checks an already-parsed IPv4 integer against every blocked range:
 * loopback 127/8, private 10/8, 172.16/12, 192.168/16, link-local
 * 169.254/16 (which also covers the cloud metadata address
 * 169.254.169.254), and the unspecified address 0.0.0.0.
 */
function isBlockedIPv4(n) {
  if (n === 0) {
    return true; // 0.0.0.0
  }
  var o = ipv4Octets(n);
  if (o[0] === 127) {
    return true; // 127.0.0.0/8
  }
  if (o[0] === 10) {
    return true; // 10.0.0.0/8
  }
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) {
    return true; // 172.16.0.0/12
  }
  if (o[0] === 192 && o[1] === 168) {
    return true; // 192.168.0.0/16
  }
  if (o[0] === 169 && o[1] === 254) {
    return true; // 169.254.0.0/16, incl. 169.254.169.254 metadata address
  }
  return false;
}

// ---- IPv6 literal parsing ----

/**
 * Expands an IPv6 literal (with at most one "::" compression) into an
 * array of 8 unsigned 16-bit integers. Returns null if the string isn't a
 * well-formed IPv6 literal.
 */
function expandIPv6(str) {
  var partsStrs;
  if (str.indexOf("::") !== -1) {
    var sides = str.split("::");
    if (sides.length > 2) {
      return null; // more than one "::" is invalid
    }
    var left = sides[0] === "" ? [] : sides[0].split(":");
    var right = sides[1] === "" ? [] : sides[1].split(":");
    var totalKnown = left.length + right.length;
    if (totalKnown > 7) {
      return null;
    }
    var missing = 8 - totalKnown;
    var mid = [];
    for (var i = 0; i < missing; i++) {
      mid.push("0");
    }
    partsStrs = left.concat(mid).concat(right);
  } else {
    partsStrs = str.split(":");
  }

  if (partsStrs.length !== 8) {
    return null;
  }
  var out = [];
  for (var j = 0; j < 8; j++) {
    var seg = partsStrs[j];
    if (!/^[0-9a-fA-F]{1,4}$/.test(seg)) {
      return null;
    }
    out.push(parseInt(seg, 16));
  }
  return out;
}

/**
 * Classifies a lowercase IPv6 literal string. Returns { blocked: boolean }
 * or null if the string isn't a recognizable IPv6 literal at all.
 */
function classifyIPv6(lowerStr) {
  // Compressed IPv4-mapped form, e.g. "::ffff:127.0.0.1".
  var mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(lowerStr);
  if (mapped) {
    var v4 = parseIPv4Like(mapped[1]);
    if (v4 === null) {
      return null;
    }
    return { blocked: isBlockedIPv4(v4) };
  }

  var groups = expandIPv6(lowerStr);
  if (!groups) {
    return null;
  }

  // Fully expanded IPv4-mapped form, e.g. "0:0:0:0:0:ffff:7f00:1".
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    var v4n = groups[6] * 65536 + groups[7];
    return { blocked: isBlockedIPv4(v4n) };
  }

  var isAllZeroExceptLast =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0 &&
    groups[6] === 0;

  if (isAllZeroExceptLast && groups[7] === 0) {
    return { blocked: true }; // :: (unspecified)
  }
  if (isAllZeroExceptLast && groups[7] === 1) {
    return { blocked: true }; // ::1 (loopback)
  }
  if ((groups[0] & 0xffc0) === 0xfe80) {
    return { blocked: true }; // fe80::/10 (link-local)
  }
  if ((groups[0] & 0xfe00) === 0xfc00) {
    return { blocked: true }; // fc00::/7 (unique-local)
  }
  return { blocked: false };
}

/**
 * Decides whether a bare hostname (no scheme, no port) is safe to fetch.
 * Pure function — does not perform DNS resolution (see the module-level
 * DNS-rebinding limitation comment above).
 */
function isHostAllowed(hostname) {
  if (!hostname) {
    return false;
  }
  var host = hostname.trim();
  if (host.charAt(0) === "[" && host.charAt(host.length - 1) === "]") {
    host = host.slice(1, -1);
  }
  // A fully-qualified name ("localhost.", "db.internal.", "127.0.0.1.")
  // resolves exactly like the same name without the trailing dot, so strip
  // every trailing dot BEFORE any comparison: otherwise each blocked form has
  // a trivial bypass. A host that is only dots is not a host.
  while (host.length > 0 && host.charAt(host.length - 1) === ".") {
    host = host.slice(0, -1);
  }
  if (host === "") {
    return false;
  }
  var lower = host.toLowerCase();

  if (readAllowPrivateOverride()) {
    return true; // test-only escape hatch, defaults off
  }

  if (lower === "localhost") {
    return false;
  }
  if (endsWithSuffixLabel(lower, ".localhost")) {
    return false;
  }
  if (endsWithSuffixLabel(lower, ".local")) {
    return false;
  }
  if (endsWithSuffixLabel(lower, ".internal")) {
    return false;
  }

  if (lower.indexOf(":") !== -1) {
    var v6 = classifyIPv6(lower);
    if (v6 === null) {
      // Not a recognizable IPv6 literal — treat as an opaque hostname.
      return true;
    }
    return !v6.blocked;
  }

  var v4 = parseIPv4Like(lower);
  if (v4 !== null) {
    return !isBlockedIPv4(v4);
  }

  // An ordinary DNS hostname that isn't localhost/.local/.internal and
  // isn't an IP literal — allowed here; actual resolution happens later,
  // outside this guard's visibility (the documented DNS-rebinding gap).
  return true;
}

/**
 * Decides whether a full URL string is safe to fetch: enforces http(s)
 * scheme only, then defers host checks to isHostAllowed.
 */
function isUrlAllowed(urlString) {
  var parsed = extractSchemeAndHost(urlString);
  if (!parsed) {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }
  return isHostAllowed(parsed.hostname);
}

module.exports = {
  isHostAllowed: isHostAllowed,
  isUrlAllowed: isUrlAllowed,
  // exported for tests
  _parseIPv4Like: parseIPv4Like,
  _isBlockedIPv4: isBlockedIPv4,
};
