# Founder request queue

Each entry: what was asked → what is actually happening → what we should do.
The founder describes symptoms, not causes. Translating is our job, not theirs.

Status: `needs-decision` · `ready` · `in-progress` · `done`

---

## FR-1 — YouTube preview takes 30+ seconds

**Asked:** *"seems like it loads straight to HD quality without loading the low qualities
first for workflow speed."*

**Actual cause:** the theory is wrong but the instinct is right. It does load low quality
first — the problem is that it **downloads the entire low-quality file to disk before
showing a single frame**. `/yt-preview-cache` is called with `full=1`, runs yt-dlp to
completion, and only then returns a path. A 10-minute video is ~10 MB and takes ~9 s; a
one-hour podcast is minutes. The 720p copy downloads afterwards in the background, so HD is
not the delay.

The reason it downloads at all: YouTube frequently publishes no muxed (video+audio) format,
so there is no single URL a `<video>` element can play. Video and audio must be merged
locally first.

*Partially mitigated (Sept 9):* when YouTube *does* publish a playable 360p rendition, the
app now streams it immediately and upgrades to 720p in the background — first frame is
instant. But that rendition's availability varies per request, so on any given video we may
still fall into the download-and-wait path.

**Recommendation:** see FR-3 — this and FR-2 are the same architectural problem.

**Measured and partly fixed (2026-09-29)**, on a 44-minute video (160 MB at 360p):

| Approach | Time to first frame |
|---|---|
| 360p and 720p downloading at once (before) | 22.0 s, and the 360p download sometimes failed |
| 360p alone, 720p started after it (now) | 14.5 s |
| Reusing resolve's JSON (`--load-info-json`) | saves ~2 s only |
| 240p instead of 360p; 48 kbps audio | no faster: YouTube throttles per request, not by size |
| First 2 minutes only (`--download-sections`) | **74 s**: yt-dlp hands sections to ffmpeg, which YouTube throttles to near real time. Phase 2's head-first plan via yt-dlp is dead |

Shipped: the HQ download starts after the low-res one; each download retries once and
logs yt-dlp's error; the viewport keeps "Preparing preview…" until something is actually
playable or both downloads have failed (it used to flash the DRM message mid-download).

What is left scales with video length: any full download of a long video takes seconds.
The only route to a ~1–2 s first frame on YouTube is not downloading at all: play the DASH
video and audio streams directly through Media Source Extensions, fetched via
`/preview-stream` (whose FR-2 disk cache then makes every revisited region instant). That
is FR-3 phase 3, sized M–L.
**Interim (S):** fetch a short head section first (~90 s) so work can start in a few
seconds, continue the full-length download behind it, and show which part of the timeline
is ready.

**Decision (2026-09-10):** ship Phases 1+2 of FR-3. **Status:** `ready`

---

## FR-2 — Seeking in a Twitch clip preview takes seconds

**Asked:** *"clicking on the timeline, it takes a few seconds to actually skip to that
part, even if the clip is only a minute."*

**Actual cause:** Twitch clips resolve to a directly playable URL, so the app streams them
through `/preview-stream` — a **pass-through proxy with no cache**. Every seek makes the
`<video>` element issue a fresh Range request, which the agent forwards to Twitch's CDN and
never stores. Seek backwards to somewhere you already watched and it is re-downloaded from
the internet again. Round-trip latency to the CDN, every time.

The clip being short is irrelevant — nothing is kept.

**Fix (S–M):** give `/preview-stream` a disk-backed byte-range cache keyed by source URL.
First pass through a region costs a network round trip; every subsequent seek to it is a
local disk read. For a one-minute clip the whole thing lands in cache within seconds of
normal scrubbing and seeking becomes instant.

This is a contained, low-risk change and does **not** require the FR-3 redesign. It is the
highest value-per-hour item in the queue.

**Fixed (2026-09-29):** `src/preview_cache.rs`. Every byte relayed through `/preview-stream`
is written at its offset in a sparse file under `$TMPDIR/clipagent_preview_cache/stream/`,
and the covered ranges are tracked in memory. Once a URL's size is known, requests are
answered locally: cached runs from disk, gaps fetched from the origin and cached on the way
through. Bytes are stored verbatim, so preview time is unchanged. 2 GB budget, least recently
used entries evicted first; the directory is wiped on first use each launch. macOS only;
Windows keeps the old pass-through (writing far past EOF zero-fills on NTFS).

