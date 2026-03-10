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

/// True when running from a sandboxed .app bundle. In that case we cannot read browser cookies (macOS blocks access).
pub fn running_from_sandboxed_app() -> bool {
    if let Ok(exe) = env::current_exe() {
        let path = exe.to_string_lossy();
        return path.contains(".app/Contents/");
    }
    false
}

/// Browser name for yt-dlp --cookies-from-browser (avoids YouTube "Sign in to confirm you're not a bot").
/// Not used when running_from_sandboxed_app() is true, because the app cannot read browser cookie stores.
pub fn yt_dlp_cookies_browser() -> &'static str {
    if cfg!(target_os = "macos") {
        "safari"
    } else if cfg!(target_os = "windows") {
        "chrome"
    } else {
        "firefox"
    }
}

#[cfg(windows)]
fn binary_name(binary: &str) -> String {
    format!("{}.exe", binary)
}

#[cfg(not(windows))]
fn binary_name(binary: &str) -> String {
    binary.to_string()
}

fn resolve_binary_path(binary: &str) -> PathBuf {
    let name = binary_name(binary);

    // 1. Windows: exe is next to bin/ (e.g. Program Files/Klipprr/Klipprr.exe, bin/ in same dir)
    #[cfg(windows)]
    if let Ok(exe_path) = env::current_exe() {
        if let Some(app_dir) = exe_path.parent() {
            for subdir in ["bin", "resources/bin"] {
                let candidate = app_dir.join(subdir).join(&name);
                if candidate.exists() {
                    return candidate;
                }
            }
        }
    }

    // 2. macOS: walk up until we find a ".app" bundle root
    #[cfg(target_os = "macos")]
    if let Ok(exe_path) = env::current_exe() {
        let mut current = exe_path.as_path();
        while let Some(parent) = current.parent() {
            if let Some(file_name) = parent.file_name() {
                if file_name.to_string_lossy().ends_with(".app") {
                    let resources_bin =
                        parent.join("Contents").join("Resources").join("bin").join(&name);
                    if resources_bin.exists() {
                        return resources_bin;
                    }
                }
            }
            current = parent;
        }
    }

    // 3. Development fallback ONLY in debug builds
    #[cfg(debug_assertions)]
    {
        let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin").join(&name);
        if dev_path.exists() {
            return dev_path;
        }
    }

    panic!("Failed to resolve bundled binary path for {}", binary);
}