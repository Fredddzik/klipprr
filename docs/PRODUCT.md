# Product

> Items tagged **[ASSUMPTION]** are inferred from the code, not confirmed by the founder.
> Confirm before building anything expensive on top of them.

## What Klipprr is

A macOS/Windows desktop app that collapses a five-step manual workflow into one screen.

**Without Klipprr**, someone who wants a 20-second clip out of a YouTube video or Twitch
VOD does this: find a sketchy downloader site → download the whole file at whatever quality
it gives → open it in an editor or a trimmer → scrub → export → hope the quality survived.
Ten minutes, three tools, one degraded file.

**With Klipprr**: paste the URL, scrub, mark in/out, export. Under a minute, source quality
preserved, and the export is cut from the original stream rather than from a re-encoded
download.

## Who it is for

**[ASSUMPTION]** The code's shape (watermark on free, clip-count limits, "Editor
submissions" style workflows, TikTok/X/Instagram/Twitch/YouTube support, vertical-format
awareness) points at:

1. **Short-form editors and social media managers** — pulling moments out of long-form
   content to repost. Volume users; the 120/500 clips-per-month tiers are aimed here.
2. **Streamers and their clippers** — Twitch VOD → highlight reel.
3. **Occasional users** — one clip for a presentation or a group chat. The free tier.