Measured against a 30 MB public MP4, every response byte-compared with the origin:

| | Cold (network) | Cached |
|---|---|---|
| 2 MB range at the start | 228 ms | **2.5 ms** |
| 2 MB range at 20 MB | 206 ms | **2.3 ms** |
| 23 MB span over three cached runs and two gaps | 411 ms | **12 ms** |

Also verified: a request the player abandons halfway keeps what it received; `HEAD`,
past-the-end (`416`) and full `GET` without `Range`; a real `<video>` element seeking
8 → 2 → 5 → 9.5 s lands on each exact time.

**Status:** `done`, pending founder verification on a real Twitch clip.

---

## FR-3 — Consider replacing the preview system; find an industry standard

**Asked:** *"maybe try to find an industry standard that is used for apps similar to mine,
but make sure creating clips and exporting them can still work with timestamps that match
what the user sees."*

### Pushback on "completely"

A full replacement is not warranted and would put the working parts at risk. The tiering,
the playhead-preserving quality swap, the Range-capable local server and the cache-keying
are all correct and are exactly the foundation a better system needs. What is missing is
**one layer**: nothing is cached, and nothing plays until a whole file exists.

### The industry standard is proxy media — and we already half-implement it

Premiere Pro, DaVinci Resolve and Final Cut all solve "the source is too heavy to scrub" the
same way: generate a **lightweight local proxy**, edit against the proxy, and **conform the
export back to the original**. That is precisely our architecture. We are not missing a
standard; we are missing the delivery mechanics that make proxies feel instant:

1. **Cache what you fetch** (fixes FR-2).
2. **Start playing before the file is complete** (fixes FR-1).

For (2) the standard mechanism is **segmented delivery** — HLS. Generate the proxy as an
HLS playlist with ~4 s segments; the player starts on segment 1 and fetches segments on
demand. macOS is favourable here: WKWebView plays HLS natively, no library needed. Windows
(WebView2/Chromium) needs `hls.js`, which is the mature standard choice.

### Proposed plan

| Phase | Work | Effect | Effort |
|---|---|---|---|
| 1 | Disk byte-range cache on `/preview-stream` | FR-2 fixed | S |
| 2 | Head-first fetch + ready-region indicator on the timeline | FR-1 mostly fixed | S–M |
| 3 | ffmpeg-generated HLS proxy, segments served on demand | ~1–2 s to first frame regardless of source length; instant seeks | M–L |

Phases 1 and 2 ship independently and are worth doing even if 3 never happens.

### Timestamp integrity — the founder's real concern

This is the right thing to worry about and it is protected by three invariants
(`PIPELINES.md`), which any redesign must keep:

- The **timeline duration always comes from resolve**, never from the proxy file. A partial
  or shorter proxy cannot redefine the timeline.
- Proxies are generated with **no trim offset and no frame-rate conversion**, so proxy time
  equals source time exactly.
- **Export never reads the proxy.** It re-fetches from the source and cuts there. Proxies
  are disposable cache.

Separately, and honestly: cuts today are **millisecond-precise, not frame-precise**, and
stream-copy cuts snap to keyframes. If "frame perfect" is a claim we want to make in
marketing, that is its own work item — see `PIPELINES.md`.

**Decision (2026-09-10):** **Phases 1 and 2 now.** Phase 3 (HLS) is deferred, not
rejected — revisit once we see how phase 2 performs on long sources.
**Status:** `ready`

---

## FR-4 — Rebrand: professional UI, and a colour that is not AI-purple

**Asked:** Premiere Pro's Export tab as the reference; move away from pink/purple.

**Agreed, and the business case is real.** A tool that looks like a weekend project cannot
charge subscription prices to professionals. The Premiere reference is a good one — but
what makes that screen feel professional is not its colours, it is:

