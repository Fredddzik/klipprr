# Context Briefing — Klipprr (desktop + web)

_Produced 2026-10-18 by reading `~/dev/klipprr` and `~/dev/klipprr-web` and verifying claims against source. Read-only: no project file was changed._

Klipprr is **one product across two git repositories plus one shared Supabase project**. Neither repo is complete on its own: licensing, plans and quota span all three. Treat "which of the three does this change touch" as the first question on any task.

| Repo | Remote | What it is |
|---|---|---|
| `~/dev/klipprr` | `github.com/Fredddzik/klipprr` | Desktop app (Tauri/Rust agent + Next.js editor UI) **and** the Supabase schema of record (`supabase/`) |
| `~/dev/klipprr-web` | `github.com/Fredddzik/klipprr-web` | klipprr.com: marketing, billing, accounts, license *signing*, `/api/track` |
| `~/dev/klipprr-local` | not a git repo | **Superseded.** Old Supabase notes and email templates only |
| `~/dev/klipprr-backup-20260910-142600` | — | Stale copy. Do not use |

---

## Tech Stack

### Desktop app (`~/dev/klipprr`)

- **Shell**: Tauri 2 — one process, app version `0.1.38` (`Cargo.toml` and `tauri.conf.json` must agree; the Release check enforces it), identifier `com.klipprr`, deep-link scheme `clipagent://`
- **Language**: Rust edition 2021, binary `clipagent` (~6,560 lines across 20 files)
- **UI**: Next.js 16.1.1, React 19.2.0, App Router, `output: "export"` (fully static), React Compiler on (`reactCompiler: true`, `babel-plugin-react-compiler` 1.0.0), Tailwind CSS v4, TypeScript 5
- **HTTP stack**: hyper 1 + hyper-util 0.1 + http-body-util 0.1 (server), reqwest 0.12 with `rustls-tls` (client), tokio 1 "full"
- **Crypto**: `ed25519-dalek` 2, `base64` 0.22 — offline license verification
- **Tauri plugins**: opener, autostart, shell, deep-link, single-instance (deep-link feature), updater, dialog, process
- **Media**: `shaka-player` 4.16.51 (DASH over MSE in the UI); bundled `yt-dlp`, `ffmpeg`, `ffprobe`
- **Other crates**: serde/serde_json, time 0.3, bytes, futures-util, dirs 5, tokio-util 0.7, urlencoding 2.1, url 2, once_cell, getrandom 0.2
- **Analytics**: `posthog-js` 1.372.1; `@supabase/supabase-js` 2.90.1

### Web (`~/dev/klipprr-web`)

- **Framework**: Next.js 16.1.6, React 19.2.3, App Router, server components by default
- **Language**: TypeScript 5, `strict: true`, target ES2017, path alias `@/* → ./*`
- **Styling**: Tailwind CSS v4 via `@tailwindcss/postcss`. No component library
- **Database/Auth**: Supabase (`@supabase/supabase-js` 2.94.0), project `fmegrgbpeobamzivplyi`, eu-north-1, Postgres 17, RLS on every table
- **Payments**: `stripe` 20.4.0 (subscriptions)
- **Email**: `resend` 6.12.2, from hello@klipprr.com
- **Crypto**: `@noble/ed25519` 3.0.1 — signs the desktop license
- **Content**: `marked` 18 renders Markdown blog posts
- **Hosting**: Vercel, project **`website-klipprr`** (owns klipprr.com and www). The separate Vercel project named `klipprr` is the desktop repo — do not confuse them
- **Lint**: ESLint 9 + `eslint-config-next` 16.1.1

### Shared

- **Supabase**: one project for both. Schema of record is `~/dev/klipprr/supabase/` (baseline `schema.sql` read from the live catalogue 2026-10-17 + `migrations/` on top)

---

## Directory Structure

### `~/dev/klipprr`

```
AGENTS.md                      Entry point for agents. Read first
docs/                          ARCHITECTURE, PIPELINES, PRODUCT, RELEASE,
                               AUDIT-2026-09, FOUNDER-REQUESTS,
                               STRATEGY-BACKLOG, CUSTOMER-QUESTIONS
clipagent/src-tauri/           The Rust engine
  src/http.rs          1650 L  localhost API on 127.0.0.1:4000 — the whole API surface
  src/commands/
    download.rs        1589 L  export pipeline (yt-dlp + ffmpeg), per-clip retry
    resolve.rs          571 L  URL -> metadata + preview decision
    license_commands.rs 502 L  Tauri commands for license/auth
    media.rs            201 L  ffmpeg/ffprobe helpers (split out of download.rs)
    ytdlp.rs            161 L  yt-dlp invocation helpers
  src/main.rs           271 L  Tauri setup, tray, single-instance, deep link
  src/license.rs        234 L  ed25519 verify, offline
  src/dash.rs           226 L  builds the MPD served at /yt-dash.mpd
  src/preview_cache.rs  210 L  on-disk byte-range cache for /preview-stream
  src/quota.rs          184 L  Supabase reserve/refund RPCs
  src/storage.rs        174 L  license, Supabase session and export path on disk
  src/paths.rs          154 L  bundled-binary resolution
  src/export_control.rs 147 L  cancellation
  src/{updates,support,body,agent_token,output}.rs
  bin/                         BUNDLED BINARIES — gitignored, fetched at build time
  tools.lock                   pinned yt-dlp / ffmpeg versions + hashes
clipagent/ui/out/              BUILD DROP for the embedded UI (gitignored since Sep 2026)
cliptool/                      The editor UI (Next.js, static export)
  src/app/page.tsx     2243 L  god component: nearly all state and orchestration
  src/components/ExportPanel.tsx 983 L  format, quality, destination, plan gating
  src/components/              VideoViewport 394, AccessModal 280, LeftSidebar 270,
                               ClipsPanel 238, Timeline 191, SettingsModal 148,
                               UpdateToast 115, WatermarkInterstitial 104
  src/hooks/                   useKeyboardShortcuts 238, useUndoRedo 91, useAppUpdate 84
  src/lib/clipagent.ts  354 L  typed client for the agent API — the UI/Rust seam
  src/lib/                     usage, posthog-flags, analytics, tauri, support,
                               supabase, auth, capabilities
supabase/                      Schema of record
  schema.sql                   baseline, 2026-10-17
  migrations/                  2 files, both applied 2026-10-18
  history/                     15 pre-baseline migrations, reference only
  functions/                   redeem_activation_code, notify_new_signup
scripts/                       fetch-yt-dlp.sh, fetch-ffmpeg.sh, build-ffmpeg.sh,
                               smoke-test-ffmpeg.sh, export-regression.sh,
                               health-check.py, launchd/
.github/workflows/             release.yml, release-check.yml,
                               build-ffmpeg.yml, update-yt-dlp.yml
```

