# Auto-updates and macOS beta release

The app uses Tauri’s built-in updater. Users see **Check for updates** in the top bar; when an update is available they can click **Install** and the app will restart on the new version.

What’s already done in the repo:

- **Backend:** `tauri-plugin-updater` is registered and `createUpdaterArtifacts: true` is set so builds produce signed updater bundles and `.sig` files.
- **Frontend:** “Check for updates” and “Install” are wired in the top bar (desktop only).
- **Config:** `tauri.conf.json` has an `updater` section (pubkey + GitHub endpoint).
- **Release workflow:** `.github/workflows/release.yml` builds on version tags, optionally signs and notarizes when Apple secrets are set, and **publishes** the release (no draft). Uploads `latest.json` + `.sig` so in-app updates work.
- **Website:** Homepage has “Download for Mac” and a **/download** page; both link to GitHub Releases.

---

## Beta release checklist (macOS)

Before shipping the first public beta:

1. **Tauri updater keys** — Generate once (section 1), put public key in `tauri.conf.json`, add `TAURI_SIGNING_PRIVATE_KEY` to GitHub Actions secrets.
2. **Apple signing + notarization** — Add the GitHub secrets below so the workflow produces a signed, notarized build. Without them, the workflow still runs but the build will be unsigned (Gatekeeper may block).
3. **GitHub Actions secrets** (Settings → Secrets and variables → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` — **base64** of the full key file when in CI (see section 1); e.g. `base64 -i ~/.tauri/clipagent.key | tr -d '\n'`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — only if the key was generated with a password (Option A in section 1)
   - `APPLE_CERTIFICATE` — base64 of your Developer ID Application .p12 (see section 5)
   - `APPLE_CERTIFICATE_PASSWORD` — password for the .p12
   - `KEYCHAIN_PASSWORD` — any strong password for the temporary CI keychain
   - `APPLE_ID` — your Apple ID email
   - `APPLE_PASSWORD` — [app-specific password](https://support.apple.com/en-us/HT204397) (not your main Apple password)
   - `APPLE_TEAM_ID` — Team ID from [Apple Developer](https://developer.apple.com/account)
4. **First release** — Bump version (tauri.conf.json + Cargo.toml), commit, then `git tag v0.1.0 && git push origin v0.1.0`. The workflow builds and publishes the release. Download link: `https://github.com/Fredddzik/klipprr/releases/latest`.
5. **Website public** — Deploy **website-klipprr** to production (e.g. Vercel) so klipprr.com serves the homepage and `/download`. New users get the app from “Download for Mac”; existing users use **Check for updates** in the app.

After that, pushing a new version tag (e.g. `v0.1.1`) triggers a new build and release; `releases/latest` and `latest.json` point to it, so both “download from website” and in-app update stay in sync.

---

## 1. Generate signing keys (one-time)

Updates are verified with a signature. You need a **private** key (secret) and a **public** key (in the app config).

From the **clipagent/src-tauri** directory (where `Cargo.toml` and `tauri.conf.json` live). Use **cargo** so `-w` is passed to the Tauri CLI, not to npm:

```bash
cd clipagent/src-tauri
cargo tauri signer generate -w ~/.tauri/clipagent.key
```

(If you prefer npm from **cliptool**, use `--` so npm doesn’t treat `-w` as its own flag:  
`npm run tauri signer generate -- -w ~/.tauri/clipagent.key` — only if you have a `tauri` script in cliptool’s package.json.)

This creates:

- **Private key:** `~/.tauri/clipagent.key` — keep this secret and back it up. If you lose it, you cannot publish new updates for existing installs.
- **Public key:** printed in the terminal or in a `.pub` file — you’ll put this in config in the next step.

Copy the **entire** public key string (starts with something like `dW50cnVzdGVk...`).

**CI / GitHub Actions:** The Tauri CLI does **not** support unencrypted keys (no `-W`). Two options:

- **Option A — Key with password:** Generate with a non-empty password:  
  `cargo tauri signer generate -w ~/.tauri/clipagent.key -p "YourSecurePassword"`  
  Add GitHub secret `TAURI_SIGNING_PRIVATE_KEY`: use **base64** of the key file (`base64 -i ~/.tauri/clipagent.key | tr -d '\n'`). Add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the same password). The release workflow passes both to the Tauri build.