- **Information density.** Everything is on one screen; nothing is hidden behind a wizard.
- **A near-monochrome surface.** Greys carry the whole layout; colour appears perhaps twice.
- **Left-aligned labels in a fixed column**, values right — scannable like a spec sheet.
- **Truthful summaries.** The "Output" block states codec, resolution, fps, colour space,
  bitrate and estimated size. It respects the user's expertise.

That last point is a product opportunity, not just visual: we currently *hide* what the
export will actually be. An honest output summary block would fix the "AV1 – Original"
confusion at the same time.

### Colour recommendation

Purple/pink now reads as "AI wrapper" — the founder's instinct is correct. Two constraints
push against the obvious replacement: Adobe blue reads as derivative, and Premiere's own
brand colour is *also* violet.

**Recommendation: graphite UI + a single saturated amber accent**, used only for the
primary action, the playhead and the in/out markers. Amber reads as film and render, is
highly legible on dark, and is not the SaaS-blue or AI-purple cliché. Red stays reserved
for destructive actions so amber never collides with warning semantics.

**Alternative: desaturated teal** — safer, more technical, less distinctive.

### Pushback: do not rename

"Rebrand" should mean visual identity only. The name, domain, `klipprr-releases` repo,
installed base, auto-update endpoints and any SEO all depend on `Klipprr`. Changing the name
costs real money and buys nothing the visual work does not already deliver.

### Do it together with the refactor

`page.tsx` (2,275 lines) and `ExportPanel.tsx` (979) have to be opened for this work
anyway. Extracting state into hooks *during* the rebrand is the cheapest this will ever be.

**Decision (2026-09-10):** **graphite surface + amber/signal-orange accent.** Name stays
Klipprr. Do the state extraction from `page.tsx` as part of the same work.
**Status:** `ready`

---

## FR-5 — Export as MP3

**Asked:** *"there should be an option to choose to export as MP3, as I've often used this
for exporting sound effects."*

**Straightforward and worth doing.** There is currently no audio-only export path at all —
this is new functionality, not a setting. ffmpeg is already bundled and already in every
export path, so the pipeline cost is small: an "Audio only" mode that maps the audio stream,
skips video, and encodes to the chosen container.

**Recommendation — offer MP3 *and* WAV.** The stated use case is sound effects, and SFX
going into an editor should be lossless; MP3 is the right choice for sharing and for voice.
Suggested: MP3 320 kbps, and WAV 48 kHz 24-bit.

Open questions for the founder (see below): does an audio export consume a clip from the
monthly quota, and does the free tier's watermark have an audio equivalent (it should not —
there is no sensible audio watermark, so audio export is arguably a paid feature or simply
unwatermarked).

**Business note:** market this as *sound effects, quotes and podcast excerpts*. Positioning
it as music extraction attracts takedown pressure and payment-processor scrutiny that a
small paid desktop app does not want.

**Decision (2026-09-10):** ship **MP3 320 kbps and WAV 48 kHz/24-bit**. An audio export
**counts as one clip** against the monthly quota, same as video.
**Status:** `ready`

---

## Cross-cutting: what the founder has not asked for but should know

- There are **three competing definitions of what each plan can do**, and two of them are
  dead code wired to nothing (`AUDIT` A4). Billing is fine today — a Max licence gets full
  features, verified — but the next gated feature has good odds of being wired to the dead
  map, which is missing the Max tier entirely. Cheap to remove now, expensive as a
  refund-and-apology later.
- The **"AV1 – Original"** export label is wrong and tells users their export may not play.
  It reads as a broken product when it is a naming bug (`AUDIT` B12).
- The repository is **388 MB** and grows 37 MB every week automatically (`AUDIT` A1).

---

## FR-6 — Large local recordings: whole file loads, seeking takes 30s

**Asked:** *"cutting clips from a large raw recording from my client (Linear PCM, H.264,
HD, 2.6 GB). The preview loads the whole massive file, and skipping 3 minutes into the
video takes 30 seconds."*

**Actual cause — two problems, only one of them the obvious one.**

