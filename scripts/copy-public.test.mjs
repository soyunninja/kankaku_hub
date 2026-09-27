import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { copyPublic } from "./copy-public.mjs";

function makeTempRoot() {
  return mkdtempSync(path.join(tmpdir(), "kankaku-hub-copy-public-"));
}

test("copies files from the source directory to a fresh destination", () => {
  const root = makeTempRoot();
  const from = path.join(root, "web/.output/public");
  const to = path.join(root, "public");
  mkdirSync(path.join(from, "assets"), { recursive: true });
  writeFileSync(path.join(from, "index.html"), "<html></html>");
  writeFileSync(path.join(from, "assets", "app.js"), "console.log(1)");

  copyPublic({ from, to });

  assert.equal(readFileSync(path.join(to, "index.html"), "utf8"), "<html></html>");
  assert.equal(readFileSync(path.join(to, "assets", "app.js"), "utf8"), "console.log(1)");

  rmSync(root, { recursive: true, force: true });
});

test("removes stale destination content before copying (fresh copy each run)", () => {
  const root = makeTempRoot();
  const from = path.join(root, "web/.output/public");
  const to = path.join(root, "public");
  mkdirSync(from, { recursive: true });
  writeFileSync(path.join(from, "new.html"), "new");
  mkdirSync(to, { recursive: true });
  writeFileSync(path.join(to, "stale.html"), "stale");

  copyPublic({ from, to });

  assert.equal(existsSync(path.join(to, "stale.html")), false);
  assert.equal(readFileSync(path.join(to, "new.html"), "utf8"), "new");

  rmSync(root, { recursive: true, force: true });
});

test("throws when the source build output does not exist", () => {
  const root = makeTempRoot();
  const from = path.join(root, "web/.output/public");
  const to = path.join(root, "public");

  assert.throws(() => copyPublic({ from, to }), /Web build output not found/);

  rmSync(root, { recursive: true, force: true });
});
