#!/usr/bin/env bash
# Starts PocketBase for local development on 127.0.0.1:8090, applying
# pb_migrations automatically. --publicDir is prepared for the future Nuxt
# static build (phase 3, not built yet).
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
  --publicDir "$REPO_ROOT/web/.output/public"