*The stall was a race, not a seek.* Local files with PCM/ALAC/FLAC audio go through a
"pcm fix" that remuxes the source into a playable MP4. That remux had no lock, and its only
readiness check was "does the output file exist". ffmpeg creates the output immediately and
writes the index (`moov` atom) **last**, so one second in the file existed at 304 MB and was
completely unparseable. The `<video>` element opens several range requests at once, so a
second request was handed that unplayable file, could not read the index, and stalled until
the remux finished and it happened to retry. Reproduced exactly: `moov atom not found`.

*The whole-file read was waste.* The fix remuxed all 2.6 GB just to re-encode the audio
track, and the background 720p proxy then re-read the same 2.6 GB. Two full passes before
the file was comfortably scrubbable.

**Fixed (2026-09-10):**

- **Head proxy first.** Only the opening 30 s is prepared up front, so playback starts
  almost immediately. It is built to a scratch name and renamed into place — a rename is
  atomic, so the cache path only ever exists as a complete, playable file. A concurrent
  request waits on a lock instead of being handed a partial.
- **No pointless re-encode.** If the source video is already H.264 — every screen recorder,
  most cameras, this client file — the proxy stream-copies the video and only fixes the
  audio. That keeps the **original resolution** (previously the background proxy dropped
  previews to 720p) and finishes several times faster. The 720p re-encode is now reserved
  for sources the webview genuinely cannot play, like ProRes and DNxHD.
- **Head length adapts:** 30 s when the full proxy is seconds away (stream copy), 120 s
  when it is a slow re-encode.
- **Sequential, not concurrent.** Overlapping the two ffmpeg passes made them fight for
  disk; on a 40 Mbps source that pushed the first frame from ~1 s out to ~12 s.
- `/local-preview` moved off the async executor — it ran ffmpeg inline, so concurrent range
  requests each tied up a worker.

Measured on a 1.1 GB / 4 min / 39 Mbps H.264 + Linear PCM file, cold cache:

| | Before | After |
|---|---|---|
| First frame | full remux, then a stalled retry | **0.63 s** |
| Whole file scrubbable | ~30 s, racing | **4.7 s** |
| Seek to 3:00 | ~30 s | **0.002 s** |
| Preview resolution | dropped to 720p | **stays 1080p** |

Their 2.6 GB file should see the same first-frame time (the head is bounded by duration,
not file size) and roughly 11 s to fully scrubbable.

**Status:** `done`, pending founder verification on the real client file.

---

## FR-7 — Rebuild the YouTube preview: long videos never become watchable

**Asked (2026-09-30):** *"a 2 hour video is more than 9 minutes into loading into preview
and still hasn't loaded."* Revise the preview system for YouTube.

**What actually happened, from the log and the cache directory.** The 360p preview of the
2 h 13 min video (345 MB) downloaded in **36 s**. The viewport never showed it. 0.1.30
ran the post-download work (remove the "in progress" lock, start the 720p copy) *after*
awaiting the download inside the HTTP handler. The webview had abandoned that request, hyper
dropped the handler, and none of it ran: lock left behind, HQ never started, viewport stuck on
"Preparing preview…". A regression from 0.1.30's reordering.

**Fixed in the working tree (ships as 0.1.31):** the post-download work runs inside the
download task itself; `/yt-proxy-status?q=` reports a finished low-res copy (`lq_path`) so the
viewport plays it even when its own request was lost; a second request no longer starts a
duplicate download into the same file.

**What is still wrong after that fix, and why this is its own item.** A full download before
the first frame is the wrong design for long sources:

| Source length | Low-res preview, measured | Scales with |
|---|---|---|
| 44 min | 14.5 s (160 MB) | length |
| 2 h 13 min | 36 s (345 MB), on a fast connection | length |

On an average home connection the 2-hour case is several minutes, and a 4-hour VOD is worse.
FR-1's cheap fixes are exhausted (see its table): smaller renditions and
`--download-sections` do not help, because YouTube throttles per request rather than by size.

**Proposal: stream instead of download (this is FR-3 phase 3, now the top engineering item).**
YouTube serves video and audio as separate DASH streams. The webview can play those directly
with Media Source Extensions (WKWebView supports MSE on macOS), fetching byte ranges on demand
through `/preview-stream`, whose FR-2 disk cache then makes every revisited region instant.
First frame becomes ~1–2 s regardless of length, and nothing is downloaded that the user does
not watch. The timing invariants in `PIPELINES.md` hold: the streams *are* the source, so
preview time is source time.

