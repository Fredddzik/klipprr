#!/usr/bin/env bash
# Prove a pair of ffmpeg/ffprobe binaries can do everything Klipprr asks of them, using
# the app's real command lines. Run by the ffmpeg build workflow before publishing a
# build, and by the release check before any release is allowed to start.
#
#   ./scripts/smoke-test-ffmpeg.sh [bin_dir]     # default: clipagent/src-tauri/bin
#
# When an export command changes in download.rs or http.rs, mirror it here.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="${1:-$REPO_ROOT/clipagent/src-tauri/bin}"
FF="$BIN/ffmpeg"
FP="$BIN/ffprobe"
WM="$REPO_ROOT/clipagent/src-tauri/assets/watermark.png"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

FAILED=0
pass() { echo "  ok    $1"; }
fail() { echo "  FAIL  $1"; FAILED=1; }
check() { # description, command...
  local d="$1"; shift
  if "$@" >"$T/log" 2>&1; then pass "$d"; else fail "$d"; tail -5 "$T/log" | sed 's/^/        /'; fi
}
duration() { "$FP" -v error -show_entries format=duration -of csv=p=0 "$1"; }
near() { awk -v a="$1" -v b="$2" -v t="$3" 'BEGIN { d = a - b; if (d < 0) d = -d; exit !(d <= t) }'; }

echo "== binaries"
for b in "$FF" "$FP"; do
  n="$(basename "$b")"
  [ -x "$b" ] || { fail "$n exists and is executable"; continue; }
  # Intel binaries run only under Rosetta, which many Apple Silicon Macs do not have.
  [ "$(lipo -archs "$b")" = arm64 ] && pass "$n is arm64-only" || fail "$n is arm64-only (got: $(lipo -archs "$b"))"
  bad="$(otool -L "$b" | tail -n +2 | awk '{print $1}' | grep -v -E '^(/usr/lib/|/System/Library/)' || true)"
  [ -z "$bad" ] && pass "$n links only system libraries" || fail "$n links $bad"
done
v1="$("$FF" -hide_banner -version | head -1 | awk '{print $3}')"
v2="$("$FP" -hide_banner -version | head -1 | awk '{print $3}')"
# Probing with one build and encoding with another is how unreproducible bugs start.
[ "$v1" = "$v2" ] && pass "ffmpeg and ffprobe are the same build ($v1)" || fail "ffmpeg $v1 vs ffprobe $v2"

echo "== capabilities"
# Captured first: `grep -q` exits on the first match, and under pipefail the SIGPIPE it
# sends ffmpeg would count as a failure.
has() { local out; out="$("$FF" -hide_banner "-$1" 2>/dev/null)"; grep -q -E "$2" <<<"$out"; }
for e in h264_videotoolbox libx264 aac libmp3lame; do
  has encoders " $e " && pass "encoder $e" || fail "encoder $e"
done
for d in libdav1d h264 hevc vp9 prores aac opus mp3 flac alac pcm_s16le png; do
  has decoders " $d " && pass "decoder $d" || fail "decoder $d"
done
has protocols "^ *https$" && pass "protocol https" || fail "protocol https"
for m in hls mov,mp4 matroska,webm; do
  has demuxers " $m[ ,]" && pass "demuxer $m" || fail "demuxer $m"
done
# The app drops these when absent (download.rs videotoolbox_speed_args), which keeps
# exports working but can cap them at real-time speed on battery.
vt="$("$FF" -hide_banner -h encoder=h264_videotoolbox 2>/dev/null)"
for o in -prio_speed -power_efficient; do
  echo "$vt" | grep -q -- "$o" && pass "videotoolbox option $o" || fail "videotoolbox option $o"
done

echo "== real commands"
# A 4 s source with a keyframe every frame, so cut accuracy is measurable.
check "make test source" "$FF" -v error -f lavfi -i testsrc2=size=1280x720:rate=30 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 -t 4 \
  -c:v libx264 -g 1 -pix_fmt yuv420p -c:a aac -shortest "$T/src.mp4"

check "stream-copy cut (Pro export path)" "$FF" -v error -ss 1.000 -i "$T/src.mp4" -t 2.000 \
  -shortest -c copy -movflags +faststart -f mp4 -y "$T/copy.mp4"
d="$(duration "$T/copy.mp4" 2>/dev/null || echo 0)"
near "$d" 2.0 0.05 && pass "stream-copy cut is 2.0 s (got $d)" || fail "stream-copy cut is 2.0 s (got $d)"

check "watermarked libx264 export (free plan)" "$FF" -v error -ss 1.000 -i "$T/src.mp4" \
  -loop 1 -i "$WM" -filter_complex \
  "[1:v]format=rgba,colorchannelmixer=aa=0.8,scale=256:-1[wm];[0:v][wm]overlay=x='max(0,W-w-32)':y='max(0,H-h-72)'" \
  -t 2.000 -shortest -c:v libx264 -preset veryfast -pix_fmt yuv420p -b:v 6M -c:a aac -y "$T/wm.mp4"
d="$(duration "$T/wm.mp4" 2>/dev/null || echo 0)"
near "$d" 2.0 0.1 && pass "watermarked export is 2.0 s (got $d)" || fail "watermarked export is 2.0 s (got $d)"

check "MP3 export (FR-5)" "$FF" -v error -i "$T/src.mp4" -vn -c:a libmp3lame -q:a 2 -y "$T/a.mp3"
check "WAV export" "$FF" -v error -i "$T/src.mp4" -vn -c:a pcm_s16le -y "$T/a.wav"

# Hosted CI Macs are virtual machines and may have no hardware encoder; there this is a
# warning. On a real Mac it must work, because it is what every macOS export uses.
if "$FF" -v error -i "$T/src.mp4" -t 2 -c:v h264_videotoolbox -prio_speed 1 -power_efficient 0 \
    -pix_fmt yuv420p -b:v 6M -c:a aac -y "$T/vt.mp4" >"$T/log" 2>&1; then
  pass "videotoolbox export (the macOS export path)"
elif [ "${CI:-}" = true ]; then
  echo "  warn  videotoolbox export unavailable on this CI machine (no hardware encoder)"
else
  fail "videotoolbox export (the macOS export path)"; tail -5 "$T/log" | sed 's/^/        /'
fi

# HTTPS input, as yt-dlp uses it for section downloads. The file is our own watermark,
# served by GitHub, so this depends on nothing but GitHub being up.
check "https input" "$FP" -v error -rw_timeout 15000000 \
  "https://raw.githubusercontent.com/Fredddzik/klipprr/main/clipagent/src-tauri/assets/watermark.png"

echo
if [ "$FAILED" = 0 ]; then echo "ffmpeg smoke test: PASSED"; else echo "ffmpeg smoke test: FAILED"; exit 1; fi
