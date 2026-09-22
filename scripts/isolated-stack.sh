#!/usr/bin/env bash
# Builds (and tears down) a fully isolated PocketBase + web dev stack in a
# throwaway directory — never the owner's real pocketbase/pb_data, never
# port 8090/3000/4321. This is the standard e2e/screenshot stack from now
# on: it replaces the ad-hoc "start a second PocketBase/Nuxt by hand on
# other ports" recipe that has already caused real accidents against the
# owner's live instance (see web/e2e/helpers.ts's assertPbWritesAllowed
# doc comment, and docs/runbooks/local-development.md).
#
# Usage:
#   scripts/isolated-stack.sh up <dir> [--pb-port N] [--web-port N] \
#       [--seed] [--seed-profile standard|rich] [--engram-url URL] [--no-web]
#   scripts/isolated-stack.sh status <dir>
#   scripts/isolated-stack.sh down <dir> [--purge]
#
# Dependencies: node, pnpm, rsync, lsof, curl — nothing else. No PocketBase
# or Nuxt server-side dependency beyond what's already vendored in this
# repo (pocketbase/bin/pocketbase, web/node_modules via a symlink).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PB_BIN="$REPO_ROOT/pocketbase/bin/pocketbase"

DEFAULT_PB_PORT=8092
DEFAULT_WEB_PORT=3002
FORBIDDEN_PORTS="8090 3000 4321"
SUPERUSER_EMAIL="admin@kankaku.local"
SUPERUSER_PASSWORD="kankaku-dev-admin"
OWNER_EMAIL="david@kankaku.local"
OWNER_PASSWORD="kankaku-dev-owner"
SERVICE_EMAIL="kankaku-sync@kankaku.local"
SERVICE_PASSWORD="kankaku-dev-sync"
DEMO_EMAIL="demo@kankaku.local"
DEMO_PASSWORD="kankaku-demo-viewer"

usage() {
  cat >&2 <<'EOF'
Usage:
  scripts/isolated-stack.sh up <dir> [--pb-port N] [--web-port N] \
      [--seed] [--seed-profile standard|rich] [--engram-url URL] [--no-web]
  scripts/isolated-stack.sh status <dir>
  scripts/isolated-stack.sh down <dir> [--purge]
EOF
}

# Pure string path resolution (no filesystem access, no dependency beyond
# node) — safe to call before the target directory exists, which matters
# because the pb_data-containment refusal check below must run BEFORE
# anything is created.
resolve_abs() {
  node -e "console.log(require('node:path').resolve(process.argv[1]))" "$1"
}

port_is_forbidden() {
  local port="$1" forbidden
  for forbidden in $FORBIDDEN_PORTS; do
    [ "$port" = "$forbidden" ] && return 0
  done
  return 1
}

