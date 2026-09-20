"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isHostAllowed, isUrlAllowed } = require("./favicon-ssrf-guard.js");

test("allows an ordinary public hostname", () => {
  assert.equal(isHostAllowed("example.com"), true);
  assert.equal(isHostAllowed("www.google.com"), true);
});

test("allows a public IPv6 address", () => {
  assert.equal(isHostAllowed("2001:db8::1"), true);
});

test("blocks exact localhost but allows localhost.evil.com", () => {
  assert.equal(isHostAllowed("localhost"), false);
  assert.equal(isHostAllowed("LOCALHOST"), false);
  assert.equal(isHostAllowed("localhost.evil.com"), true);
  assert.equal(isHostAllowed("evil-localhost.com"), true);
});

test("blocks *.localhost, *.local, *.internal suffixes only as proper subdomains", () => {
  assert.equal(isHostAllowed("foo.localhost"), false);
  assert.equal(isHostAllowed("printer.local"), false);
  assert.equal(isHostAllowed("service.internal"), false);
  assert.equal(isHostAllowed("notlocal.com"), true);
  assert.equal(isHostAllowed("internal-tool.com"), true);
});

test("blocks IPv4 loopback, private, link-local and unspecified ranges", () => {
  assert.equal(isHostAllowed("127.0.0.1"), false);
  assert.equal(isHostAllowed("127.55.0.1"), false);
  assert.equal(isHostAllowed("10.0.0.5"), false);
  assert.equal(isHostAllowed("172.16.0.1"), false);
  assert.equal(isHostAllowed("172.31.255.255"), false);
  assert.equal(isHostAllowed("172.32.0.1"), true); // just outside 172.16.0.0/12
  assert.equal(isHostAllowed("192.168.1.1"), false);
  assert.equal(isHostAllowed("169.254.1.1"), false);
  assert.equal(isHostAllowed("169.254.169.254"), false); // cloud metadata
  assert.equal(isHostAllowed("0.0.0.0"), false);
  assert.equal(isHostAllowed("8.8.8.8"), true);
});

test("blocks IPv4 shorthand forms (inet_aton style)", () => {
  assert.equal(isHostAllowed("127.1"), false); // 127.0.0.1
  assert.equal(isHostAllowed("10.1"), false); // 10.0.0.1
});

test("blocks decimal-integer IPv4 loopback bypass", () => {
  assert.equal(isHostAllowed("2130706433"), false); // 127.0.0.1
});

test("blocks hex-form IPv4 loopback bypass (whole address and per-octet)", () => {
  assert.equal(isHostAllowed("0x7f000001"), false);
  assert.equal(isHostAllowed("0x7f.0x0.0x0.0x1"), false);
});

test("blocks octal-form IPv4 loopback bypass", () => {
  assert.equal(isHostAllowed("0177.0.0.1"), false); // 0177 octal = 127
});

test("blocks IPv6 loopback and unspecified forms", () => {
  assert.equal(isHostAllowed("::1"), false);
  assert.equal(isHostAllowed("[::1]"), false);
  assert.equal(isHostAllowed("::"), false);
});

test("blocks IPv6 link-local and unique-local ranges", () => {
  assert.equal(isHostAllowed("fe80::1"), false);
  assert.equal(isHostAllowed("fc00::1"), false);
  assert.equal(isHostAllowed("fd12:3456:789a::1"), false);
});

test("blocks IPv4-mapped IPv6 loopback, compressed and fully expanded", () => {
  assert.equal(isHostAllowed("::ffff:127.0.0.1"), false);
  assert.equal(isHostAllowed("0:0:0:0:0:ffff:7f00:1"), false);
});

test("isUrlAllowed rejects non-http(s) schemes", () => {
  assert.equal(isUrlAllowed("ftp://example.com/"), false);
  assert.equal(isUrlAllowed("file:///etc/passwd"), false);
  assert.equal(isUrlAllowed("javascript:alert(1)"), false);
});

test("isUrlAllowed accepts a normal https URL and blocks a loopback URL", () => {
  assert.equal(isUrlAllowed("https://example.com/path"), true);
  assert.equal(isUrlAllowed("http://127.0.0.1:8093/"), false);
});

test("the KANKAKU_FAVICON_ALLOW_PRIVATE override allows loopback and defaults off", () => {
  assert.equal(isHostAllowed("127.0.0.1"), false);
  const prev = process.env.KANKAKU_FAVICON_ALLOW_PRIVATE;
  try {
    process.env.KANKAKU_FAVICON_ALLOW_PRIVATE = "1";
    assert.equal(isHostAllowed("127.0.0.1"), true);
  } finally {
    if (prev === undefined) {
      delete process.env.KANKAKU_FAVICON_ALLOW_PRIVATE;
    } else {
      process.env.KANKAKU_FAVICON_ALLOW_PRIVATE = prev;
    }
  }
  assert.equal(isHostAllowed("127.0.0.1"), false);
});

test("never throws on garbage input", () => {
  assert.doesNotThrow(() => isHostAllowed(""));
  assert.doesNotThrow(() => isHostAllowed(null));
  assert.doesNotThrow(() => isUrlAllowed("not a url at all"));
  assert.equal(isHostAllowed(""), false);
  assert.equal(isUrlAllowed("not a url at all"), false);
});
