use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::storage;
use tauri::AppHandle;

use base64::engine::general_purpose::URL_SAFE;
use base64::Engine;

// ---------- Types ----------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Plan {
    Free,
    Pro,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseClaims {
    pub email: String,
    pub plan: Plan,
    pub iat: u64,
    pub exp: Option<u64>,
    pub lic: String,
    pub aud: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseToken {
    pub payload: String,
    pub signature: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Capabilities {
    pub can_rename_clips: bool,
    pub can_edit_clip_range: bool,
    pub can_set_custom_export_path: bool,
    pub has_watermark: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub enum LicenseStatus {
    Ok {
        plan: String,
        claims: LicenseClaims,
    },
    Invalid {
        reason: String,
    },
}

// ---------- Helpers ----------

pub fn now_unix() -> u64 {    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}

fn is_expired(exp: Option<u64>) -> bool {
    match exp {
        Some(t) => now_unix() > t,
        None => false,
    }
}

// ---------- Core logic ----------

pub fn effective_plan(app: &AppHandle) -> Plan {
    match storage::load_license(app) {
        Some(token) => match verify_license(&token) {
            Ok(claims) => claims.plan,
            Err(_) => Plan::Free,
        },
        None => Plan::Free,
    }
}

pub fn get_license_status(app: &AppHandle) -> LicenseStatus {
    match storage::load_license(app) {
        Some(token) => match verify_license(&token) {
            Ok(claims) => LicenseStatus::Ok {
                plan: match claims.plan {
                    Plan::Pro => "pro".to_string(),
                    Plan::Free => "free".to_string(),
                },
                claims,
            },
            Err(reason) => {
    if reason == "expired" {
        println!("[License] License expired → clearing local license");
        let _ = storage::clear_license(app);
    }

    LicenseStatus::Invalid {
        reason: reason.to_string(),
    }
}
        },
        None => LicenseStatus::Invalid {
            reason: "missing".to_string(),
        },
    }
}

pub fn capabilities_for_plan(plan: &str) -> Capabilities {
    match plan {
        "pro" => Capabilities {
            can_rename_clips: true,
            can_edit_clip_range: true,
            can_set_custom_export_path: true,
            has_watermark: false,
        },
        _ => Capabilities {
            can_rename_clips: false,
            can_edit_clip_range: false,
            can_set_custom_export_path: false,
            has_watermark: true,
        },
    }
}

pub fn get_capabilities(app: &AppHandle) -> Capabilities {
    match get_license_status(app) {
        LicenseStatus::Ok { plan, .. } => capabilities_for_plan(&plan),
        _ => capabilities_for_plan("free"),
    }
}

// ---------- Verification (stub for now) ----------
// IMPORTANT: Signature verification will be added AFTER UI wiring.
// For now we trust payload structure so UX can be built.

fn verify_license(token: &LicenseToken) -> Result<LicenseClaims, &'static str> {
    let json = base64_url_decode(&token.payload).map_err(|_| "bad_payload")?;
    let claims: LicenseClaims = serde_json::from_str(&json).map_err(|_| "bad_json")?;

    if is_expired(claims.exp) {
        return Err("expired");
    }

    Ok(claims)
}

// ---------- Activation ----------

pub fn activate_license(app: &AppHandle, token: LicenseToken) -> Result<(), String> {
    // Verify before storing
    verify_license(&token).map_err(|e| e.to_string())?;
    storage::save_license(app, &token)
}

pub fn clear_license(app: &AppHandle) -> Result<(), String> {
    storage::clear_license(app)
}

// ---------- Utils ----------

fn base64_url_decode(input: &str) -> Result<String, ()> {
    let padded = match input.len() % 4 {
        2 => format!("{input}=="),
        3 => format!("{input}="),
        _ => input.to_string(),
    };

    let decoded = URL_SAFE.decode(padded).map_err(|_| ())?;
    String::from_utf8(decoded).map_err(|_| ())
}