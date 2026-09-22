# 0029-viewer-role-read-only

| | |
|---|---|
| Status | accepted |
| Date | 2026-09-22 |

## Context

The owner wants a public demo instance of kankaku-hub — fictional, rich
seed data (`pocketbase/seed/seed.js --seed-profile rich`) — that anyone can
browse to see what the hub looks like, without exposing the real
`pocketbase/pb_data` or letting an anonymous visitor change anything.

Before this decision `users.role` only had two values, `owner` and
`service` (1758300001), and `task_entries`/`work_records` — the two
measurement collections `service` (kankaku's sync client) needs to write —
had `createRule`/`updateRule` of `@request.auth.id != ''`: any
authenticated account, present or future, could create or update rows
there. `clients`/`projects`/`tasks`/`ignored_sessions` already restrict
writes to `role = 'owner'`. A demo account with no restriction beyond "is
logged in" would be able to vandalize the seeded data, and a plain
unauthenticated visitor cannot use the hub at all — every collection's
`listRule`/`viewRule` requires `@request.auth.id != ''`, and the totals
route (`POST /api/kankaku/totals`, ADR 0027) and the Engram narrative proxy
(ADR 0028) both call `$apis.requireAuth()` by design.

## Decision

Add a third `users.role` value, `viewer`, that can read every collection
and hub route a `service`/`owner` account can, but write nothing.
`task_entries`/`work_records` `createRule`/`updateRule` become
`@request.auth.role = 'owner' || @request.auth.role = 'service'`
(migration `1758300021`) — `viewer` satisfies neither side, so any write
attempt 403s. Every other collection already gates writes to
`role = 'owner'`, so a `viewer` account is already refused there with no
further schema change. `list`/`view`/`delete` rules and every hooked
route's `$apis.requireAuth()` check are untouched: a `viewer` still counts
as authenticated for reads.

`scripts/isolated-stack.sh` provisions a third throwaway account
(`demo@kankaku.local` / `kankaku-demo-viewer`, `role: viewer`) the same
idempotent way it already provisions `owner`/`service`, so a fresh isolated
stack always has one ready to hand out. Hiding write *controls* from a
non-owner in the web UI (so a viewer isn't shown buttons that would 403) is
a separate, UI-only follow-up — see `odd/tasks/viewer-role.md` T2 — this
ADR covers only the server-side authorization boundary, which holds even
if the UI change is incomplete or bypassed with a raw `curl`.

## Consequences

- A public demo instance becomes possible: point PocketBase's
  `--publicDir` at a `pnpm generate` build (same single-process shape as
  [`local-development.md`](../runbooks/local-development.md) and
  [`deploy-to-vps.md`](../runbooks/deploy-to-vps.md)), seed it with rich
  fictional data, and hand out the `demo@kankaku.local` credentials —
  visitors can explore real-looking dashboards, filters, and totals with
  no risk to that data or any other instance.
- The UI must still hide write actions for non-owner roles (T2); until
  that lands, a `viewer` who clicks a write button gets a 403 from the API
  rather than a silent failure, which is safe but not polished.
- No per-record ACL: `viewer` is all-or-nothing across every collection —
  there is no way to expose one client's data to a demo account while
  hiding another's. Acceptable for a demo instance seeded with entirely
  fictional data; would need real per-record rules for a multi-tenant read
  audience, which is out of scope (see proposal §9, "everything local for
  now", ADR 0010).
- `role` remains not self-editable (1758300017): a `viewer` account cannot
  `PATCH` its own way into `owner` or `service`.

## Alternatives considered

- **A separate demo PocketBase instance with API rules disabled entirely**
  (any authenticated or even anonymous request can read/write) — rejected:
  it would need its own migrations/seed pipeline to stay in sync with the
  real schema, and disabling rules invites the same vandalism problem this
  decision exists to prevent, just on a second copy of the data instead of
  the first.
- **Unauthenticated read access** (drop `@request.auth.id != ''` from
  `listRule`/`viewRule` for a subset of collections) — rejected: the
  totals route and the Engram narrative proxy require auth by design
  (`$apis.requireAuth()`, ADR 0027/0028), so an unauthenticated visitor
  would hit a working dashboard for raw collection listing but a 401 wall
  on the aggregated totals and session-narrative features the rest of the
  UI depends on. A named `viewer` account keeps one consistent auth story
  for every route.

## Related

- ADRs: [0018](0018-billing-boundary-enforced-in-schema.md) (no money in
  the schema — relevant to what a public demo can safely expose),
  [0027](0027-totals-computed-server-side.md),
  [0028](0028-engram-narrative-read-only-proxy.md)
- Code: `pocketbase/pb_migrations/1758300021_viewer_role_and_write_rules.js`,
  `pocketbase/pb_migrations/1758300001_users_role_field.js`,
  `pocketbase/pb_migrations/1758300017_users_role_is_not_self_editable.js`,
  `scripts/isolated-stack.sh`
- Docs: [`../contract.md`](../contract.md) (auth/roles),
  [`../runbooks/local-development.md`](../runbooks/local-development.md)
  ("Demo instance (read-only)")
- Task: `odd/tasks/viewer-role.md`
