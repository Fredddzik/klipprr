# Release

## How a release happens today

```
git tag v0.1.27 && git push origin v0.1.27
   → .github/workflows/release.yml
       job "release"          (macos-latest)  → .app + .dmg + .app.tar.gz + .sig
       job "release-windows"  (windows-latest, continue-on-error) → .msi
```

The version must be bumped **by hand in two places** before tagging:

- `clipagent/src-tauri/tauri.conf.json` → `version`
- `clipagent/src-tauri/Cargo.toml` → `version`

They must match the tag. Nothing validates this; a mismatch produces a release whose
updater manifest points at the wrong version.

## What the macOS job does, in order

1. Build the UI: `cd cliptool && npm ci && npm run build` (writes `clipagent/ui/out/`).
2. Import the Developer ID certificate into a temporary keychain.
3. **Sign the bundled binaries individually.** `ffmpeg` and `ffprobe` get
   `--options runtime --timestamp`. `yt-dlp` additionally gets
   `entitlements-binaries.plist` because it is a PyInstaller bundle whose embedded Python
   has a different Team ID and would otherwise fail library validation.
4. `tauri-action` builds `--target aarch64-apple-darwin --bundles app,dmg`, signs the app,
   notarizes it with `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`, and creates the
   GitHub release.
5. Mirror `.app.tar.gz`, `.sig` and `.dmg` to the **public** releases repo
   (`RELEASES_PUBLIC_REPO`), then generate `latest.json` for the auto-updater.
6. Upload the `.dmg` to Vercel Blob at a stable URL for the website download button.

**Apple Silicon only.** The toolchain installs `x86_64-apple-darwin` but the build never
uses it. Intel Macs are unsupported. That may be the right call — but the workflow implies
otherwise and should say so explicitly.

## Auto-update

Tauri's updater polls
`https://github.com/Fredddzik/klipprr-releases/releases/latest/download/latest.json`,
verifies the `.app.tar.gz` against the minisign public key embedded in `tauri.conf.json`,
and installs.

`createUpdaterArtifacts: true` means **any** build tries to produce a signed update
artifact. A local build without `TAURI_SIGNING_PRIVATE_KEY` therefore ends with:

```
Error A public key has been found, but no private key.
```

The `.app` is already built and complete at that point — the failure is only the update
artifact. For local builds, use `--bundles app` and ignore the trailing error, or set the
env var.

### Rotating the updater key is a one-way door

Every installed copy verifies against the embedded public key. Change it and existing
installs can never auto-update again — they must be manually re-downloaded. Same applies to
`KLIPPRR_LICENSE_ED25519_PUB_B64`.

## Windows

Unsigned. `continue-on-error: true`, so a Windows failure does not fail the release. The
job **downloads ffmpeg and yt-dlp at build time** from `latest` upstream releases, which
means two Windows builds of the same tag are not guaranteed to contain the same binaries.

There are two near-identical Windows jobs (`release-windows`, `release-windows-only`)
differing only in trigger and how the tag is derived — roughly 80 duplicated lines.

## Dependency bumps

`.github/workflows/update-yt-dlp.yml` runs weekly: downloads the latest yt-dlp, commits the
**37 MB binary** into the repo, and bumps the patch version in `tauri.conf.json` and
`Cargo.toml`. See `AUDIT-2026-09.md` — this is the main reason `.git` is 388 MB.

## Required CI configuration

**Variables**
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RELEASES_PUBLIC_REPO`

**Secrets**
`TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD` if encrypted), `APPLE_CERTIFICATE`,
`APPLE_CERTIFICATE_PASSWORD`, `KEYCHAIN_PASSWORD`, `APPLE_ID`, `APPLE_PASSWORD`,
`APPLE_TEAM_ID`, `KLIPPRR_LICENSE_ED25519_PUB_B64`, `RELEASES_PUBLIC_REPO_TOKEN`,
`VERCEL_BLOB_TOKEN`

## Local build

```bash
cd cliptool && npm run build          # UI → clipagent/ui/out
cd ../clipagent/src-tauri
cargo tauri build --bundles app       # → target/release/bundle/macos/Klipprr.app
```

A locally built app is **ad-hoc signed**. It runs on the machine that built it (no
quarantine attribute) but is not distributable — `spctl` will not vouch for it. Only CI
produces shippable builds.