### `~/dev/klipprr-web`

```
CLAUDE.md                      Working agreement. Read first
README.md
docs/context/                  product, architecture, legal-and-compliance,
                               messaging-and-claims, analytics-and-consent, operations
docs/seo/                      strategy, roadmap, content-briefs, audit-2026-10-15,
                               outreach-2026-10
docs/legal/open-items.md       Outstanding obligations with owners
app/                           App Router
  page.tsx              822 L  homepage (hero, demo, features, pricing, FAQ)
  login/page.tsx        762 L  email/password + Google OAuth; desktop sign-in entry
  upgrade/page.tsx      690 L  THE ONLY PAID CHECKOUT PATH
  account/page.tsx      438 L
  download/page.tsx     331 L  + WindowsWaitlist.tsx, DownloadButton.tsx
  (legal)/                     privacy 464, terms 273, cookies 239, refunds 158,
                               copyright 142, open-source 124, layout, legal-meta.ts
  youtube-clip-downloader/     479 L   } per-platform landing pages,
  twitch-clip-downloader/      465 L   } the main organic entry points
  instagram-reel-downloader/   388 L   }
  tiktok-video-downloader/     386 L   }
  twitter-clip-downloader/     279 L   }
  blog/ , blog/[slug]/         SSG from public/blog/*.md via marked
  about/page.tsx        155 L
  api/
    cron/email-sequence/ 431 L  daily onboarding email job
    stripe/webhook/      419 L  SOURCE OF TRUTH for license state
    track/               273 L  server-side analytics relay
    stripe/checkout/     177 L  rejects without withdrawal acknowledgement
    account/delete/      132 L
    auth/app-session/    118 L  mints a separate session for the desktop app
    stripe/portal/       107 L , unsubscribe/ 102 L ,
    stripe/subscription/  87 L , download/mac/ 49 L
  CookieConsent.tsx     358 L  the consent gate everything else reads
  PricingSection.tsx    265 L  reference implementation for price/renewal/tax
  Analytics.tsx 118, PostHogProvider.tsx 104, AuthLinkHandler.tsx 37
  sitemap.ts, robots.ts, opengraph-image.tsx
lib/                           server-analytics 183, analytics 173, og-image 70,
                               utm 69, app-session 37, supabase-server 17,
                               safe-url 17, tauri 14, supabase 11, unsubscribe 7
public/                        blog/ (11 .md posts), llms.txt, llms-full.txt,
                               demo.mp4, BingSiteAuth.xml, IndexNow key file
scripts/                       check-claims.mjs (prebuild gate), indexnow-submit.mjs (postbuild)
supabase/migrations/           4 pre-baseline files — see Warnings
vercel.json                    cron + two blog redirects
next.config.ts                 security headers, CSP, www/http redirects
```

---

## Architectural Patterns

### Desktop

- **Routing (agent)**: hand-rolled `if method == … && path == …` chain in `http.rs::handle`. No router crate. 11 endpoints.
- **Routing (UI)**: Next.js file-based, but effectively a single page — `src/app/page.tsx` plus modals.
- **Why a local HTTP server instead of Tauri IPC**: `<video>` needs a URL it can issue **Range** requests against, and Tauri IPC cannot serve a seekable byte stream. Once HTTP existed for `/local-preview`, the rest followed. Documented as a deliberate, defensible choice.
- **Data fetching**: UI → `fetch` to `http://127.0.0.1:4000` through the typed client `src/lib/clipagent.ts`. That file is the contract between TypeScript and Rust.
- **State management**: none. React `useState`/`useRef` concentrated in `page.tsx`; two custom hooks (`useUndoRedo`, `useAppUpdate`). No Redux/Zustand/Context store.
- **Component pattern**: feature components under `src/components/`, flat, no index barrels, props drilled from `page.tsx`.
- **Concurrency**: `/resolve` runs under `spawn_blocking`; up to **3 clips export in parallel**, each spawning its own yt-dlp + ffmpeg.
- **Persistence**: `storage.rs` writes license, Supabase session and export path to the app data dir.

#### The agent API (`clipagent/src-tauri/src/http.rs`, 127.0.0.1:4000, plain HTTP)

