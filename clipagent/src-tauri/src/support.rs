//! "Contact support": an email to hello@klipprr.com with the details a bug report needs
//! already filled in, so reports arrive with the app version, OS and yt-dlp version.
//!
//! Nothing is sent by the app: it opens the user's mail client with a draft they can read,
//! edit or discard (promise 4).

use std::process::Command;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;

const SUPPORT_EMAIL: &str = "hello@klipprr.com";
pub const MENU_ID: &str = "contact_support";

fn os_description() -> String {
    #[cfg(target_os = "macos")]
    {
        let version = Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "unknown".to_string());
        let chip = if std::env::consts::ARCH == "aarch64" { "Apple Silicon" } else { "Intel" };
        format!("macOS {version} ({chip})")
    }
    #[cfg(not(target_os = "macos"))]
    {
        format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH)
    }
}

fn yt_dlp_version() -> String {
    Command::new(crate::paths::yt_dlp_path())
        .arg("--version")
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

/// The mailto: URL. `context` is what was on screen when the user asked for help (the
/// error, the link that failed); it goes under the details so the user writes first.
pub fn mailto(app: &AppHandle, subject: Option<&str>, context: Option<&str>) -> String {
    let version = app.package_info().version.to_string();
    let mut body = String::from(
        "Hi Klipprr team,\n\nWhat happened, and what did you expect instead?\n\n\n\n\
         ---\nPlease keep the details below; they help us fix it.\n",
    );
    body.push_str(&format!("Klipprr {version}\n{}\nyt-dlp {}\n", os_description(), yt_dlp_version()));
    if let Some(c) = context.map(str::trim).filter(|c| !c.is_empty()) {
        // A raw yt-dlp error can run to pages; the first part identifies it.
        let c: String = c.chars().take(1500).collect();
        body.push_str(&format!("\n{c}\n"));
    }
    let subject = subject.map(str::trim).filter(|s| !s.is_empty()).unwrap_or("Klipprr support");
    format!(
        "mailto:{SUPPORT_EMAIL}?subject={}&body={}",
        urlencoding::encode(&format!("{subject} (Klipprr {version})")),
        urlencoding::encode(&body),
    )
}

pub fn open(app: &AppHandle, subject: Option<&str>, context: Option<&str>) -> Result<(), String> {
    #[allow(deprecated)] // the opener plugin is the successor; shell is what this app initialises
    app.shell().open(mailto(app, subject, context), None).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_support_email(app: AppHandle, subject: Option<String>, context: Option<String>) -> Result<(), String> {
    open(&app, subject.as_deref(), context.as_deref())
}
