use std::fs;
use std::path::{PathBuf};
use tauri::AppHandle;
use tauri::Manager;

use crate::license::LicenseToken;

/// Name of the file on disk
const LICENSE_FILE: &str = "license.json";

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "cannot_resolve_app_data_dir".to_string())
}

/// Load license from disk
pub fn load_license(app: &AppHandle) -> Option<LicenseToken> {
    let dir = app_data_dir(app).ok()?;
    let path = dir.join(LICENSE_FILE);
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Save license to disk
pub fn save_license(app: &AppHandle, token: &LicenseToken) -> Result<(), String> {
    let dir = app_data_dir(app)?;
    println!("🔑 Saving license to: {:?}", dir);

    fs::create_dir_all(&dir)
        .map_err(|_| "cannot_create_app_data_dir".to_string())?;

    let path = dir.join(LICENSE_FILE);
    let raw = serde_json::to_string_pretty(token)
        .map_err(|_| "cannot_serialize_license".to_string())?;

    fs::write(&path, raw)
        .map_err(|_| "cannot_write_license".to_string())?;

    println!("✅ License saved at {:?}", path);
    Ok(())
}

/// Remove license from disk
pub fn clear_license(app: &AppHandle) -> Result<(), String> {
    let dir = app_data_dir(app)?;
    let path = dir.join(LICENSE_FILE);

    println!("[License][STORAGE] clear_license called");
    println!("[License][STORAGE] license path = {:?}", path);

    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
        println!("[License][STORAGE] license.json deleted");
    } else {
        println!("[License][STORAGE] license.json did not exist");
    }

    Ok(())
}