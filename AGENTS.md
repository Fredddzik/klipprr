# Klipprr — start here

You are working on **Klipprr**, a desktop app that turns a video URL into exported clips.
Read this file fully before touching code. It is short on purpose; the detail lives in `docs/`.

## The one-sentence product

> Paste a video URL, scrub to the exact moments you want, mark in/out, and export
> broadcast-ready clips at source quality — without downloading the whole video by hand,
> without a browser extension, and without opening an NLE.

## The four promises we must never break

1. **What you see is what you cut.** A timestamp in the preview must produce the same
   frame in the export. Preview quality may be lower than the export; preview *timing*
   may not differ.
2. **Source quality survives.** Exports do not silently re-encode or downscale. When a
   re-encode is unavoidable, we say so in the UI before the user commits.
3. **The app stays responsive.** No operation blocks the UI without a progress signal.
   Long work runs in the background and streams progress.
4. **Nothing leaves the machine that doesn't have to.** Media is fetched and processed
   locally. We are not a cloud transcoder and must not become one by accident.

## Repo map (four locations, one product)

| Location | What it is | Owns |
|---|---|---|
| `~/dev/klipprr` (this repo) | Desktop app | Tauri/Rust agent + Next.js editor UI |
| `~/dev/klipprr-web` | Marketing site + API | Stripe, Resend, license *signing*, `/api/track` |
| `~/dev/klipprr-local` | Supabase | migrations, plan/usage schema, docs |
| `~/dev/klipprr copy` | **Stale manual copy — do not use.** Slated for deletion. | — |

Changes to licensing or plans usually touch **two or three** of these. See
`docs/ARCHITECTURE.md#cross-repo-changes`.

## Where things are in this repo

```
clipagent/src-tauri/   Rust desktop agent — the real engine
  src/http.rs            localhost HTTP API (:4000 / :4001) the UI talks to
  src/commands/resolve.rs  URL -> metadata + preview decision
  src/commands/download.rs export pipeline (yt-dlp + ffmpeg)
  src/license.rs         ed25519 license verification
  bin/                   BUNDLED BINARIES (yt-dlp, ffmpeg, ffprobe) — see AUDIT
cliptool/              Next.js editor UI (static export, embedded in the app)
  src/app/page.tsx       2,275-line god component — see AUDIT
  src/components/        Timeline, VideoViewport, ExportPanel, ClipsPanel
  src/lib/clipagent.ts   typed client for the agent's HTTP API
clipagent/ui/out/      BUILD OUTPUT, COMMITTED TO GIT — see AUDIT
docs/                  You are here
```

## Non-obvious things that will bite you

- **The UI is a static Next.js export baked into the Rust binary.** Editing `cliptool/`
  does nothing until you run `cd cliptool && npm run build`, which writes to
  `clipagent/ui/out/` (via `scripts/copy-out.js`) and is then embedded at compile time.
- **`clipagent/ui/` is not a project.** It is a drop folder for build output that also
  happens to contain a vestigial `package.json` and 436 MB of unused `node_modules`.
- **A dev build on macOS cannot resolve YouTube.** Outside a `.app` bundle the agent
  passes `--cookies-from-browser safari`, which macOS blocks, and every resolve returns
  `cookies_not_accessible`. To test the real path, build a bundle or stage one — see
  `docs/PIPELINES.md#testing-resolve-locally`.
- **Two plan vocabularies exist.** `usage.ts` knows `free|pro|max`; `plan.ts` knows only
  `free|pro`. Rust knows all three. Do not add a fourth.
- **There are zero tests.** Anything you change, you verify by running it.

## Working agreements

- Verify claims by executing them. "Should work" is not a result.
- Match surrounding code style. Comments explain *why*, never *what*.
- Do not add a dependency to solve something ffmpeg or the standard library already does.
- Never commit anything to `clipagent/src-tauri/bin/`. Ask first — see `docs/AUDIT-2026-09.md`.
- When you touch preview or export, re-read `docs/PIPELINES.md` invariants first.

## Index

- `docs/PRODUCT.md` — who this is for, what they are trying to do, plans and limits
- `docs/ARCHITECTURE.md` — processes, boundaries, data flow, cross-repo changes
- `docs/PIPELINES.md` — resolve → preview → export in detail, and the accuracy invariants
- `docs/RELEASE.md` — build, sign, notarize, ship, auto-update
- `docs/AUDIT-2026-09.md` — known weaknesses and the reform backlog
- `docs/FOUNDER-REQUESTS.md` — the live request queue with engineering translation