- **Option B — Unencrypted key:** Install [rsign2](https://github.com/jedisct1/rsign2) (`cargo install rsign2`; the binary is **`rsign`**), then:  
  `rsign generate -W -s ~/.tauri/clipagent.key -p ~/.tauri/clipagent.key.pub`  
  **Public key:** use the **base64** of the whole `.pub` file (both lines): `base64 -i ~/.tauri/clipagent.key.pub | tr -d '\n'` → put that string in `tauri.conf.json` → `plugins.updater.pubkey`.  
  **Private key:** when using a secret (CI), Tauri expects the key **base64-encoded** (raw file contents have spaces/newlines and break decoding). Run `base64 -i ~/.tauri/clipagent.key | tr -d '\n'` and put that single string in GitHub secret `TAURI_SIGNING_PRIVATE_KEY`. Do **not** set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

---

## 2. Put the public key and endpoint in the app

1. Open **clipagent/src-tauri/tauri.conf.json**.
2. In `plugins.updater`:
   - Replace `REPLACE_WITH_PUBLIC_KEY_FROM_TAURI_SIGNER_GENERATE` with the **exact** public key string from step 1 (one line, no path, no file reference).
   - Replace the `endpoints` URL with your real GitHub release URL:
     - If your repo is `https://github.com/your-org/klipprr`, use:
       - `https://github.com/your-org/klipprr/releases/latest/download/latest.json`
     - Use your actual org/user and repo name.

Example (with a fake key and repo):

```json
"updater": {
  "pubkey": "dW50cnVzdGVk...your-full-public-key...",
  "endpoints": [
    "https://github.com/your-org/klipprr/releases/latest/download/latest.json"
  ]
}
```

---

## 3. Build with the private key (local or CI)

For the build to produce **signed** updater artifacts (and correct `.sig` files), the private key must be available when you run the build.

**Local build (for testing):**

```bash
# Mac/Linux
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/clipagent.key)"
# Then from repo root, build frontend and Tauri:
cd cliptool && npm run build && cd ../clipagent && npm run tauri build
```

(On Windows use `set TAURI_SIGNING_PRIVATE_KEY=...` and the path to your key file or its content.)

**Important:** `.env` files are not used for the signer; the key must be in the environment (or passed another way your build uses).

---

## 4. GitHub Actions: secret and workflow

So that **GitHub** can build and release signed updates:

1. **Add the private key as a secret**
   - Repo → **Settings** → **Secrets and variables** → **Actions**.
   - **New repository secret**
   - Name: `TAURI_SIGNING_PRIVATE_KEY`
   - Value: **base64** of the key file so CI decoding works: run `base64 -i ~/.tauri/clipagent.key | tr -d '\n'` and paste that single line (no newlines).

2. **Add a workflow that builds and publishes a release**

**Automatic yt-dlp updates:** **.github/workflows/update-yt-dlp.yml** runs daily (and on manual "Run workflow"). It updates the bundled yt-dlp, bumps the app version, and pushes a version tag. That triggers **release.yml**, which builds and **publishes** the release (no draft).

**Release workflow (release.yml):** On a version tag (e.g. `v0.2.0`) it:

- Checks out the repo, sets up Node and Rust (aarch64-apple-darwin).
- Builds the frontend (cliptool → clipagent/ui/out).
- **If Apple secrets are set:** imports the Developer ID certificate into a keychain, **signs every executable in `clipagent/src-tauri/bin/`** (ffmpeg, ffprobe, yt-dlp) with that identity so they pass notarization, then Tauri build runs with code signing and notarization.
- Runs **tauri-apps/tauri-action** with `TAURI_SIGNING_PRIVATE_KEY`; creates/updates a **published** GitHub Release and uploads the macOS build + `latest.json` and `.sig` for the updater.

Minimal pattern (adjust paths and Node/Rust setup to match your repo):

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    runs-on: macos-latest  # or matrix for macos/ubuntu/windows
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - name: Install frontend deps and build
        run: |
          cd cliptool && npm ci && npm run build

      - name: Tauri build and release
        uses: tauri-apps/tauri-action@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
        with:
          projectPath: clipagent
          tagName: v__VERSION__
          releaseName: 'ClipAgent v__VERSION__'
          releaseBody: 'See the assets to download.'
          releaseDraft: true
          args: '--target aarch64-apple-darwin'  # or matrix
```

- **tagName: v__VERSION__** — the action replaces `__VERSION__` with the version from `tauri.conf.json` (e.g. `0.1.0`). So when you push tag `v0.1.0`, the release and assets are for that version.
- **releaseDraft: true** — release is created as a draft; you can publish it after checking.
- **uploadUpdaterJson** is `true` by default, so the action will generate and upload **latest.json** for the updater.

After the workflow runs, the release’s **latest** download URL for `latest.json` will be:

`https://github.com/YOUR_ORG/klipprr/releases/latest/download/latest.json`

That must match the `endpoints` URL you put in **tauri.conf.json** in step 2.

**Note:** `releases/latest/download/latest.json` does not exist until you create your **first** release (step 5). Until then, “Check for updates” in the app will fail or see no update—that’s expected.

---

## 5. Apple code signing and notarization (macOS)

### 5.0 What each GitHub secret is (from your Developer ID certificate)

From your **Developer ID Application** certificate (e.g. “Developer ID Application: Frederik Hypky (4C774KBDHL)” in Keychain):

| GitHub secret | What it is | Where you get it |
|---------------|------------|------------------|
| **APPLE_TEAM_ID** | Your 10-character Team ID | Certificate **Subject → User ID** or **Organizational Unit**: `4C774KBDHL` |
| **APPLE_SIGNING_IDENTITY** | Full name of the cert (for signing) | Certificate **Subject → Common Name**: `Developer ID Application: Frederik Hypky (4C774KBDHL)` — the workflow can also detect this from the keychain if you don’t set the secret. |
| **APPLE_CERTIFICATE** | The certificate file, base64-encoded | **Not** visible in the certificate window. You must **export** the cert from Keychain as a `.p12` file, then base64-encode it (see below). |
| **APPLE_CERTIFICATE_PASSWORD** | Password for the .p12 file | You **choose** this when you export the .p12 in Keychain Access. Store the same value in GitHub. |
| **APPLE_ID** | Your Apple ID email | The email you use for [Apple Developer](https://developer.apple.com/account). |
| **APPLE_PASSWORD** | App-specific password (for notarization) | Create at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords. **Not** your normal Apple ID password. |
| **KEYCHAIN_PASSWORD** | Password for the temporary CI keychain | Any strong password you make up; only used in the workflow to create/unlock the keychain that holds the cert. |

**Creating APPLE_CERTIFICATE (base64 of .p12):**

1. In **Keychain Access**, open **My Certificates**, find **Developer ID Application: Frederik Hypky (4C774KBDHL)**.
2. Expand the certificate (click the triangle); select both the **certificate** and the **private key** (hold Command to select both).
3. Right-click → **Export 2 items…** → save as e.g. `klipprr-cert.p12`. Choose a **password** (this is **APPLE_CERTIFICATE_PASSWORD**).
4. Base64-encode the file (Terminal):  
   `openssl base64 -A -in klipprr-cert.p12 -out klipprr-cert-base64.txt`
5. Copy the **entire contents** of `klipprr-cert-base64.txt` into the GitHub secret **APPLE_CERTIFICATE** (one long line, no line breaks).

**Values you can set now (from the certificate window):**

- **APPLE_TEAM_ID** = `4C774KBDHL`
- **APPLE_SIGNING_IDENTITY** = `Developer ID Application: Frederik Hypky (4C774KBDHL)` (optional; the workflow can detect it from the imported cert)

---

There are **two different kinds of signing** involved:

| Layer | What it does | You have it? |
|-------|----------------|---------------|
| **Tauri updater signing** | Proves the **update package** (e.g. `.tar.gz`) is from you. The app only installs updates whose signature matches the public key in the app. | ✅ Yes — `TAURI_SIGNING_PRIVATE_KEY` + pubkey in config. |
| **Apple code signing + notarization** | Tells **macOS** that the **.app** is from you. Without it, Gatekeeper shows “unidentified developer” or blocks the app. | Set up separately (see below). |

**Why it matters for auto-updates:**  
The in-app updater downloads the **same build** you upload to the release (the same `.app` or archive). If that build is **not** signed and notarized by Apple, then after a user clicks “Install” and the app updates, the **new** .app will still be “unidentified” and macOS may block it. So for a smooth experience, the build that goes to GitHub (and that the updater serves) should be **signed and notarized** in CI.

**What you need (when you add it):**

- **Apple Developer account** (paid; notarization is not available on the free tier).
- **Developer ID Application** certificate (created in Apple Developer → Certificates).
- Certificate exported as a **.p12** file, then **base64-encoded** and stored in a GitHub secret (e.g. `APPLE_CERTIFICATE`); plus a password secret (`APPLE_CERTIFICATE_PASSWORD`).
- For **notarization:** Apple ID + app-specific password (or App Store Connect API key). Stored as GitHub secrets (e.g. `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`).

**Where it fits in the pipeline:**  
In your release workflow, **after** the Tauri build produces the .app (or .dmg):

1. **Import** the Apple certificate into the keychain (decode the secret and install the .p12).
2. **Sign** the .app (and any binaries inside it) using that identity (`codesign` or Tauri’s env: `APPLE_SIGNING_IDENTITY`, etc.).
3. **Submit** the signed app (or a .zip/.dmg of it) to Apple for **notarization** (`xcrun notarytool submit`).
4. **Staple** the notarization ticket to the app (`xcrun stapler staple`).
5. **Upload** that signed, notarized build to the GitHub release (and use it for the updater artifact).

Until you add these steps, the workflow will produce **unsigned** macOS builds. They can run on your machine (and with “Open Anyway”), but many users will see Gatekeeper warnings. Adding Apple signing and notarization to the workflow is the right next step before or during beta; you can keep the same “release new version” flow below—only the **contents** of the release (signed vs unsigned) will change.

---

## 6. Step-by-step: Releasing a new version

Use this checklist every time you ship a new version (first beta or later updates).

### 6.1 Bump the version

- Open **clipagent/src-tauri/tauri.conf.json** → set `"version"` (e.g. `"0.2.0"`).
- Open **clipagent/src-tauri/Cargo.toml** → set `version = "0.2.0"` (same value).
- Save both files.

### 6.2 Commit and push

```bash
git add clipagent/src-tauri/tauri.conf.json clipagent/src-tauri/Cargo.toml
git commit -m "Bump version to 0.2.0"
git push origin main
```

### 6.3 Create and push the version tag

The tag **must** match the version number with a `v` prefix:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Pushing the tag triggers the **Release** workflow. It will:

- Build the frontend (cliptool).
- Build the Tauri app (clipagent) with `TAURI_SIGNING_PRIVATE_KEY`.
- Create a **draft** GitHub Release for that tag and upload the built artifacts + **latest.json** (and .sig for the updater).

### 6.4 Release is published automatically

- The workflow publishes the release (no draft). On GitHub **Releases** you’ll see **Klipprr vX.Y.Z** with assets (e.g. .dmg or .app.tar.gz, `latest.json`, `.sig`). If Apple secrets are set, the macOS build is signed and notarized.

### 6.5 Website download

- The site already links to **https://github.com/Fredddzik/klipprr/releases/latest** (homepage “Download for Mac” and **/download** page). Users pick the asset there. Each new release becomes “latest,” so no manual update of the download link is needed.

### 6.6 (Optional) Announce

- Tell beta users a new version is available. Those who have the app can use **Check for updates** → **Install**; others can re-download from the website if you updated the link.

---

**Summary:**  
Version bump → commit & push → tag & push → workflow runs → release is published; website already points to releases/latest. When Apple secrets are set, the workflow signs and notarizes so the release and in-app updater both serve the same build.

---

## 7. Manual release with Apple signing (macOS .dmg + updater)

Use this when you build and sign locally (your existing Apple pipeline) and want to upload a **signed, notarized** build to GitHub so both the **website download** and **Check for updates** serve the same good build.

**Versioning (important):** You don’t “change” v0.1.0. You release a **new** version each time (e.g. v0.1.0, then v0.1.1, then v0.2.0). GitHub’s **releases/latest** points to the **newest published release**. So when you publish v0.1.1, `releases/latest/download/latest.json` will point to v0.1.1, and users on v0.1.0 who click “Check for updates” will get v0.1.1.

### 7.1 Bump version

- **clipagent/src-tauri/tauri.conf.json** → `"version": "0.1.1"` (or next version).
- **clipagent/src-tauri/Cargo.toml** → `version = "0.1.1"`.
- Commit and push (optional but good practice).

### 7.2 Build app (frontend + Tauri)

From repo root:

```bash
cd cliptool && npm run build
cd ../clipagent/src-tauri
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/clipagent.key)"
cargo tauri build
```

App is at `clipagent/src-tauri/target/release/bundle/macos/Klipprr.app`. Tauri also produces `Klipprr.app.tar.gz` and `Klipprr.app.tar.gz.sig` there (those are from the **unsigned** .app; we’ll replace them with signed artifacts below).

### 7.3 Stage to clean directory (never sign inside target/)

```bash
cd ~/dev/klipprr/clipagent/src-tauri

STAGE="/tmp/Klipprr-sign"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R target/release/bundle/macos/Klipprr.app "$STAGE/"
APP="$STAGE/Klipprr.app"

xattr -cr "$APP"
```

### 7.4 Sign (binaries first, then app)

Use your **Developer ID Application** identity (from Keychain or `security find-identity -v -p codesigning`):

```bash
SIGN="Developer ID Application: Frederik Hypky (4C774KBDHL)"
ENTITLEMENTS="$(pwd)/entitlements.plist"

codesign --force --options runtime --entitlements "$ENTITLEMENTS" --timestamp --sign "$SIGN" "$APP/Contents/Resources/bin/yt-dlp"
codesign --force --options runtime --timestamp --sign "$SIGN" "$APP/Contents/Resources/bin/ffprobe"
codesign --force --options runtime --timestamp --sign "$SIGN" "$APP/Contents/Resources/bin/ffmpeg"

codesign --force --deep --options runtime --entitlements "$ENTITLEMENTS" --timestamp --sign "$SIGN" "$APP"
```

### 7.5 Verify, then notarize

```bash
codesign --verify --deep --strict --verbose=2 "$APP"
spctl --assess --type exec --verbose "$APP"   # expect "Unnotarized" for now

NOTARY="/tmp/klipprr-notary.zip"
rm -f "$NOTARY"
ditto -c -k --keepParent "$APP" "$NOTARY"

xcrun notarytool submit "$NOTARY" --keychain-profile "klipprr-notary" --wait
# Wait for: status: Accepted

xcrun stapler staple "$APP"
# Expect: The staple and validate action worked!

spctl --assess --type exec --verbose "$APP"   # expect: accepted, source=Notarized Developer ID
```

### 7.6 Create distribution artifacts

**A) .tar.gz for the updater** (Tauri’s format; “Check for updates” will download this):

```bash
UPDATER_TAR="/tmp/Klipprr.app.tar.gz"
rm -f "$UPDATER_TAR"
ditto -c -k --keepParent "$APP" "$UPDATER_TAR"
```

**B) Sign the .tar.gz with the Tauri signer** (so the updater can verify it):

