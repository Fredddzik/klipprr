use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

use tauri::AppHandle;
use tauri::Emitter;

use crate::PENDING_AUTH;
use crate::license::{
    activate_license as core_activate_license,
    clear_license as core_clear_license,
    get_capabilities as core_get_capabilities,
    get_license_status as core_get_license_status,
    LicenseClaims,
    LicenseToken,
    Plan,
    Capabilities,
    LicenseStatus,
    now_unix,
};
use crate::storage;

use base64::engine::general_purpose::URL_SAFE;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};

fn append_file_log(msg: &str) {
    let mut log_dir = dirs::home_dir().unwrap_or(PathBuf::from("/tmp"));
    log_dir.push("Library/Logs/ClipAgent");
    let mut log_path = log_dir.clone();
    log_path.push("clipagent.log");

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = writeln!(file, "{msg}");
    }
}

#[tauri::command]
pub fn consume_auth_tokens() -> Option<(String, String)> {
    let mut guard = PENDING_AUTH.lock().unwrap();
    guard.take()
}

/// Return stored session tokens so the frontend can restore its Supabase session (e.g. after it was cleared on focus).
#[tauri::command]
pub fn get_stored_session_tokens(app: AppHandle) -> Option<(String, String)> {
    let session = storage::load_supabase_session(&app)?;
    let refresh = session.refresh_token.filter(|s| !s.is_empty())?;
    Some((session.access_token, refresh))
}

#[tauri::command]
pub fn get_license_status(app: AppHandle) -> LicenseStatus {
    core_get_license_status(&app)
}

#[tauri::command]
pub fn get_capabilities(app: AppHandle) -> Capabilities {
    let caps = core_get_capabilities(&app);
    println!("[License] Reporting capabilities: {:?}", caps);
    append_file_log(&format!("[License] Reporting capabilities: {:?}", caps));
    caps
}

#[tauri::command]
pub fn activate_license(app: AppHandle, token: LicenseToken) -> Result<(), String> {
    core_activate_license(&app, token)
}

#[tauri::command]
pub fn clear_license_cmd(app: AppHandle) -> Result<(), String> {
    println!("[License] Clearing local license and session (logout or inactive)");
    append_file_log("[License] Clearing local license and session");
    let _ = storage::clear_supabase_session(&app);
    let res = core_clear_license(&app);
    println!("[License] Clear license result: {:?}", res);
    append_file_log(&format!("[License] Clear license result: {:?}", res));
    res
}

#[tauri::command]
pub fn set_license_from_server(
    app: AppHandle,
    email: String,
    plan: String,
    exp: Option<u64>,
) -> Result<(), String> {
    println!("[License] set_license_from_server invoked");
    append_file_log("[License] set_license_from_server invoked");
    let normalized = plan.to_lowercase();
    let plan_enum = match normalized.as_str() {
        "pro" => Plan::Pro,
        _ => Plan::Free,
    };

    let claims = LicenseClaims {
        email,
        plan: plan_enum,
        iat: now_unix(),
        exp,
        lic: "supabase".to_string(),
        aud: None,
    };

    let json = serde_json::to_string(&claims)
        .map_err(|_| "failed_to_serialize_claims")?;

    let payload = URL_SAFE.encode(json.as_bytes());

    let token = LicenseToken {
        payload,
        signature: "server-trusted".to_string(),
    };

    println!("[License] Installing license into ClipAgent: {}", plan);
    append_file_log(&format!("[License] Installing license into ClipAgent: {}", plan));

    println!("[License] Overwriting any existing local license");
    append_file_log("[License] Overwriting any existing local license");
    let res = core_activate_license(&app, token);
    println!("[License] License install result: {:?}", res);
    append_file_log(&format!("[License] License install result: {:?}", res));
    res
}