The founder is himself user type 1 and also uses the app to **pull audio for sound
effects**, which is why audio-only export matters (`FOUNDER-REQUESTS.md` #5). It shipped as
FR-5 in 0ea0de4: WAV is 48 kHz / 24-bit precisely because that is what the sound-effect use
needs in an editor.

## The jobs users hire it for

Every row below was re-verified against source on 2026-10-19 (see CONTEXT-BRIEFING
findings 29-33). The file references are the authority; do not update a row from another
doc.

| Job | Today | Gap |
|---|---|---|
| "Get me this exact 15 seconds" | Works | Length and start both land on the mark, within one frame (measured 2026-10-19). Stream-copy MP4s keep the keyframe run-up as hidden pre-roll behind an edit list, so a tool that ignores `elst` sees the clip start early; a Matroska local source has no edit list and does start early |
| "Don't wreck the quality" | Works | High Quality with "Re-encode to H.264" off will stream-copy an AV1 or HEVC source into the MP4 |
| "Let me find the moment fast" | Works | Latency not re-measured since FR-7. TikTok and sources with an unreadable DASH index still download before the first frame |
| "Give me a batch of clips" | Works | Parallel export, up to 4 concurrent |
| "Just the audio" | Works | MP3 320k and WAV 48 kHz/24-bit; always forced into Speed mode, never watermarked or capped |
| "Make it not look like a toy" | **Weak** | UI reads as hobbyist; blocks pro adoption. **[ASSUMPTION]** — a founder judgement, not a code fact |

**Row 1, cut precision.** Clip length comes from ffmpeg `-t`/`-to` and is accurate: the
regression suite asserts duration to within 0.35 s (`scripts/export-regression.sh`). The
start was measured on 2026-10-19 (CONTEXT-BRIEFING finding 34) and **it lands on the mark**:
every path measured came in between 0.000 s and 0.033 s of the requested timestamp, at most
one frame. The suite now asserts the start to within 0.15 s on every case, by matching the
clip's first frame against the source at the mark.

That holds for the stream-copy paths too, which is the part worth understanding before
marketing it. Nothing can cut mid-GOP without re-encoding, so the local-file branch
(`download.rs:338`), High Quality without a watermark (`download.rs:1500`) and the Speed
path when `can_stream_copy_to_mp4` says yes (`media.rs:107`) all copy from the keyframe at
or before the mark — and then write an MP4 edit list that starts presentation at the mark.
The keyframe run-up stays in the file as hidden pre-roll (measured 3.0 s to 5.2 s) instead
of appearing at the front of the clip. Re-encoded exports — watermarked Free exports,
Universal/H.264, audio — seek exactly and carry no pre-roll.

Two caveats, and they decide what the marketing copy can say:

- **A tool that ignores MP4 edit lists sees the pre-roll.** Strip the edit list from the
  same clips and they start 0.9 s to 3.9 s early and run long. So the cut is exact in
  QuickTime, a browser and ffmpeg, and not guaranteed in an NLE that ignores `elst`.
- **A Matroska local source has no edit list to hide behind.** The local-file branch keeps
  the source extension, so an `.mkv` or `.webm` input gets neither a trim nor an edit list:
  an 8 s request produced a clip **4.03 s early and 12.23 s long**. Only `.mp4` sources are
  safe today.

What is defensible today is "frame-accurate playback from MP4 sources", not an unqualified
"exact" or "frame-perfect". Fix the Matroska case before dropping the qualifier.

**Row 2, Original mode.** The "mislabeled, can emit AV1" claim that stood here until
2026-10-19 was false on both halves. The label was fixed in 0.1.34 and the button now reads
"Original – no re-encode" with the honest subtitle "Copies the source's own H.264 stream"
(`ExportPanel.tsx:690`). The format selector asks for `avc1` first and falls back through
MP4 tiers (`download.rs:392`), `resolve.rs` counts only H.264 renditions toward the fast
ceiling (unit test `av1_in_mp4_is_never_a_fast_export`), and if a deep fallback does hand
back something else, `can_stream_copy_to_mp4` only copies when the codec is exactly `h264`
— everything else is re-encoded. The one place AV1 still survives into an output is High
Quality mode: `video_mp4_ok` there accepts `h264 | av1 | hevc`, so with the "Re-encode to
H.264" box unchecked an AV1/AAC source is remuxed as-is (`download.rs:1277`). That is the
row's real gap.

**Row 3, finding the moment.** The "#1 complaint" framing predates the preview rebuild and
is not something the code can confirm either way. What the code now does: YouTube previews
stream from a generated DASH manifest over the renditions resolve found (FR-7,
`http.rs:1325`, `dash.rs`), media is fetched through `/preview-stream`, which caches byte
ranges on disk (FR-2), and a 360p copy plays while a 720p one is merged in the background.
The spinner is reached only for TikTok, which downloads a throwaway 60 s preview, and for
DASH-only sources whose index will not probe, which fall back to a downloaded preview
(`page.tsx:1855`). Re-measure before claiming latency as either a win or a gap.

## Plans and limits

The monthly clip limits live in `cliptool/src/lib/usage.ts`
(`PLAN_MONTHLY_CLIP_LIMIT`) and, authoritatively, in the Supabase function itself
(`supabase/migrations/20261017120000_export_reservations.sql`, which hard-codes 500 / 120 /
10 and **ignores the `p_plan` argument**, looking the caller's plan up server-side). The
capability flags are decided by the agent in `license.rs::capabilities_for_plan` and read
by the UI over `get_capabilities` / `GET /capabilities`; `cliptool/src/lib/capabilities.ts`
is only the TypeScript shape.

Enforcement is server-side through the RPCs `reserve_clip_exports` and
`release_export_reservation` (legacy `release_clip_exports` as a fallback), but the **caller
is the agent, not the web app**: `quota::reserve` runs in the `/export` route before any
source branch (`http.rs:1522`), and `quota::settle` refunds whatever did not export
(`quota.rs:127`, `quota.rs:155`). `usage.ts` still exports unused client-side
`reserveClipExports` / `releaseClipExports` wrappers from before 0.1.38 — see
CONTEXT-BRIEFING finding 27. The plan itself is mirrored into the desktop app by an
ed25519-signed license token.

> There is no `cliptool/src/lib/plan.ts`. It was deleted on `main` in 1e9ed06 and the
> `PLAN_CAPABILITIES` map it held exists nowhere in the tree. Earlier revisions of this
> section cited it; they were stale.

| | Free | Pro | Max |
|---|---|---|---|
| Clips / month | 10 | 120 | 500 |
| Watermark | Yes | No | No |
| Rename clips | No | Yes | Yes |
| Edit clip range numerically | No | Yes | Yes |
| Custom export path | No | Yes | Yes |
| Export resolution cap | 720p | source | source |

### Product decision: local files are exported untouched, on every plan

Clips cut from a file on the user's own Mac are a straight stream-copy trim on **every** plan,
Free included: **no watermark, no resolution cap, no re-encode**. The output has exactly the
quality and streams of the file the user loaded (`download.rs`, local-file branch).

One exception to "same format", since 0.1.40: clips from `.mkv`, `.webm` and `.avi` are written
as `.mp4` with the same streams copied. Those containers have no edit list, so a copied cut
started at the keyframe before the IN point (a 4 s clip from an OBS recording came out 6 s).
MP4 cuts exactly. Their preview goes through the local proxy like unplayable audio does.

This is deliberate (founder decision, confirmed 2026-10-09), not a bug:
- The file is already the user's own media, often their own recording or a client's raw
  footage. Stamping it or downscaling it would damage their material for no reason.
- It fits promise 2: source quality survives.
- The watermark and the 720p cap are how Free differs from Pro **for URL sources only**.

What still applies to local files: a free account is required to export, and each clip
counts toward the monthly clip limit. The reservation is taken in the agent's `/export`
route before the local-file branch is reached (`quota::reserve`, `http.rs:1522`), so it is
unconditional and cannot be skipped by source. (It used to be `reserveExportQuota` in
`page.tsx`; that function is gone — the agent took the quota over in 0.1.38.)

Do not "fix" this by adding the watermark or cap to local exports. If the free tier ever
needs a stronger reason to upgrade, change it on purpose, as a pricing decision recorded here.

**Resolved 2026-10-19:** this section used to warn that `plan.ts::PLAN_CAPABILITIES` only
defined `free` and `pro`, so a `max` user fell through to the caller's default. That bug is
gone, because the map is gone with the file. The one authority on capabilities is now
`license.rs::capabilities_for_plan`, which handles `pro` and `max` explicitly and treats
everything else as free, and `usage.ts` and `license.rs::Plan` both still know `max`.

**[ASSUMPTION]** Pricing, trial length, and billing cadence live in `klipprr-web` +
Stripe and are not represented in this repo.

## How money and identity flow

```
User signs in (Supabase magic link, email OTP — no passwords)
  → klipprr-web checks Stripe subscription
  → klipprr-web mints an ed25519-signed license token (payload + signature)
  → token stored in Supabase `licenses` row
  → desktop app pulls it (sync_license_from_supabase) and caches it locally
  → clipagent/src-tauri/src/license.rs verifies the signature offline
  → capabilities gate the UI
```

The **private** signing key lives only in `klipprr-web`. The desktop app embeds only the
public key (`KLIPPRR_LICENSE_ED25519_PUB_B64`, injected at build time; the raw base64url
copy in `cliptool/keys/` is the public half and is safe to commit). This is a genuinely
good design: licences verify offline, and compromising the app does not let anyone mint
licences.

## Competitive position

**[ASSUMPTION]** — stated so the team argues with it rather than absorbing it silently.

- **Browser extensions / downloader sites** — free, sketchy, no editing, no precision.
  Klipprr wins on trust and on cutting precision.
- **Premiere / Resolve / CapCut** — vastly more capable, but they will not ingest a URL.
  The user has to download first. Klipprr wins on time-to-first-clip, not on features.
  **We should never try to become an NLE.**
- **Opus Clip / Vizard (AI clippers)** — automatic clip selection. Different job: they
  decide *what* to clip; Klipprr assumes the user already knows and wants control.

The defensible position is **speed and fidelity for someone who already knows the moment
they want**. Every roadmap item should be judged against that sentence.

## What would make the product fail

1. **Preview latency.** If finding the moment is slow, the core time-saving claim dies.
   This is currently the weakest link and the founder has flagged it twice.
2. **A broken yt-dlp.** Platforms change extraction constantly. The weekly bump workflow
   exists for this reason; it must stay healthy.
3. **Trust.** Unsigned builds, Gatekeeper warnings, or anything that smells like a
   downloader site costs conversions disproportionately for a paid desktop tool.
4. **Looking unserious.** A pro tool that looks like a weekend project does not get paid
   for. This is the business case behind the UI rebrand request.
