#!/usr/bin/env bash
# Development mode in one terminal: PocketBase (API) on 127.0.0.1:8090 plus
# the Nuxt dev server with hot reload on http://localhost:3000. Ctrl+C stops
# both. No static build is needed or used here; `npm run web:build` is only
# for the single-process, production-like mode served by `npm run dev`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PB_PID=""

cleanup() {
  trap - INT TERM EXIT
  if [ -n "$PB_PID" ] && kill -0 "$PB_PID" 2>/dev/null; then
    kill "$PB_PID" 2>/dev/null || true
    wait "$PB_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

if curl -sf http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
  echo "==> PocketBase already running on 127.0.0.1:8090, reusing it"
else
  echo "==> Starting PocketBase on http://127.0.0.1:8090"
  "$REPO_ROOT/scripts/dev.sh" >"$REPO_ROOT/pocketbase/dev.log" 2>&1 &
  PB_PID=$!
  for _ in $(seq 1 40); do
    curl -sf http://127.0.0.1:8090/api/health >/dev/null 2>&1 && break
    if ! kill -0 "$PB_PID" 2>/dev/null; then
      echo "PocketBase failed to start; see pocketbase/dev.log" >&2
      exit 1
    fi
    sleep 0.25
  done
  echo "==> PocketBase ready (log: pocketbase/dev.log)"
fi

echo "==> Starting the web dev server on http://localhost:3000"
pnpm --dir "$REPO_ROOT/web" dev