| Endpoint | Method | Purpose | Token? |
|---|---|---|---|
| `/ping` | GET | liveness | no |
| `/capabilities` | GET | plan-derived feature flags from the verified license | no |
| `/resolve` | GET | URL → `{id, title, duration, thumbnail, preview, capabilities}` | **yes** |
| `/preview-stream` | GET/HEAD | Range-forwarding proxy for a remote preview URL | no |
| `/local-preview` | GET | local file with Range support, optional `pcm_fix=1` | no |
| `/local-proxy-status` | GET | poll the background 720p proxy of a local file | no |
| `/yt-preview-cache` | GET | build a merged local preview (`q`, `full`, `hq`, `bg`) | **yes** |
| `/yt-dash.mpd` | GET | MPD for the Shaka/MSE DASH path (`dash.rs`) | no |
| `/yt-proxy-status` | GET | poll the background high-quality preview | no |
| `/download-all` | POST | the export; reserves quota, runs to completion | **yes** |
| `/export-cancel` | POST | cancel a running export | **yes** |

Three guards, all in `http.rs`:
1. **Origin** — `origin_is_allowed()` permits `localhost`, `127.0.0.1`, `tauri.localhost`, `tauri:`. No `Origin` header is allowed (non-browser callers). Applies to every endpoint except `/ping`.
2. **Agent token** — per-launch `X-Klipprr-Token` (`agent_token.rs`), readable only by the app's own window. Required on the four work endpoints. Media endpoints cannot carry headers and stay open.
3. **SSRF** — `/preview-stream` blocks this Mac and the local network by literal IP (`Url::host()`), by resolving names before the request, and by re-checking after redirects.

#### The build coupling that surprises everyone

```
cliptool/  --npm run build-->  cliptool/out/  --scripts/copy-out.js-->  clipagent/ui/out/
                                                                              |
                                                     tauri.conf.json frontendDist
                                                                              v
                                                                      Klipprr.app binary
```

A UI change is **invisible** until `cd cliptool && npm run build`. The output is embedded at compile time.

### Web

- **Routing**: Next.js App Router, file-based. Server components by default; `"use client"` only where there is interactivity. `trailingSlash: false`.
- **Data fetching**: static/SSG for marketing and blog (homepage revalidates release info); client-side Supabase for `/upgrade`, `/account`, `/login`, `/auth/*`; route handlers under `app/api/` for everything privileged.
- **State management**: none. Local component state plus the Supabase session.
- **Component pattern**: page-local components colocated in `app/` (e.g. `app/CookieConsent.tsx`, `app/PricingSection.tsx`); shared helpers in `lib/`. Route groups for cross-cutting layout (`app/(legal)/`).
- **Privilege split**: `lib/supabase.ts` (anon key, browser) vs `lib/supabase-server.ts` (service role, server only).

#### Purchase flow

```
/upgrade  → pick plan, tick the withdrawal acknowledgement
          → POST /api/stripe/checkout   (Supabase bearer; REJECTS without the tick)
          → Stripe Customer created or reused; session metadata records consent + ack timestamp
          → Stripe Checkout (card details never touch us)
          → success_url /upgrade?success=1&session_id=…
          → webhook checkout.session.completed → licenses row updated, Ed25519 license signed
          → deep link into clipagent:// with a NEWLY MINTED session (see below)
```

Plan changes happen in the Stripe customer portal, so proration, tax and confirmation are Stripe's problem. `customer.subscription.updated` brings the new plan back to `licenses`.

License state rules in the webhook:
- `active`, `trialing` **and `past_due`** count as active (Stripe is still retrying; revoking would take the product from someone about to pay).
- Access ends on `unpaid`, `canceled`, `incomplete_expired`, `customer.subscription.deleted`.
- **Plan resolves from the current price id, not subscription metadata.** `klipprr_plan` is written once at checkout and goes stale the moment someone switches plan. Getting this backwards once left a customer on Pro's limits while paying Max's price.

#### Desktop sign-in (the subtle one)

The app and the browser must **never hold the same Supabase session**. Supabase rotates refresh tokens and treats a reused one as stolen, revoking the whole session — whichever holder refreshed second logged the user out of both, hours later. The first paying customer was logged out twice on 2026-10-07.

Every deep link now goes `lib/app-session.ts` → `POST /api/auth/app-session`, which mints a brand-new session for the same user (server-side magic link, verified immediately, no email sent; origin-checked, 10 req/min per IP, bearer must be under 5 minutes old). If minting fails, `/auth/callback` hands over the browser's session and then forgets it locally (`signOut({ scope: "local" })`) so there is still only one holder.

---

## Data Model

Supabase `public` schema. Defined in `~/dev/klipprr/supabase/schema.sql` (baseline) + `migrations/`.

