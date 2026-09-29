# Release

## How a release happens today

```
1. Bump the version in both places (below) and push to main.
2. Wait for "Release check" to go green on that commit (Actions tab, ~10 min).
3. git tag v0.1.29 && git push origin v0.1.29
   → .github/workflows/release.yml
       job "preflight"        (macos-latest)  the same Release check, run again
       job "release"          (macos-latest)  → .app + .dmg + .app.tar.gz + .sig
       job "release-windows"  (windows-latest, continue-on-error) → .msi
```

The version must be bumped **by hand in two places** before tagging:

- `clipagent/src-tauri/tauri.conf.json` → `version`
- `clipagent/src-tauri/Cargo.toml` → `version`

They must match each other and the tag. The Release check enforces this.

### The Release check (`release-check.yml`)

Runs on every push to main, on demand, and as the first job of every release. It checks,
in about ten minutes, everything that has ever made a release fail late:

- versions agree, and the tag matches them; warns if the version is already released
- every required secret is set; the mirror token still works
- the updater key can actually sign; the Apple certificate imports and has not expired
- Apple accepts the notarization credentials
- the pinned yt-dlp and ffmpeg download and verify; ffmpeg passes
  `scripts/smoke-test-ffmpeg.sh` (the app's real export commands)
- the frontend builds and the app compiles for release

What it cannot check: notarization itself (Apple's verdict on the finished app) and the
upload steps. Those can still fail, but no longer because of a credential or a binary.

**Rule: never tag a commit whose Release check is not green.** If the preflight job fails
inside a release, nothing was signed or published. Fix the problem, then delete and
re-push the tag (`git push --delete origin vX && git tag -f vX && git push origin vX`).

## What the macOS job does, in order

1. Build the UI: `cd cliptool && npm ci && npm run build` (writes `clipagent/ui/out/`),
   then fetch the pinned yt-dlp and ffmpeg (`scripts/fetch-*.sh`, versions in `tools.lock`).
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

## Two ways this pipeline dies silently (both hit us, Apr–Sep 2026)

Releases stopped after v0.1.24 (2026-04-30) and nobody noticed for four and a half months.
There were **two independent causes**, and neither produced an alert.

### 1. A tag pushed by CI triggers nothing

`update-yt-dlp.yml` creates the version tag. It used to push it with the default
`GITHUB_TOKEN`, and **GitHub deliberately refuses to trigger workflows from events created
by that token** (loop protection). So v0.1.25, v0.1.26 and v0.1.27 were tagged and built
nothing — no run, no failure, no signal. v0.1.24 was the last tag pushed by a human, which
is exactly why it was the last one that shipped.

Fixed: the tag is pushed with a PAT (`RELEASE_TAG_TOKEN`, falling back to
`RELEASES_PUBLIC_REPO_TOKEN`), and the job fails loudly if neither secret exists.

### 2. Apple's agreement lapsed → notarization 403

```
failed to notarize app: HTTP status code: 403. A required agreement is missing or has
expired. This request requires an in-effect agreement that has not been signed or has
expired.
```

Nothing in the repo can fix this. It means either the Apple Developer Program membership
has lapsed, or Apple published an updated Program License Agreement that the **Account
Holder** has not yet accepted. Apple does this every year or so, and it silently breaks
notarization for everyone until someone signs in and clicks Agree.

**Fix:** the Account Holder signs in at `developer.apple.com/account`, accepts any pending
agreement on the landing page or under Membership, and confirms the membership is active.
Then re-run the Release workflow — no code change and no new tag needed.

**Worth knowing:** everything before notarization succeeds, so the failure comes ~6 minutes
in, after a full compile and code-sign. Check agreements *before* cutting a release.

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

**yt-dlp:** `.github/workflows/update-yt-dlp.yml` runs weekly. When yt-dlp has a new
release it bumps `YT_DLP_VERSION` in `tools.lock` and the app's patch version, then tags.
The release's preflight job checks that release like any other.

**ffmpeg:** arm64 macOS builds are compiled from source by `scripts/build-ffmpeg.sh`
(ffmpeg + x264 + dav1d + LAME, pinned by checksum). To upgrade:

1. Bump the versions and `REVISION` in `scripts/build-ffmpeg.sh`, push to main.
2. Actions → **Build ffmpeg** → Run workflow (~5 min). It builds, runs the smoke test,
   publishes the result as a pre-release of this repo, and commits the new
   `FFMPEG_MACOS_BUILD` / `FFMPEG_MACOS_SHA256` to `tools.lock`.
3. Run **Release check** on main, then release as normal.

Releases only download the pinned build; they never compile ffmpeg. Windows still fetches
an unpinned BtbN build (see Windows above).

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
