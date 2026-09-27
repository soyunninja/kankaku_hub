#!/usr/bin/env node
// Downloads the pinned PocketBase release zip for each supported OS/arch
// (darwin/linux, arm64/amd64), computes its SHA256, and writes/updates
// pocketbase/pocketbase-checksums.json.
//
// Run manually whenever scripts/pb-download.sh's PB_VERSION changes:
//
//   node scripts/pb-checksums.mjs
//
// then commit the resulting pocketbase/pocketbase-checksums.json.
// scripts/write-manifest.mjs reads this file and fails loudly if it is
// missing an entry for the pinned version.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readPinnedPbVersion } from "./write-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const TARGETS = [
  { key: "darwin-arm64", os: "darwin", arch: "arm64" },
  { key: "darwin-amd64", os: "darwin", arch: "amd64" },
  { key: "linux-arm64", os: "linux", arch: "arm64" },
  { key: "linux-amd64", os: "linux", arch: "amd64" },
];

async function sha256OfUrl(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const pbDownloadScriptText = readFileSync(path.join(repoRoot, "scripts/pb-download.sh"), "utf8");
  const version = readPinnedPbVersion(pbDownloadScriptText);

  const outPath = path.join(repoRoot, "pocketbase/pocketbase-checksums.json");
  let existing = {};
  try {
    existing = JSON.parse(readFileSync(outPath, "utf8"));
  } catch {
    // No existing file yet (or it's unreadable) — start fresh.
    existing = {};
  }

  const checksums = {};
  for (const { key, os, arch } of TARGETS) {
    const asset = `pocketbase_${version}_${os}_${arch}.zip`;
    const url = `https://github.com/pocketbase/pocketbase/releases/download/v${version}/${asset}`;
    console.log(`Downloading ${asset}...`);
    checksums[key] = await sha256OfUrl(url);
  }

  existing[version] = checksums;
  writeFileSync(outPath, JSON.stringify(existing, null, 2) + "\n");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
