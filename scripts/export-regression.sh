#!/bin/bash
# Export regression: drives a running Klipprr through every export path and checks each
# file with ffprobe. Run it before every release that touches resolve, preview or export.
#
# Checks per case: output duration, codecs, and where the clip actually starts. The
# start check matches the clip's first frame (or, for audio-only output, its waveform)
# against the source at the requested mark, so it catches a cut that is the right
# length but of the wrong moment. URL cases need yt-dlp to resolve a direct media URL
# for that comparison; when it cannot, the case reports "start n/a" instead of failing.
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
FFMPEG="$BIN/ffmpeg"
YT_DLP="$BIN/yt-dlp"
OUT_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/klipprr-regression.XXXXXX")

YT=https://www.youtube.com/watch?v=aqz-KE-bpKQ
YT_SHORT=https://www.youtube.com/watch?v=jNQXAC9IVRw
TWITCH_CLIP=https://www.twitch.tv/sergeynixon/clip/StormyThankfulSproutFutureMan
TWITCH_VOD=https://www.twitch.tv/videos/6528877
IG=https://www.instagram.com/reel/Chunk8-jurw/
X=https://twitter.com/LisPower1/status/1001551623938805763

# How close the clip's first frame has to be to the requested mark. Every path is held
# to the same bound, re-encode and stream copy alike: a stream-copied MP4 carries the
# keyframe run-up as hidden pre-roll and an edit list that starts presentation at the
# mark, so what a player shows is frame-accurate either way (measured 2026-10-19, see
# docs/CONTEXT-BRIEFING.md item 34). 0.15 s covers one frame of a 15 fps source plus the
# 33 ms grid the matcher below quantises to; the paths measure 0.000-0.033 s, and a cut
# that lost its mark would be off by a whole GOP, which is seconds.
MAX_START_DRIFT=0.15
# That hidden pre-roll is the one thing that does differ by path, so it gets a per-case
# ceiling instead of a shared one: `exact` cases re-encode from the seek point and must
# carry none, `copy` cases may carry up to one source GOP. The ceiling is what catches a
# cut that landed a whole GOP away from the mark; it is not a frame-accuracy claim.
MAX_PREROLL_EXACT=0.25
MAX_PREROLL_COPY=12.0