port_is_listening() {
  lsof -i ":$1" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_http() {
  local url="$1" timeout_s="$2" pid_to_check="${3:-}"
  local waited=0
  while true; do
    if curl -sf -o /dev/null "$url" 2>/dev/null; then
      return 0
    fi
    if [ -n "$pid_to_check" ] && ! kill -0 "$pid_to_check" 2>/dev/null; then
      echo "Process $pid_to_check exited while waiting for $url" >&2
      return 1
    fi
    if [ "$waited" -ge "$timeout_s" ]; then
      echo "Timed out waiting for $url after ${timeout_s}s" >&2
      return 1
    fi
    sleep 1
    waited=$((waited + 1))
  done
}

pb_authenticate() {
  local pb_url="$1"
  curl -fsS "$pb_url/api/collections/_superusers/auth-with-password" \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"$SUPERUSER_EMAIL\",\"password\":\"$SUPERUSER_PASSWORD\"}" \
    | node -e 'process.stdin.on("data",d=>process.stdout.write(JSON.parse(d).token))'
}

# Idempotent: creates the user only if no record with this email exists yet.
create_user_if_missing() {
  local pb_url="$1" token="$2" email="$3" password="$4" role="$5"
  local count
  count="$(curl -fsS \
    "$pb_url/api/collections/users/records?filter=$(node -e "console.log(encodeURIComponent('email=\"'+process.argv[1]+'\"'))" "$email")" \
    -H "Authorization: $token" | node -e 'process.stdin.on("data",d=>process.stdout.write(String(JSON.parse(d).totalItems)))')"

  if [ "$count" != "0" ]; then
    echo "==> $email already exists, skipping"
    return
  fi

  echo "==> Creating $email (role=$role)"
  curl -fsS "$pb_url/api/collections/users/records" \
    -H "Authorization: $token" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"passwordConfirm\":\"$password\",\"role\":\"$role\",\"emailVisibility\":true,\"verified\":true}" \
    >/dev/null
}

cmd_up() {
  local raw_dir="${1:-}"
  [ -n "$raw_dir" ] || { usage; exit 2; }
  shift

  local pb_port="$DEFAULT_PB_PORT"
  local web_port="$DEFAULT_WEB_PORT"
  local do_seed=0
  local seed_profile="standard"
  local engram_url=""
  local no_web=0

  while [ $# -gt 0 ]; do
    case "$1" in
      --pb-port) pb_port="$2"; shift 2 ;;
      --web-port) web_port="$2"; shift 2 ;;
      --seed) do_seed=1; shift ;;
      --seed-profile) seed_profile="$2"; shift 2 ;;
      --engram-url) engram_url="$2"; shift 2 ;;
      --no-web) no_web=1; shift ;;
      *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
    esac
  done

  if [ "$seed_profile" != "standard" ] && [ "$seed_profile" != "rich" ]; then
    echo "Refusing: --seed-profile must be 'standard' or 'rich' (got '$seed_profile')." >&2
    exit 2
  fi

  local abs_dir abs_pb_data
  abs_dir="$(resolve_abs "$raw_dir")"
  abs_pb_data="$(resolve_abs "$REPO_ROOT/pocketbase/pb_data")"
  if [ "$abs_dir" = "$abs_pb_data" ] || [[ "$abs_dir" == "$abs_pb_data"/* ]]; then
    echo "Refusing: <dir> ($abs_dir) resolves inside/equal to the owner's real" >&2
    echo "pocketbase/pb_data ($abs_pb_data). Choose a throwaway directory instead." >&2
    exit 2
  fi

  for p in "$pb_port" "$web_port"; do
    if port_is_forbidden "$p"; then
      echo "Refusing: port $p is reserved for the owner's live stack (8090/3000/4321)." >&2
      exit 2
    fi
  done

  if port_is_listening "$pb_port"; then
    echo "Refusing: port $pb_port is already listening — pick a free --pb-port." >&2
    exit 2
  fi
  if [ "$no_web" != "1" ] && port_is_listening "$web_port"; then
    echo "Refusing: port $web_port is already listening — pick a free --web-port." >&2
    exit 2
  fi

  echo "==> Building isolated stack at $abs_dir (pb-port=$pb_port, web-port=$web_port, no-web=$no_web)"
  mkdir -p "$abs_dir/pb_data" "$abs_dir/pw-out"
  local public_dir="$abs_dir/empty_public"
  mkdir -p "$public_dir"

  echo "==> Upserting superuser $SUPERUSER_EMAIL in $abs_dir/pb_data"
  "$PB_BIN" superuser upsert "$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD" --dir "$abs_dir/pb_data"

  echo "==> Starting PocketBase on 127.0.0.1:$pb_port"
  local pb_log="$abs_dir/pocketbase.log"
  if [ -n "$engram_url" ]; then
    KANKAKU_ENGRAM_URL="$engram_url" "$PB_BIN" serve \
      --http "127.0.0.1:$pb_port" \
      --dir "$abs_dir/pb_data" \
      --migrationsDir "$REPO_ROOT/pocketbase/pb_migrations" \
      --hooksDir "$REPO_ROOT/pocketbase/pb_hooks" \
      --publicDir "$public_dir" \
      >"$pb_log" 2>&1 &
  else
    "$PB_BIN" serve \
      --http "127.0.0.1:$pb_port" \
      --dir "$abs_dir/pb_data" \
      --migrationsDir "$REPO_ROOT/pocketbase/pb_migrations" \
      --hooksDir "$REPO_ROOT/pocketbase/pb_hooks" \
      --publicDir "$public_dir" \
      >"$pb_log" 2>&1 &
  fi
  local pb_pid=$!

  local pb_url="http://127.0.0.1:$pb_port"
  if ! wait_for_http "$pb_url/api/health" 30 "$pb_pid"; then
    echo "PocketBase failed to become healthy; see $pb_log" >&2
    kill "$pb_pid" 2>/dev/null || true
    exit 1
  fi
  echo "==> PocketBase ready ($pb_url), log: $pb_log"

  local token
  token="$(pb_authenticate "$pb_url")"
  create_user_if_missing "$pb_url" "$token" "$OWNER_EMAIL" "$OWNER_PASSWORD" "owner"
  create_user_if_missing "$pb_url" "$token" "$SERVICE_EMAIL" "$SERVICE_PASSWORD" "service"
  create_user_if_missing "$pb_url" "$token" "$DEMO_EMAIL" "$DEMO_PASSWORD" "viewer"

  if [ "$do_seed" = "1" ]; then
    echo "==> Seeding (profile=$seed_profile)"
    PB_URL="$pb_url" PB_SUPERUSER_EMAIL="$SUPERUSER_EMAIL" PB_SUPERUSER_PASSWORD="$SUPERUSER_PASSWORD" \
      SEED_PROFILE="$seed_profile" node "$REPO_ROOT/pocketbase/seed/seed.js"
  fi

  local web_pid=""
  if [ "$no_web" != "1" ]; then
    echo "==> Syncing web/ into $abs_dir/web"
    mkdir -p "$abs_dir/web"
    rsync -a --exclude node_modules --exclude .nuxt --exclude .output "$REPO_ROOT/web/" "$abs_dir/web/"
    ln -sfn "$REPO_ROOT/web/node_modules" "$abs_dir/web/node_modules"

    echo "==> Starting Nuxt dev on http://localhost:$web_port"
    local nuxt_log="$abs_dir/nuxt.log"
    NUXT_PUBLIC_PB_URL="$pb_url" pnpm --dir "$abs_dir/web" dev --port "$web_port" >"$nuxt_log" 2>&1 &
    web_pid=$!

    if ! wait_for_http "http://localhost:$web_port" 90 "$web_pid"; then
      echo "Nuxt dev server failed to become ready; see $nuxt_log" >&2
      kill "$web_pid" 2>/dev/null || true
      kill "$pb_pid" 2>/dev/null || true
      exit 1
    fi
    echo "==> Web ready (http://localhost:$web_port), log: $nuxt_log"
  fi

  {
    echo "PB_PID=$pb_pid"
    echo "PB_PORT=$pb_port"
    echo "WEB_PID=$web_pid"
    if [ "$no_web" != "1" ]; then echo "WEB_PORT=$web_port"; else echo "WEB_PORT="; fi
  } >"$abs_dir/stack.pids"

  echo ""
  echo "=== stack ready: $abs_dir ==="
  echo ""
  echo "# Playwright env (copy/paste):"
  echo "export E2E_ALLOW_PB_WRITES=1"
  echo "export NUXT_PUBLIC_PB_URL=$pb_url"
  if [ "$no_web" != "1" ]; then
    echo "export PW_BASE_URL=http://localhost:$web_port"
  fi
  echo "export PW_OUTPUT_DIR=$abs_dir/pw-out"
  echo ""
  echo "# Accounts (owner/service always created; demo is read-only, role=viewer):"
  echo "#   owner:   $OWNER_EMAIL / $OWNER_PASSWORD"
  echo "#   service: $SERVICE_EMAIL / $SERVICE_PASSWORD"
  echo "#   demo:    $DEMO_EMAIL / $DEMO_PASSWORD"
  echo ""
  echo "Reminder: after a screenshot run against this stack, run"
  echo "  git checkout -- web/docs/screenshots"
  echo "unless the new screenshots were intentional."
  echo ""
  echo "Tear down with: scripts/isolated-stack.sh down $abs_dir [--purge]"
}

cmd_down() {
  local raw_dir="${1:-}"
  [ -n "$raw_dir" ] || { usage; exit 2; }
  shift

  local purge=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --purge) purge=1; shift ;;
      *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
    esac
  done

  local abs_dir pidfile
  abs_dir="$(resolve_abs "$raw_dir")"
  pidfile="$abs_dir/stack.pids"

  local pb_pid="" web_pid="" pb_port="" web_port=""
  if [ -f "$pidfile" ]; then
    # shellcheck disable=SC1090
    source "$pidfile"
    pb_pid="${PB_PID:-}"
    web_pid="${WEB_PID:-}"
    pb_port="${PB_PORT:-}"
    web_port="${WEB_PORT:-}"

    for pid in "$pb_pid" "$web_pid"; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        echo "==> Stopping pid $pid"
        kill "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
      fi
    done
  else
    echo "No stack.pids found at $pidfile — nothing recorded to stop." >&2
  fi

  for port in "$pb_port" "$web_port"; do
    [ -n "$port" ] || continue
    local leftover
    leftover="$(lsof -ti ":$port" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$leftover" ]; then
      echo "==> Killing leftover listener(s) on port $port: $leftover"
      echo "$leftover" | xargs -r kill 2>/dev/null || true
    fi
  done

  sleep 0.5
  for port in "$pb_port" "$web_port"; do
    [ -n "$port" ] || continue
    if port_is_listening "$port"; then
      echo "WARNING: port $port still appears to be listening after teardown." >&2
    fi
  done

  if [ "$purge" = "1" ]; then
    echo "==> Purging $abs_dir"
    rm -rf "$abs_dir"
  else
    echo "==> Kept data dir at $abs_dir (pass --purge to delete it)"
  fi
}

cmd_status() {
  local raw_dir="${1:-}"
  [ -n "$raw_dir" ] || { usage; exit 2; }

  local abs_dir pidfile
  abs_dir="$(resolve_abs "$raw_dir")"
  pidfile="$abs_dir/stack.pids"

  if [ ! -f "$pidfile" ]; then
    echo "No stack.pids found at $pidfile."
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$pidfile"

  echo "PocketBase: pid=${PB_PID:-none} port=${PB_PORT:-none}"
  if [ -n "${PB_PID:-}" ] && kill -0 "${PB_PID}" 2>/dev/null; then
    echo "  process: alive"
  else
    echo "  process: NOT running"
  fi
  if [ -n "${PB_PORT:-}" ] && curl -sf -o /dev/null "http://127.0.0.1:${PB_PORT}/api/health" 2>/dev/null; then
    echo "  health: OK"
  else
    echo "  health: FAILED"
  fi

  echo "Web: pid=${WEB_PID:-none} port=${WEB_PORT:-none}"
  if [ -n "${WEB_PID:-}" ] && kill -0 "${WEB_PID}" 2>/dev/null; then
    echo "  process: alive"
  else
    echo "  process: not running (or started with --no-web)"
  fi
}

main() {
  local cmd="${1:-}"
  [ -n "$cmd" ] || { usage; exit 2; }
  shift

  case "$cmd" in
    up) cmd_up "$@" ;;
    down) cmd_down "$@" ;;
    status) cmd_status "$@" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown command: $cmd" >&2; usage; exit 2 ;;
  esac
}

main "$@"
