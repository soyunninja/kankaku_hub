import { test } from "node:test";
import assert from "node:assert/strict";
import { buildManifest, readPinnedPbVersion } from "./write-manifest.mjs";

test("readPinnedPbVersion extracts the PB_VERSION default", () => {
  const script = 'PB_VERSION="${PB_VERSION:-0.40.4}"\n';
  assert.equal(readPinnedPbVersion(script), "0.40.4");
});

test("readPinnedPbVersion throws when the pattern is missing", () => {
  assert.throws(() => readPinnedPbVersion("no version here"), /PB_VERSION/);
});

test("buildManifest builds the expected manifest from fixture inputs", () => {
  const pkg = { name: "kankaku-hub", version: "0.2.0" };
  const checksums = {
    "0.40.4": {
      "darwin-arm64": "aaa111",
      "darwin-amd64": "bbb222",
      "linux-arm64": "ccc333",
      "linux-amd64": "ddd444",
    },
  };
  const migrationFiles = ["1758300001_a.js", "1758300002_b.js"];
  const generatedAt = "2026-01-01T00:00:00.000Z";

  const manifest = buildManifest({
    pkg,
    pbVersion: "0.40.4",
    checksums,
    migrationFiles,
    generatedAt,
  });

  assert.deepEqual(manifest, {
    name: "kankaku-hub",
    version: "0.2.0",
    schemaVersion: "1758300002_b.js",
    migrations: ["1758300001_a.js", "1758300002_b.js"],
    pocketbase: {
      version: "0.40.4",
      assets: {
        "darwin-arm64": {
          file: "pocketbase_0.40.4_darwin_arm64.zip",
          url: "https://github.com/pocketbase/pocketbase/releases/download/v0.40.4/pocketbase_0.40.4_darwin_arm64.zip",
          sha256: "aaa111",
        },
        "darwin-amd64": {
          file: "pocketbase_0.40.4_darwin_amd64.zip",
          url: "https://github.com/pocketbase/pocketbase/releases/download/v0.40.4/pocketbase_0.40.4_darwin_amd64.zip",
          sha256: "bbb222",
        },
        "linux-arm64": {
          file: "pocketbase_0.40.4_linux_arm64.zip",
          url: "https://github.com/pocketbase/pocketbase/releases/download/v0.40.4/pocketbase_0.40.4_linux_arm64.zip",
          sha256: "ccc333",
        },
        "linux-amd64": {
          file: "pocketbase_0.40.4_linux_amd64.zip",
          url: "https://github.com/pocketbase/pocketbase/releases/download/v0.40.4/pocketbase_0.40.4_linux_amd64.zip",
          sha256: "ddd444",
        },
      },
    },
    serve: {
      http: "127.0.0.1:8090",
      migrationsDir: "pocketbase/pb_migrations",
      hooksDir: "pocketbase/pb_hooks",
      publicDir: "public",
    },
    generatedAt,
  });
});

test("buildManifest throws when the pinned version has no checksums", () => {
  const pkg = { name: "kankaku-hub", version: "0.2.0" };
  assert.throws(
    () =>
      buildManifest({
        pkg,
        pbVersion: "0.40.4",
        checksums: { "0.30.0": { "darwin-arm64": "x" } },
        migrationFiles: ["1758300001_a.js"],
        generatedAt: "2026-01-01T00:00:00.000Z",
      }),
    /Missing PocketBase checksums for pinned version 0\.40\.4/,
  );
});

test("buildManifest throws when the checksums file is empty/missing entirely", () => {
  const pkg = { name: "kankaku-hub", version: "0.2.0" };
  assert.throws(
    () =>
      buildManifest({
        pkg,
        pbVersion: "0.40.4",
        checksums: undefined,
        migrationFiles: ["1758300001_a.js"],
        generatedAt: "2026-01-01T00:00:00.000Z",
      }),
    /Missing PocketBase checksums for pinned version 0\.40\.4/,
  );
});

test("buildManifest throws when there are no migrations", () => {
  const pkg = { name: "kankaku-hub", version: "0.2.0" };
  assert.throws(
    () =>
      buildManifest({
        pkg,
        pbVersion: "0.40.4",
        checksums: { "0.40.4": { "darwin-arm64": "aaa111" } },
        migrationFiles: [],
        generatedAt: "2026-01-01T00:00:00.000Z",
      }),
    /No migrations found/,
  );
});
