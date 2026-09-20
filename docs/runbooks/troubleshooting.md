# Troubleshooting

Only issues with a code-backed explanation are listed here — see the linked
spec/architecture doc for the mechanism behind each fix.

## Hub unreachable

**Symptom**: session start doesn't show a picker, or shows a one-time
notice instead of the catalog; `/kankaku sync` fails immediately.

**Why**: kankaku never blocks on the network. With no cache and an
unreachable hub, it falls back to the pre-hub free-text `client` behaviour
rather than hanging — see [`../specs/catalog-cache.md`](../specs/catalog-cache.md)
and [`../adr/0005-reads-cached-writes-queued.md`](../adr/0005-reads-cached-writes-queued.md).

**Fix**: confirm the hub is actually running
(`curl http://127.0.0.1:8090/api/health` locally, or the deployed URL) and
that `KANKAKU_PB_URL`/`~/.kankaku/credentials.json` point at it — see
[`connect-kankaku-to-hub.md`](connect-kankaku-to-hub.md).

## Picker not shown

**Symptom**: expected the client/project picker, but the session started
silently.

**Why**: target resolution checks, in order, the session's own
already-picked/skipped state, then `<KANKAKU_DIR>/config.json`, then the
cached catalog's `repo_paths` for the current directory — see
[`../specs/target-selection.md`](../specs/target-selection.md). Any of
these resolving silently suppresses the picker by design.

**Fix**: `/kankaku target pick` forces the picker regardless of an existing
resolution. To fully reset, also clear `<KANKAKU_DIR>/config.json`'s
`clientId`/`projectId` if a stale repo mapping is the cause.

## Sync stuck or "locked"

**Symptom**: `/kankaku sync` reports it's already running, or nothing
happens.

**Why**: sync uses an exclusive-create cross-process lock file
(`<KANKAKU_DIR>/sync.lock`) — see
[`../specs/auto-sync-and-locking.md`](../specs/auto-sync-and-locking.md).
A crashed process can leave a lock behind.

**Fix**: a lock older than 5 minutes, or owned by a pid that's no longer
alive, is automatically recovered on the next attempt — wait and retry.
`/kankaku sync status` shows the current state without attempting to
acquire the lock. If a lock is stuck sooner than 5 minutes and you're
certain the owning process is dead, it is safe to delete
`<KANKAKU_DIR>/sync.lock` manually (this is exactly what the automatic
stale-lock recovery would eventually do).

## Stale catalog

**Symptom**: a recently added client/project doesn't show up in the
picker.

**Why**: the catalog cache has a 6-hour TTL — see
[`../specs/catalog-cache.md`](../specs/catalog-cache.md). A stale cache is
shown immediately by design, with a background refresh updating it for
next time.

**Fix**: `/kankaku catalog refresh` forces an immediate refresh.

## 400 on create (sync)

**Symptom**: a sync attempt reports a `400` error for a task.

**Two distinct cases**:

1. **`data.task_id.code == "validation_not_unique"`** — expected and
   handled automatically: this means the row already exists, and the sync
   client falls back to look-up-then-update. If you see this surfaced as a
   user-facing error rather than handled silently, that's a real bug — see
   [`../specs/sync-push.md`](../specs/sync-push.md) requirement
   `SYNC-REQ-006`.
2. **Any other `400`** (commonly a bare `{"data":{},"message":"Failed to
   create record.","status":400}`) — a rule mismatch or missing required
   field, not something to retry blindly. The most common cause: the
   service account (`role: "service"`) cannot create/update/delete
   `clients`/`projects`/`tasks` — only `task_entries`/`work_records`. If a
   task references a project that no longer exists, the sync client cannot
   auto-create it; this is recorded in the local `failed` list rather than
   retried forever — see
   [`../architecture/hub-backend.md`](../architecture/hub-backend.md#access-rules-summary).

## Wrong theme flash

**Symptom**: the web app briefly shows the light theme before switching to
dark on load.

**Why**: `@nuxtjs/color-mode` is configured with `preference: 'dark'`,
`fallback: 'dark'` — this should prevent a flash by design (verified with
Playwright on a fresh profile per `ESTADO.md`). If you're seeing a flash,
it's likely a genuine regression, not expected behavior — check
`web/nuxt.config.ts`'s `colorMode` block hasn't been changed, and that
`localStorage` under the key `kankaku-color-mode` isn't being cleared or
blocked (private browsing, blocked site data) in a way that skips the
configured fallback.

## `/login` redirect gotcha with static hosting

**Symptom**: after `pnpm generate` + serving via PocketBase's
`--publicDir`, navigating directly to `/login` (or any non-root route)
produces broken API calls (e.g. requests going to `/login/api/...`), or an
unexpected redirect to a trailing-slash URL.

**Why**: with `ssr: false`, Nuxt's default prerender used to emit one
`index.html` per route (`login/index.html`, ...). PocketBase's static file
server treats such a folder as a directory and 301-redirects to the
trailing-slash URL, which breaks the PocketBase SDK's relative request URL
resolution (`api/...` resolves against the *current path*). Fixed two
independent ways — see
[`../architecture/hub-web.md`](../architecture/hub-web.md#the-nuxt-generate--pocketbase-static-serving-gotcha):
`nitro.prerender.routes = ['/']` in `nuxt.config.ts`, and the PocketBase
client plugin using `window.location.origin` in production.

**Fix if this regresses**: confirm `web/nuxt.config.ts`'s
`nitro.prerender` block still only prerenders `/`, and that
`web/app/plugins/pocketbase.client.ts` still resolves to
`window.location.origin` rather than a relative/empty base in production.

## Icon not appearing

**Symptom**: a client always shows its initials avatar, never its site's
favicon, even after pressing the refresh-icon button in its detail sheet
or saving a `website` change.

**Why**: several independent, by-design reasons, roughly in likelihood
order — see [`../specs/client-favicons.md`](../specs/client-favicons.md):

1. The connected PocketBase instance hasn't applied
   `1758300012_clients_favicon_fields.js` yet (the owner hasn't restarted
   since this feature landed — see `ESTADO.md`). `favicon` reads as
   `undefined`, which `ClientAvatar` treats the same as no favicon: this
   is the expected degrade-gracefully behavior, not a bug.
2. The refresh actually ran and failed — check the toast it showed (or
   `clients.favicon_checked_at`/`favicon_source` on the record via the
   PocketBase Admin UI): `no_website` (nothing to fetch), `fetch_failed`,
   `no_icon_found`, `unsupported_type`, `too_large`, or `blocked_host`
   (the client's own site resolves to a private/loopback address — see
   [`../architecture/hub-backend.md`](../architecture/hub-backend.md)).
3. The client's `website` hasn't actually changed since the last save —
   the automatic background refresh only fires on a real change (see
   `FAVICON-REQ-009`); use the manual refresh-icon button to force a
   retry without editing the field.
4. The favicon *was* fetched, but the browser's request for the image
   itself failed client-side (network hiccup, the file was deleted from
   `pb_data/storage` out of band) — `ClientAvatar`'s `@error` handler
   falls back to initials silently; a page reload re-attempts the same
   URL (now cache-busted by `updated`, so it isn't served from a stale
   browser cache entry either).

**Fix**: restart `npm run dev:all` once if the migration/hook haven't
been applied yet; otherwise open the client's detail sheet and press the
refresh-icon button, then read the resulting toast for the actual reason.

## Related

- [`local-development.md`](local-development.md), [`connect-kankaku-to-hub.md`](connect-kankaku-to-hub.md)
- [`../contract.md`](../contract.md#gotchas-for-the-sync-client-author)