Open questions before building: whether resolve's format URLs carry the `indexRange` /
`initRange` MSE needs (if not, parse the `sidx` box ourselves); how long the signed URLs stay
valid for a long editing session (re-resolve on 403); Windows (WebView2 also has MSE).
**Effort:** M–L. **Risk:** medium, touches the preview path every YouTube user hits.

**Related risk found at the same time: yt-dlp now wants a JavaScript runtime for YouTube.**
The log shows `No supported JavaScript runtime could be found … YouTube extraction without a
JS runtime has been deprecated, and some formats may be missing`, followed by
`HTTP Error 403: Forbidden` on the first attempt (the retry succeeded). yt-dlp's EJS support
expects Deno. Today YouTube works without it, degraded; when YouTube tightens further it may
stop working entirely. Decide before that happens: bundle Deno (~100 MB, would roughly double
the app download) or accept the degradation. Needs measuring: how often downloads fail with
and without it.

**Built (2026-09-30).** `dash.rs` + `/yt-dash.mpd` + Shaka Player (DASH-only build,
521 KB, Apache-2.0) in `VideoViewport`. Resolve remembers the H.264 (≤1080p) and AAC
renditions; the manifest endpoint reads each file's first 64 KB for its `moov` and `sidx`
ranges (seeding the FR-2 cache with them) and serves an on-demand DASH manifest. Any Shaka
error falls back to the old download path. Measured on the 2 h 13 min video:

