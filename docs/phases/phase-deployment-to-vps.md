# Phase — Deployment to VPS (PLANNED, operational)

| | |
|---|---|
| Status | planned |
| Repos | kankaku-hub |
| Depends on | [phase-3-web](phase-3-web.md) |

## Goal

Take the local-only PocketBase + web system (see
[ADR 0010](../adr/0010-everything-local-for-now.md)) and run it on a real
VPS, reachable over HTTPS, so kankaku instances on other machines can sync
to it and the owner can use the dashboard from anywhere.

## Scope

### In (planned)

- Single PocketBase binary + `pb_public` (the generated web build) on a
  VPS, per [`../runbooks/deploy-to-vps.md`](../runbooks/deploy-to-vps.md).
- TLS via a reverse proxy.
- Backups of `pb_data`.
- Provisioning the real owner and service accounts (rotating the current
  throwaway dev credentials).
- Tightening any rule that was left permissive for local dev convenience.

### Out (planned)

- Multi-instance/HA deployment — this is a single-owner tool; one instance
  is the target.
- Publishing kankaku to npm — see
  [phase-publish-kankaku-release](phase-publish-kankaku-release.md), a
  separate operational phase.

## Deliverables

None yet — not started. No GitHub remote, no VPS, nothing deployed as of
this writing (`git remote -v` empty in both repos).

## Acceptance criteria

- [ ] PocketBase reachable over HTTPS from outside the VPS.
- [ ] `pb_data` backed up on a schedule.
- [ ] Dev credentials rotated to real, non-throwaway ones.
- [ ] Access rules re-reviewed against a real (not local-dev) threat model.
- [ ] A real kankaku install (a second machine) can sync against it
      end-to-end.

## Evidence

None — this is a documented plan, not an executed deployment. See
[`../runbooks/deploy-to-vps.md`](../runbooks/deploy-to-vps.md) for the
runbook, marked not yet executed.

## Known gaps

Everything operational: no server provisioned, no DNS, no TLS certificate,
no backup mechanism configured, no monitoring.

## Next steps

- Execute [`../runbooks/deploy-to-vps.md`](../runbooks/deploy-to-vps.md)
  when the owner decides to deploy.
