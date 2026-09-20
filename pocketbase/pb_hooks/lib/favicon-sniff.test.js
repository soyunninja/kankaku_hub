"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sniffFavicon } = require("./favicon-sniff.js");

function bytes(arr) {
  return arr;
}

test("accepts PNG magic bytes with matching content-type", () => {
  const b = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
  const res = sniffFavicon(b, "image/png");
  assert.equal(res.ok, true);
  assert.equal(res.type, "png");
});

test("accepts ICO magic bytes with either ICO content-type alias", () => {
  const b = bytes([0x00, 0x00, 0x01, 0x00, 1, 0, 32, 32]);
  assert.equal(sniffFavicon(b, "image/x-icon").ok, true);
  assert.equal(sniffFavicon(b, "image/vnd.microsoft.icon").ok, true);
  assert.equal(sniffFavicon(b, "image/x-icon").type, "ico");
});

test("accepts JPEG magic bytes with matching content-type", () => {
  const b = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const res = sniffFavicon(b, "image/jpeg");
  assert.equal(res.ok, true);
  assert.equal(res.type, "jpg");
});

test("accepts GIF magic bytes with matching content-type", () => {
  const b = bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  const res = sniffFavicon(b, "image/gif");
  assert.equal(res.ok, true);
  assert.equal(res.type, "gif");
});

test("accepts WEBP (RIFF....WEBP) magic bytes with matching content-type", () => {
  const b = bytes([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x00, 0x00, 0x00, 0x00, // size (unused by sniff)
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);
  const res = sniffFavicon(b, "image/webp");
  assert.equal(res.ok, true);
  assert.equal(res.type, "webp");
});

test("rejects an SVG body even if labeled as an image content-type", () => {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg'></svg>";
  const b = Array.from(Buffer.from(svg, "utf8"));
  assert.equal(sniffFavicon(b, "image/png").ok, false);
});

test("rejects an XML-prefixed SVG body", () => {
  const svg = "<?xml version='1.0'?><svg></svg>";
  const b = Array.from(Buffer.from(svg, "utf8"));
  assert.equal(sniffFavicon(b, "image/svg+xml").ok, false);
});

test("rejects an HTML error/redirect page mislabeled as an image", () => {
  const html = "<!doctype html><html><body>404</body></html>";
  const b = Array.from(Buffer.from(html, "utf8"));
  assert.equal(sniffFavicon(b, "image/png").ok, false);
});

test("rejects plain text content", () => {
  const b = Array.from(Buffer.from("just some text, not an image", "utf8"));
  assert.equal(sniffFavicon(b, "text/plain").ok, false);
});

test("rejects when magic bytes and declared content-type disagree", () => {
  const pngBytes = bytes([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  assert.equal(sniffFavicon(pngBytes, "image/jpeg").ok, false);
});

test("rejects when content-type is missing or unrecognized even with valid magic bytes", () => {
  const pngBytes = bytes([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
  assert.equal(sniffFavicon(pngBytes, "").ok, false);
  assert.equal(sniffFavicon(pngBytes, "application/octet-stream").ok, false);
});

test("handles a content-type with a charset suffix", () => {
  const gifBytes = bytes([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
  assert.equal(sniffFavicon(gifBytes, "image/gif; charset=binary").ok, true);
});

test("never throws on empty or short buffers", () => {
  assert.doesNotThrow(() => sniffFavicon([], "image/png"));
  assert.equal(sniffFavicon([], "image/png").ok, false);
  assert.doesNotThrow(() => sniffFavicon(null, "image/png"));
  assert.equal(sniffFavicon(null, "image/png").ok, false);
  assert.doesNotThrow(() => sniffFavicon([0x89], "image/png"));
});
