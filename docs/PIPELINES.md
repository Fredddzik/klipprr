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
- **`/preview-stream` does not cache.** Every seek re-requests bytes from the origin CDN.
  This is why scrubbing a Twitch clip feels laggy even though the clip is short.
- **No frame-level seek affordance.** The timeline seeks by time only.

Any redesign must preserve the invariants below.

---

## 3. Export

`POST /download-all` → `commands/download.rs::handle_download_all`

Two source kinds and two modes:

|  | Speed mode | Quality mode |
|---|---|---|
| **URL source** | `yt-dlp --download-sections` per clip, stream copy into MP4 | full download, then ffmpeg re-encode |
| **Local source** | ffmpeg `-ss/-to` stream copy | ffmpeg re-encode |

Format selectors (speed mode, URL source):

```
universal / watermarked:  bv*[height<=H] + ba / best      → re-encoded to H.264
"original" (stream copy): bv*[ext=mp4][height<=H]+ba[ext=m4a]
                          / bv*[ext=mp4][height<=H]+ba
                          / best[ext=mp4][height<=H] / best[height<=H]
```

Up to **3 clips export in parallel**, each spawning its own yt-dlp + ffmpeg. Quota is
reserved before the run and refunded on failure.

### ⚠ The "Original" label is wrong

The UI calls the stream-copy option **"AV1 – Original"** and warns it "may not play in
QuickTime on older Macs". That is backwards: it is not *supposed* to be AV1. The selector
asks for `ext=mp4`, and YouTube's 1440p/2160p `.mp4` renditions are AV1/VP9, so at high
caps the copy silently picks a codec the user cannot use. With `fast_max_height` now capped
to the tallest H.264 rendition, the resolution picker no longer offers those heights in
stream-copy mode — but **the label and the warning still need fixing**.

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

The agent logs to `~/Library/Logs/ClipAgent/clipagent.log`. `[RESOLVE]` lines tell you which
preview decision was made.
