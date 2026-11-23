# Pipelines: resolve → preview → export

This is the heart of the product. Read it before changing anything in `resolve.rs`,
`http.rs`, `download.rs`, `VideoViewport.tsx` or `Timeline.tsx`.

---

## 1. Resolve

`GET /resolve?url=…` → `commands/resolve.rs::handle_resolve`

Spawns `yt-dlp --dump-single-json --no-warnings --no-progress --no-playlist <url>`.
On macOS, when **not** running from a `.app` bundle it also passes
`--cookies-from-browser safari`.

From the format list it computes:

```jsonc
{
  "id", "title", "duration", "thumbnail",
  "preview": {
    "url": "",                      // a directly playable muxed URL, or empty
    "requires_local_preview": true, // no playable URL exists; build one locally
    "local_upgrade_height": 720     // a better local preview is worth fetching
  },
  "capabilities": {
    "fast_max_height": 1080,            // tallest H.264 — what a stream copy can reach
    "true_max_height": 2160,            // tallest of any codec
    "true_max_requires_reencode": true  // true when no H.264 exists at true_max
  }
}
```

### Why this is harder than it looks

YouTube **no longer publishes muxed (audio+video) formats reliably**. For a given video it
may return the legacy 360p `itag 18` or nothing muxed at all — *and this varies between
requests for the same video*. Verified: `aqz-KE-bpKQ` returned no muxed format one day and
one the next.

Worse, when `itag 18` is present it is sometimes degenerate: an empty body, or a header
that advertises the full duration but contains no decodable frames. That is the origin of
the historical **"black screen with the right duration"** bug.

So resolve does two things beyond format-picking:

1. **Probes suspect URLs.** When the only playable format is materially worse than what a
   local merge could produce (`< 720p` while H.264 reaches ≥ 720p), it runs
   `ffprobe -read_intervals "%+#2"` against the URL (~150 ms). No frames decoded → the URL
   is discarded and `requires_local_preview` is set.
2. **Reports an upgrade target.** `local_upgrade_height` tells the UI to fetch a better
   copy in the background even when a playable URL exists.

### Codec, not container

`is_h264()` gates the capability numbers. YouTube ships **AV1 and VP9 inside `.mp4`**, so
testing the container is wrong twice over: WKWebView cannot decode them, and stream-copying
one into an `.mp4` produces a file most editors reject. `fast_max_height` counts only
H.264; `true_max_requires_reencode` is `true_max_height > max_h264_height`.

### Error codes resolve can return

`cookies_not_accessible`, `youtube_bot_block`, `login_or_private`, `video_unavailable`,
`no_progressive_preview`, `yt_dlp_failed`, `invalid_json_from_yt_dlp`, `resolve_bad_json`,
`invalid_core_fields`, `unable_to_spawn_yt_dlp`, `resolve_panicked`.
Every one of these needs a human-readable message in `page.tsx`. An unmapped code shows the
raw string to the user.

---

## 2. Preview

There are **four** preview paths. Knowing which one is active is the first debugging step.

| Path | When | Source |
|---|---|---|
| **Streamed DASH** (FR-7) | `preview.dash` (YouTube with separate H.264/AAC streams) | `/yt-dash.mpd?url=<page url>` played by Shaka over MSE; media via `/preview-stream` |
| **Direct stream** | `preview.url` set, not TikTok | `/preview-stream?url=…` proxy |
| **Native HLS** | preview URL contains `m3u8` | passed straight to `<video>` (WKWebView decodes it; proxying breaks segment resolution) |
| **Local merged** | `requires_local_preview`, or TikTok | `/yt-preview-cache` downloads + merges, served via `/local-preview` |
| **Local file** | user loaded a file from disk | `/local-preview?path=…`, `pcm_fix=1` when audio is PCM/ALAC/FLAC |

### The tiering

When a local preview is involved:

1. Fetch **360p, full length** (`q=360&full=1`) so the whole timeline is scrubbable.
2. Simultaneously start a background **720p** download (`hq=720`).
3. Poll `/yt-proxy-status` every 4 s; when ready, swap the `<video>` `src`.
4. `VideoViewport` restores `currentTime` across the swap via `lastTimeRef` →
   `pendingSeekRef` → `onLoadedMetadata`.

When a direct URL exists *and* `local_upgrade_height > 0`, step 1 is skipped
(`bg=1` queues only the background job) so the first frame is immediate.

Format selector for local previews pins **avc1 + m4a** because WKWebView cannot decode the
VP9/AV1 YouTube otherwise serves:

```
bestvideo[height<=H][vcodec^=avc1]+bestaudio[ext=m4a]
  / bestvideo[height<=H][vcodec^=avc1]+bestaudio
  / best[height<=H][vcodec^=avc1] / best[height<=H] / best
```

### Caching and locks

Previews cache in `$TMPDIR/clipagent_preview_cache/`, keyed by a hash of the source URL
plus a tier suffix (`yt_preview_<hash>_<tier>.mp4`). A `.lock` sentinel marks an in-flight
download. Locks older than one hour are treated as abandoned and deleted — without that, a
hard quit left a lock that pinned `/yt-proxy-status` at `"downloading"` forever and blocked
all future upgrades for that URL.

