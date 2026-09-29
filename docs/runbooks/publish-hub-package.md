# Publish the hub package (npm: kankaku-hub)

| | |
|---|---|
| Status | **Published:** `kankaku-hub@0.2.0` on npm, 2026-09-28. The steps below apply to future releases. |

kankaku-hub is published to npm as `kankaku-hub` so a consumer can install
a local hub without a git checkout — see `kankaku hub install` in the
`kankaku` CLI/pi extension repo. This runbook is the step-by-step release
procedure; the rationale and the "what ships" list live in `AGENTS.md`
("Publishing the hub package").

## What ships

Exactly:

- `pocketbase/pb_migrations/**` — the schema, the contract.
- `pocketbase/pb_hooks/**`, excluding `*.test.js` (a nested
  `pocketbase/pb_hooks/.npmignore` prunes the tests out of the tarball —
  see [`../../pocketbase/pb_hooks/.npmignore`](../../pocketbase/pb_hooks/.npmignore)).
- `public/` — the prebuilt static web app, copied from `web/.output/public`
  at pack time by `scripts/copy-public.mjs`.
- `hub-manifest.json` — generated at pack time by `scripts/write-manifest.mjs`.
- `README.md`, `LICENSE`.

Nothing else: no seed data (`pocketbase/seed/`), no dev scripts, no web
sources, no other docs. See `package.json`'s `files` field for the exact
allowlist, and verify with `npm pack --dry-run` before every release (step
2 below).

### What a consumer reads from `hub-manifest.json`

```json
{
  "name": "kankaku-hub",
  "version": "0.2.0",
  "schemaVersion": "1758300021_viewer_role_and_write_rules.js",
  "migrations": ["1758300001_users_role_field.js", "…"],
  "pocketbase": {
    "version": "0.40.4",
    "assets": {
      "darwin-arm64": { "file": "...", "url": "...", "sha256": "..." },
      "darwin-amd64": { "...": "..." },
      "linux-arm64": { "...": "..." },
      "linux-amd64": { "...": "..." }
    }
  },
  "serve": {
    "http": "127.0.0.1:8090",
    "migrationsDir": "pocketbase/pb_migrations",
    "hooksDir": "pocketbase/pb_hooks",
    "publicDir": "public"
  },
  "generatedAt": "..."
}
```

`kankaku hub install` is expected to use this to: download the right
PocketBase binary for the host's OS/arch and verify its SHA256 before
running it, know which directories to pass as `--migrationsDir`/
`--hooksDir`/`--publicDir` (relative to the installed package — the same
shape `scripts/dev.sh` and `docs/runbooks/deploy-to-vps.md` already use
for a git checkout), and read `schemaVersion`/`migrations` to reason about
compatibility (see below) without needing to enumerate the package's files
itself.

### Compatibility note

A consumer pins a `kankaku-hub` version (e.g. in its own `package.json` or
lockfile). A `kankaku-hub` release that only **adds** migrations —
including the empty-to-populated `pocketbase/pocketbase-checksums.json`
case, or a new field, index or collection — is always safe to upgrade to:
PocketBase reconciles `pb_migrations/` against its `pb_data` on every
`serve` startup, applying whatever new migration files it finds and
leaving already-applied ones alone (see `docs/runbooks/deploy-to-vps.md`
§4b for the corresponding rollback caveat). A release that **removes or
rewrites** a previously shipped migration is not safe in the same way —
see "never edit a shipped migration" in `AGENTS.md`.

## 1. Before you start

- `npm run manifest:test` — must be green.
- `npm run hooks:test` and `npm run seed:test` — must stay green (this
  package change does not touch either).
- If the pinned PocketBase version in `scripts/pb-download.sh` changed
  since the last release, run `node scripts/pb-checksums.mjs` (needs
  network — downloads the four release zips and hashes them) and commit
  the updated `pocketbase/pocketbase-checksums.json` **first**, as its own
  commit. `scripts/write-manifest.mjs` fails loudly if it is missing an
  entry for the currently pinned version, so this is not optional.

## 2. Build and verify the tarball

```bash
npm run pack:hub        # web:build (needs pnpm) + write-manifest + copy-public
npm pack --dry-run
```

Confirm in the `npm pack --dry-run` output:

- No `*.test.js` file is listed.
- No `pocketbase/seed/` path is listed.
- No `web/` source path is listed (only the top-level `public/` copy).
- `hub-manifest.json` is listed and its `schemaVersion`/`migrations`
  match the current `pocketbase/pb_migrations/` contents
  (`node -e "console.log(require('./hub-manifest.json'))"`).

## 3. Version bump

```bash
npm version x.y.z --no-git-tag-version
```

Update a changelog file if this repo has one by the time you read this
(none exists yet — see `docs/README.md`'s map). Follow this repo's usual
semver judgment: an additive migration/hook/manifest change is a minor
bump; a fix with no schema change is a patch; a shipped-migration removal
or rewrite (which should not normally happen — see above) would be major.

Commit the version bump (and the changelog, if any) with a
`chore(release): …` commit, then tag it:

```bash
git tag vX.Y.Z
```

## 4. Publish

```bash
npm publish
```

`npm publish` runs `prepack` automatically, which reruns `npm run
pack:hub` against the tagged commit — the build in step 2 is a dry run to
catch problems early, not a substitute for this.

`npm publish` requires browser-based two-factor authentication tied to the
publishing account, same as `kankaku`'s own release runbook. **This step
must be run by the repo owner personally** — it cannot be delegated to or
automated by an agent.

## 5. After publishing

- Push the branch and the tag: `git push && git push --tags`.
- Smoke-test the published package: in a scratch directory,
  `npm install kankaku-hub@x.y.z` and confirm `hub-manifest.json` and
  `public/index.html` exist under `node_modules/kankaku-hub/`.
- If `kankaku` (the CLI/pi extension) pins a `kankaku-hub` version for
  `kankaku hub install`, update that pin in a follow-up change there.

## Related

- `AGENTS.md` — "Publishing the hub package (npm: kankaku-hub)".
- [`local-development.md`](local-development.md) — building the web app
  locally (`pnpm`), the single-process shape this package mirrors.
- [`deploy-to-vps.md`](deploy-to-vps.md) — the same
  binary + `pb_migrations` + static build shape, deployed by hand instead
  of via npm.
- [`release-kankaku.md`](release-kankaku.md) — the equivalent runbook for
  the `kankaku` npm package, including the same two-factor caveat.