```bash
cd ~/dev/klipprr/clipagent/src-tauri
cargo tauri signer sign -f ~/.tauri/clipagent.key "$UPDATER_TAR"
# Creates: /tmp/Klipprr.app.tar.gz.sig
```

**C) .dmg or .zip for the website** (optional; for first-time download):

```bash
# Zip (same as before):
DIST="/tmp/Klipprr-mac.zip"
rm -f "$DIST"
ditto -c -k --keepParent "$APP" "$DIST"

# Or .dmg (e.g. for website):
DMG="/tmp/Klipprr.dmg"
rm -f "$DMG"
hdiutil create -volname "ClipAgent" -srcfolder "$APP" -ov -format UDZO "$DMG"
```

### 7.7 Create GitHub release and upload

1. **Create the release (draft):**
   - GitHub → **Releases** → **Draft a new release**.
   - **Choose a tag:** create new tag `v0.1.1` (must match the version in `tauri.conf.json`).
   - Release title: e.g. **ClipAgent v0.1.1**.
   - Leave body as you like → **Publish release** (or save as draft).

2. **Upload assets:**
   - Upload **`/tmp/Klipprr.app.tar.gz`** (signed/notarized app archive for the updater).
   - After upload, copy the **asset URL** (e.g. `https://github.com/Fredddzik/klipprr/releases/download/v0.1.1/Klipprr.app.tar.gz`).

