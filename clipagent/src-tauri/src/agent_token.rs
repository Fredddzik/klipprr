//! A per-launch secret for the endpoints on :4000 that start work.
//!
//! Browsers are kept out by the Origin check, but a request with no Origin at all (an
//! `<img>` tag on any web page, a script on this Mac) used to be able to resolve URLs, start
//! preview downloads and run exports. Those endpoints now also need this token, which only
//! the app's own window can read (`agent_token` command). Media endpoints stay open: a
//! `<video>` element cannot send headers.

use once_cell::sync::Lazy;
use tauri::{AppHandle, Manager};

pub const HEADER: &str = "x-klipprr-token";

static TOKEN: Lazy<String> = Lazy::new(|| {
    let mut bytes = [0u8; 24];
    getrandom::getrandom(&mut bytes).expect("system random number generator");
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
});

#[tauri::command]
pub fn agent_token() -> String {
    TOKEN.clone()
}

pub fn is_valid<B>(req: &hyper::Request<B>) -> bool {
    req.headers()
        .get(HEADER)
        .and_then(|v| v.to_str().ok())
        .map_or(false, |v| v == TOKEN.as_str())
}

/// Writes the token where scripts/export-regression.sh can read it, readable by this user
/// only. Anything running as the user could drive the app anyway.
pub fn write_for_scripts(app: &AppHandle) {
    let Ok(dir) = app.path().app_data_dir() else { return };
    let path = dir.join("agent-token");
    if std::fs::create_dir_all(&dir).is_err() || std::fs::write(&path, TOKEN.as_bytes()).is_err() {
        return;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
    }
}
