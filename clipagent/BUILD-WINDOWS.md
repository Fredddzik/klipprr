# Building and testing on Windows

## Prerequisites

- **Binaries in `src-tauri/bin/`**: For Windows you need `yt-dlp.exe`, `ffmpeg.exe`, and `ffprobe.exe` in `clipagent/src-tauri/bin/`. The bundle copies everything from `bin/*` into the installer.

## Build and test MSI locally

1. **Build the frontend (cliptool)**
   ```powershell
   cd cliptool
   npm run build
   ```

2. **Ensure binaries are in place**
   - Put `yt-dlp.exe`, `ffmpeg.exe`, and `ffprobe.exe` in `clipagent/src-tauri/bin/`.

3. **Build the Tauri app and MSI**
   ```powershell
   cd clipagent\src-tauri
   cargo tauri build --bundles msi
   ```

4. **Output**
   - MSI installer: `clipagent/src-tauri/target/release/bundle/msi/...msi`

### Build messages you may see

- **"A public key has been found, but no private key"** — Disabled by setting `createUpdaterArtifacts: false` so local MSI builds don’t require `TAURI_SIGNING_PRIVATE_KEY`. For release/CI, set `createUpdaterArtifacts` to `true` in `tauri.conf.json` and set the `TAURI_SIGNING_PRIVATE_KEY` env var.
- **"__TAURI_BUNDLE_TYPE variable not found"** — Warning only; the MSI still builds. The updater plugin may not pick the right package for updates. If you need that, keep `tauri` and `tauri-cli` (and `tauri-build`) on matching 2.x versions.

## Development (no MSI)

- Run `cargo tauri dev` from `clipagent/src-tauri` (with cliptool built and binaries in `bin/`). The app resolves binaries from `src-tauri/bin/` in debug builds.

## Login (magic link / "Open Klipprr?")

- The **`clipagent://` URL scheme** must be declared in `src-tauri/tauri.conf.json` under `plugins.deep-link.desktop.schemes` (`["clipagent"]`) so the Windows installer registers it with the OS. Without that, the browser shows *scheme does not have a registered handler*.
- **macOS** is unaffected for login: `register_all()` is not used there (Tauri only documents it for Windows/Linux). The shipped `.app` still gets `clipagent://` from `src-tauri/Info.plist` `CFBundleURLTypes`, which the macOS bundler merges last and therefore keeps as the source of truth for that key.
- On first run, the app calls `register_all()` on Windows/Linux so the current executable is associated with `clipagent://` (needed for `cargo tauri dev` without installing an MSI).
- The **"Allow browser to open Klipprr?"** prompt only appears if the OS has registered the `clipagent://` URL scheme.
- **Installed MSI**: The installer should register the scheme; after installing, click the magic link in the browser and Windows should offer to open Klipprr.
- **Running from bundle folder** (e.g. exe inside `target/release/bundle/msi/` without installing): The scheme is usually **not** registered, so the browser won't show the prompt. Install the MSI and try again.
- In Supabase Auth redirect URLs, use the same scheme (e.g. `clipagent://**` or the exact callback path your app uses).

## Platform-specific behavior

- **Windows**: Bundled binaries are resolved via Tauri’s resource directory (`$RESOURCE/bin/`). Development uses `src-tauri/bin/` (tries both `yt-dlp.exe` and `yt-dlp`).
- **macOS**: Unchanged; still uses `.app/Contents/Resources/bin/` and the same dev fallback.