/// Store Supabase session so sync_license_from_supabase can read it (call from frontend when user is logged in).
#[tauri::command]
pub fn set_supabase_session(
    app: AppHandle,
    access_token: String,
    refresh_token: String,
) -> Result<(), String> {
    println!("[Session] Storing Supabase session (token-based)");
    append_file_log("[Session] set_supabase_session called");

    // Decode JWT payload (no signature validation, just base64 decode middle part)
    let parts: Vec<&str> = access_token.split('.').collect();
    if parts.len() != 3 {
        append_file_log("[Session] invalid_jwt_format");
        return Err("invalid_jwt_format".to_string());
    }

    let payload_b64 = parts[1];
    let decoded = URL_SAFE_NO_PAD
        .decode(payload_b64.as_bytes())
        .or_else(|e| {
            let pad_len = (4 - (payload_b64.len() % 4)) % 4;
            let padded = format!("{}{}", payload_b64, "=".repeat(pad_len));
            URL_SAFE.decode(padded.as_bytes()).map_err(|_| e)
        })
        .map_err(|e| {
            let msg = format!("[Session] jwt_decode_failed: {}", e);
            append_file_log(&msg);
            format!("jwt_decode_failed: {}", e)
        })?;

    let payload_json = String::from_utf8(decoded)
        .map_err(|_| "jwt_utf8_failed")?;

    let v: serde_json::Value = serde_json::from_str(&payload_json)
        .map_err(|_| "jwt_json_failed")?;

    let user_id = v
        .get("sub")
        .and_then(|s| s.as_str())
        .ok_or("jwt_missing_sub")?
        .to_string();

    let user_email = v
        .get("email")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();

    let session = storage::SupabaseSession {
        access_token,
        refresh_token: Some(refresh_token),
        user_id,
        user_email,
    };

    storage::save_supabase_session(&app, &session)?;

    println!("[Session] Supabase session stored successfully");
    append_file_log(&format!(
        "[Session] Supabase session stored successfully user_id={} email={}",
        session.user_id, session.user_email
    ));
    Ok(())
}

#[derive(Debug, Deserialize)]
struct SupabaseLicenseRow {
    plan: Option<String>,
    active: Option<bool>,
    #[serde(default)]
    expires_at: Option<String>,
}

/// Downgrade to Free: clear local license and notify frontend. Call whenever we cannot confirm Pro.
fn downgrade_to_free(app: &AppHandle) {
    append_file_log("[SYNC] Downgrading to Free (cannot confirm active Pro)");
    let _ = storage::clear_license(app);
    let _ = app.emit("license-updated", ());
}

/// Supabase Auth refresh token request body.
#[derive(Serialize)]
struct RefreshTokenRequest {
    refresh_token: String,
}

/// Supabase Auth token response (access_token, refresh_token).
#[derive(Debug, Deserialize)]
struct AuthTokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
}

/// Refresh Supabase session using refresh_token. Returns (access_token, refresh_token) on success.
async fn refresh_supabase_token(
    supabase_url: &str,
    supabase_anon_key: &str,
    refresh_token: &str,
) -> Result<(String, String), String> {
    let url = format!(
        "{}/auth/v1/token?grant_type=refresh_token",
        supabase_url.trim_end_matches('/')
    );
    let client = reqwest::Client::new();
    let body = RefreshTokenRequest {
        refresh_token: refresh_token.to_string(),
    };
    let resp = client
        .post(&url)
        .header("apikey", supabase_anon_key)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        append_file_log(&format!("[SYNC] Refresh token failed status={} body={}", status, body_text));
        return Err(format!("refresh_failed: {}", status));
    }
    let data: AuthTokenResponse = resp.json().await.map_err(|e| e.to_string())?;
    let new_refresh = data
        .refresh_token
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| refresh_token.to_string());
    Ok((data.access_token, new_refresh))
}

