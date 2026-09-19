#!/usr/bin/env bash
# Downloads the pinned PocketBase release for the current OS/arch into
# pocketbase/bin/. The binary itself is gitignored; this script is what
# makes it reproducible for anyone cloning the repo.
set -euo pipefail

PB_VERSION="${PB_VERSION:-0.40.4}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$REPO_ROOT/pocketbase/bin"

os="$(uname -s)"
arch="$(uname -m)"

case "$os" in
  Darwin) pb_os="darwin" ;;
  Linux) pb_os="linux" ;;
  *)
    echo "Unsupported OS: $os" >&2
    exit 1
    ;;
esac

case "$arch" in
  arm64|aarch64) pb_arch="arm64" ;;
  x86_64|amd64) pb_arch="amd64" ;;
  *)
    echo "Unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

asset="pocketbase_${PB_VERSION}_${pb_os}_${pb_arch}.zip"
url="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/${asset}"

echo "Downloading PocketBase ${PB_VERSION} for ${pb_os}/${pb_arch}..."
mkdir -p "$BIN_DIR"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

curl -fsSL "$url" -o "$tmp_dir/$asset"
unzip -o -q "$tmp_dir/$asset" -d "$tmp_dir"

install -m 0755 "$tmp_dir/pocketbase" "$BIN_DIR/pocketbase"
[ -f "$tmp_dir/CHANGELOG.md" ] && cp "$tmp_dir/CHANGELOG.md" "$BIN_DIR/CHANGELOG.md"
[ -f "$tmp_dir/LICENSE.md" ] && cp "$tmp_dir/LICENSE.md" "$BIN_DIR/LICENSE.md"

echo "Installed $("$BIN_DIR/pocketbase" --version) at $BIN_DIR/pocketbase"