| Entity | Key Fields | Relationships | RLS |
|---|---|---|---|
| `profiles` | `id` (PK, FK `auth.users` ON DELETE CASCADE), `email`, `created_at` | 1:1 with `auth.users`; created by the `on_auth_user_created` trigger | read own only |
| `licenses` | `id` (PK), `user_id` (FK users, **UNIQUE**), `plan` CHECK `free\|pro\|max`, `active`, `issued_at`, `expires_at`, `status`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`, `desktop_license_payload`, `desktop_license_sig` | 1:1 per user | read own only; writes service-role |
| `clip_usage_monthly` | PK (`user_id`, `period_start`), `clips_used` CHECK `>= 0`, `created_at`, `updated_at`; index on `period_start` | 1:N per user, one row per month | read own; **insert and update explicitly denied** to clients |
| `export_reservations` | one row per export, `user_id` + period, index `(user_id, period)` | 1:N per user | read own |
| `activation_codes` | `code` (PK), `plan` CHECK `free\|pro\|max`, `redeemed_by` (FK users), `redeemed_at`, `license_duration_days` | optional 1:1 to a user | `select using (false)` — no direct read |
| `email_sequence_log` | `id` (PK), `user_id` (FK), `email_key`, `sent_at`; UNIQUE (`user_id`, `email_key`) | 1:N per user | service_role only |
| `email_unsubscribes` | `user_id` (PK, FK) | 1:1 per user | service_role only |
| `waitlist` | `id` (PK), `email`, `platform`, `source` default `'website'`, `note`, `user_id`, `created_at` | standalone (no FK) | **insert-only for anon, NO read policy** |
| `v_user_licenses` | view, `security_invoker = true`; `revoke all … from anon, authenticated` | joins profiles + licenses | admin only |

```
auth.users ─1:1─ profiles             (trigger on_auth_user_created; then on_new_signup_notify emails the founder)
          ├─1:1─ licenses             (plan + signed desktop license; clients read only)
          ├─1:N─ clip_usage_monthly   (one row per month)
          ├─1:N─ export_reservations  (one row per export; what may be refunded)
          └─1:N─ email_sequence_log, email_unsubscribes

