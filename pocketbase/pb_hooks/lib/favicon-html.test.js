"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractFaviconCandidates, resolveUrl, originOf } = require("./favicon-html.js");

test("returns an empty array when there are no icons at all", () => {
  const html = "<html><head><title>No icons here</title></head><body></body></html>";
  assert.deepEqual(extractFaviconCandidates(html, "https://example.com/"), []);
});

test("never throws on garbage input", () => {
  assert.doesNotThrow(() => extractFaviconCandidates("<link rel=icon href=", "https://example.com/"));
  assert.deepEqual(extractFaviconCandidates("", "https://example.com/"), []);
  assert.deepEqual(extractFaviconCandidates(null, "https://example.com/"), []);
  assert.deepEqual(extractFaviconCandidates("<link>", null), []);
});

test("resolves a relative href against the base URL", () => {
  const html = '<link rel="icon" href="favicon.png">';
  const out = extractFaviconCandidates(html, "https://example.com/some/page.html");
  assert.deepEqual(out, ["https://example.com/some/favicon.png"]);
});

test("resolves an absolute-path href against the origin", () => {
  const html = '<link rel="icon" href="/assets/icon.png">';
  const out = extractFaviconCandidates(html, "https://example.com/some/page.html");
  assert.deepEqual(out, ["https://example.com/assets/icon.png"]);
});

test("resolves a protocol-relative href using the base's scheme", () => {
  const html = '<link rel="icon" href="//cdn.example.com/icon.png">';
  const out = extractFaviconCandidates(html, "https://example.com/");
  assert.deepEqual(out, ["https://cdn.example.com/icon.png"]);
});

test("honors a <base href> override for relative resolution", () => {
  const html = '<base href="https://cdn.example.com/assets/"><link rel="icon" href="icon.png">';
  const out = extractFaviconCandidates(html, "https://example.com/page.html");
  assert.deepEqual(out, ["https://cdn.example.com/assets/icon.png"]);
});

test("handles multiple sizes and prefers one in the 32-192 sweet spot", () => {
  const html = `
    <link rel="icon" sizes="16x16" href="/icon-16.png">
    <link rel="icon" sizes="512x512" href="/icon-512.png">
    <link rel="icon" sizes="32x32" href="/icon-32.png">
  `;
  const out = extractFaviconCandidates(html, "https://example.com/");
  assert.equal(out[0], "https://example.com/icon-32.png");
});

test("recognizes apple-touch-icon and apple-touch-icon-precomposed", () => {
  const html = `
    <link rel="apple-touch-icon" href="/apple.png">
    <link rel="apple-touch-icon-precomposed" href="/apple-precomposed.png">
  `;
  const out = extractFaviconCandidates(html, "https://example.com/");
  assert.equal(out.length, 2);
  assert.ok(out.indexOf("https://example.com/apple.png") !== -1);
  assert.ok(out.indexOf("https://example.com/apple-precomposed.png") !== -1);
});

test("prefers a plain icon rel over apple-touch-icon at equal size", () => {
  const html = `
    <link rel="apple-touch-icon" sizes="32x32" href="/apple.png">
    <link rel="icon" sizes="32x32" href="/icon.png">
  `;
  const out = extractFaviconCandidates(html, "https://example.com/");
  assert.equal(out[0], "https://example.com/icon.png");
});

test("prefers png over ico when sizes are equal/unknown", () => {
  const html = `
    <link rel="icon" href="/favicon.ico">
    <link rel="icon" href="/favicon.png">
  `;
  const out = extractFaviconCandidates(html, "https://example.com/");
  assert.equal(out[0], "https://example.com/favicon.png");
});

test("handles UPPERCASE tag and attribute names", () => {
  const html = '<LINK REL="ICON" HREF="/upper.png">';
  const out = extractFaviconCandidates(html, "https://example.com/");
  assert.deepEqual(out, ["https://example.com/upper.png"]);
});

test("handles single-quoted attribute values", () => {
  const html = "<link rel='shortcut icon' href='/single.png'>";
  const out = extractFaviconCandidates(html, "https://example.com/");
  assert.deepEqual(out, ["https://example.com/single.png"]);
});

test("de-duplicates identical resolved candidate URLs", () => {
  const html = `
    <link rel="icon" href="/icon.png">
    <link rel="shortcut icon" href="/icon.png">
  `;
  const out = extractFaviconCandidates(html, "https://example.com/");
  assert.equal(out.length, 1);
});

test("ignores non-icon rel values", () => {
  const html = `
    <link rel="stylesheet" href="/style.css">
    <link rel="canonical" href="/page">
  `;
  assert.deepEqual(extractFaviconCandidates(html, "https://example.com/"), []);
});

test("resolveUrl returns null for unresolvable/opaque schemes", () => {
  assert.equal(resolveUrl("data:image/png;base64,AAAA", "https://example.com/"), null);
  assert.equal(resolveUrl("mailto:a@b.com", "https://example.com/"), null);
  assert.equal(resolveUrl("", "https://example.com/"), null);
  assert.equal(resolveUrl(null, "https://example.com/"), null);
});

test("originOf extracts scheme+host from an absolute URL", () => {
  assert.equal(originOf("https://example.com:8443/a/b?x=1"), "https://example.com:8443");
  assert.equal(originOf("not a url"), null);
});
