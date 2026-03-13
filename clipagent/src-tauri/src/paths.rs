use std::path::PathBuf;
use std::env;
use std::sync::Mutex;
use once_cell::sync::Lazy;

/// On Windows, Tauri places bundle resources in $RESOURCE. We set this from app setup so path
/// resolution can find bin/ without depending on AppHandle in HTTP handlers.
#[cfg(windows)]
static RESOURCE_DIR: Lazy<Mutex<Option<PathBuf>>> = Lazy::new(|| Mutex::new(None));

/// Call from app setup so bundled binaries can be resolved on Windows (Tauri uses $RESOURCE there).
#[cfg(windows)]
pub fn init_resource_dir(dir: PathBuf) {
    if let Ok(mut guard) = RESOURCE_DIR.lock() {
        *guard = Some(dir);
    }
}

/// No-op on non-Windows; macOS uses .app layout, not resource_dir.
#[cfg(not(windows))]
pub fn init_resource_dir(_dir: PathBuf) {}

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

/// True when we should not pass --cookies-from-browser to yt-dlp (avoids Chrome DPAPI decrypt errors on Windows).
#[cfg(windows)]
pub fn skip_browser_cookies_for_yt_dlp() -> bool {
    true
}

#[cfg(not(windows))]
pub fn skip_browser_cookies_for_yt_dlp() -> bool {
    false
}

/// Browser name for yt-dlp --cookies-from-browser (avoids YouTube "Sign in to confirm you're not a bot").
/// Not used when running_from_sandboxed_app() or skip_browser_cookies_for_yt_dlp() is true.
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

    // 1. Windows: Tauri bundles put resources in $RESOURCE (set from app setup)
    #[cfg(windows)]
    if let Ok(guard) = RESOURCE_DIR.lock() {
        if let Some(ref base) = *guard {
            let with_exe = base.join("bin").join(&name);
            if with_exe.exists() {
                return with_exe;
            }
            // Bundle config may list "bin/yt-dlp"; on Windows file may be yt-dlp or yt-dlp.exe
            let no_exe = base.join("bin").join(binary);
            if no_exe.exists() {
                return no_exe;
            }
        }
    }

    // 2. Windows: exe-relative fallback (e.g. portable layout: exe and bin/ in same dir)
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

    // 3. macOS: walk up until we find a ".app" bundle root
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

    // 4. Development fallback ONLY in debug builds (src-tauri/bin/)
    #[cfg(debug_assertions)]
    {
        let manifest_bin = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin");
        let dev_path = manifest_bin.join(&name);
        if dev_path.exists() {
            return dev_path;
        }
        // On Windows, bin/ may contain Unix-named binaries (e.g. yt-dlp without .exe)
        #[cfg(windows)]
        {
            let dev_path_no_exe = manifest_bin.join(binary);
            if dev_path_no_exe.exists() {
                return dev_path_no_exe;
            }
        }
    }

    panic!("Failed to resolve bundled binary path for {}", binary);
}