3. **Create and upload latest.json:**
   - Upload it to **this same release**. When this release is **published**, GitHub’s `releases/latest` will point here, so `releases/latest/download/latest.json` will serve your file.
   - **latest.json** content (replace version, url, and signature):

   ```json
   {
     "version": "0.1.1",
     "notes": "",
     "pub_date": "2026-03-01T12:00:00Z",
     "platforms": {
       "darwin-aarch64": {
         "signature": "PASTE_CONTENTS_OF_TMP_CLIPAGENT_APP_TAR_GZ_SIG_HERE",
         "url": "https://github.com/Fredddzik/klipprr/releases/download/v0.1.1/Klipprr.app.tar.gz"
       }
     }
   }
   ```

   - **signature:** run `cat /tmp/Klipprr.app.tar.gz.sig` and paste the whole string (one line).
   - **url:** the download URL of the **Klipprr.app.tar.gz** asset you uploaded (same release).
   - **pub_date:** RFC 3339 (e.g. now in UTC).
   - Save as `latest.json` and upload it to the **same** release. For “Check for updates” to see it via `releases/latest/download/latest.json`, this release must be the **published** “Latest release” (the most recent one).

4. **Publish the release** so GitHub treats it as “latest.”

### 7.8 Update the website

- Download the **.dmg or .zip** you created (or the same .tar.gz) and upload it to your site, or point the download button to the release asset URL.
- New users get this version; existing users get it via **Check for updates**.

