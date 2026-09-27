#!/usr/bin/env node
// Copies the built web app (web/.output/public, produced by
// `npm run web:build` / `pnpm --dir web generate`) to public/ at the repo
// root, so the npm package has one stable top-level path to ship
// regardless of where the web build tool puts its own gitignored output
// (web/.output is gitignored and lives under web/). Run by
// `npm run pack:hub`. Never commit public/ itself — see .gitignore.
import { existsSync, rmSync, cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Pure-ish: takes explicit from/to paths so it can be exercised against
// temp directories in tests — see scripts/copy-public.test.mjs.
export function copyPublic({ from, to }) {
  if (!existsSync(from)) {
    throw new Error(
      `Web build output not found at ${from}. Run \`npm run web:build\` (pnpm --dir web generate) first.`,
    );
  }
  // Fresh copy every run: never let a stale file from a previous build
  // survive under a new one.
  rmSync(to, { recursive: true, force: true });
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
}

function main() {
  copyPublic({
    from: path.join(repoRoot, "web/.output/public"),
    to: path.join(repoRoot, "public"),
  });
  console.log("Copied web/.output/public -> public");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main();
}
