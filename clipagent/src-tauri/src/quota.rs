//! Monthly clip quota, charged by the agent itself.
//!
//! The UI used to reserve clips and refund failures on its own, and `/download-all`
//! exported whatever it was sent: anyone could skip the reservation with one request to
//! localhost, or refund any number of clips with one call to Supabase. Now every export
//! starts with a reservation made here, and only clips that did not export are refunded
//! against that reservation (supabase/migrations/20261017120000_export_reservations.sql).

use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;
use serde_json::{json, Value};
use tauri::AppHandle;

use crate::commands::download::log_to_file;
use crate::storage;

/// A reservation for one export. `id` is None when the server predates reservation ids;
/// refunds then go through the older count-based function.
#[derive(Clone)]
pub struct Reservation {
    pub id: Option<String>,
    pub clips: usize,
    access_token: String,
}

pub enum Refused {
    /// No usable session: the user has to sign in.
    SignIn,
    /// The plan's monthly limit would be exceeded.
    Limit { used: i64, limit: i64, remaining: i64 },
    /// Supabase could not be reached or answered something unexpected.
    Unavailable(String),
}

/// Clips that finished, per export, so the refund at the end covers exactly the rest.
static DONE: Lazy<Mutex<HashMap<String, usize>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn config() -> Option<(String, String)> {
    let url = std::env::var("SUPABASE_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| crate::supabase_embed::SUPABASE_URL_EMBED.trim().to_string());
    let key = std::env::var("SUPABASE_ANON_KEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| crate::supabase_embed::SUPABASE_ANON_KEY_EMBED.trim().to_string());
    if url.is_empty() || key.is_empty() {
        None
    } else {
        Some((url.trim_end_matches('/').to_string(), key))
    }
}

async fn rpc(name: &'static str, token: String, args: Value) -> Result<(reqwest::StatusCode, Value), String> {
    let (url, key) = config().ok_or("supabase_not_configured")?;
    let resp = reqwest::Client::new()
        .post(format!("{}/rest/v1/rpc/{}", url, name))
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .timeout(std::time::Duration::from_secs(15))
        .json(&args)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.json::<Value>().await.unwrap_or(Value::Null);
    Ok((status, body))
}

/// Tokens to try, freshest first: the one the UI sent with the request, then the session
/// the agent stored, then that session refreshed.
async fn with_token<F, Fut>(app: &AppHandle, ui_token: Option<&str>, call: F) -> Result<(String, Value), Refused>
where
    F: Fn(String) -> Fut,
    Fut: std::future::Future<Output = Result<(reqwest::StatusCode, Value), String>>,
{
    let stored = storage::load_supabase_session(app);
    let mut candidates: Vec<String> = Vec::new();
    if let Some(t) = ui_token.filter(|t| !t.trim().is_empty()) {
        candidates.push(t.trim().to_string());
    }
    if let Some(s) = &stored {
        if !candidates.contains(&s.access_token) && !s.access_token.is_empty() {
            candidates.push(s.access_token.clone());
        }
    }
    let mut last_err = None;
    for token in candidates {
        match call(token.clone()).await {
            Ok((status, body)) if status.is_success() => return Ok((token, body)),
            Ok((status, _)) if status == reqwest::StatusCode::UNAUTHORIZED => continue,
            Ok((status, body)) => last_err = Some(format!("{} {}", status, body)),
            Err(e) => last_err = Some(e),
        }
    }
    if let Some(err) = last_err {
        return Err(Refused::Unavailable(err));
    }
    // Every token was rejected as expired: refresh the stored session once.
    let refresh = stored.as_ref().and_then(|s| s.refresh_token.clone()).filter(|r| !r.is_empty());
    let (Some(refresh), Some((url, key))) = (refresh, config()) else {
        return Err(Refused::SignIn);
    };
    let Ok((access, new_refresh)) =
        crate::commands::license_commands::refresh_supabase_token(&url, &key, &refresh).await
    else {
        return Err(Refused::SignIn);
    };
    if let Some(s) = stored {
        let _ = storage::save_supabase_session(
            app,
            &storage::SupabaseSession { access_token: access.clone(), refresh_token: Some(new_refresh), ..s },
        );
    }
    match call(access.clone()).await {
        Ok((status, body)) if status.is_success() => Ok((access, body)),
        Ok((status, _)) if status == reqwest::StatusCode::UNAUTHORIZED => Err(Refused::SignIn),
        Ok((status, body)) => Err(Refused::Unavailable(format!("{} {}", status, body))),
        Err(e) => Err(Refused::Unavailable(e)),
    }
}

/// Charges `clips` to the signed-in user's month before an export starts.
pub async fn reserve(app: &AppHandle, ui_token: Option<&str>, clips: usize) -> Result<Reservation, Refused> {
    let (token, body) = with_token(app, ui_token, |t| {
        rpc("reserve_clip_exports", t, json!({ "p_plan": "free", "p_requested": clips }))
    })
    .await?;
    let row = if body.is_array() { body.get(0).cloned().unwrap_or(Value::Null) } else { body };
    if row.get("allowed").and_then(|v| v.as_bool()) == Some(true) {
        let id = row.get("reservation_id").and_then(|v| v.as_str()).map(String::from);
        log_to_file(&format!("[QUOTA] reserved {} clip(s) reservation={:?}", clips, id));
        return Ok(Reservation { id, clips, access_token: token });
    }
    if row.get("message").and_then(|m| m.as_str()) == Some("Authentication required") {
        return Err(Refused::SignIn);
    }
    let n = |k: &str| row.get(k).and_then(|v| v.as_i64()).unwrap_or(0);
    log_to_file(&format!("[QUOTA] refused: {}", row));
    Err(Refused::Limit { used: n("used"), limit: n("limit"), remaining: n("remaining") })
}

/// Records one exported clip of `export_id`.
pub fn clip_done(export_id: Option<&str>) {
    if let Some(id) = export_id {
        *DONE.lock().unwrap().entry(id.to_string()).or_insert(0) += 1;
    }
}

/// After an export: gives back every reserved clip that did not export. Runs in the
/// background; a failed refund only costs the user that refund.
pub fn settle(app: &AppHandle, export_id: Option<&str>, reservation: Reservation) {
    let done = export_id.and_then(|id| DONE.lock().unwrap().remove(id)).unwrap_or(0);
    let unused = reservation.clips.saturating_sub(done);
    // scripts/export-regression.sh waits for this line.
    log_to_file(&format!("[QUOTA] settled export={} done={} unused={}", export_id.unwrap_or("-"), done, unused));
    if unused == 0 {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let token = reservation.access_token.clone();
        let result = with_token(&app, Some(&token), |t| {
            let id = reservation.id.clone();
            async move {
                match id {
                    Some(id) => {
                        rpc("release_export_reservation", t, json!({ "p_reservation_id": id, "p_count": unused })).await
                    }
                    None => rpc("release_clip_exports", t, json!({ "p_count": unused })).await,
                }
            }
        })
        .await;
        match result {
            Ok((_, body)) => log_to_file(&format!("[QUOTA] refund of {} clip(s): {}", unused, body)),
            Err(_) => log_to_file(&format!("[QUOTA] refund of {} clip(s) failed", unused)),
        }
        let _ = tauri::Emitter::emit(&app, "usage-changed", ());
    });
}
