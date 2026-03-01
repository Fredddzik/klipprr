use std::path::{PathBuf};
use std::env;

/// Returns path to bundled yt-dlp binary.
/// In development (cargo tauri dev), falls back to src-tauri/bin.
/// In production (bundled .app), resolves to Contents/Resources/bin.
pub fn yt_dlp_path() -> PathBuf {
    resolve_binary_path("yt-dlp")
}

/// Returns path to bundled ffmpeg binary.
pub fn ffmpeg_path() -> PathBuf {
    resolve_binary_path("ffmpeg")
}

/// Returns path to bundled ffprobe binary (same bundle as ffmpeg).
pub fn ffprobe_path() -> PathBuf {
    resolve_binary_path("ffprobe")
}

fn resolve_binary_path(binary: &str) -> PathBuf {
    // 1. Always try resolving relative to the currently running executable.
    // This works for both:
    // - Installed .app in /Applications
    // - target/release/bundle builds
    if let Ok(exe_path) = env::current_exe() {
        // Walk up until we find a ".app" bundle root
        let mut current = exe_path.as_path();

        while let Some(parent) = current.parent() {
            if let Some(name) = parent.file_name() {
                if name.to_string_lossy().ends_with(".app") {
                    let resources_bin =
                        parent.join("Contents").join("Resources").join("bin").join(binary);

                    if resources_bin.exists() {
                        return resources_bin;
                    }
                }
            }
            current = parent;
        }
    }

    // 2. Development fallback ONLY in debug builds
    // This prevents production builds from ever resolving to CARGO_MANIFEST_DIR.
    #[cfg(debug_assertions)]
    {
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("bin")
            .join(binary);

        if dev_path.exists() {
            return dev_path;
        }
    }

    // 3. If we reach here, something is wrong — fail loudly instead of silently using a wrong path
    panic!("Failed to resolve bundled binary path for {}", binary);
}