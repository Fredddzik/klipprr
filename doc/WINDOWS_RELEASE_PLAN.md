# Plan: Windows release alongside macOS

**Goal:** Release a Windows build (e.g. `.msi` or `.exe` installer) at the same time as the Mac `.dmg`, and show it on the website download page. No code written yet — planning only.

---

## 1. Difficulty (high level)

| Area | Effort | Notes |
|------|--------|--------|
| **CI: add Windows build** | Medium | New job on `windows-latest` (or matrix), same frontend artifact, Tauri `--target x86_64-pc-windows-msvc` and bundle (e.g. `msi` or `nsis`). |
| **Binaries (ffmpeg, ffprobe, yt-dlp)** | Medium | Today `bin/` has macOS binaries. Windows build needs Windows builds of these (e.g. `bin/win/` or CI step to fetch Windows ffmpeg/yt-dlp). |
| **Mirror step** | Small | Extend existing “Mirror release to public repo” to also upload Windows artifact(s) and add `windows-x86_64` to `latest.json` if you want in-app updates on Windows. |
| **Download page** | Small | `getLatestRelease()` already has a pattern (Mac); add `windowsUrl` / `windowsLabel` from release assets (e.g. `.msi`), and make the Windows section point to it instead of “Coming soon.” |
| **Windows code signing** | Medium (optional first) | See section 3. You can ship an **unsigned** Windows build first; signing is for reducing SmartScreen warnings and trust. |

**Overall:** Medium. Most work is (1) Windows job + correct bundles, (2) Windows binaries for ffmpeg/yt-dlp (and ffprobe), (3) optionally signing. Mirror + download page are small, incremental changes.

---

## 2. How Windows signing differs from Apple

| | **macOS** | **Windows** |
|---|-----------|-------------|
| **What you buy** | Apple Developer Program (~$99/year). You get Developer ID Application cert + notarization. | Code Signing Certificate. Options: (a) **EV** from a CA (e.g. DigiCert, Sectigo) — often ~$300–500/year, instant SmartScreen trust; (b) **Standard (OV)** — cheaper, but new publishers can get SmartScreen warnings until reputation builds. |
| **Where it lives** | Cert in Keychain; CI uses `.p12` + keychain. | Cert (`.pfx` or from CA) + private key; CI uses env vars or Azure Key Vault / GitHub Actions secret. |
| **What gets signed** | `.app` bundle, binaries inside it, then **notarization** (Apple’s cloud check). | The `.exe` and/or `.msi` (and sometimes installers’ internal files). No “notarization” step; trust is via SmartScreen reputation + cert. |
| **Without signing** | Gatekeeper can block or warn (“unidentified developer”). | SmartScreen often shows “Windows protected your PC” for new/unsigned apps. Users can “Run anyway.” |
| **Tauri** | `tauri-action` supports `APPLE_SIGNING_IDENTITY`, notarization via `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID`. | Tauri can sign Windows builds with `signtool` (or similar); you provide cert (e.g. `.pfx`) and optionally timestamp server. |

**Practical approach:** You can **release an unsigned Windows build first** (faster to ship; users may see one SmartScreen “Run anyway”). Add signing later with an EV or OV cert and wire it into the Windows job (cert in secret, `signtool` in CI).

---

## 3. Windows code signing options

### Option A: Traditional EV / OV certificate (~$300–500/yr or less)

- **Get a cert:** From a public CA (DigiCert, Sectigo, etc.): **EV** (best for instant SmartScreen) or **OV** (Standard). You get a `.pfx` and password.
- **Store in GitHub:** Put the `.pfx` (base64) and password in **Secrets** (e.g. `WINDOWS_SIGNING_PFX`, `WINDOWS_SIGNING_PASSWORD`). Optionally a timestamp server URL.
- **In CI:** On `windows-latest`, install the cert, then run Tauri build with signing enabled or run `signtool` after the build on the produced `.exe`/`.msi`.
- **No “Apple-like” notarization:** Trust is certificate + SmartScreen reputation.

