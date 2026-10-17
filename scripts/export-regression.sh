#!/bin/bash
# Export regression: drives a running Klipprr through every export path and checks each
# file with ffprobe. Run it before every release that touches resolve, preview or export.
#
#   1. Quit Klipprr, start the build you want to test (a staged bundle, see
#      docs/RELEASE.md), and sign in. The agent must be listening on :4000.
#   2. scripts/export-regression.sh            # all cases
#      scripts/export-regression.sh yt_ twitch  # only cases whose name contains a word
#
# Every case is a real export: it counts against the signed-in account's monthly clips
# (about 12 per full run). Use a test account.
#
# Exit status is the number of failed cases.
set -u

AGENT=${KLIPPRR_AGENT:-http://127.0.0.1:4000}
LOG="$HOME/Library/Logs/ClipAgent/clipagent.log"
BIN=${KLIPPRR_BIN:-/Applications/Klipprr.app/Contents/Resources/bin}
FFPROBE="$BIN/ffprobe"
OUT_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/klipprr-regression.XXXXXX")

YT=https://www.youtube.com/watch?v=aqz-KE-bpKQ
YT_SHORT=https://www.youtube.com/watch?v=jNQXAC9IVRw
TWITCH_CLIP=https://www.twitch.tv/sergeynixon/clip/StormyThankfulSproutFutureMan
TWITCH_VOD=https://www.twitch.tv/videos/6528877
IG=https://www.instagram.com/reel/Chunk8-jurw/
X=https://twitter.com/LisPower1/status/1001551623938805763

# name | source (URL, or "local") | mode | codec | start | end | max height | expect
# expect: v = H.264 video, mp3 / wav = audio codec.
CASES=(
  "yt_original|$YT|speed|original|100|108|720|v"
  "yt_universal|$YT|speed|universal|110|118|720|v"
  "yt_mp3|$YT|speed|mp3|120|128|720|mp3"
  "yt_wav|$YT|speed|wav|130|135|720|wav"
  "yt_quality|$YT_SHORT|quality|original|3|9||v"
  "twitch_clip|$TWITCH_CLIP|speed|original|2|8|720|v"
  "twitch_vod|$TWITCH_VOD|speed|original|1000|1008|720|v"
  "instagram|$IG|speed|original|1|5|1080|v"
  "x|$X|speed|original|1|4|720|v"
  "local_copy|local|speed|original|1|4||v"
  "local_mp3|local|speed|mp3|1|4||mp3"
)

if ! curl -s -o /dev/null -m 3 "$AGENT/ping"; then
  echo "Klipprr is not running (no answer on $AGENT/ping)." >&2
  exit 100
fi
# Work endpoints need the agent's per-launch token (agent_token.rs).
TOKEN_FILE=${KLIPPRR_TOKEN_FILE:-"$HOME/Library/Application Support/com.klipprr/agent-token"}
TOKEN=$(cat "$TOKEN_FILE" 2>/dev/null)
if [ -z "$TOKEN" ]; then
  echo "No agent token at $TOKEN_FILE (Klipprr 0.1.38 or later writes it at launch)." >&2
  exit 100
fi

LOCAL_SRC=""
failed=0

run_case() {
  local name=$1 src=$2 mode=$3 codec=$4 start=$5 end=$6 height=$7 expect=$8
  local out="$OUT_ROOT/$name"
  mkdir -p "$out"
  if [ "$src" = local ] && [ -z "$LOCAL_SRC" ]; then
    echo "SKIP $name: no local source (the yt_original case makes one)"
    return
  fi
  local id="regression-$name-$$"
  local n
  n=$(wc -l < "$LOG")
  local body
  body=$(python3 - "$id" "$src" "$mode" "$codec" "$start" "$end" "$height" "$out" "$LOCAL_SRC" <<'PY'
import json, sys
id_, src, mode, codec, start, end, height, out, local = sys.argv[1:]
b = {"client_export_id": id_, "mode": mode, "codec": codec, "export_path": out,
     "fast_max_height": int(height) if height else None,
     "clips": [{"id": "c1", "name": id_.split("-")[1], "start": float(start), "end": float(end)}]}
if src == "local":
    b["url"] = ""; b["local_path"] = local
else:
    b["url"] = src
print(json.dumps(b))
PY
)
  local t0 status
  t0=$(date +%s)
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H 'content-type: application/json' \
    -H "X-Klipprr-Token: $TOKEN" -d "$body" "$AGENT/download-all")
  if [ "$status" != 202 ]; then
    echo "FAIL $name: agent answered $status"
    failed=$((failed + 1))
    return
  fi
  for _ in $(seq 1 300); do
    tail -n +$((n + 1)) "$LOG" | grep -q "QUOTA\] settled export=$id" && break
    sleep 1
  done
  local f
  f=$(ls "$out"/* 2>/dev/null | head -1)
  if [ -z "$f" ]; then
    echo "FAIL $name: no file after $(( $(date +%s) - t0 ))s"
    tail -n +$((n + 1)) "$LOG" | grep -iE "error|fail" | head -3 | cut -c1-200 | sed 's/^/     /'
    failed=$((failed + 1))
    return
  fi
  local dur vcodec acodec want
  dur=$("$FFPROBE" -v error -show_entries format=duration -of csv=p=0 "$f")
  vcodec=$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 "$f")
  acodec=$("$FFPROBE" -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$f")
  want=$(python3 -c "print($end - $start)")
  local problems=""
  python3 -c "import sys; sys.exit(0 if abs(float('${dur:-0}') - $want) <= 0.35 else 1)" ||
    problems="$problems duration ${dur:-none}s (want ${want}s);"
  case $expect in
    v) [ "$vcodec" = h264 ] || problems="$problems video ${vcodec:-none} (want h264);" ;;
    mp3) [ "$acodec" = mp3 ] && [ -z "$vcodec" ] || problems="$problems audio ${acodec:-none} video ${vcodec:-none};" ;;
    wav) [ "$acodec" = pcm_s24le ] || problems="$problems audio ${acodec:-none} (want pcm_s24le);" ;;
  esac
  if [ -n "$problems" ]; then
    echo "FAIL $name:$problems"
    failed=$((failed + 1))
  else
    echo "ok   $name  $(( $(date +%s) - t0 ))s  ${vcodec:-} ${acodec:-} ${dur}s"
  fi
  [ "$name" = yt_original ] && LOCAL_SRC=$f
}

for c in "${CASES[@]}"; do
  IFS='|' read -r name src mode codec start end height expect <<< "$c"
  if [ $# -gt 0 ]; then
    match=0
    for w in "$@"; do case $name in *"$w"*) match=1 ;; esac; done
    # Local cases need the yt_original file.
    [ $match = 0 ] && [ "$name" != yt_original ] && continue
  fi
  run_case "$name" "$src" "$mode" "$codec" "$start" "$end" "$height" "$expect"
done

leftovers=$(ls "${TMPDIR:-/tmp}" 2>/dev/null | grep -cE "^klipprr_(wm_tmp|audio_tmp|export)_" || true)
[ "$leftovers" -gt 0 ] && echo "note: $leftovers klipprr temp files left in \$TMPDIR"
echo "$failed failed. Files: $OUT_ROOT"
exit $failed