### Known weaknesses (this is the #1 product complaint)

- **`/yt-preview-cache` downloads the entire file before responding.** For a long source
  that is tens of seconds of spinner. Nothing streams while it downloads.
- **`/preview-stream` caches per session only.** Byte ranges are kept on disk
  (`preview_cache.rs`) so re-seeking is local, but the first visit to any region still
  waits on the origin CDN, and nothing survives an app restart.
- **No frame-level seek affordance.** The timeline seeks by time only.

Any redesign must preserve the invariants below.

---

## 3. Export

`POST /download-all` → `commands/download.rs::handle_download_all`

Every video export is an **exact cut** (since 0.1.43, released 16 Nov 2026): it starts on the
frame that is on screen at the In point and is re-encoded in the chosen format. A stream copy can
only start on a keyframe, so the "Original – no re-encode" option and the Fast/Quality switch were
removed (both modes downloaded the same stream).

| Source | How a clip is cut |
|---|---|
| **Any link** (YouTube, Twitch, X, Instagram, TikTok) | `url_exact_cut`: yt-dlp prints the chosen formats as JSON (`requested_formats` when it merges two), and each stream gets its own request headers and cookies (`exact_cut_streams`, `ffmpeg_http_args`; TikTok answers 403 without the session cookies, and its quoted cookie values must be unquoted); a refused stream (403) is retried twice with fresh links, after 3 s and 10 s; the frame rate comes from yt-dlp or the stream (`parse_frame_rate`, which also reads HLS output), never a guess; `frame_start_at` reads the real start time of the frame on screen at the In point from the stream's own timestamps (ffprobe `-read_intervals` with an absolute end; frames are not always on a clean grid, e.g. a Twitch VOD), with `frame_span` (fps maths) as the fallback; ffmpeg seeks each stream to that frame minus 1 ms, `setpts/asetpts=PTS-STARTPTS`, `-frames:v` (`frames_until`, with slack for ffprobe's 6-decimal timestamps so an Out mark on a frame boundary keeps its last frame). Sources without audio skip the audio filter. Falls back to the section download (below) on any failure |
| **TikTok specifics** | Formats: the exact cut pairs the best video (often video-only HEVC, up to 1080p60) with the audio of a version that has sound (`ba*[vcodec!=none][acodec!=none][format_id!=download]`, needs `--video-multistreams`), never TikTok's `audio` MP3 (the post's sound: can be the song without the voice, and ~50 ms off). The fallback takes the best version with sound. Preview: **streams** through `/preview-stream` like other links (since 23 Nov 2026). Resolve records the preview format's headers and cookies (`remember_preview_stream`), and the proxy sends them (`with_preview_referer`); without them TikTok answers 403. Links stay valid about 48 h. If playback fails, the app downloads the whole video instead (`yt-preview-cache?full=1`, `YT_PREVIEW_SELECTOR_WORST`: smallest H.264 version with sound, never the watermarked `download`; cached as tier `lqfull`, because copies from before 0.1.45 hold only the first 60 s). **Preview alignment** (`preview_alignment`): TikTok's versions of one post do not show the same picture at the same timestamp. Measured on 10 posts (22-23 Nov 2026): same frame rate as the preview, identical on every frame; a 60 fps version against a 30 fps preview, each picture between 0 and one preview frame (33 ms) earlier, and it can change within a post (a compilation: 33 ms at 0:15, 0 at 3:00). So: same rate, no change; double rate, snap both marks to the preview frame and move only the In point back one preview frame (exact, or one preview frame of padding at one end, never short); any other rate, pad one preview frame on each side. The export reads the preview's frame rate from the downloaded copy, or from the recorded stream |
| **Local file** | the same frame lookup and cut, on the file |
| **Fallback** | `yt-dlp --download-sections` per clip, then the padding is skipped by length difference and the clip is re-encoded in the chosen format (`.mov` for ProRes; until 23 Nov 2026 it stream-copied H.264 downloads and always wrote H.264). **Not frame exact** (can start a frame or two late). Runs only when `url_exact_cut` fails |

