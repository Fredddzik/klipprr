#!/usr/bin/env bash
# Fetch the pinned arm64 ffmpeg + ffprobe into clipagent/src-tauri/bin/ and verify them.
#
# The binaries are built by .github/workflows/build-ffmpeg.yml (scripts/build-ffmpeg.sh)
# and published as an asset on a pre-release of this repository. Used by CI before the
# Tauri build, and by developers after a fresh clone. macOS only; the Windows jobs fetch
# their own build.
#
#   ./scripts/fetch-ffmpeg.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="$REPO_ROOT/clipagent/src-tauri/bin"
LOCK="$REPO_ROOT/clipagent/src-tauri/tools.lock"
REPO="${FFMPEG_REPO:-Fredddzik/klipprr}"
# Overridable so the script can be tested against a local copy of a build.
BASE_URL="${FFMPEG_BASE_URL:-https://github.com/$REPO/releases/download}"

lock() { grep -E "^$1=" "$LOCK" | cut -d= -f2 | tr -d '[:space:]'; }
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
ACTUAL="$(shasum -a 256 "$TMP/$NAME.tar.gz" | awk '{print $1}')"
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
