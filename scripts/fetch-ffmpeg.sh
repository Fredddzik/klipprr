#!/usr/bin/env bash
# Fetch the pinned ffmpeg + ffprobe into clipagent/src-tauri/bin/ and verify them.
#
# macOS (arm64): built by .github/workflows/build-ffmpeg.yml (scripts/build-ffmpeg.sh).
# Windows (x64): BtbN's GPL build, mirrored unchanged. Both are assets on pre-releases of
# this repository, pinned by hash in tools.lock. Used by CI before the Tauri build, and by
# developers after a fresh clone.
#
#   ./scripts/fetch-ffmpeg.sh            # macOS
#   ./scripts/fetch-ffmpeg.sh windows    # Windows (Git Bash on the CI runner)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$REPO_ROOT/clipagent/src-tauri/bin"
LOCK="$REPO_ROOT/clipagent/src-tauri/tools.lock"
REPO="${FFMPEG_REPO:-Fredddzik/klipprr}"
# Overridable so the script can be tested against a local copy of a build.
BASE_URL="${FFMPEG_BASE_URL:-https://github.com/$REPO/releases/download}"

lock() { grep -E "^$1=" "$LOCK" | cut -d= -f2 | tr -d '[:space:]'; }
sha256() { if command -v shasum >/dev/null; then shasum -a 256 "$1"; else sha256sum "$1"; fi | awk '{print $1}'; }

if [ "${1:-}" = windows ]; then
  NAME="$(lock FFMPEG_WINDOWS_BUILD)"
  EXPECTED="$(lock FFMPEG_WINDOWS_SHA256)"
  mkdir -p "$BIN_DIR"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  echo "Fetching $NAME …"
  curl --fail --location --silent --show-error -o "$TMP/$NAME.zip" "$BASE_URL/$NAME/$NAME.zip"
  ACTUAL="$(sha256 "$TMP/$NAME.zip")"
  if [ "$ACTUAL" != "$EXPECTED" ]; then
    echo "CHECKSUM MISMATCH for $NAME"
    echo "  expected $EXPECTED"
    echo "  actual   $ACTUAL"
    exit 1
  fi
  unzip -q "$TMP/$NAME.zip" -d "$TMP/x"
  find "$TMP/x" -name ffmpeg.exe -exec cp {} "$BIN_DIR/" \;
  find "$TMP/x" -name ffprobe.exe -exec cp {} "$BIN_DIR/" \;
  find "$TMP/x" -name LICENSE.txt -exec cp {} "$BIN_DIR/ffmpeg-LICENSE.txt" \;
  [ -f "$BIN_DIR/ffmpeg.exe" ] && [ -f "$BIN_DIR/ffprobe.exe" ] || { echo "ffmpeg.exe/ffprobe.exe missing from $NAME"; exit 1; }
  echo "ffmpeg $NAME verified and installed in $BIN_DIR"
  exit 0
fi

NAME="$(lock FFMPEG_MACOS_BUILD)"
EXPECTED="$(lock FFMPEG_MACOS_SHA256)"
[ -n "$NAME" ] && [ -n "$EXPECTED" ] || {
  echo "FFMPEG_MACOS_BUILD / FFMPEG_MACOS_SHA256 not set in $LOCK."
  echo "Run the 'Build ffmpeg' workflow; it publishes a build and fills these in."
  exit 1; }

mkdir -p "$BIN_DIR"
STAMP="$BIN_DIR/ffmpeg.build"
if [ -x "$BIN_DIR/ffmpeg" ] && [ -x "$BIN_DIR/ffprobe" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$NAME" ]; then
  echo "ffmpeg $NAME already present"
  exit 0
fi

echo "Fetching $NAME …"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl --fail --location --silent --show-error -o "$TMP/$NAME.tar.gz" \
  "$BASE_URL/$NAME/$NAME.tar.gz"

# The hash is pinned here, not fetched alongside the file: we produced this build, so
# the lock is the record of which bytes we tested and ship.
ACTUAL="$(sha256 "$TMP/$NAME.tar.gz")"
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "CHECKSUM MISMATCH for $NAME"
  echo "  expected $EXPECTED"
  echo "  actual   $ACTUAL"
  exit 1
fi

tar -xzf "$TMP/$NAME.tar.gz" -C "$TMP"
install -m 755 "$TMP/ffmpeg" "$TMP/ffprobe" "$BIN_DIR/"
# Ships inside the app next to the binaries, as the GPL requires.
install -m 644 "$TMP/ffmpeg-LICENSE.txt" "$BIN_DIR/"
echo "$NAME" > "$STAMP"
echo "ffmpeg $NAME verified and installed in $BIN_DIR"