Verified by `scripts/export-regression.sh` on 23 Nov 2026, first and last frame (17 cases, 0
failed): YouTube (H.264, HEVC), Twitch clip and VOD, X, TikTok (60 fps with a 30 fps preview,
capped 720p, 30 fps throughout), local file; Instagram first frame. ProRes and some ends report
n/a when neighbouring frames are too alike to tell apart. TikTok cases compare against the app's
own preview. **Windows is not in the regression.** A full run costs about 17 clips: use a test
account (a run on 23 Nov used up a Pro account's 120).

For comparison (22 Nov 2026, same YouTube clip 10.3–14 s): a plain `yt-dlp --download-sections`
copy held 5.02 s of hidden run-up behind its edit list and showed its first frame one frame late;
with `--force-keyframes-at-cuts` it had no run-up but was still one frame late, and the video
started 40 ms after the audio.

Formats (`ExportVideoCodec`, media.rs): MP4 · H.264 (`"universal"`), MP4 · HEVC (`"hevc"`),
MOV · ProRes 422 (`"prores"`), all on VideoToolbox. H.264 bitrate scales with height (6, 12,
24, 40 Mbps at ≤720p, ≤1080p, ≤1440p, above); HEVC uses half.

Why the frame maths matters: the preview shows a frame from its start until the next one, so
a mark lands partway through a frame. Seeking to the mark itself drops that frame (the clip
starts one frame late) and left the video 1 frame after the audio, which players show as a
black first frame.

"Also save the full video" (paid plans) runs after the clips: best quality (`bv*+ba[ext=m4a]`),
converted to H.264 only when this Mac cannot play it (VP9, or AV1 before M3:
`mac_has_av1_decoder`).

Format selectors (other URLs):

```
bv*[height<=H] + ba / best      → re-encoded in the chosen format
```

Up to **4 clips export in parallel**, each spawning its own yt-dlp + ffmpeg, and all four
re-encode. (The stream-copy branch, which copied clips that were already H.264/AAC and
unwatermarked, only runs for codec `"original"`, which the interface no longer sends.) Quota is
reserved before the run and refunded on failure.

**Refused downloads are retried.** YouTube refuses section downloads with a 403 now and
then, in bursts of 20-30 seconds. `run_ytdlp_with_progress` (download.rs) tries every
yt-dlp run up to three times, waiting 3 s and then 10 s, and each attempt extracts fresh
stream URLs. Failures another attempt cannot fix (private, members-only, age-gated,
"Requested format is not available", unsupported URL) are not retried; see
`ytdlp_failure_is_permanent`. A cancel ends the wait at once. If a clip still fails, the
export panel keeps it on screen with **Retry** and **Email us** instead of a dialog.


---

## Invariants — do not break these

1. **Preview time == source time.** Whatever the preview is built from (360p proxy, 720p
   proxy, direct stream, HLS), position *t* in the preview must be position *t* in the
   source. Any proxy generation must preserve timestamps exactly: no `-ss` on the input
   without compensating, no frame-rate conversion, no `setpts`.
2. **Duration comes from resolve, not from the preview file.** The timeline is built from
   `resolve.duration`. A proxy that is shorter (e.g. a 60 s TikTok preview) must never
   redefine the timeline.
3. **Export cuts from the source, never from the preview proxy.** Preview files are
   disposable cache; they are not export inputs.
4. **A quality swap must not move the playhead.** `VideoViewport` restores position across
   a `src` change. If you touch that component, re-test the 360→720 swap mid-playback.
5. **Never report a background job "ready" before it is complete.** Check the lock first,
   then the file size. A half-written MP4 handed to `<video>` produces a user-visible error.
6. **Stream copy must stay H.264.** If a code path can emit AV1/VP9 in an `.mp4` the user
   asked to be "original", that path is a bug.

### Accuracy: what "frame perfect" actually means today

Cuts are expressed in **seconds with millisecond precision** (`-ss {:.3}`), not in frames.
At 29.97 fps one frame is 33.4 ms, so the current implementation can be off by up to a
frame, and **stream-copy cuts snap to the nearest keyframe** unless the segment is
re-encoded. The product promise says frame-perfect; the implementation is
millisecond-approximate. Closing that gap means:

- snapping in/out to frame boundaries in the UI using the real `fps` from resolve,
- passing frame-derived timestamps to ffmpeg,
- and either accepting keyframe snapping in copy mode or re-encoding a short head segment.

This is a known, deliberate gap. Do not claim frame accuracy in marketing copy until it is
closed.

---

## Testing resolve locally

A dev build outside a `.app` bundle always fails YouTube resolve with
`cookies_not_accessible`, because `running_from_sandboxed_app()` keys off `".app/Contents/"`
in the executable path. To exercise the real path without a full release build:

```bash
cd clipagent/src-tauri && cargo build
APP=/tmp/Fake.app
mkdir -p $APP/Contents/MacOS $APP/Contents/Resources/bin
cp target/debug/clipagent $APP/Contents/MacOS/clipagent
cp bin/yt-dlp bin/ffmpeg bin/ffprobe $APP/Contents/Resources/bin/
$APP/Contents/MacOS/clipagent &
curl -s "http://127.0.0.1:4000/resolve?url=$(python3 -c "import urllib.parse;print(urllib.parse.quote('https://www.youtube.com/watch?v=dQw4w9WgXcQ',safe=''))")"
```

Start it with a clean environment, as Finder would: `env -i HOME="$HOME" USER="$USER"
PATH=/usr/bin:/bin:/usr/sbin:/sbin TMPDIR="$TMPDIR" $APP/Contents/MacOS/clipagent &`. Launched
from a shell, yt-dlp finds Homebrew's `deno` on `PATH`, extracts YouTube differently, and the
DASH preview then fails with `audio index unreadable` and spins forever. The shipped app never
sees that `PATH`, so this is a test-setup artefact, not a product bug (found 2026-11-16).
The same applies to `cargo tauri dev`, which is why dev builds "never resolve" videos.

The agent logs to `~/Library/Logs/ClipAgent/clipagent.log`. `[RESOLVE]` lines tell you which
preview decision was made.
