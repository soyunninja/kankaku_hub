#!/usr/bin/env node
// Writes hub-manifest.json (gitignored, generated at pack time) describing
// this release for a consumer that installs kankaku-hub from npm instead of
// a git checkout: the schema version (the last applied migration), the
// pinned PocketBase binary per OS/arch with its download URL and SHA256,
// and where to serve pb_migrations/pb_hooks/public from.
//
// Run automatically by `npm run pack:hub` (and therefore by `npm publish`,
// via `prepack`). Never commit hub-manifest.json itself — see .gitignore.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "..");

// Extracts the pinned PocketBase version from scripts/pb-download.sh's
// `PB_VERSION="${PB_VERSION:-0.40.4}"` line, so this file stays the single
// source of truth for the pinned version instead of duplicating it here.
export function readPinnedPbVersion(pbDownloadScriptText) {
  const match = pbDownloadScriptText.match(/PB_VERSION="\$\{PB_VERSION:-([^}]+)\}"/);
  if (!match) {
    throw new Error("Could not find a PB_VERSION default in scripts/pb-download.sh");
  }
  return match[1];
}

// Pure: builds the manifest object from already-loaded inputs. Kept
// separate from all filesystem access so it can be unit tested with
// fixture data — see scripts/write-manifest.test.mjs.
export function buildManifest({ pkg, pbVersion, checksums, migrationFiles, generatedAt }) {
  const versionChecksums = checksums && checksums[pbVersion];
  if (!versionChecksums) {
    throw new Error(
      `Missing PocketBase checksums for pinned version ${pbVersion} in ` +
        "pocketbase/pocketbase-checksums.json. Run " +
        "`node scripts/pb-checksums.mjs` and commit the result.",
    );
  }

  if (!migrationFiles || migrationFiles.length === 0) {
    throw new Error("No migrations found in pocketbase/pb_migrations");
  }

  const assets = {};
  for (const [key, sha256] of Object.entries(versionChecksums)) {
    const [os, arch] = key.split("-");
    const file = `pocketbase_${pbVersion}_${os}_${arch}.zip`;
    const url = `https://github.com/pocketbase/pocketbase/releases/download/v${pbVersion}/${file}`;
    assets[key] = { file, url, sha256 };
  }

  return {
    name: pkg.name,
    version: pkg.version,
    schemaVersion: migrationFiles[migrationFiles.length - 1],
    migrations: migrationFiles,
    pocketbase: {
      version: pbVersion,
      assets,
    },
    serve: {
      http: "127.0.0.1:8090",
      migrationsDir: "pocketbase/pb_migrations",
      hooksDir: "pocketbase/pb_hooks",
      publicDir: "public",
    },
    generatedAt,
  };
}

function main() {
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const pbDownloadScriptText = readFileSync(path.join(repoRoot, "scripts/pb-download.sh"), "utf8");
  const pbVersion = readPinnedPbVersion(pbDownloadScriptText);

  let checksums;
  try {
    checksums = JSON.parse(readFileSync(path.join(repoRoot, "pocketbase/pocketbase-checksums.json"), "utf8"));
  } catch (err) {
    throw new Error(
      `Could not read pocketbase/pocketbase-checksums.json (${err.message}). ` +
        "Run `node scripts/pb-checksums.mjs` once and commit the result.",
    );
  }

  const migrationFiles = readdirSync(path.join(repoRoot, "pocketbase/pb_migrations"))
    .filter((name) => name.endsWith(".js"))
    .sort();

  const manifest = buildManifest({
    pkg,
    pbVersion,
    checksums,
    migrationFiles,
    generatedAt: new Date().toISOString(),
  });

  const outPath = path.join(repoRoot, "hub-manifest.json");
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${outPath}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}
