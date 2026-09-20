#!/usr/bin/env bash
# Starts PocketBase for local development on 127.0.0.1:8090, applying
# pb_migrations automatically and loading pb_hooks (custom routes such as
# the favicon fetcher — see docs/architecture/hub-backend.md). --publicDir
# serves the static web build (`npm run web:build`), so this one process
# serves both API and web.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PB_BIN="$REPO_ROOT/pocketbase/bin/pocketbase"

if [ ! -x "$PB_BIN" ]; then
  echo "PocketBase binary not found at $PB_BIN" >&2
  echo "Run scripts/pb-download.sh first." >&2
  exit 1
fi

exec "$PB_BIN" serve \
  --http 127.0.0.1:8090 \
  --dir "$REPO_ROOT/pocketbase/pb_data" \
  --migrationsDir "$REPO_ROOT/pocketbase/pb_migrations" \
  --hooksDir "$REPO_ROOT/pocketbase/pb_hooks" \
  --publicDir "$REPO_ROOT/web/.output/public"