/// Sync local license from Supabase: read stored session, query licenses table, apply or clear.
/// Pro is never "sticky": if the REST call fails (401 JWT expired, network, etc.) or Supabase
/// has no active license, we clear the local license so the app shows Free.
#[tauri::command]
pub async fn sync_license_from_supabase(
    app: AppHandle,
    supabase_url: Option<String>,
    supabase_anon_key: Option<String>,
) -> Result<(), String> {
    append_file_log("[SYNC] sync_license_from_supabase called");

    let session = match storage::load_supabase_session(&app) {
        Some(s) if !s.user_id.trim().is_empty() => s,
        _ => {
            append_file_log("[SYNC] No session or empty user_id");
            downgrade_to_free(&app);
            return Err("not_logged_in".to_string());
        }
    };
    let user_id = session.user_id.trim();

    // Prefer frontend params, then env, then build-time embedded (from cliptool/.env.local).
    let supabase_url = supabase_url
        .filter(|s| !s.trim().is_empty())
        .or_else(|| std::env::var("SUPABASE_URL").ok())
        .or_else(|| {
            let s = crate::supabase_embed::SUPABASE_URL_EMBED.trim();
            if s.is_empty() {
                None
            } else {
                Some(s.to_string())
            }
        })
        .ok_or_else(|| {
            downgrade_to_free(&app);
            "SUPABASE_URL not set (pass from frontend, set env, or build with cliptool/.env.local)".to_string()
        })?;
    let supabase_anon_key = supabase_anon_key
        .filter(|s| !s.trim().is_empty())
        .or_else(|| std::env::var("SUPABASE_ANON_KEY").ok())
        .or_else(|| {
            let s = crate::supabase_embed::SUPABASE_ANON_KEY_EMBED.trim();
            if s.is_empty() {
                None
            } else {
                Some(s.to_string())
            }
        })
        .ok_or_else(|| {
            downgrade_to_free(&app);
            "SUPABASE_ANON_KEY not set (pass from frontend, set env, or build with cliptool/.env.local)".to_string()
        })?;

    append_file_log(&format!(
        "[SYNC] Using Supabase URL (len {}), anon key (len {})",
        supabase_url.len(),
        supabase_anon_key.len()
    ));

    let url = format!(
        "{}/rest/v1/licenses?user_id=eq.{}&active=eq.true&limit=1",
        supabase_url.trim_end_matches('/'),
        urlencoding::encode(user_id)
    );
    println!("[SYNC] Request URL: {}", url);
    append_file_log(&format!("[SYNC] Request URL: {}", url));

    let client = reqwest::Client::new();
    let mut resp = match client
        .get(&url)
        .header("apikey", &supabase_anon_key)
        .header("Authorization", format!("Bearer {}", session.access_token))
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            append_file_log(&format!("[SYNC] Request send failed: {}", e));
            downgrade_to_free(&app);
            return Err(e.to_string());
        }
    };

    // On 401 (e.g. JWT expired), try to refresh the session and retry once so Pro can come back.
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        let refresh_token = session
            .refresh_token
            .as_deref()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| {
                append_file_log("[SYNC] 401 but no refresh_token");
                downgrade_to_free(&app);
                "session_expired_no_refresh".to_string()
            })?;
        append_file_log("[SYNC] 401 Unauthorized, attempting token refresh");
        match refresh_supabase_token(&supabase_url, &supabase_anon_key, refresh_token).await {
            Ok((new_access, new_refresh)) => {
                append_file_log("[SYNC] Token refresh succeeded, saving session and retrying");
                let new_session = storage::SupabaseSession {
                    access_token: new_access.clone(),
                    refresh_token: Some(new_refresh),
                    user_id: session.user_id.clone(),
                    user_email: session.user_email.clone(),
                };
                if storage::save_supabase_session(&app, &new_session).is_ok() {
                    resp = client
                        .get(&url)
                        .header("apikey", &supabase_anon_key)
                        .header("Authorization", format!("Bearer {}", new_access))
                        .header("Accept", "application/json")
                        .send()
                        .await
                        .map_err(|e| {
                            append_file_log(&format!("[SYNC] Retry send failed: {}", e));
                            downgrade_to_free(&app);
                            e.to_string()
                        })?;
                }
            }
            Err(e) => {
                append_file_log(&format!("[SYNC] Token refresh failed: {}", e));
                downgrade_to_free(&app);
                return Err(e);
            }
        }
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_else(|_| String::new());
        append_file_log(&format!("[SYNC] Request failed status={} body={}", status, body_text));
        downgrade_to_free(&app);
        return Err(format!("supabase_request_failed: {}", status));
    }

    let status = resp.status();
    let body_bytes = resp.bytes().await.map(|b| b.to_vec()).unwrap_or_else(|_| Vec::new());
    let snippet_len = body_bytes.len().min(400);
    let body_snippet = String::from_utf8_lossy(&body_bytes[..snippet_len]);
    append_file_log(&format!("[SYNC] Response status={} body_len={} snippet={:?}", status, body_bytes.len(), body_snippet));

    let rows: Vec<SupabaseLicenseRow> = match serde_json::from_slice(&body_bytes) {
        Ok(r) => r,
        Err(e) => {
            append_file_log(&format!("[SYNC] JSON parse failed: {} body_snippet={:?}", e, body_snippet));
            downgrade_to_free(&app);
            return Err(e.to_string());
        }
    };
    let row_count = rows.len();
    println!("[SYNC] Supabase rows (count={}): {:?}", row_count, rows);
    append_file_log(&format!("[SYNC] Supabase rows count={} user_id={:?}", row_count, user_id));

    // Current local state (plan name and whether we have an active license)
    let (local_plan, local_active) = match core_get_license_status(&app) {
        LicenseStatus::Ok { plan, .. } => (plan, true),
        LicenseStatus::Invalid { .. } => ("free".to_string(), false),
    };

    if let Some(row) = rows.into_iter().next() {
        if row.active == Some(true) {
            let supabase_plan = row.plan.unwrap_or_else(|| "free".to_string());
            let supabase_plan_norm = supabase_plan.to_lowercase();
            if local_active && local_plan.to_lowercase() == supabase_plan_norm {
                append_file_log(&format!(
                    "[SYNC] Idempotent: local already plan={} active=true, skip install",
                    local_plan
                ));
                return Ok(());
            }
            append_file_log(&format!(
                "[SYNC] Installing plan={} active=true (local was plan={} active={})",
                supabase_plan, local_plan, local_active
            ));
            let exp = row
                .expires_at
                .as_deref()
                .and_then(|s| parse_iso_to_unix(s).ok());
            if let Err(e) = set_license_from_server(app.clone(), session.user_email, supabase_plan, exp) {
                append_file_log(&format!("[SYNC] set_license_from_server failed: {}", e));
                downgrade_to_free(&app);
                return Err(e);
            }
            app.emit("license-updated", ()).ok();
            append_file_log("[SYNC] Emitted license-updated");
            return Ok(());
        }
    }

    // Supabase returned 0 rows or no row with active=true (RLS may block if JWT user_id != licenses.user_id).
    if !local_active {
        append_file_log("[SYNC] Idempotent: local already cleared, skip clear");
        return Ok(());
    }
    append_file_log(&format!(
        "[SYNC] No active license in Supabase for user_id={} (got {} rows). Check licenses.user_id matches this id and RLS allows SELECT.",
        user_id, row_count
    ));
    downgrade_to_free(&app);
    Ok(())
}

fn parse_iso_to_unix(iso: &str) -> Result<u64, ()> {
    let dt = time::OffsetDateTime::parse(iso, &time::format_description::well_known::Rfc3339)
        .map_err(|_| ())?;
    let secs = dt.unix_timestamp();
    if secs < 0 {
        return Err(());
    }
    Ok(secs as u64)
}
