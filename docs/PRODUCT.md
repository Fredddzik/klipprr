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
effects**, which is why audio-only export matters (see `FOUNDER-REQUESTS.md` #5).

## The jobs users hire it for

| Job | Today | Gap |
|---|---|---|
| "Get me this exact 15 seconds" | Works | Cut precision is millisecond, not frame — see PIPELINES invariants |
| "Don't wreck the quality" | Works | "Original" mode is mislabeled and can emit AV1 |
| "Let me find the moment fast" | **Weak** | Preview load and seek latency — the #1 complaint |
| "Give me a batch of clips" | Works | Parallel export, up to 3 concurrent |
| "Just the audio" | **Missing** | No audio-only export at all |
| "Make it not look like a toy" | **Weak** | UI reads as hobbyist; blocks pro adoption |

## Plans and limits

Defined in `cliptool/src/lib/usage.ts` and `plan.ts`, enforced server-side by the Supabase
RPCs `reserve_clip_exports` / `release_clip_exports`, and mirrored in the desktop app by an
ed25519-signed license token.

| | Free | Pro | Max |
|---|---|---|---|
| Clips / month | 10 | 120 | 500 |
| Watermark | Yes | No | No |
| Rename clips | No | Yes | Yes |
| Edit clip range numerically | No | Yes | Yes |
| Custom export path | No | Yes | Yes |
| Export resolution cap | 720p | source | source |

**Known inconsistency:** `plan.ts::PLAN_CAPABILITIES` only defines `free` and `pro`. A `max`
user resolved through that map falls through to whatever the caller defaults to. Rust
(`license.rs::Plan`) and `usage.ts` both know `max`. This is a live bug, not a design.

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