### Option B: Azure Trusted Signing (cheaper, cloud-based)

**What it is:** Microsoft’s managed code-signing service. You don’t buy a cert; you create a “Trusted Signing” account in Azure and sign via their API/CLI. Certificates are short-lived and managed by Microsoft; reputation is tied to your verified identity.

**Pricing (typical):**

- **Basic:** ~**$9.99/month**, 5,000 signatures/month.
- **Premium:** ~$99.99/month, 100,000 signatures/month.

So it’s much cheaper than a $300–500/year EV cert for low volume.

**Pros:**

- No hardware token; everything in the cloud.
- Works with GitHub Actions (Azure provides an action and docs).
- Uses the same CA as Microsoft’s own software, so it can help with SmartScreen reputation.
- Certificate lifecycle is automatic.

**Eligibility (as of 2024–2025):**

- **Individuals:** Public preview was opened for individuals but **currently limited to USA and Canada**. Other countries cannot create new individual accounts during preview.
- **Organizations:** May have different rules (e.g. some regions require 3+ years verifiable history). Check [Azure Trusted Signing FAQ](https://learn.microsoft.com/en-us/azure/trusted-signing/faq) and Microsoft’s blog for the latest.

If you’re not in the US/Canada, you may have to wait for general availability (GA) or use Option A.

**Implementing in the release workflow:**

1. **Azure setup:** Create an Azure subscription, create a Trusted Signing account, complete identity verification. Create an App Registration (service principal) for CI and grant it the “Artifact Signing Certificate Profile Signer” (or current equivalent) role. Store **Application (client) ID**, **tenant ID**, and **client secret** in GitHub Secrets.
2. **Sign after build:** Tauri does not have built-in Azure Trusted Signing. Sign the built `.exe` and/or `.msi` **after** `cargo tauri build`:
   - Use the **[Azure Trusted Signing Action](https://github.com/Azure/trusted-signing-action)** (or the newer **artifact-signing-action**) in a step that runs after the Tauri build, passing the path(s) to the built `.exe` and `.msi`.
   - Or use a custom script that calls Azure’s signing API/CLI (e.g. `az rest` or the Trusted Signing client tools) with the same secrets.
3. **Secrets:** e.g. `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_CLIENT_SECRET` (or federated credential) so the action can authenticate to Azure and call the signing service.

So: **you are not limited to a $300–500 EV cert.** If you’re in the US or Canada, Azure Trusted Signing is a cheaper option and can be wired into the same Windows job as a post-build signing step. If you’re elsewhere, check Microsoft’s current eligibility or use a traditional cert.

---

## 4. What would change (when you implement)

### 4.1 GitHub Actions (`.github/workflows/release.yml`)

- **Option A — Two jobs:**  
  - Keep existing `release` job on `macos-latest` (frontend build + Mac Tauri build + Apple signing/notarization + mirror Mac artifacts).  
  - Add a `release-windows` job on `windows-latest` that:  
    - Checks out repo.  
    - Uses the **same** frontend build output (you’d need to pass it as an artifact from the Mac job, or rebuild the frontend on Windows — rebuilding is simpler and keeps one source of truth for “what’s in the release”).  
    - Installs Node, Rust (target `x86_64-pc-windows-msvc`), and builds Tauri with e.g. `--bundles msi` (or `nsis`).  
    - Optionally signs the `.exe`/`.msi` if secrets are set.  
    - Uploads Windows artifact(s) to the **same** GitHub Release (tag) created by the Mac job (e.g. using `gh release upload` with `GITHUB_TOKEN`).  
- **Option B — Matrix:**  
  - Single job with a matrix strategy (e.g. `os: [macos-latest, windows-latest]`). More refactor: Mac-only steps (Apple cert, notarization) must be conditional on `matrix.os == 'macos-latest'`; Windows-only steps (signing with signtool, bundle type) on `windows-latest`. Artifacts from both runs are then combined (e.g. upload Windows to release in a follow-up step).  

Recommendation: **Option A** is clearer and matches your current “one Mac job + mirror” flow: add a second job that depends on the release existing (or use a small “coordinator” that creates the release and both jobs upload to it).

### 4.2 Binaries (ffmpeg, ffprobe, yt-dlp) on Windows

- Today `clipagent/src-tauri/bin/` is macOS (and possibly Linux). For Windows you need Windows builds:
  - **ffmpeg / ffprobe:** e.g. from https://github.com/BtbN/FFmpeg-Builds/releases (e.g. `ffmpeg-master-latest-win64-gpl.zip`) or similar; put `ffmpeg.exe` / `ffprobe.exe` in a path the Windows bundle can use (e.g. `bin/win/` or `bin/` with platform detection in `build.rs` or config).
  - **yt-dlp:** Official release provides `yt-dlp.exe`. You can download it in CI or commit a Windows build under `bin/win/` and reference it only when building for Windows.
- **Tauri `bundle.resources`:** May need to be platform-specific (e.g. include `bin/win/*.exe` only on Windows) so the Windows installer packages the right binaries.

### 4.3 Mirror to public repo

- In the “Mirror release to public repo” step (today Mac-only):
  - After the Windows job has uploaded its artifact(s) to the **private** repo’s release, the mirror step (or a dedicated step) should also upload those Windows assets to the **public** repo’s same tag (e.g. `v0.1.11`).
  - So: same tag in public repo gets both Mac (`.dmg`, `.app.tar.gz`, `.sig`, `latest.json`) and Windows (e.g. `Klipprr_0.1.11_x64_en-US.msi` or similar).
- **Updater (`latest.json`):** If you want “Check for updates” on Windows, extend `latest.json` with a `windows-x86_64` (or similar) entry: `signature` (from Tauri’s updater) and `url` to the Windows installer/sig. Tauri’s updater format supports multiple platforms in one JSON.

### 4.4 Website download page

- **API:** In `getLatestRelease()` (or equivalent), detect a Windows asset (e.g. `.msi` or `.exe`) and set `windowsUrl` and `windowsLabel`.
- **UI:** In the Windows section, if `windowsUrl` is present, show “Download Klipprr vX.Y.Z (.msi)” (or similar) and link to `windowsUrl`. Remove “Coming soon” when a Windows build exists.

### 4.5 Tauri config

- **Bundles:** Ensure Windows targets produce the desired installer. Typical: `msi` (Windows Installer) or `nsis` (NSIS). In the Windows job you’d pass e.g. `--bundles msi` (and optionally `app` for the raw `.exe`).
- **Updater:** If you add Windows to `latest.json`, Tauri’s updater plugin will use it when the app runs on Windows.

---

## 5. Order of operations (suggested)

1. **Windows build in CI (unsigned)**  
   Add Windows job; produce `.msi` (or `.exe`); upload to the same release tag. Resolve ffmpeg/yt-dlp for Windows (path and CI or committed binaries).

2. **Mirror + download page**  
   Mirror Windows artifact to public repo; extend download page to show Windows link when the asset exists.

3. **Updater for Windows**  
   Add `windows-x86_64` (or appropriate key) to `latest.json` in the mirror step so “Check for updates” works on Windows.

4. **Windows signing (optional)**  
   Obtain code signing cert; store in secrets; add signing step in the Windows job so the installer is signed and SmartScreen warnings decrease over time.

---

## 6. Summary

- **Difficulty:** Medium overall: one new Windows job, Windows binaries for bundled tools, small mirror + download page changes. Signing is optional and similar in concept to “we need a cert,” but different ecosystem (no notarization; cert + SmartScreen).
- **Signing:** Not required to ship. You can ship unsigned first; then add a Windows code signing cert (EV or OV) and wire it into CI when you want better trust/SmartScreen behavior.
- **Same release, same tag:** Mac and Windows assets can live on the same GitHub Release (same tag); the mirror copies both to the public repo; the download page shows one “Download for Mac” and one “Download for Windows” from the same version.

No code changes have been made; this document is the plan only.
