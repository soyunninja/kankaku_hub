# 0010 — Everything local for now

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-20 |

## Context

The proposal designs for a VPS-hosted PocketBase instance, but nothing has
actually been deployed. Building and proving the system locally first
avoids paying deployment/ops cost before the design has been validated by
real use.

## Decision

No GitHub remote has been added to either repo (`git remote -v` is empty in
both), no VPS has been provisioned, and kankaku has not been published to
npm. Both repos are local-only. `kankaku-hub/package.json` is `"private": true`;
`kankaku/package.json` has a `prepublishOnly` script ready but has not been
run for an actual publish.

## Consequences

- No production credentials, no production data, no exposed attack surface
  — the current dev credentials (documented in `ESTADO.md`) are
  intentionally throwaway and would need rotation before any deployment.
- Deployment and publishing are explicitly planned-but-not-executed
  operational phases — see
  [`../phases/phase-deployment-to-vps.md`](../phases/phase-deployment-to-vps.md)
  and [`../phases/phase-publish-kankaku-release.md`](../phases/phase-publish-kankaku-release.md),
  and their corresponding runbooks
  ([`../runbooks/deploy-to-vps.md`](../runbooks/deploy-to-vps.md),
  [`../runbooks/release-kankaku.md`](../runbooks/release-kankaku.md)).
- Anyone extending this system today is working entirely against local
  PocketBase instances and local builds; nothing here has been exercised
  against real network conditions, real users, or a real npm registry.

## Alternatives considered

- **Deploy early to a VPS to validate under real conditions** — rejected
  for this stage: the schema and both apps were still moving quickly
  (see `ESTADO.md`'s in-progress polish pass), and premature deployment
  would mean securing and maintaining infrastructure for a moving target.

## Related

- Evidence: `git remote -v` (empty, both repos), `kankaku-hub/package.json` (`"private": true`)
- Phases: [phase-deployment-to-vps](../phases/phase-deployment-to-vps.md), [phase-publish-kankaku-release](../phases/phase-publish-kankaku-release.md)
- Runbooks: [deploy-to-vps](../runbooks/deploy-to-vps.md), [release-kankaku](../runbooks/release-kankaku.md)
