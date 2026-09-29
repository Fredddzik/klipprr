#!/usr/bin/env bash
# Build the arm64 macOS ffmpeg + ffprobe that ship inside Klipprr.
#
# There is no official static macOS build, so we compile it from pinned, checksummed
# sources. Run by .github/workflows/build-ffmpeg.yml, which publishes the result as a
# GitHub release asset. Releases never run this: they download that asset
# (scripts/fetch-ffmpeg.sh), so a release does not pay the build time.
#
#   ./scripts/build-ffmpeg.sh [out_dir]      # default: ./ffmpeg-dist
#
# Needs on PATH: clang (Xcode CLT), make, git, meson, ninja, pkg-config.
#
# Only what the app actually uses is enabled:
#   h264_videotoolbox + libx264  video encode (download.rs, http.rs preview proxies)
#   aac (native)                 audio encode
#   libmp3lame                   MP3 export (FR-5)
#   libdav1d                     AV1 decode; YouTube serves AV1 and ffmpeg has no
#                                software AV1 decoder of its own
#   securetransport              HTTPS input; yt-dlp hands ffmpeg URLs for section downloads
set -euo pipefail

# ---- Pinned sources. Bump a version here, update its hash, bump REVISION. -------------
REVISION=1
FFMPEG_VERSION=9.0.2
FFMPEG_SHA256=8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e
DAV1D_VERSION=1.5.4
DAV1D_SHA256=686616b7c69eb88d44459391ab25cac13b6647a3b288835c5784e71c1514a5c5
LAME_VERSION=3.100
LAME_SHA256=ddfe36cab873794038ae2c1210557ad34857a4b6bdc515785d1da9e175b1da1e
# x264 has no releases; its stable branch is the release. Pinned by commit, which git
# verifies as a content hash on checkout.
X264_COMMIT=b35605ace3ddf7c1a5d67a2eb553f034aef41d55
# Apple Silicon Macs start at macOS 11, so nothing older is reachable anyway.
export MACOSX_DEPLOYMENT_TARGET=11.0
# ---------------------------------------------------------------------------------------

[ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || {
  echo "must run on an arm64 Mac (got $(uname -s) $(uname -m))"; exit 1; }
for t in clang make git meson ninja pkg-config; do
  command -v "$t" >/dev/null || { echo "missing build tool: $t"; exit 1; }
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$(mkdir -p "${1:-$REPO_ROOT/ffmpeg-dist}" && cd "${1:-$REPO_ROOT/ffmpeg-dist}" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
PREFIX="$WORK/prefix"
mkdir -p "$PREFIX" "$WORK/src"
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
# pkg-config must never find a Homebrew copy of these libraries: a dynamic link to
# /opt/homebrew would work on this machine and fail on every customer's.
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
JOBS="$(sysctl -n hw.ncpu)"

fetch() { # url file sha256
  curl --fail --location --silent --show-error -o "$WORK/src/$2" "$1"
  echo "$3  $WORK/src/$2" | shasum -a 256 -c - >/dev/null || {
    echo "checksum mismatch for $2"; exit 1; }
  tar -xf "$WORK/src/$2" -C "$WORK/src"
}

echo "==> dav1d $DAV1D_VERSION"
fetch "https://downloads.videolan.org/pub/videolan/dav1d/$DAV1D_VERSION/dav1d-$DAV1D_VERSION.tar.xz" \
  "dav1d.tar.xz" "$DAV1D_SHA256"
meson setup "$WORK/build-dav1d" "$WORK/src/dav1d-$DAV1D_VERSION" \
  --prefix="$PREFIX" --libdir=lib --buildtype=release --default-library=static \
  -Denable_tools=false -Denable_tests=false >/dev/null
ninja -C "$WORK/build-dav1d" install >/dev/null

echo "==> x264 $X264_COMMIT"
git init -q "$WORK/src/x264"
git -C "$WORK/src/x264" fetch -q --depth 1 https://code.videolan.org/videolan/x264.git "$X264_COMMIT"
git -C "$WORK/src/x264" checkout -q FETCH_HEAD
(cd "$WORK/src/x264" && ./configure --prefix="$PREFIX" --enable-static --disable-cli \
  --enable-pic >/dev/null && make -j"$JOBS" >/dev/null && make install >/dev/null)

echo "==> lame $LAME_VERSION"
fetch "https://downloads.sourceforge.net/project/lame/lame/$LAME_VERSION/lame-$LAME_VERSION.tar.gz" \
  "lame.tar.gz" "$LAME_SHA256"
# lame 3.100 lists a symbol that no longer exists; the linker rejects the export file.
sed -i '' '/lame_init_old/d' "$WORK/src/lame-$LAME_VERSION/include/libmp3lame.sym"
(cd "$WORK/src/lame-$LAME_VERSION" && ./configure --prefix="$PREFIX" --enable-static \
  --disable-shared --disable-frontend --disable-decoder >/dev/null \
  && make -j"$JOBS" >/dev/null && make install >/dev/null)

echo "==> ffmpeg $FFMPEG_VERSION"
fetch "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" "ffmpeg.tar.xz" "$FFMPEG_SHA256"
(cd "$WORK/src/ffmpeg-$FFMPEG_VERSION" && ./configure \
  --prefix="$PREFIX" \
  --pkg-config-flags="--static" \
  --extra-cflags="-I$PREFIX/include" \
  --extra-ldflags="-L$PREFIX/lib" \
  --extra-libs="-liconv" \
  --enable-gpl --enable-version3 \
  --enable-static --disable-shared \
  --disable-ffplay --disable-doc --disable-debug \
  --disable-autodetect \
  --enable-videotoolbox --enable-audiotoolbox --enable-securetransport \
  --enable-zlib --enable-bzlib --enable-iconv \
  --enable-libx264 --enable-libdav1d --enable-libmp3lame \
  >/dev/null && make -j"$JOBS" >/dev/null)

FF="$WORK/src/ffmpeg-$FFMPEG_VERSION"
STAGE="$WORK/stage"
mkdir -p "$STAGE"
cp "$FF/ffmpeg" "$FF/ffprobe" "$STAGE/"
cp "$FF/COPYING.GPLv3" "$STAGE/ffmpeg-LICENSE.txt"
strip -x "$STAGE/ffmpeg" "$STAGE/ffprobe"

# Anything linked outside the OS would be missing on a customer's Mac.
for b in ffmpeg ffprobe; do
  bad="$(otool -L "$STAGE/$b" | tail -n +2 | awk '{print $1}' \
    | grep -v -E '^(/usr/lib/|/System/Library/)' || true)"
  [ -z "$bad" ] || { echo "$b links non-system libraries:"; echo "$bad"; exit 1; }
done

cat > "$STAGE/BUILDINFO.txt" <<EOF
Klipprr ffmpeg build r$REVISION, macOS arm64, minimum macOS $MACOSX_DEPLOYMENT_TARGET
ffmpeg $FFMPEG_VERSION  sha256 $FFMPEG_SHA256  https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz
dav1d  $DAV1D_VERSION   sha256 $DAV1D_SHA256
lame   $LAME_VERSION    sha256 $LAME_SHA256
x264   $X264_COMMIT  https://code.videolan.org/videolan/x264
Licence: GPL v3 (ffmpeg-LICENSE.txt). Built by scripts/build-ffmpeg.sh.

$("$STAGE/ffmpeg" -hide_banner -buildconf)
EOF

NAME="ffmpeg-$FFMPEG_VERSION-macos-arm64-r$REVISION"
tar -czf "$OUT/$NAME.tar.gz" -C "$STAGE" ffmpeg ffprobe ffmpeg-LICENSE.txt BUILDINFO.txt
shasum -a 256 "$OUT/$NAME.tar.gz" | awk '{print $1}' > "$OUT/$NAME.tar.gz.sha256"
echo "$NAME" > "$OUT/NAME"
echo "==> $OUT/$NAME.tar.gz"
echo "    sha256 $(cat "$OUT/$NAME.tar.gz.sha256")"
