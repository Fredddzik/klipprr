# Logo assets

- **`logo.png`** – Full app icon (with background). Used as fallback and for Open Graph / social previews if you add them later.
- **`logo-transparent.png`** – **Use the version without background here.** This file is shown in the in-app header (top bar next to “ClipAgent”). Replace this file with your transparent PNG so the logo looks correct on the dark UI without a solid background.

The app icon in the dock/menu bar and installers is set in the Tauri project: `clipagent/src-tauri/icons/` (generated from `app-icon.png` via `cargo tauri icon`).
