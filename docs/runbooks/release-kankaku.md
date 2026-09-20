# Release kankaku

| | |
|---|---|
| Status | **PLANNED — not yet executed.** `kankaku/package.json` is still at `0.4.6` (the `main` baseline); the hub integration lives only on `feat/pocketbase-hub` and has not been merged or published. |

## 1. Merge the branch

`feat/pocketbase-hub` is 20 commits ahead of `main` (`45415ce`). Before
merging, confirm:

- `npm run check` is green (`tsc --noEmit && node --test tests/*.test.ts`).
- The opt-in `npm run e2e:hub` passes against a real PocketBase instance
  built from `kankaku-hub` (see [`local-development.md`](local-development.md)).
- No GitHub remote currently exists for this repo (`git remote -v` is
  empty) — decide where `main` will actually live (push a remote, or merge
  locally) before this step is meaningful as a "release."

## 2. Version bump

Confirm the bump against `kankaku/AGENTS.md`'s stated versioning policy
before choosing a number. The hub integration is additive
(`WORK_RECORD_SCHEMA` is unchanged at `1`; new fields are optional; see
[`../specs/record-identity.md`](../specs/record-identity.md)), which
typically argues for a minor version bump under semver — verify this
reasoning against the repo's actual policy rather than assuming it.

## 3. Publish to npm

```bash
npm run check       # prepublishOnly already runs this, but verify first
npm publish
```

`npm publish` requires browser-based two-factor authentication tied to the
publishing account. **This step must be run by the repo owner personally**
— it cannot be delegated to or automated by an agent.

## 4. pi.dev listing

If kankaku is listed on pi.dev (or an equivalent extension directory),
update the listing to reflect the new version and the hub integration
feature, once published.

## Related

- [phase-publish-kankaku-release](../phases/phase-publish-kankaku-release.md)
- [ADR 0009](../adr/0009-separate-repos-instead-of-monorepo.md) (kankaku is the npm-publishable half of the system)
- [ADR 0010](../adr/0010-everything-local-for-now.md)
