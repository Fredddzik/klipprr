use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;
use once_cell::sync::Lazy;

use crate::license::LicenseToken;
use serde::{Deserialize, Serialize};

/// Name of the file on disk
const LICENSE_FILE: &str = "license.json";
const SUPABASE_SESSION_FILE: &str = "supabase_session.json";
const EXPORT_PATH_FILE: &str = "export_path.txt";

/// Stored Supabase session for sync_license_from_supabase (set by frontend when user is logged in).
/// refresh_token is persisted so the frontend can restore its session when it loses it (e.g. after focus).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SupabaseSession {
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: Option<String>,
    pub user_id: String,
    pub user_email: String,
}

// Keep session in-memory for this app run so we avoid repeated keychain/file reads.
static SESSION_CACHE: Lazy<Mutex<Option<SupabaseSession>>> = Lazy::new(|| Mutex::new(None));

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

/// Load Supabase session from disk (if any).
pub fn load_supabase_session(app: &AppHandle) -> Option<SupabaseSession> {
    // 0) Fast path: in-memory cache for current app run.
    if let Ok(guard) = SESSION_CACHE.lock() {
        if let Some(session) = guard.as_ref() {
            return Some(session.clone());
        }
    }

    // 1) File-only session load for beta UX: avoid any keychain access prompts.
    let dir = app_data_dir(app).ok()?;
    let path = dir.join(SUPABASE_SESSION_FILE);
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(session) = serde_json::from_str::<SupabaseSession>(&raw) {
            if !session.user_id.trim().is_empty() {
                if let Ok(mut guard) = SESSION_CACHE.lock() {
                    *guard = Some(session.clone());
                }
                return Some(session);
            }
        }
    }

    None
}

/// Save Supabase session to disk (called by frontend when user is logged in).
pub fn save_supabase_session(app: &AppHandle, session: &SupabaseSession) -> Result<(), String> {
    println!("[SupabaseSession] Saving session");

    let raw = serde_json::to_string(session).map_err(|_| "cannot_serialize_session".to_string())?;

    if let Ok(mut guard) = SESSION_CACHE.lock() {
        *guard = Some(session.clone());
    }

    let dir = app_data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|_| "cannot_create_app_data_dir".to_string())?;
    let path = dir.join(SUPABASE_SESSION_FILE);
    fs::write(&path, raw).map_err(|e| e.to_string())?;
    Ok(())
}

/// Clear Supabase session from disk (e.g. on logout).
#[allow(dead_code)]
pub fn clear_supabase_session(app: &AppHandle) -> Result<(), String> {
    if let Ok(mut guard) = SESSION_CACHE.lock() {
        *guard = None;
    }

    let dir = app_data_dir(app)?;
    let path = dir.join(SUPABASE_SESSION_FILE);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Load persisted export directory. Returns None if missing, invalid, or not a directory.
pub fn load_export_path(app: &AppHandle) -> Option<String> {
    let dir = app_data_dir(app).ok()?;
    let path = dir.join(EXPORT_PATH_FILE);
    let raw = fs::read_to_string(path).ok()?;
    let p = raw.trim();
    if p.is_empty() {
        return None;
    }
    let candidate = PathBuf::from(p);
    if candidate.is_dir() {
        Some(candidate.display().to_string())
    } else {
        let _ = fs::remove_file(dir.join(EXPORT_PATH_FILE));
        None
    }
}

/// Save export directory for next launch.
pub fn save_export_path(app: &AppHandle, path: &str) -> Result<(), String> {
    let dir = app_data_dir(app)?;
    fs::create_dir_all(&dir).map_err(|_| "cannot_create_app_data_dir".to_string())?;
    let file_path = dir.join(EXPORT_PATH_FILE);
    fs::write(&file_path, path.trim())
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Clear persisted export path (e.g. when user switches to Free).
pub fn clear_export_path(app: &AppHandle) -> Result<(), String> {
    let dir = app_data_dir(app)?;
    let path = dir.join(EXPORT_PATH_FILE);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}