---

**Order summary:**  
Bump version → build (frontend + Tauri) → stage .app → sign binaries + app → notarize → staple → create .app.tar.gz from signed app → sign .tar.gz with Tauri signer → create GitHub release (tag vX.Y.Z) → upload .tar.gz and latest.json → publish release → update website.  
No need to “change” an existing version; each release is a new version and “latest” follows the newest published release.

---

## 8. Troubleshooting

- **“Update check failed”**  
  - Endpoint URL in `tauri.conf.json` must be exactly the GitHub `latest.json` URL (see step 2).  
  - For **releases/latest**, the release must be **published** (not draft) so that “latest” points to it.

- **No updater artifacts / missing latest.json**  
  - Build must run with `TAURI_SIGNING_PRIVATE_KEY` set (local or `TAURI_SIGNING_PRIVATE_KEY` secret in GitHub).  
  - `createUpdaterArtifacts: true` must be set in `tauri.conf.json` (already done).

- **Signature verification failed**  
  - The **public** key in `tauri.conf.json` must match the key pair of the **private** key used when building.  
  - Replacing the private key (e.g. new secret) requires updating the public key in config and shipping a new app version that uses it.

- **Bump version**  
  - After changing the public key or the endpoint, bump the app version and release a new build so all users get the new updater config.
