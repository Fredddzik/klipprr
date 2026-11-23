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
# 60 fps HEVC at 1080p, video-only; its sound comes from the H.264 rendition (download.rs).
TIKTOK=https://www.tiktok.com/@outruncook/video/7690286989635046669
TIKTOK_ESPN=https://www.tiktok.com/@espn/video/7711144248808148255    # 60 fps, 30 fps preview
TIKTOK_30=https://www.tiktok.com/@grillflavor0/video/7704311549657156894 # 30 fps throughout

# How close the clip's first frame has to be to the requested mark. Every path is held
# to the same bound, re-encode and stream copy alike: a stream-copied MP4 carries the
# keyframe run-up as hidden pre-roll and an edit list that starts presentation at the
# mark, so what a player shows is frame-accurate either way (measured 2026-10-19, see
# ~/dev/klipprr-web/docs/app/CONTEXT-BRIEFING.md item 34). 0.15 s covers one frame of a 15 fps source plus the
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
# expect: v = H.264 video, hevc / prores = that video codec, mp3 / wav = audio codec.
# Since 16 Nov 2026 the app only sends "universal" (H.264), "hevc" or "prores" for video;
# "original" (stream copy) is kept here only because the engine still accepts it and the
# yt_original file is the local source.
# cut: copy = stream copy (pre-roll allowed), exact = re-encoded from the seek point.
CASES=(
  "yt_original|$YT|speed|original|100|108|720|v|copy"
  "yt_universal|$YT|speed|universal|110|118|720|v|exact"
  "yt_hevc|$YT|speed|hevc|140|146|720|hevc|exact"
  "yt_prores|$YT|speed|prores|150|153|720|prores|exact"
  "yt_mp3|$YT|speed|mp3|120|128|720|mp3|exact"
  "yt_wav|$YT|speed|wav|130|135|720|wav|exact"
  "yt_quality|$YT_SHORT|quality|original|3|9||v|copy"
  "twitch_clip|$TWITCH_CLIP|speed|universal|2|8|720|v|exact"
  "twitch_vod|$TWITCH_VOD|speed|universal|1000|1008|720|v|exact"
  "instagram|$IG|speed|universal|1|5|1080|v|exact"
  "x|$X|speed|universal|1|4|720|v|exact"
  "tiktok|$TIKTOK|speed|universal|15.381|19.25||v|exact"
  "tiktok_720|$TIKTOK|speed|universal|20|24|720|v|exact"
  "tiktok_espn60|$TIKTOK_ESPN|speed|universal|3.21|6.5||v|exact"
  "tiktok_30fps|$TIKTOK_30|speed|universal|4.1|7.3||v|exact"
  "local_exact|local|speed|universal|1|4||v|exact"
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

# Exact cases: is the clip's first frame the source frame on screen at the mark, or the
# one after it? The drift check above works on a 30 Hz grid and cannot tell neighbouring
# frames apart. This reads the source's real frame times (they are not always on a clean
# grid from zero; a Twitch VOD's are not) and compares the clip's first frame with the frame
# shown at the mark and with the next one.
EXACT="$OUT_ROOT/first-frame.py"
cat > "$EXACT" <<'EXACTPY'
import os, subprocess, sys
FFMPEG = os.environ.get("FFMPEG", "ffmpeg"); FFPROBE = os.environ.get("FFPROBE", "ffprobe")
clip, src, mark = sys.argv[1], sys.argv[2], float(sys.argv[3])
def out(a): return subprocess.run(a, capture_output=True).stdout.decode()
def num(x):
    try: return float(x.strip().rstrip(","))
    except ValueError: return None
origin = num(out([FFPROBE, "-v", "error", "-show_entries", "format=start_time", "-of", "csv=p=0", src])) or 0.0
# Absolute window ending past the mark: a relative "+2" counts from the keyframe ffprobe
# seeks to and can stop short of it.
window = "%.3f%%%.3f" % (origin + mark - 1.5, origin + mark + 0.5)
ts = sorted(t for t in (num(l) for l in out([FFPROBE, "-v", "error", "-select_streams", "v:0", "-read_intervals",
      window, "-show_entries", "frame=pts_time", "-of", "csv=p=0", src]).splitlines()) if t is not None)
shown = [t for t in ts if t <= origin + mark + 0.0005]
after = [t for t in ts if t > origin + mark + 0.0005]
if not shown or not after:
    print("n/a no source frames near the mark"); sys.exit(1)
f0, f1 = shown[-1], after[0]
# Pick the reference frames by their own timestamps (-copyts keeps them as ffprobe reports
# them). Seeking straight to a time can land a frame early, which is what made the first
# version of this check call exact clips late.
def gray(a, vf=""): return subprocess.run([FFMPEG, "-v", "error", "-nostdin"] + a + ["-vf", vf + "scale=96:54,format=gray",
      "-fps_mode", "passthrough", "-f", "rawvideo", "-"], capture_output=True).stdout
pair = gray(["-ss", "%.3f" % max(0.0, f0 - origin - 2.0), "-copyts", "-t", "4", "-i", src, "-an", "-frames:v", "2"],
            "select='between(t\\,%.6f\\,%.6f)'," % (f0 - 0.0005, f1 + 0.0005))
first = gray(["-i", clip, "-frames:v", "1"])
n = 96 * 54
if len(pair) < 2 * n or len(first) < n:
    print("n/a could not read frames"); sys.exit(1)
d0 = sum(abs(a - b) for a, b in zip(first[:n], pair[:n]))
d1 = sum(abs(a - b) for a, b in zip(first[:n], pair[n:2 * n]))
if min(d0, d1) > 0.9 * max(d0, d1):
    print("n/a neighbouring frames too similar to tell apart"); sys.exit(1)
print("exact" if d0 < d1 else "one frame late (diff %d vs %d)" % (d0, d1))
EXACTPY

# The other end: is the clip's last frame the one just before the frame on screen at the
# Out mark (the Out frame itself is not part of the clip), one frame short, or one long?
# The first-frame check cannot see this; an export once lost its last frame to rounding.
LASTF="$OUT_ROOT/last-frame.py"
cat > "$LASTF" <<'LASTPY'
import os, subprocess, sys
FFMPEG = os.environ.get("FFMPEG", "ffmpeg"); FFPROBE = os.environ.get("FFPROBE", "ffprobe")
clip, src, mark = sys.argv[1], sys.argv[2], float(sys.argv[3])
def out(a): return subprocess.run(a, capture_output=True).stdout.decode()
def num(x):
    try: return float(x.strip().rstrip(","))
    except ValueError: return None
origin = num(out([FFPROBE, "-v", "error", "-show_entries", "format=start_time", "-of", "csv=p=0", src])) or 0.0
window = "%.3f%%%.3f" % (origin + mark - 1.5, origin + mark + 0.5)
ts = sorted(t for t in (num(l) for l in out([FFPROBE, "-v", "error", "-select_streams", "v:0", "-read_intervals",
      window, "-show_entries", "frame=pts_time", "-of", "csv=p=0", src]).splitlines()) if t is not None)
at_out = [t for t in ts if t <= origin + mark + 0.0005]
if len(at_out) < 3 or not [t for t in ts if t > at_out[-1]]:
    print("n/a no source frames near the mark"); sys.exit(1)
short, want, long_ = at_out[-3], at_out[-2], at_out[-1]
def gray(a, vf=""): return subprocess.run([FFMPEG, "-v", "error", "-nostdin"] + a + ["-vf", vf + "scale=96:54,format=gray",
      "-fps_mode", "passthrough", "-f", "rawvideo", "-"], capture_output=True).stdout
trio = gray(["-ss", "%.3f" % max(0.0, short - origin - 2.0), "-copyts", "-t", "4", "-i", src, "-an", "-frames:v", "3"],
            "select='between(t\\,%.6f\\,%.6f)'," % (short - 0.0005, long_ + 0.0005))
def fps(p):
    # First usable line: an HLS source prints one per variant.
    for l in out([FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate",
                  "-of", "csv=p=0", p]).splitlines():
        a, _, b = l.strip().rstrip(",").partition("/")
        try:
            if float(b) > 0 and float(a) > 0: return float(a) / float(b)
        except ValueError: pass
    return 0.0
tail = gray(["-sseof", "-0.5", "-i", clip])
n = 96 * 54
if len(trio) < 3 * n or len(tail) < 2 * n:
    print("n/a could not read frames"); sys.exit(1)
# A clip at twice the reference's rate (a 60 fps TikTok against its 30 fps preview) shows two
# frames for each reference frame: the last reference frame and the in-between frame after
# it, which the reference never shows. Check the one the reference does show.
double = abs(fps(clip) - 2 * fps(src)) < 0.1
last = tail[-2 * n:-n] if double else tail[-n:]
d = [sum(abs(a - b) for a, b in zip(last, trio[i * n:(i + 1) * n])) for i in range(3)]
best = min(range(3), key=d.__getitem__)
if sorted(d)[1] < 1.1 * max(d[best], 1):
    print("n/a neighbouring frames too similar to tell apart"); sys.exit(1)
# At double rate the export pads instead of cutting off (download.rs, preview_alignment):
# one reference frame long is the intended result where TikTok's versions line up.
print(["one frame short", "exact", "padded one frame" if double else "one frame long"][best])
LASTPY

# A reference on the source's own timeline. Local cases already have the file; URL
# cases get a direct media URL from yt-dlp, which only has to be the same video, not
# the same rendition the app picked: the thumbnails are scaled before matching.
source_ref() {
  local src=$1 want=$2 height=$3 sel
  if [ "$src" = local ]; then
    echo "$LOCAL_SRC"
    return
  fi
  # TikTok: the reference is the app's own preview, the file the user marks on. TikTok's
  # versions of one post do not all show the same picture at the same timestamp (a 60 fps
  # version runs one preview frame ahead of a 30 fps preview), so "exact" means "matches
  # the preview". Fetching it also leaves it in the cache, where the export reads its frame
  # rate (download.rs, preview_alignment). The TikTok cases mark inside its first 60 s.
  case $src in
    *tiktok.com*)
      local enc
      enc=$(python3 -c "import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=''))" "$src")
      curl -s -m 180 -H "X-Klipprr-Token: $TOKEN" "$AGENT/yt-preview-cache?url=$enc" |
        python3 -c "import sys,json;print(json.load(sys.stdin).get('path',''))" 2>/dev/null
      return
      ;;
  esac
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
  # TikTok exports line up with the cached preview, so it has to exist first, as it does
  # in the app (the preview loads before anything can be marked).
  case $src in *tiktok.com*) source_ref "$src" v "$height" >/dev/null ;; esac
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
    hevc) [ "$vcodec" = hevc ] || problems="$problems video ${vcodec:-none} (want hevc);" ;;
    prores) [ "$vcodec" = prores ] || problems="$problems video ${vcodec:-none} (want prores);" ;;
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
  # Black first frame: the picture must not start after the sound. A 1-frame gap here is
  # what players showed as a black first frame (fixed 16 Nov 2026).
  local vstart=""
  if [ "$kind" = video ] && [ "$cut" = exact ]; then
    vstart=$("$FFPROBE" -v error -select_streams v:0 -show_entries stream=start_time -of csv=p=0 "$f")
    python3 -c "import sys; sys.exit(0 if float('${vstart:-0}') <= 0.002 else 1)" ||
      problems="$problems picture starts ${vstart}s after the sound (black first frame);"
  fi
  local frame_check="" last_check=""
  if [ "$kind" = video ] && [ "$cut" = exact ] && [ -n "$ref" ]; then
    frame_check=$(FFMPEG="$FFMPEG" FFPROBE="$FFPROBE" python3 "$EXACT" "$f" "$ref" "$start")
    case $frame_check in
      exact|"n/a"*) ;;
      *) problems="$problems first frame is $frame_check;" ;;
    esac
    last_check=$(FFMPEG="$FFMPEG" FFPROBE="$FFPROBE" python3 "$LASTF" "$f" "$ref" "$end")
    case $last_check in
      exact|padded*|"n/a"*) ;;
      *) problems="$problems last frame is $last_check;" ;;
    esac
  fi
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
    echo "ok   $name  $(( $(date +%s) - t0 ))s  ${vcodec:-} ${acodec:-} ${dur}s  start ${drift_show}${preroll:+  pre-roll ${preroll}s}${vstart:+  picture at ${vstart}s}${frame_check:+  first frame: ${frame_check}}${last_check:+  last frame: ${last_check}}"
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
