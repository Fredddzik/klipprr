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

**Status:** `ready`

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
