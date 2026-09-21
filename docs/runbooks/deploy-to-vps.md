# Deploy to a VPS

| | |
|---|---|
| Status | **PLANNED — not yet executed.** Nothing in this runbook has been run against a real server. It is a design sketch for [phase-deployment-to-vps](../phases/phase-deployment-to-vps.md), written from the proposal (§9.1) and the local single-process shape already proven in [`local-development.md`](local-development.md), not from operational experience. |

## Prerequisites (planned)

- A VPS with a public IP/domain, SSH access.
- `web/` built (`pnpm generate`) and `pocketbase/bin/pocketbase` for the
  target OS/arch (`scripts/pb-download.sh`).
- A domain pointed at the VPS, for TLS.

## 1. Single binary + pb_public

Copy to the VPS:

- `pocketbase/bin/pocketbase` (the binary for the VPS's OS/arch — re-run
  `scripts/pb-download.sh` there, or cross-copy if arch matches).
- `pocketbase/pb_migrations/` (schema).
- `web/.output/public/` (the static build, from `pnpm generate`) — serve it
  via PocketBase's `--publicDir`, exactly as in local single-process mode
  (see [ADR 0015](../adr/0015-static-spa-served-by-pocketbase.md)).
- Do **not** copy the local `pocketbase/pb_data/` — start fresh so
  migrations apply cleanly and no throwaway dev/demo data reaches
  production.

```bash
./pocketbase serve \
  --http 127.0.0.1:8090 \
  --dir /path/on/vps/pb_data \
  --migrationsDir /path/on/vps/pb_migrations \
  --publicDir /path/on/vps/pb_public
```

## 2. systemd unit (planned sketch)

```ini
[Unit]
Description=kankaku-hub PocketBase
After=network.target

[Service]
Type=simple
User=kankaku
ExecStart=/opt/kankaku-hub/pocketbase serve \
  --http 127.0.0.1:8090 \
  --dir /opt/kankaku-hub/pb_data \
  --migrationsDir /opt/kankaku-hub/pb_migrations \
  --publicDir /opt/kankaku-hub/pb_public
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Adjust paths/user for the actual deployment; not verified against a real
system.

## 3. Reverse proxy with TLS (Caddy example, planned sketch)

```
hub.example.com {
    reverse_proxy 127.0.0.1:8090
}
```

Caddy's automatic HTTPS (Let's Encrypt) satisfies the "HTTPS only" rule
kankaku's client enforces (see
[`../specs/security-and-privacy.md`](../specs/security-and-privacy.md)).
Any reverse proxy with automatic TLS renewal works equally well; Caddy is
suggested for its minimal configuration.

## 4. Backups of pb_data (planned)

`pb_data` is a SQLite database plus files. A minimal approach: stop
accepting writes briefly (or use SQLite's online backup via PocketBase's
own backup feature, `pocketbase/bin/pocketbase backup`, once verified) and
copy the directory off-box on a schedule (cron + rsync to another host, or
a VPS provider's snapshot feature). Not yet implemented or tested for this
project.

## 4b. Rolling back a migration in production

`pocketbase migrate down` does NOT survive the next restart of the
`systemd` unit above: PocketBase re-applies every migration file present
in `--migrationsDir` on every `serve` startup, so a service restart
silently re-applies whatever `migrate down` just undid. Before touching
production schema:

1. Back up `pb_data` (§4) first — always, but especially before a
   rollback, since a dropped column's data cannot be recovered by either
   option below.
2. Prefer a NEW forward migration that reverts the change, rather than
   `migrate down` — it survives every future restart by construction and
   never risks a deploy racing a restart between the `down` and the file
   removal. This is what `1758300018_task_entries_daily_totals_sentinel.js`
   does to fix `1758300015` rather than editing that file.
3. If a file must be removed instead, run `migrate down` on THIS instance
   first, then delete the migration file from the deployed
   `--migrationsDir` (and from the repo, via a commit) before the next
   restart — deleting the file without running `down` first leaves the
   schema change applied with no record of it.

Full rollback procedure and the data-loss warning:
[`troubleshooting.md`](troubleshooting.md#pocketbase-migrate-down-doesnt-survive-a-restart),
[`../architecture/hub-backend.md`](../architecture/hub-backend.md#migrations-policy).

## 5. Creating the owner and service accounts (planned)

Reuse `scripts/create-dev-accounts.sh` as a starting point, but with real,
non-throwaway credentials:

```bash
PB_URL=https://hub.example.com \
SUPERUSER_EMAIL=<real-admin-email> SUPERUSER_PASSWORD=<real-strong-password> \
scripts/create-dev-accounts.sh
```

Rotate every credential currently documented as a "local dev" value in
[`local-development.md`](local-development.md) — none of those are safe to
reuse in production.

## 6. Tightening rules (planned)

Review [`../specs/hub-schema-and-access-rules.md`](../specs/hub-schema-and-access-rules.md)
against a real (not local-dev) threat model before going live — in
particular, confirm the service account's write scope is still exactly
`task_entries`/`work_records` and nothing more.

## 7. Smoke checks (planned)

- `curl https://hub.example.com/api/health`
- Log in to the web app with the real owner account.
- Point one real kankaku install at the deployed URL (see
  [`connect-kankaku-to-hub.md`](connect-kankaku-to-hub.md), swapping in the
  production URL/credentials) and confirm a sync round-trip.

## Related

- [ADR 0010](../adr/0010-everything-local-for-now.md), [ADR 0015](../adr/0015-static-spa-served-by-pocketbase.md)
- [phase-deployment-to-vps](../phases/phase-deployment-to-vps.md)
- [`../specs/security-and-privacy.md`](../specs/security-and-privacy.md)
