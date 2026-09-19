#!/usr/bin/env bash
# Creates the three local dev accounts documented in ESTADO.md:
#   - a PocketBase superuser (via the CLI, works whether or not the
#     server is running)
#   - the "owner" human user and the "kankaku-sync" service user (via the
#     REST API as the superuser, so scripts/dev.sh must be running first)
#
# Safe to re-run: `superuser upsert` upserts by email, and the two regular
# users are created only if they don't already exist.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PB_BIN="$REPO_ROOT/pocketbase/bin/pocketbase"
PB_DATA="$REPO_ROOT/pocketbase/pb_data"
PB_URL="${PB_URL:-http://127.0.0.1:8090}"

SUPERUSER_EMAIL="admin@kankaku.local"
SUPERUSER_PASSWORD="kankaku-dev-admin"
OWNER_EMAIL="david@kankaku.local"
OWNER_PASSWORD="kankaku-dev-owner"
SERVICE_EMAIL="kankaku-sync@kankaku.local"
SERVICE_PASSWORD="kankaku-dev-sync"

if [ ! -x "$PB_BIN" ]; then
  echo "PocketBase binary not found at $PB_BIN" >&2
  echo "Run scripts/pb-download.sh first." >&2
  exit 1
fi

echo "==> Upserting superuser $SUPERUSER_EMAIL"
"$PB_BIN" superuser upsert "$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD" --dir "$PB_DATA"

if ! curl -fsS -o /dev/null "$PB_URL/api/health"; then
  echo "PocketBase is not reachable at $PB_URL." >&2
  echo "Start it first with scripts/dev.sh, then re-run this script." >&2
  exit 1
fi

SUPERUSER_TOKEN="$(curl -fsS "$PB_URL/api/collections/_superusers/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"$SUPERUSER_EMAIL\",\"password\":\"$SUPERUSER_PASSWORD\"}" \
  | node -e 'process.stdin.on("data",d=>process.stdout.write(JSON.parse(d).token))')"

create_user_if_missing() {
  local email="$1" password="$2" role="$3"

  local count
  count="$(curl -fsS \
    "$PB_URL/api/collections/users/records?filter=$(node -e "console.log(encodeURIComponent('email=\"'+process.argv[1]+'\"'))" "$email")" \
    -H "Authorization: $SUPERUSER_TOKEN" | node -e 'process.stdin.on("data",d=>process.stdout.write(String(JSON.parse(d).totalItems)))')"

  if [ "$count" != "0" ]; then
    echo "==> $email already exists, skipping"
    return
  fi

  echo "==> Creating $email (role=$role)"
  curl -fsS "$PB_URL/api/collections/users/records" \
    -H "Authorization: $SUPERUSER_TOKEN" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"passwordConfirm\":\"$password\",\"role\":\"$role\",\"emailVisibility\":true,\"verified\":true}" \
    > /dev/null
}

create_user_if_missing "$OWNER_EMAIL" "$OWNER_PASSWORD" "owner"
create_user_if_missing "$SERVICE_EMAIL" "$SERVICE_PASSWORD" "service"

echo "==> Done. See ESTADO.md for the full list of local dev credentials."
