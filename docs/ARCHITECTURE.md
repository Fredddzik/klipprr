# Architecture

## The shape of the thing

Klipprr is **one desktop process** that happens to contain a web UI and a local HTTP
server, plus **three supporting cloud services** it talks to.

```
┌─ Klipprr.app (Tauri, one process) ──────────────────────────────┐
│                                                                  │
│  WKWebView (macOS) / WebView2 (Windows)                          │
│    └── Next.js static export, embedded in the binary             │
│          talks to ──────────┐                                    │
│                             │ http://localhost:4000              │
│                             │ https://localhost:4001             │
│  Rust "clipagent"           ▼                                    │
│    ├── http.rs      the API surface (9 endpoints)                │
│    ├── resolve.rs   spawns yt-dlp --dump-single-json             │
│    ├── download.rs  spawns yt-dlp + ffmpeg per clip              │
│    ├── license.rs   ed25519 verify, offline                      │
│    └── bin/         bundled yt-dlp, ffmpeg, ffprobe              │
└──────────────────────────────────────────────────────────────────┘
        │                    │                      │
        ▼                    ▼                      ▼
   Supabase             klipprr-web              PostHog
   auth, licenses,      Stripe checkout,         product analytics
   clip_usage_monthly   license signing,
                        Resend email,
                        /api/track
```

### Why a local HTTP server instead of Tauri IPC

Because `<video>` needs a URL it can issue **Range** requests against, and Tauri's IPC
cannot serve a seekable byte stream. Once an HTTP server existed for `/local-preview`, the
rest of the API followed it. This is a defensible choice — keep it.

Two listeners exist: plain HTTP on 4000 and HTTPS on 4001. The UI prefers HTTPS
(`CLIPAGENT_HTTPS`) because a page served over `tauri://` cannot fetch plain HTTP without
mixed-content complaints on some platforms.

## The HTTP API (`clipagent/src-tauri/src/http.rs`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/ping` | GET | Liveness. The UI's "is the agent up" check. |
| `/capabilities` | GET | Plan-derived feature flags from the verified license. |
| `/resolve` | GET | URL → `{id, title, duration, thumbnail, preview, capabilities}`. Runs yt-dlp. |
| `/preview-stream` | GET/HEAD | Range-forwarding proxy for a remote preview URL. **No caching.** |
| `/local-preview` | GET | Serves a local file with Range support. Optional `pcm_fix=1`. |
| `/local-proxy-status` | GET | Poll for the background 720p proxy of a local file. |
| `/yt-preview-cache` | GET | Builds a merged local preview with yt-dlp. `q`, `full`, `hq`, `bg`. |
| `/yt-proxy-status` | GET | Poll for the background high-quality preview of a URL. |
| `/download-all` | POST | The export. Takes the full clip list; runs to completion. |

**Origin policy:** every endpoint except `/ping` checks `origin_is_allowed()`, which
permits `localhost`, `127.0.0.1`, `tauri.localhost` and the `tauri:` scheme. Requests with
no `Origin` header are allowed (non-browser callers). `/preview-stream` additionally
blocks private/loopback targets to prevent the proxy being used for SSRF.

**Concurrency note:** `/resolve` runs under `spawn_blocking`. `/download-all` does **not**
— it blocks a tokio worker for the entire export. See AUDIT.

## The UI (`cliptool/`)

Next.js 16, App Router, `output: export` (fully static), Tailwind v4, React 19.

```
src/app/page.tsx        2,275 lines. Holds nearly all state and orchestration.
src/components/
  VideoViewport.tsx     the <video> element, overlay controls, error surface
  Timeline.tsx          scrub bar, clip markers, in/out handles
  ClipsPanel.tsx        the clip list
  ExportPanel.tsx       979 lines. Format, quality, destination, plan gating.
  LeftSidebar.tsx       URL input, local file load, session
  AccessModal.tsx       sign-in / upgrade
  SettingsModal.tsx     preferences
  WatermarkInterstitial.tsx  free-tier upsell before export
src/lib/
  clipagent.ts          typed client for the agent API — the seam between UI and Rust
  supabase.ts auth.ts license.ts plan.ts capabilities.ts usage.ts
  analytics.ts          posts to klipprr-web /api/track
  posthog-flags.ts      feature flags / A-B
```

`page.tsx` and `ExportPanel.tsx` are the two files that make changes expensive. Treat
splitting them as infrastructure work, not cosmetics — see AUDIT.

## Build coupling (the thing that surprises everyone)

```
cliptool/  --npm run build-->  cliptool/out/
                                   |
                    scripts/copy-out.js moves it to
                                   v
                          clipagent/ui/out/     <-- committed to git
                                   |
                 tauri.conf.json frontendDist embeds it
                                   v
                       Klipprr.app binary
```

Consequences you must internalise:

- A UI change is invisible until `npm run build` in `cliptool/`.
- The build output is **committed**, so every UI change produces 20+ file diffs of
  minified JS and hashed fonts. Code review of UI changes is effectively impossible today.
- `clipagent/ui/` also contains a leftover `package.json`, `next.config.ts`, empty
  `app/`+`components/` dirs, a `.next/` dev cache and 436 MB of `node_modules`. None of it
  is used. It is a fossil of an earlier layout.

## Data model (Supabase, defined in `~/dev/klipprr-local/supabase/migrations`)

- `licenses` — `user_id`, `plan`, `active`, plus a signed desktop payload + signature
- `clip_usage_monthly` — `user_id`, `period_start`, `clips_used`
- `activation_codes` — redeemable codes with a license duration
- RPCs: `reserve_clip_exports(p_plan, p_requested)`, `release_clip_exports(p_count)`

Usage is **reserved before export and refunded on failure**. That is the correct pattern —
it prevents a crashed export from burning quota. Keep it.

## Cross-repo changes

Some changes cannot be made in one repo. Before starting, work out which of these applies:

| Change | klipprr | klipprr-web | klipprr-local |
|---|---|---|---|
| New plan tier | capabilities + `plan.ts` + `license.rs::Plan` | signing, Stripe price | migration, RPC limits |
| New plan limit value | display only | — | RPC + migration |
| New gated feature | capability flag both sides | token claims if new claim needed | — |
| Analytics event | `analytics.ts` / PostHog call | `/api/track` handler if new shape | — |
| Preview/export behaviour | here only | — | — |
| UI/brand | here only (plus site for consistency) | site theme | — |

**The license public key is embedded at build time** from
`KLIPPRR_LICENSE_ED25519_PUB_B64`. If the keypair is ever rotated, every shipped app stops
verifying licences until users update. Treat rotation as a release-blocking event.

## Environments and secrets

Runtime config reaches the UI as `NEXT_PUBLIC_*` and is therefore **public** —
`NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe by design (row-level security does the work), but
never put a service-role key there.

Local dev: `cliptool/.env.local`. CI: GitHub Actions *variables* for the public values and
*secrets* for signing material. See `RELEASE.md`.
