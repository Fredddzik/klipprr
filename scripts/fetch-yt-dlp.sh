#!/usr/bin/env bash
# Fetch the pinned yt-dlp into clipagent/src-tauri/bin/ and verify it against the
# checksums yt-dlp publishes for that release.
#
# Used by CI before the Tauri build, and by developers after a fresh clone.
# The binary is gitignored on purpose — see clipagent/src-tauri/tools.lock.
#
#   ./scripts/fetch-yt-dlp.sh            # host platform
#   ./scripts/fetch-yt-dlp.sh windows    # cross-fetch yt-dlp.exe (CI)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$REPO_ROOT/clipagent/src-tauri/bin"
LOCK="$REPO_ROOT/clipagent/src-tauri/tools.lock"

[ -f "$LOCK" ] || { echo "missing $LOCK"; exit 1; }
# shellcheck disable=SC2046
VERSION="$(grep -E '^YT_DLP_VERSION=' "$LOCK" | cut -d= -f2 | tr -d '[:space:]')"
[ -n "$VERSION" ] || { echo "YT_DLP_VERSION not set in $LOCK"; exit 1; }

TARGET="${1:-auto}"
if [ "$TARGET" = "auto" ]; then
  case "$(uname -s)" in
    Darwin) TARGET=macos ;;
    Linux)  TARGET=linux ;;
    *)      TARGET=windows ;;
  esac
fi

case "$TARGET" in
  macos)   ASSET=yt-dlp_macos; OUT="$BIN_DIR/yt-dlp" ;;
  linux)   ASSET=yt-dlp_linux; OUT="$BIN_DIR/yt-dlp" ;;
  windows) ASSET=yt-dlp.exe;   OUT="$BIN_DIR/yt-dlp.exe" ;;
  *) echo "unknown target: $TARGET"; exit 1 ;;
esac

BASE="https://github.com/yt-dlp/yt-dlp/releases/download/$VERSION"
mkdir -p "$BIN_DIR"

# Already the right version? Skip the download.
if [ -x "$OUT" ] && [ "$("$OUT" --version 2>/dev/null || true)" = "$VERSION" ]; then
  echo "yt-dlp $VERSION already present at $OUT"
  exit 0
fi

echo "Fetching $ASSET $VERSION …"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl --fail --location --silent --show-error -o "$TMP/$ASSET" "$BASE/$ASSET"
curl --fail --location --silent --show-error -o "$TMP/SUMS" "$BASE/SHA2-256SUMS"

# Verify against the project's own published sums for this exact release. A hardcoded
# hash in this repo would only prove we downloaded what we downloaded last time.
EXPECTED="$(grep -E "[[:space:]]\*?${ASSET}\$" "$TMP/SUMS" | awk '{print $1}' | head -1)"
[ -n "$EXPECTED" ] || { echo "no checksum for $ASSET in SHA2-256SUMS"; exit 1; }

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$TMP/$ASSET" | awk '{print $1}')"
else
  ACTUAL="$(shasum -a 256 "$TMP/$ASSET" | awk '{print $1}')"
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "CHECKSUM MISMATCH for $ASSET"
  echo "  expected $EXPECTED"
  echo "  actual   $ACTUAL"
  exit 1
fi

mv "$TMP/$ASSET" "$OUT"
chmod +x "$OUT"
echo "$VERSION" > "$BIN_DIR/yt-dlp.version"
echo "yt-dlp $VERSION verified and installed at $OUT"
