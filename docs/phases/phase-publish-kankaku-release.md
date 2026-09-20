# Phase — Publish kankaku release (PLANNED, operational)

| | |
|---|---|
| Status | planned |
| Repos | kankaku |
| Depends on | [phase-2-sync-push](phase-2-sync-push.md), [phase-2b-backfill](phase-2b-backfill.md) |

## Goal

Merge the `feat/pocketbase-hub` branch (20 commits ahead of `main`/`v0.4.6`)
and publish a new kankaku version to npm with the hub integration included,
so other pi users can install it.

## Scope

### In (planned)

- Merging the branch to `main`.
- A version bump (semver — hub integration is additive/backwards-compatible
  per `WORK_RECORD_SCHEMA` staying at `1`, so likely a minor bump, e.g.
  `0.5.0`; confirm against `kankaku/AGENTS.md`'s versioning policy before
  publishing).
- `npm publish`, which requires browser-based 2FA — the owner must run this
  step personally, it cannot be automated by an agent.
- Listing/updating the extension on pi.dev, if applicable.

### Out (planned)

- Any code change as part of this phase — it is a release/publish
  operation, not a feature phase.

## Deliverables

None yet — not started. `kankaku/package.json` version is still `0.4.6` at
the time of this writing; `prepublishOnly` (`npm run check`) is configured
but has not been run for an actual publish.

## Acceptance criteria

- [ ] `feat/pocketbase-hub` merged to `main`.
- [ ] Version bumped appropriately and `npm run check` green.
- [ ] `npm publish` completed (owner-run, 2FA).
- [ ] pi.dev listing updated, if applicable.

## Evidence

None — this is a documented plan, not an executed release. See
[`../runbooks/release-kankaku.md`](../runbooks/release-kankaku.md).

## Known gaps

No remote exists for the kankaku repo yet (`git remote -v` empty) — merging
to `main` and publishing both require deciding where `main` lives first
(see [ADR 0010](../adr/0010-everything-local-for-now.md)).

## Next steps

- Execute [`../runbooks/release-kankaku.md`](../runbooks/release-kankaku.md)
  when the owner decides to publish.
