# Connect kankaku to the hub

How to point a real pi/kankaku session at a running local hub, using the
branch build (`feat/pocketbase-hub`) rather than the published `0.4.6`.

## 1. Have the hub running

Follow [`local-development.md`](local-development.md)'s kankaku-hub steps
first — you need `http://127.0.0.1:8090` up, with the dev accounts created
and demo data seeded.

## 2. Provide credentials to kankaku

Either set env vars for the current shell/session:

```bash
export KANKAKU_PB_URL=http://127.0.0.1:8090
export KANKAKU_PB_EMAIL=kankaku-sync@kankaku.local
export KANKAKU_PB_PASSWORD=kankaku-dev-sync
```

...or write `~/.kankaku/credentials.json` (recommended `chmod 600`):

```json
{
  "url": "http://127.0.0.1:8090",
  "email": "kankaku-sync@kankaku.local",
  "password": "kankaku-dev-sync"
}
```

Env vars take precedence per field over the file — see
[`../specs/hub-credentials-and-config.md`](../specs/hub-credentials-and-config.md).
Note `127.0.0.1` is accepted over plain HTTP only because it is a
recognized local host; a real deployment must use `https:`.

## 3. Load the branch build in pi

To try the unpublished branch build without installing it:

```bash
pi -e /absolute/path/to/kankaku
```

(`-e` points at the extension's directory; pi resolves the entry point
itself via the package's `pi.extensions` field, `["./src/extension.ts"]`.)

To install it more permanently instead:

```bash
pi install /absolute/path/to/kankaku          # local path
pi install git:github.com/soyunninja/kankaku  # from a git remote, once pushed
pi install npm:kankaku                        # once published, see release-kankaku.md
```

`pi install` writes to `~/.pi/agent/settings.json` (global) or, with `-l`,
`.pi/settings.json` (project-local).

## 4. First run

Start a pi session inside a project directory. As an orchestrator session
with UI, kankaku's `session_start` handler runs
[target selection](../specs/target-selection.md):

- If `<KANKAKU_DIR>/config.json` already has `clientId`/`projectId`, or the
  cached catalog's `repo_paths` maps this directory, the target resolves
  **silently** — check the status bar for `💼 <client> · <project>`.
- Otherwise, you are shown a client picker, then a project picker, each
  with a `— skip —` option. Pick one of the seeded demo clients/projects
  (see [`local-development.md`](local-development.md) for the seed
  dataset), or skip.
- If you pick, you may be asked "Remember for this repository?" — answering
  yes writes `clientId`/`projectId` into `<KANKAKU_DIR>/config.json` for
  next time.

## 5. Confirm it worked

```
/kankaku target        # shows the currently resolved target
/kankaku catalog refresh
/kankaku sync status    # shows the watermark / last run, no network call
/kankaku sync           # manual, unthrottled sync push
```

After `/kankaku sync`, open the hub's web dashboard
(`http://127.0.0.1:8090/`, or `pnpm dev` on `localhost:3000` — see
[`local-development.md`](local-development.md)) and confirm the new
`task_entries` row appears (it should update live via the realtime
subscription, no reload needed).

## What to expect

- Nothing blocks on the network at session start — a stale or absent
  catalog degrades to the pre-hub free-text picker, not a hang (see
  [`../specs/catalog-cache.md`](../specs/catalog-cache.md)).
- Subagents never ask for a target; they inherit the orchestrator's.
- Sync never happens inline with a prompt — it is a separate, throttled
  background step (or the manual command above).

## Related

- [`../specs/hub-credentials-and-config.md`](../specs/hub-credentials-and-config.md), [`../specs/target-selection.md`](../specs/target-selection.md), [`../specs/sync-push.md`](../specs/sync-push.md)
- [`troubleshooting.md`](troubleshooting.md)