# name | source (URL, or "local") | mode | codec | start | end | max height | expect | cut
# expect: v = H.264 video, mp3 / wav = audio codec.
# cut: copy = stream copy (pre-roll allowed), exact = re-encoded from the seek point.
CASES=(
  "yt_original|$YT|speed|original|100|108|720|v|copy"
  "yt_universal|$YT|speed|universal|110|118|720|v|exact"
  "yt_mp3|$YT|speed|mp3|120|128|720|mp3|exact"
  "yt_wav|$YT|speed|wav|130|135|720|wav|exact"
  "yt_quality|$YT_SHORT|quality|original|3|9||v|copy"
  "twitch_clip|$TWITCH_CLIP|speed|original|2|8|720|v|copy"
  "twitch_vod|$TWITCH_VOD|speed|original|1000|1008|720|v|copy"
  "instagram|$IG|speed|original|1|5|1080|v|copy"
  "x|$X|speed|original|1|4|720|v|copy"
  "local_copy|local|speed|original|1|4||v|copy"
  "local_mp3|local|speed|mp3|1|4||mp3|exact"
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

# Where does the clip actually start? Compares the clip against the source at the
# requested mark and prints the offset in seconds (positive = the clip starts early).
# Video: matches the clip's first frame against source frames resampled onto a 30 Hz
# grid, as 32x18 grayscale thumbnails, so it works across renditions of the same
# source. Audio-only output: normalised cross-correlation of the 1 kHz waveform,
# coarse on a 10 ms envelope then refined to 1 ms.
DRIFT="$OUT_ROOT/clip-start-drift.py"
cat > "$DRIFT" <<'DRIFTPY'
import os, subprocess, sys

FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
W, H, GRID = 32, 18, 30.0
FRAME = W * H
RATE, ENV = 1000, 10  # audio sample rate, envelope block in ms


def run(args):
    return subprocess.run([FFMPEG, "-v", "error", "-nostdin"] + args,
                          capture_output=True).stdout


def seek(src, ss, t):
    a = []
    if ss is not None:
        a += ["-ss", "%.3f" % ss]
    a += ["-i", src]
    if t is not None:
        a += ["-t", "%.3f" % t]
    return a


def thumbs(src, ss, t):
    d = run(seek(src, ss, t) + ["-an", "-vf", "fps=%g,scale=%d:%d,format=gray" % (GRID, W, H),
                                "-f", "rawvideo", "-"])
    return [d[i:i + FRAME] for i in range(0, len(d) - FRAME + 1, FRAME)]


def pcm(src, ss, t):
    d = run(seek(src, ss, t) + ["-vn", "-ac", "1", "-ar", str(RATE),
                                "-f", "s16le", "-acodec", "pcm_s16le", "-"])
    return [int.from_bytes(d[i:i + 2], "little", signed=True) for i in range(0, len(d) - 1, 2)]


def ncc(a, b):
    """Zero-mean normalised correlation; 1.0 is a perfect match."""
    n = min(len(a), len(b))
    if n == 0:
        return -1.0
    a, b = a[:n], b[:n]
    ma, mb = sum(a) / n, sum(b) / n
    da = [x - ma for x in a]
    db = [x - mb for x in b]
    na = sum(x * x for x in da) ** 0.5
    nb = sum(x * x for x in db) ** 0.5
    if na == 0 or nb == 0:
        return -1.0
    return sum(x * y for x, y in zip(da, db)) / (na * nb)


def envelope(xs):
    step = RATE * ENV // 1000
    return [max(abs(v) for v in xs[i:i + step]) for i in range(0, len(xs) - step + 1, step)]


def by_frame(clip, source, mark, span):
    first = thumbs(clip, None, 0.2)
    if not first:
        return None, "no video frame in the clip"
    first = first[0]
    start = max(0.0, mark - span - 0.5)
    cands = thumbs(source, start, (mark - start) + 1.0)
    if len(cands) < 2:
        return None, "no video frames in the source window"
    sads = [(sum(abs(x - y) for x, y in zip(first, c)), start + i / GRID)
            for i, c in enumerate(cands)]
    best = min(s for s, _ in sads)
    # A still stretch of source makes neighbouring frames indistinguishable, so take
    # every frame that matches about as well and, among those, the one nearest the
    # mark: the reading most favourable to the cut. Only a source that is static right
    # across the window cannot be measured at all.
    tied = [t for s, t in sads if s <= best * 1.5 + 30]
    if len(tied) > len(sads) // 2:
        return None, "source is static across the window"
    return mark - min(tied, key=lambda t: abs(t - mark)), None


def by_waveform(clip, source, mark, span):
    want = pcm(clip, None, 1.5)
    if len(want) < RATE // 2:
        return None, "no audio in the clip"
    start = max(0.0, mark - span - 0.5)
    hay = pcm(source, start, (mark - start) + 2.0)
    if len(hay) < len(want):
        return None, "no audio in the source window"
    we, he = envelope(want), envelope(hay)
    block = RATE * ENV // 1000
    coarse = max(range(len(he) - len(we) + 1), key=lambda o: ncc(we, he[o:o + len(we)]))
    lo = max(0, coarse * block - block)
    hi = min(len(hay) - len(want), coarse * block + block)
    if hi < lo:
        return None, "source window too short to refine"
    off = max(range(lo, hi + 1), key=lambda o: ncc(want, hay[o:o + len(want)]))
    if ncc(want, hay[off:off + len(want)]) < 0.5:
        return None, "waveform match too weak"
    return mark - (start + off / RATE), None


clip, source, mark = sys.argv[1], sys.argv[2], float(sys.argv[3])
span, kind = float(sys.argv[4]), sys.argv[5]
drift, why = (by_waveform if kind == "audio" else by_frame)(clip, source, mark, span)
if why:
    print("n/a " + why)
    sys.exit(1)
print("%.3f" % drift)
DRIFTPY

# A reference on the source's own timeline. Local cases already have the file; URL
# cases get a direct media URL from yt-dlp, which only has to be the same video, not
# the same rendition the app picked: the thumbnails are scaled before matching.
source_ref() {
  local src=$1 want=$2 height=$3 sel
  if [ "$src" = local ]; then
    echo "$LOCAL_SRC"
    return
  fi
  if [ "$want" = audio ]; then
    sel="ba/b"
  elif [ -n "$height" ]; then
    sel="bv*[height<=$height]/b[height<=$height]/b"
  else
    sel="bv*/b"
  fi
  "$YT_DLP" -g -f "$sel" "$src" 2>/dev/null | head -1
}

# The keyframe run-up a stream copy leaves in the file: media the edit list hides from
# players, and what a tool that ignores edit lists shows before the mark.
preroll_secs() {
  local raw shown
  raw=$("$FFPROBE" -v error -ignore_editlist 1 -select_streams v:0 \
        -show_entries stream=duration -of csv=p=0 "$1" 2>/dev/null)
  shown=$("$FFPROBE" -v error -select_streams v:0 \
        -show_entries stream=duration -of csv=p=0 "$1" 2>/dev/null)
  python3 -c "
import sys
try:
    print('%.3f' % max(0.0, float(sys.argv[1]) - float(sys.argv[2])))
except (ValueError, IndexError):
    print('')
" "${raw:-}" "${shown:-}"
}

run_case() {
  local name=$1 src=$2 mode=$3 codec=$4 start=$5 end=$6 height=$7 expect=$8 cut=$9
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

  # --- does the clip start where it was asked to? ---
  # `span` is how far back of the mark the matcher looks, so it has to be wider than any
  # drift worth reporting: a copy case can legitimately sit a whole GOP early, and an
  # exact case that regressed should still be located rather than come back unmeasurable.
  local kind=video span=6 ceiling=$MAX_PREROLL_EXACT
  [ -z "$vcodec" ] && kind=audio
  [ "$cut" = copy ] && { span=$MAX_PREROLL_COPY; ceiling=$MAX_PREROLL_COPY; }
  local ref drift drift_show preroll=""
  ref=$(source_ref "$src" "$kind" "$height")
  if [ -z "$ref" ]; then
    drift="n/a no source reference (yt-dlp could not resolve a media URL)"
  else
    drift=$(FFMPEG="$FFMPEG" python3 "$DRIFT" "$f" "$ref" "$start" "$span" "$kind")
  fi
  drift_show="${drift}s"
  case $drift in
    "n/a"*) drift_show=$drift ;;  # could not measure; reported, not failed
    *) python3 -c "import sys; sys.exit(0 if abs($drift) <= $MAX_START_DRIFT else 1)" ||
         problems="$problems starts ${drift}s off the mark (max ${MAX_START_DRIFT}s);" ;;
  esac
  if [ "$kind" = video ]; then
    preroll=$(preroll_secs "$f")
    if [ -n "$preroll" ]; then
      python3 -c "import sys; sys.exit(0 if $preroll <= $ceiling else 1)" ||
        problems="$problems ${preroll}s of keyframe pre-roll (max ${ceiling}s for $cut);"
    fi
  fi

  if [ -n "$problems" ]; then
    echo "FAIL $name:$problems"
    failed=$((failed + 1))
  else
    echo "ok   $name  $(( $(date +%s) - t0 ))s  ${vcodec:-} ${acodec:-} ${dur}s  start ${drift_show}${preroll:+  pre-roll ${preroll}s}"
  fi
  [ "$name" = yt_original ] && LOCAL_SRC=$f
}

for c in "${CASES[@]}"; do
  IFS='|' read -r name src mode codec start end height expect cut <<< "$c"
  if [ $# -gt 0 ]; then
    match=0
    for w in "$@"; do case $name in *"$w"*) match=1 ;; esac; done
    # Local cases need the yt_original file.
    [ $match = 0 ] && [ "$name" != yt_original ] && continue
  fi
  run_case "$name" "$src" "$mode" "$codec" "$start" "$end" "$height" "$expect" "$cut"
done

leftovers=$(ls "${TMPDIR:-/tmp}" 2>/dev/null | grep -cE "^klipprr_(wm_tmp|audio_tmp|export)_" || true)
[ "$leftovers" -gt 0 ] && echo "note: $leftovers klipprr temp files left in \$TMPDIR"
echo "$failed failed. Files: $OUT_ROOT"
exit $failed