activation_codes, waitlist: stand alone
```

### Functions

| Function | Does |
|---|---|
| `reserve_clip_exports(p_plan text, p_requested int)` | The quota gate. **Deliberately ignores `p_plan` from the caller** and reads the real plan from `licenses`. Limits: `max` 500, `pro` 120, else 10. `SELECT … FOR UPDATE` on the usage row. Returns a `reservation_id`. This design is correct and must stay that way |
| `release_export_reservation(id, count)` | Refunds clips **of that reservation only**, within a day and under a monthly cap (`greatest(5, limit/4)`) |
| `release_clip_exports(p_count)` | Legacy. Kept for 0.1.37 and earlier, which are still installed |
| `handle_new_user()` | Trigger, creates the `profiles` row. `security definer`, `search_path = public` |
| `handle_new_signup_notification()` | Trigger, reads `notify_webhook_secret` from Supabase Vault at call time and `net.http_post`s the `notify_new_signup` edge function. Swallows all errors — a notification must never fail a signup |

Both trigger functions had `EXECUTE` revoked from `public`, `anon` and `authenticated` on 2026-09-19 — they were callable as RPC.

### Edge functions (`~/dev/klipprr/supabase/functions/`)

- `redeem_activation_code` — JWT verified. Beta/activation codes.
- `notify_new_signup` — **no JWT**, guarded by a shared secret in `NOTIFY_WEBHOOK_SECRET`, matched against the Vault secret the trigger sends.

### Quota flow (changed in 0.1.38)

Usage is **reserved before the export and refunded on failure, by the agent itself** (`quota.rs`). `/download-all` reserves first and answers 401/402 when it cannot; it refunds the clips that did not export when the run ends. The UI only pre-checks, to show the upgrade dialog early. Before 0.1.38 the UI held the refund, and `release_clip_exports` refunded any number — the monthly limit could be reset at will (finding C1).

### Plans

| | Free | Pro | Max |
|---|---|---|---|
| Clips / month (enforced in `reserve_clip_exports`) | 10 | 120 | 500 |
| Price (USD, from `PricingSection.tsx`) | $0 | $12/mo, $10/mo billed yearly ($120/yr) | $39/mo, $33/mo billed yearly ($396/yr) |
| Rename clips | no | yes | yes |

**Local files are exported untouched on every plan** — no watermark, no resolution cap, no re-encode. The watermark and the 720p cap distinguish Free from Pro **for URL sources only**. A free account is still required, and local clips still count against the monthly limit. Do not "fix" this by adding the watermark to local exports.

---

## Conventions

1. **Documentation is the source of truth and is kept honest.** Both repos lead with an agent-facing entry file (`AGENTS.md`, `CLAUDE.md`) that indexes short, purpose-scoped docs. Facts have single homes: product facts in `docs/context/product.md`, company identity in `app/(legal)/legal-meta.ts`, plan limits in `reserve_clip_exports`. The rule is "change the source of truth, not the copy of it" — when you change one, grep for the others.

2. **Comments explain *why*, never *what*, and carry history.** This is the dominant style in both repos and it is load-bearing. Examples verified in source:
   - `.gitignore`: "Committing this weekly is what grew .git to 388 MB."
   - `next.config.ts`: "PostHog loads its optional modules … from `*-assets.i.posthog.com` at runtime. They were blocked before this host was listed."
   - `PricingSection.tsx`: "Never show a bare struck-through number: under the EU Price Indication Directive a comparison price has to say what it is being compared to."
   - `schema.sql`: "p_plan from the caller is ignored; the plan comes from licenses."
   Match this. A comment that restates the code is off-style here.

3. **Naming.** Rust: `snake_case` files and functions (`preview_cache.rs`, `agent_token.rs`, `origin_is_allowed`). TypeScript: `PascalCase.tsx` for components, `camelCase.ts` for libs and hooks (`useKeyboardShortcuts.ts`, `clipagent.ts`). SQL: `snake_case` tables and functions, `p_`-prefixed function parameters, `v_`-prefixed PL/pgSQL locals, `v_`-prefixed views. Migrations: `YYYYMMDDHHMMSS_description.sql`, applied in filename order. Error codes are flat `snake_case` strings (`cookies_not_accessible`, `youtube_bot_block`).

4. **Imports.** `@/*` path alias in klipprr-web (`tsconfig.json` `paths`). No barrel/index re-exports in either TypeScript tree — components and libs are imported by direct path. Rust modules are declared in `main.rs` and `commands/mod.rs`.

5. **Error handling.** Rust: `Result<T, String>` with human-readable strings at command boundaries; stable `snake_case` error codes across the HTTP seam. **Every resolve error code needs a human-readable message in `page.tsx`; an unmapped code shows the raw string to the user.** Failures that another attempt cannot fix are classified (`ytdlp_failure_is_permanent`) and not retried. Failed clips stay on screen with **Retry** and **Email us** rather than a dialog.

6. **Verification, not assertion.** "Verify claims by executing them. 'Should work' is not a result." On the web side: `npx tsc --noEmit` and `npx next build` before claiming done. On the desktop side: `cargo test` (13 unit tests) and `scripts/export-regression.sh` (11 export paths, ffprobe-checked); anything else you change, you verify by running it.

7. **Dependency restraint.** "Do not add a dependency to solve something ffmpeg or the standard library already does." The web repo uses no component library and no state library on purpose.

8. **Copy.** American spelling in customer-facing copy. Em dashes are house style in site copy (but not in chat replies to the founder). Internal docs are not policed.

9. **Analytics events**: `klipprr_` prefix, `snake_case`, past-tense verbs.

---

## Infrastructure Constraints

### Desktop

- **Apple Silicon only.** macOS ffmpeg/ffprobe are built arm64 (`ffmpeg-9.0.2-macos-arm64-r1`). Finding A5 in the September audit is that Intel binaries were shipping inside an Apple-Silicon-only app — check its current state before assuming either way.
- **Bundled binaries are never committed.** `yt-dlp` (pinned `2026.08.19`), `ffmpeg`, `ffprobe` are fetched at build time by `scripts/fetch-*.sh` and verified against the hashes in `clipagent/src-tauri/tools.lock`. Committing yt-dlp weekly grew `.git` by ~350 MB. **Never commit anything to `clipagent/src-tauri/bin/` — ask first.**
- **ffmpeg is built, not downloaded.** `.github/workflows/build-ffmpeg.yml` (manual dispatch only) builds from pinned sources, runs the app's real command lines against the result (`smoke-test-ffmpeg.sh`), publishes it as a **pre-release** asset (never GitHub's "latest", which the website and updater read), then rewrites `tools.lock` in its own commit. Never edit those lines by hand. Windows ffmpeg is BtbN's GPL 9.0 build mirrored unchanged and pinned by hash, because BtbN's "latest" URL changes daily.
- **The license public key is embedded at build time** from `KLIPPRR_LICENSE_ED25519_PUB_B64`. **Rotating the keypair stops every shipped app from verifying licenses until users update. Treat rotation as a release-blocking event.** The private key exists in two places, both needed: Vercel and the `redeem_activation_code` edge function.
- **A dev build on macOS cannot resolve YouTube.** Outside a `.app` bundle the agent passes `--cookies-from-browser safari`, which macOS blocks, so every resolve returns `cookies_not_accessible` (`running_from_sandboxed_app()` keys off `".app/Contents/"` in the executable path). Stage a fake bundle to test the real path — recipe in `docs/PIPELINES.md#testing-resolve-locally`.
- **Updates**: Tauri updater, minisign pubkey in `tauri.conf.json`, endpoint `github.com/Fredddzik/klipprr-releases/releases/latest/download/latest.json` — a **public mirror** repo, since the app repo is private.
- **CSP is disabled in the webview** (`"csp": null`, `dangerousDisableAssetCspModification: true`, asset protocol scope `**`). Devtools are enabled in the shipped window config.
- **Release gating**: `release-check.yml` runs on every push to `main` and as the first job of every release. It checks versions agree, the version is not already released, required secrets are set, the mirror token works, the updater signing key works, the Apple certificate imports and is valid, notarization credentials work, pinned tools fetch, ffmpeg does everything the app asks of it, the frontend builds, the app compiles for release, and the unit tests pass. A green run means that commit is safe to tag; when it fails inside a release, nothing has been signed, notarized or published.
- **Logs**: `~/Library/Logs/ClipAgent/clipagent.log`, rotated to `clipagent.1.log` past 5 MB at launch. `[RESOLVE]` lines say which preview decision was made.
- **A launchd health check** runs at 09:30 (`scripts/launchd/com.klipprr.health-check.plist`), independent of any app being open, and kills whole timed-out process groups — a timed-out yt-dlp once left ffmpeg running for days.

### Web

- **`main` deploys straight to production. There is no staging environment and no test suite.** `npx tsc --noEmit` plus `npx next build` are the only gates. `prebuild` runs `check-claims.mjs`; `postbuild` runs `indexnow-submit.mjs`.
- **CSP is strict and hand-maintained** in `next.config.ts`. `unsafe-eval` is dev-only. Adding a script host means editing the allow-list. Also set: HSTS `max-age=63072000; includeSubDomains; preload`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `object-src 'none'`, nosniff, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`.
- **`www` → apex and `http` → `https` are permanent redirects at the framework level.**
- **Cron**: `/api/cron/email-sequence` daily at 09:00 UTC via `vercel.json`, bearer `CRON_SECRET`.
- **`NEXT_PUBLIC_*` is public by definition.** `NEXT_PUBLIC_SUPABASE_ANON_KEY` is safe because RLS does the work. Never put a service-role key there.
- **`lib/supabase.ts` falls back to `http://localhost:54321` with a placeholder key** when the client env vars are missing, so a misconfigured deploy fails as a *network error at runtime* rather than a build error. Worth knowing when debugging "nothing saves".
- **Server-only env**: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_{PRO,MAX}_PRICE_ID_{MONTHLY,YEARLY}`, `STRIPE_AUTOMATIC_TAX`, `KLIPPRR_LICENSE_ED25519_PRIV_B64`, `RESEND_API_KEY`, `CRON_SECRET`, `UNSUBSCRIBE_SECRET`, `GA4_API_SECRET`, `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`.
- **Client env**: `NEXT_PUBLIC_{SUPABASE_URL, SUPABASE_ANON_KEY, GA_MEASUREMENT_ID, GOOGLE_ADS_ID, POSTHOG_KEY, POSTHOG_HOST, RELEASES_REPO, APP_URL, MAC_DOWNLOAD_URL}`.
- **`/api/track` cannot be authenticated** (the desktop app posts to it), so instead: per-IP rate limit (60 requests / 60 s), origin check for browser callers, consent gate for web events, and it never forwards an email address to PostHog.
- **The `waitlist` table is write-only from the client. Keep it that way** — a read policy would expose every address.
- **Supabase migrations are file-first**: write the file in `migrations/`, test it inside `begin; … rollback;` with a throwaway user and a `raise exception` at the end so nothing can commit, then apply it (Supabase MCP `apply_migration` with the same name, or the dashboard SQL editor). Never change the live database without the file. **Keep old app versions working** — released desktop apps call `reserve_clip_exports` and `release_clip_exports` with fixed signatures.
- **Secrets never go in a migration.** Use Vault (`vault.decrypted_secrets`) or the edge function's environment.
- **Blog posts are served raw at `/blog/<slug>.md` on purpose**, for AI crawlers, and linked from each post. Adding one means updating `public/llms.txt` and `public/llms-full.txt` in the same change.

---

## Integration Points

| Service | Purpose | Auth method |
|---|---|---|
| **Supabase** (`fmegrgbpeobamzivplyi`, eu-north-1) | Auth, licenses, quota, waitlist, email log | Browser and desktop: anon key + RLS, user JWT. Server: `SUPABASE_SERVICE_ROLE_KEY`. Quota RPCs are `security definer` and read the plan server-side |
| **Stripe** | Subscriptions, Checkout Session, Billing Portal | `STRIPE_SECRET_KEY` server-side; webhook verified by `STRIPE_WEBHOOK_SECRET` signature. Card details never touch us |
| **Resend** | Transactional + onboarding email from hello@klipprr.com | `RESEND_API_KEY`, server only |
| **klipprr-web `/api/track`** | Analytics relay for both web and the desktop app | **None by necessity.** Rate-limited per IP, origin-checked for browsers, consent-gated for web events |
| **PostHog** | Behaviour, funnels, feature flags, A/B | `NEXT_PUBLIC_POSTHOG_KEY` (public, consent-gated). Identifies by Supabase user id, `person_profiles: "identified_only"` |
| **GA4** | Acquisition. Also fed server-side via the Measurement Protocol so ad blockers do not erase the picture | `NEXT_PUBLIC_GA_MEASUREMENT_ID` client; `GA4_API_SECRET` server |
| **Google Ads** | Conversion measurement for paid campaigns | `NEXT_PUBLIC_GOOGLE_ADS_ID`, advertising consent only |
| **Meta CAPI** | **Parked.** No pixel on the site, nothing is sent today. The code path stays, consent-gated to advertising | `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`. Before it goes live the Cookie and Privacy policies must list Meta as active — see `docs/legal/open-items.md` A3 |
| **Google Search Console** | The real source for organic performance; does not depend on consent | OAuth (GSC MCP connector) |
| **Bing Webmaster Tools** | Verification via `public/BingSiteAuth.xml` | file-based |
| **IndexNow** | Submits URLs after every build (`postbuild`) | key file in `public/` |
| **GitHub Releases** | App distribution + the updater feed, via the public mirror `Fredddzik/klipprr-releases` | `NEXT_PUBLIC_RELEASES_REPO`; mirror push token in Actions secrets. `/api/download/mac` 302s to the latest `.dmg` so the download origin is our domain |
| **Vercel Blob** | Release workflow uploads the `.dmg` for the website download button | Actions secret |
| **Apple notarization / codesign** | macOS distribution | Developer certificate + notarization credentials, Actions secrets, verified by the Release check |
| **Tauri updater** | In-app updates | minisign public key in `tauri.conf.json`; signing key in Actions secrets |
| **yt-dlp** | URL resolve and sectioned download | bundled binary, pinned by version + published checksum |
| **ffmpeg / ffprobe** | Cutting, re-encoding, probing, watermarking | bundled binaries, pinned by SHA-256 |
| **YouTube / Twitch / Instagram / TikTok / X** | Media sources, through yt-dlp | none; YouTube needs Safari cookies, which only works from inside a `.app` bundle |
| **`clipagent://` deep link** | Web → app handoff for sign-in and post-purchase plan pickup | A freshly minted Supabase session from `POST /api/auth/app-session` |

### Event taxonomy (`klipprr_` prefix, snake_case, past tense)

| Event | Fired where | Key properties |
|---|---|---|
| `page_view` | every consented page load | path, title, referrer |
| `signup` | after account creation, both auth methods | method (email/google) |
| `download` | download button click | platform |
| `checkout_started` | before the Stripe redirect | plan, billing, value |
| `purchase` | success page and, authoritatively, the Stripe webhook | plan, billing, value, transaction_id |
| `clip_created` | desktop | plan, source_type, clip_duration_seconds |
| `clip_exported` / `first_export` | desktop | plan, clip_count, quality |
| `paywall_hit` | desktop | feature, plan |
| `export_limit_reached` | desktop | plan |
| `export_failed` | desktop | plan, error_type |

Purchases dedupe on the Stripe session id, which both the browser and the webhook use as the transaction id. Live PostHog flags: `pricing-pro-cta`, `upgrade-subscribe-cta` — **neither can conclude anything at current traffic; do not act on them.**

### Development tooling

- **Claude Code** (desktop app) with worktrees in `.claude/worktrees/` in both repos; `.claude/launch.json` in klipprr-web runs `next dev` on port 3000. `.claude/` and `.cursor/` are gitignored in klipprr as non-portable.
- **MCP connectors in play for this project**: Supabase (migrations, SQL, advisors), Vercel (deploys, logs, env, domains), Stripe, PostHog, Google Search Console, GitHub.
- **Build/CI**: GitHub Actions (4 workflows), Vercel for the web.
- **Quality gates**: `cargo test` (13 unit tests across `export_control.rs` 2, `http.rs` 2, `download.rs` 4, `resolve.rs` 4 + 1 more in-module), `scripts/export-regression.sh`, `scripts/smoke-test-ffmpeg.sh`, `scripts/check-claims.mjs`, `npx tsc --noEmit`, `npx next build`, ESLint 9.

---

## The Four Promises (product invariants that constrain design)

From `AGENTS.md`. These are not aspirations, they are acceptance criteria:

1. **What you see is what you cut.** A timestamp in the preview must produce the same frame in the export. Preview *quality* may be lower; preview *timing* may not differ.
2. **Source quality survives.** Exports do not silently re-encode or downscale. When a re-encode is unavoidable, the UI says so before the user commits.
3. **The app stays responsive.** No operation blocks the UI without a progress signal.
4. **Nothing leaves the machine that doesn't have to.** Media is fetched and processed locally. We are not a cloud transcoder and must not become one by accident.

### Pipeline invariants (`docs/PIPELINES.md`) — do not break these

1. **Preview time == source time.** No `-ss` on the input without compensating, no frame-rate conversion, no `setpts`.
2. **Duration comes from resolve, not from the preview file.** A shorter proxy (e.g. a 60 s TikTok preview) must never redefine the timeline.
3. **Export cuts from the source, never from the preview proxy.** Preview files are disposable cache.
4. **A quality swap must not move the playhead.** Re-test the 360→720 swap mid-playback if you touch `VideoViewport`.
5. **Never report a background job "ready" before it is complete.** Check the lock, then the file size. A half-written MP4 handed to `<video>` produces a user-visible error.
6. **Stream copy must stay H.264.** A path that emits AV1/VP9 in an `.mp4` the user asked to be "original" is a bug.

**Why this is hard:** YouTube no longer publishes muxed formats reliably, and what it returns *varies between requests for the same video*. When `itag 18` is present it is sometimes degenerate — an empty body, or a header advertising the full duration with no decodable frames. That is the origin of the historical "black screen with the right duration" bug. Resolve therefore probes suspect URLs with `ffprobe -read_intervals "%+#2"` (~150 ms) and discards ones that decode nothing. Codec, not container, gates everything: YouTube ships **AV1 and VP9 inside `.mp4`**, which WKWebView cannot decode and which stream-copy into an `.mp4` most editors reject — so `is_h264()` drives `fast_max_height`, and `true_max_requires_reencode` is `true_max_height > max_h264_height`.

There are **four preview paths** (streamed DASH via Shaka/MSE, direct stream through `/preview-stream`, native HLS passed straight to `<video>`, local merged via `/yt-preview-cache`, plus local file). **Knowing which one is active is the first debugging step.** Local previews fetch 360p full-length first, then swap in a background 720p; the format selector pins `avc1` + `m4a`. Previews cache in `$TMPDIR/clipagent_preview_cache/` keyed by URL hash + tier, with `.lock` sentinels that are treated as abandoned after an hour — without that, a hard quit pinned `/yt-proxy-status` at `"downloading"` forever for that URL.

---

## Warnings / Tech Debt

### Things that will cost you if you don't know them

1. **A UI change is invisible until `cd cliptool && npm run build`.** Easily an hour lost.
2. **`clipagent/ui/` is not a project.** It is a drop folder for build output that also contains a vestigial `package.json`, `next.config.ts`, empty `app/`+`components/` dirs, a `.next/` dev cache and ~436 MB of unused `node_modules`. A fossil of an earlier layout (audit B2).
3. **Two plan vocabularies still exist.** `usage.ts` knows `free|pro|max`; `plan.ts::PLAN_CAPABILITIES` knows only `free|pro`; Rust knows all three. **Do not add a fourth.** Still open.
4. **Dev builds cannot resolve YouTube** (see Infrastructure).
5. **`page.tsx` (2,243 lines) and `ExportPanel.tsx` (983) are where changes get expensive.** Splitting them is infrastructure work, not cosmetics (audit B1/C7; the rest of the split is parked with FR-4).
6. **`/download-all` runs the whole export in one request.** It no longer blocks a tokio worker (C5 fixed), but it is still a long-lived request with no resumability.

### Known weaknesses in the product itself

7. **Preview delivery is the #1 product complaint and the one weak subsystem.** `/yt-preview-cache` downloads the **entire file** before responding — tens of seconds of spinner on a long source, nothing streams meanwhile. `/preview-stream` caches byte ranges on disk per session, so re-seeking is local, but the first visit to any region waits on the origin CDN and nothing survives a restart. There is no frame-level seek affordance; the timeline seeks by time only.
8. **"Frame perfect" is not true yet, and marketing must not claim it.** Cuts are seconds with millisecond precision (`-ss {:.3}`), not frames. At 29.97 fps one frame is 33.4 ms, so cuts can be off by up to a frame, and **stream-copy cuts snap to the nearest keyframe** unless the segment is re-encoded. Closing the gap means snapping in/out to frame boundaries using the real `fps` from resolve, passing frame-derived timestamps to ffmpeg, and either accepting keyframe snapping in copy mode or re-encoding a short head segment. **A deliberate, documented gap.**
9. **Tests are thin.** 13 Rust unit tests cover pure logic; `export-regression.sh` drives a running app through 11 export paths. The frame-accurate cut test and the UI smoke test (audit A3 items 2 and 3) remain open. The web repo has **no tests at all**.
10. **No error monitoring anywhere.** Production failures are visible only in Vercel logs, if someone looks.
11. **The email cron does not scale.** `app/api/cron/email-sequence/route.ts` loads every user on every run and pages `listUsers` at 1,000. Fine at ~22 users, broken at 5,000. Its excluded-emails list is hard-coded and belongs in the database.
12. **The Windows waitlist has no fulfilment.** `waitlist` is never read by the email cron (it has no read policy by design), so the promised "we'll email you when Windows ships" has no implementation — tracked in `docs/legal/open-items.md`.
13. **`app/page.tsx` duplicates the FAQ between JSON-LD and JSX.** Any FAQ edit has to be made twice, and they have drifted before.
14. **The duplicated Windows CI job remains** (audit B3/C9); Windows ffmpeg is now pinned but the ~80 lines of duplication are not resolved.
15. **Audit A5 is mostly closed, with one residue.** Verified on the local build drop: `ffmpeg` and `ffprobe` are `Mach-O 64-bit executable arm64` (arm64 only, correct). **`yt-dlp` is still a universal binary** carrying both `x86_64` and `arm64` — 37 MB where ~19 MB would do, in an app that only runs on Apple Silicon. `scripts/fetch-yt-dlp.sh` downloads whatever yt-dlp publishes for that release; thinning it with `lipo -thin arm64` after the checksum verification would save ~18 MB per download. Low priority, but it is the remaining half of A5.

### Drift I found between the docs and the code (worth fixing)

16. **Supabase migrations live in both repos.** `~/dev/klipprr/supabase/README.md` declares `~/dev/klipprr/supabase/` the source of truth as of 2026-10-17, but `~/dev/klipprr-web/supabase/migrations/` still holds 4 files (`20260430_email_unsubscribes`, `20260919_lock_down_trigger_functions`, `20260919_notify_signup_secret_from_vault`, `20260923_notify_signup_via_pg_net`) that duplicate, under different filenames, entries in `~/dev/klipprr/supabase/history/`. Two directories claiming the same database is how C5 happened in the first place. **Recommend: delete the klipprr-web copies with a pointer in their place, or document them as reference-only.**
17. **`klipprr/docs/ARCHITECTURE.md` undercounts the API.** It says "11 endpoints" and its table lists 9 — `/export-cancel` and `/yt-dash.mpd` are missing from the table, though both are documented elsewhere. Actual count is 11.
18. **`klipprr-web/docs/context/architecture.md` route table is missing three live routes**: `/tiktok-video-downloader` (386 lines, a real landing page), `/about` (155), and `/(legal)/open-source` (124).
19. **`keyring` 3.6.3 is an unused Cargo dependency.** It is declared with `apple-native` and `windows-native` features but appears nowhere in `clipagent/src-tauri/src/` or `build.rs` — `storage.rs` writes to the app data dir instead. It contradicts the stated no-unnecessary-dependencies rule and costs build time. **Recommend: remove it, or wire the session/license into the keychain as presumably intended.**
20. **Row counts in `klipprr-web/docs/context/architecture.md` are dated "Sep 2026"** (22 profiles, 8 licenses, 17 usage rows, 3 activation codes, 78 email log rows, 2 waitlist). Treat them as historical. They can be refreshed against the live project through the Supabase connector.

### Non-obvious operational facts

21. **`cliptool/next.config.ts` and `klipprr-web/next.config.ts` both pin `turbopack.root: __dirname`** so Next does not infer the wrong workspace from a stray lockfile up the tree.
22. **Supabase's leaked-password protection warning is deliberately unaddressed** — the desktop app has no passwords; sign-in is by email link or code.
23. **The license signing key is held in two places (Vercel and the `redeem_activation_code` edge function) and both are needed.** Not a mistake.
24. **The Ed25519 claims object field order must match the Rust struct exactly.** Changing it silently invalidates every license.

---

## Handoff

- **Schema work**: the data model is coherent and RLS is thorough, but items 3 (two plan vocabularies) and 16 (migrations in two repos) are schema-adjacent inconsistencies. If either is in scope, load `architect/schema-design`.
- **API work**: the agent's 11 endpoints are a hand-rolled chain with three guard layers and no formal contract document; `src/lib/clipagent.ts` is the de facto spec. If the API surface is being extended (or items 17 and the `/download-all` long-request shape are in scope), load `architect/api-design`.