| | Downloaded preview (0.1.31) | Streamed |
|---|---|---|
| Manifest ready | n/a | 0.35 s |
| First frame | minutes | 0.2 s |
| Quality | 360p, 720p later | 1080p from the start (Shaka's ABR picks) |
| Seek to 1 h / 2 h 10 m | after the full download | 1.3 s / 0.7 s |
| Seek back to a watched region | instant | 0.05 s (disk cache) |

Verified in Chromium (every seek landed on the exact requested time) and in the real app
(WKWebView): the video opened at 1080p at a saved mid-video position.

**Deno decision (same day):** not bundled. 8 videos × 2 rounds with and without it: 32/32
downloads succeeded either way, formats and timings equal. +40 MB for no measured gain.
Revisit if `[YT-PREVIEW]` failures appear in logs.

**Known limits:** YouTube's signed media URLs expire after some hours, so a preview left open
that long will fail on its next fetch and fall back to the download path (re-loading the URL
also fixes it). Windows is untested (WebView2 has MSE, so it should work).

**Status:** `done`. Founder-tested in the app 2026-09-30: seeks anywhere in the 2-hour video under half a second. Ships as 0.1.32.

---

## FR-8 — Daily health check: does every platform still resolve, preview and export?

**Asked (2026-09-30):** an automated job, every day or few days, that checks the app still
works (resolving and exporting a clip) on each supported platform, since YouTube and yt-dlp
change often.

**Agreed, and daily is the right cadence.** Breakage is sudden (YouTube changes something,
or a yt-dlp release regresses) while yt-dlp itself releases every 2–4 weeks. Daily means a
break is found within a day, usually before a user hits it. A run takes a few minutes.

**The one design constraint: it cannot run on GitHub's servers.** YouTube, Instagram and X
treat datacenter IP addresses as bots ("Sign in to confirm you're not a bot"). A check run
from GitHub Actions would fail for reasons users never see, and false alarms train everyone
to ignore it. It has to run from a normal home connection, like users have: the founder's
Mac, on a schedule (launchd, or a Claude Code scheduled task). A day the Mac is off or asleep
is simply skipped.

**What each run does**, using the *installed* Klipprr's own bundled yt-dlp and ffmpeg, so it
tests exactly what users have:

1. For each platform, one fixed public test URL: YouTube (a long video and a Short), Twitch
   VOD, Twitch clip, Instagram Reel, X video.
2. **Resolve:** yt-dlp returns formats, with an H.264 rendition where the app expects one.
3. **Preview:** for YouTube, the DASH index probe behind `/yt-dash.mpd` (FR-7) succeeds.
4. **Export:** download a 10-second section, cut it, and check duration and codecs with ffprobe.
5. **Freshness:** report whether yt-dlp has a newer release than `tools.lock` pins.

It stays silent when everything passes. On a failure it sends a macOS notification and writes
a report; as a Claude Code scheduled task it can also read the error, check yt-dlp's issue
tracker and release notes, and propose the fix.

**Telling "the video is gone" apart from "Klipprr is broken".** A deleted or private test
video must not raise a breakage alarm. Two safeguards:

- **Two test URLs per platform;** an alarm only when both fail.
- **An independent availability check on any failure.** YouTube and X publish oEmbed
  endpoints that return "not found" for removed or private videos, with no yt-dlp involved.
  Instagram's oEmbed needs a Meta API token, so there the script classifies yt-dlp's own
  error text ("unavailable", "removed", "private"). A missing video becomes a low-priority
  note ("replace the X test link"), not an alarm.

**Test URLs.** Start with stable public videos; move to our own uploads when they exist,
since we control those. YouTube uploads can be **unlisted**: they play for anyone with the
link and need no login, and stay off the channel and search. Private videos cannot be used.
Twitch deletes past broadcasts after a few weeks, so the Twitch VOD test must be a highlight
or an upload, which are permanent. Instagram and X have no unlisted mode.

**Nothing leaves the machine.** The script drives the bundled binaries directly, not an
account's export, so no clip is uploaded, stored or counted against any plan limit. Clips
go to a temporary folder and are deleted at the end of each run; only the report is kept.

**Effort:** S (a script, `scripts/health-check.sh`, plus the schedule).
**Built (2026-09-30):** `scripts/health-check.py` + `scripts/health-check.json`, run daily at
~10:10 by the Claude Code scheduled task `klipprr-daily-health-check`, which also investigates
any breakage (tries the newest yt-dlp, searches upstream issues) and reports a fix. Runs when
the Claude app is open; a missed run happens at next launch. First full run: all five
platforms OK in 3 minutes. Verified that a deleted video is reported as a gone link, and a
simulated extractor failure as BROKEN.

Noticed while building it: YouTube's "Original" export picks AV1 when YouTube offers it,
because the selector only asks for an MP4 container (see AUDIT B12).

**Status:** `done`.

---

## FR-9 — "Unable to load preview / DRM" flashes while a new video loads

**Asked (2026-09-30):** after clipping one video, pasting a new URL and clicking Load
sometimes shows the DRM error before the video resolves. A new user would think it failed.
Must be fixed in the next release.

**Cause.** Loading a new URL cleared `resolvedUrl` but kept the previous video's
`videoData` on screen for the ~8 s resolve. The viewport then computed "old video, no URL",
found no source, and rendered its only no-source state, which was the DRM message. The
deeper flaw: one message meant both "still loading" and "every source failed".

**Fix.** A new load clears `videoData` too, so the loading skeleton shows until the new video
resolves. And the viewport now shows the error only when the page says every preview source
has failed (`unavailable`: both YouTube downloads failed, or TikTok's only download failed);
any other moment without a source shows "Preparing preview…".

**Status:** `done`. Founder-tested 2026-09-30: a second load shows the loading placeholder, no error. Ships in 0.1.33.

---

## FR-10 — Rebuild sign-in to the desktop app on the industry standard

**Asked (2026-09-30):** revise how users sign in to the app, based on the industry standard.

**How it works today.** The app opens `klipprr.com/login?redirect=clipagent://auth-callback`
in the browser. After login, the website redirects to
`clipagent://auth-callback#access_token=…&refresh_token=…`; macOS hands that URL to the app,
which stores both tokens in `supabase_session.json` in its data folder, as plain text.

**What the standard is.** OAuth 2.0 for native apps (RFC 8252), as used by Slack, Figma,
Spotify, VS Code and GitHub Desktop:

1. Sign in happens in the user's own browser, where their password manager and existing
   Google session live. *Klipprr already does this; keep it.*
2. The browser sends back a **one-time code, never the tokens themselves** (Authorization
   Code flow with PKCE). The app exchanges the code, plus a secret it generated at the start,
   for tokens directly with the server. Anything that intercepts the redirect gets a code it
   cannot use. Supabase supports this (`flowType: "pkce"`, `exchangeCodeForSession`).
3. The redirect goes somewhere only Klipprr can receive: a loopback address
   (`http://127.0.0.1:<port>/auth/callback`; the agent already runs a local server) or a
   macOS Universal Link on `klipprr.com`. A custom scheme like `clipagent://` can be
   registered by any app on the Mac.
4. A random `state` value round-trips through the browser, so the app only accepts the
   sign-in it actually started.
5. Tokens are stored in the **macOS Keychain** (Windows Credential Manager on Windows),
   not a readable file. The `keyring` crate for this is already a dependency, unused.
6. Signing out revokes the refresh token on the server, not just locally.

**Where Klipprr differs, and why it matters.**

| | Today | Standard | Risk today |
|---|---|---|---|
| What comes back from the browser | access + refresh tokens in the URL | one-time code (PKCE) | tokens can leak via the URL: browser history, logs, a hijacked scheme |
| Redirect target | `clipagent://` custom scheme | loopback or Universal Link | another app can register the same scheme and receive a user's tokens |
| Stored where | plain JSON file | OS Keychain | any process running as the user can read and reuse the refresh token |
| Login mix-up protection | none | `state` parameter | a crafted link could sign a user into someone else's account |
| Sign out | local only | server-side revocation | a copied refresh token keeps working |

None of these is an active incident. Together they are the difference between an indie
project and the kind of login a professional buyer's IT team would accept.

**UX parts of the same standard** (these also cost conversions, since exporting requires an
account):
- The browser page after login says "You're signed in, return to Klipprr" with a button that
  reopens the app, and the app comes to the front on its own.
- If the browser never returns (user closed the tab), the app offers "Didn't work? Sign in
  again" instead of waiting forever.
- Measure it: how many people who click Sign in in the app finish signing in. Today that
  number is unknown.

**Scope.** Two repos: `klipprr-web` (the `/auth/clipagent` and `/upgrade` pages that build
the deep link, switch to PKCE and the new redirect) and the app (start the flow with a PKCE
verifier and `state`, receive the callback on the loopback server, exchange the code, move
storage to the Keychain, migrate existing sessions once so nobody is signed out by the
update). Keep `clipagent://` working for one or two releases so older app versions can still
sign in.

**Effort:** M. **Risk:** medium: sign-in is on the path to every export, so it needs an
end-to-end test on a clean Mac before shipping.
**Status:** `ready`.

---

## FR-11 — Export progress panel: real progress, real per-clip cancel, no false alarms

**Asked (2026-09-30):** the export panel is ugly. The bar races to the middle, stops, then
jumps to the end when no re-encode is needed; cancel only works on all clips at once; it
says "Connection lost" on exports that succeed; two headers both say "Exporting clips".

**Causes, found in `ExportPanel.tsx` and `download.rs`:**

- **The first half of the bar is simulated.** Section downloads (`--download-sections`) run
  through ffmpeg, which prints `time=00:00:04.12` progress, not the `[download] 42%` lines
  the agent parses. With no real signal, the UI animates 0→47% on a timer set to half the
  clip's length, then waits near 50% for the download to finish. On the stream-copy path
  the remaining work takes milliseconds, so the bar jumps from ~50% to 100%.
- **Cancel stops nothing.** The ✕ aborts the HTTP request and hides the panel; yt-dlp and
  ffmpeg keep running and the clips still appear. There is no cancel in the agent at all,
  so per-clip cancel was impossible.
- **"Connection lost" is self-inflicted.** `/download-all` keeps one HTTP request open for
  the whole export; the webview abandons it on long exports while the agent carries on and
  keeps sending progress events.
- **Duplicate header.** A leftover "Exporting clips" subheading under the main title.

**Fix:**
1. Real download progress: parse ffmpeg's `time=` from yt-dlp's output (it uses `\r`, not
   `\n`), divided by the clip length. Stream-copy exports spend their whole time
   downloading, so that phase fills 0→95%; re-encodes keep 0→50% download, 50→100% encode.
   The timer simulation is removed.
2. Real cancel, per clip and for all: the agent tracks each clip's yt-dlp/ffmpeg processes,
   `POST /export-cancel` stops them (process group, so yt-dlp's ffmpeg child dies too), the
   clip reports "cancelled" (not "failed"), its temp files are removed and its clip-quota
   reservation is released. Clips still waiting their turn are skipped.
3. `/download-all` answers as soon as the export has started; progress, completion and
   errors come through events only. No request to lose, so no "Connection lost".
4. One header ("Exporting 2 of 3 clips"), one row per clip with a clear state (Waiting,
   Downloading 42%, Finishing, Done, Cancelled, Failed) and its own cancel button.

Also fixed on the way: local-file and High Quality exports never reported a failed clip,
so the panel waited on it forever (another route to "Connection lost").

**Verified against the real agent (2026-10-01):** `/download-all` answers in under 1 ms;
cancelling one of three 60 s clips stopped it with no file and no temp leftovers while the
other two came out at exactly 60.0 s; "Cancel all" mid-download took all 8 yt-dlp/ffmpeg
processes to zero within a second, wrote no files and closed the export; cancelling an
export that already finished answers `running: false` so the panel closes.

**Status:** `done` pending the founder's look at the new panel; ships in 0.1.34.

---

## FR-12 — Restricted posts (age-limited Instagram, age-gated YouTube) cannot be loaded

**Asked (2026-10-01):** an Instagram Reel failed with yt-dlp's raw "Instagram sent an empty
media response" error.

**Cause: the post, not Klipprr.** Logged out, Instagram shows the page as "People under 18
can't see this content. This account has set limits on who can see their profile and
content." Klipprr, like most clippers, fetches without an account, so Instagram returns
nothing. The latest yt-dlp nightly (2026.09.27) fails the same way; it is not a bug to wait
out.

**Fixed now (0.1.34):** the error is classified instead of dumped. Instagram's empty media
response maps to `login_or_private` ("This post is private or restricted, for example
age-limited…"), and YouTube's age gate gets its own `age_restricted` message. Before, the
age gate ("Sign in to confirm your age") matched the bot-block rule and told the user
YouTube was blocking automated access, which was wrong.

**The real fix is a product decision: let users sign in through their browser.** yt-dlp can
use the user's own browser login (`--cookies-from-browser`). That would open age-limited and
private-but-followed posts, and age-gated YouTube.
- Safari's cookies are blocked by macOS for apps without Full Disk Access; Chrome, Brave,
  Edge and Firefox work, with a one-time Keychain prompt for Chromium browsers.
- Everything stays on the Mac (promise 4 holds): cookies are read locally and only sent to
  the platform they belong to.
- **The risk lands on the user's account.** Instagram and YouTube flag accounts used by
  download tools; heavy use can get an account rate-limited or suspended. This has to be
  opt-in, per platform, off by default, with that warning in plain words.

**Recommendation:** build it as an opt-in setting ("Use my Chrome login for Instagram"),
once there is evidence users hit restricted posts often. The health check and the resolve
log can count `login_or_private` and `age_restricted` errors to provide that evidence.
**Effort:** M. **Status:** `parked` pending demand.

**Follow-up (2026-10-05): newer Reels failed even when public.** `DeFM9aGsYbg` resolved in
yt-dlp but the app rejected it with no message. Instagram now lists its plain MP4
renditions with no codec, size or duration, and resolve required a duration. Fix: resolve
probes one unlabelled MP4 with ffprobe (well under a second) and labels them all (they were
H.264 + AAC, 720×1280, 26.19 s), with a duration fallback from formats or the media itself.
Side effect: such Reels now preview instantly from the direct file instead of downloading.

The same investigation found exports coming out as VP9 (Instagram) and AV1 (YouTube) on
"Original", because the selector asked only for an MP4 container (AUDIT B12). It now prefers
H.264, matching the fast-export ceiling resolve computes from H.264 renditions, and uses
yt-dlp's `^=?` / `<=?` so Instagram's unlabelled H.264 files still qualify. Verified: one
clip each from Instagram, YouTube, Twitch and X all came out H.264 + AAC at the right length;
the daily health check passes on all 10 links, all H.264.
