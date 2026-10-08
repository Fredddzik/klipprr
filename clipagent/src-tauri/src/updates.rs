//! Installing app updates.
//!
//! The JS `downloadAndInstall` reported every chunk to the webview through an IPC channel
//! and had no timeout. On the founder's Mac (2026-10-08) the 73 MB update crawled with long
//! dead spells (5 minutes, against 30 seconds for curl on the same connection) while the UI
//! said only "Downloading…", which users read as stuck. Here the download runs in Rust,
//! chunks only bump a counter, the UI gets a percentage twice a second, and a download that
//! receives nothing for STALL_SECS is abandoned and restarted.

use serde_json::json;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::UpdaterExt;

const STALL_SECS: u64 = 30;
const ATTEMPTS: u32 = 3;

fn emit(app: &AppHandle, phase: &str, received: u64, total: u64) {
    let _ = app.emit("update-progress", json!({ "phase": phase, "received": received, "total": total }));
}

/// Checks, downloads (with progress and stall recovery), verifies, installs and restarts.
/// Errors are short codes the UI maps to a message.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| format!("updater_unavailable: {e}"))?;
    let update = updater
        .check()
        .await
        .map_err(|e| format!("check_failed: {e}"))?
        .ok_or_else(|| "no_update".to_string())?;

    let mut bytes = None;
    for attempt in 1..=ATTEMPTS {
        let received = Arc::new(AtomicU64::new(0));
        let total = Arc::new(AtomicU64::new(0));
        let (r, t) = (received.clone(), total.clone());
        let download = update.download(
            move |chunk, len| {
                r.fetch_add(chunk as u64, Ordering::Relaxed);
                if let Some(len) = len {
                    t.store(len, Ordering::Relaxed);
                }
            },
            || {},
        );
        tokio::pin!(download);

        let mut last_bytes = 0u64;
        let mut last_change = Instant::now();
        let mut tick = tokio::time::interval(Duration::from_millis(500));
        let outcome = loop {
            tokio::select! {
                res = &mut download => break Some(res),
                _ = tick.tick() => {
                    let now = received.load(Ordering::Relaxed);
                    emit(&app, "downloading", now, total.load(Ordering::Relaxed));
                    if now != last_bytes {
                        last_bytes = now;
                        last_change = Instant::now();
                    } else if last_change.elapsed() > Duration::from_secs(STALL_SECS) {
                        break None;
                    }
                }
            }
        };
        match outcome {
            Some(Ok(b)) => {
                bytes = Some(b);
                break;
            }
            // The signature check happens inside download(); a bad package must not be retried.
            Some(Err(e)) if e.to_string().to_lowercase().contains("signature") => {
                return Err(format!("signature_invalid: {e}"));
            }
            Some(Err(e)) => crate::commands::download::log_to_file(&format!("[UPDATE] attempt {attempt} failed: {e}")),
            None => crate::commands::download::log_to_file(&format!(
                "[UPDATE] attempt {attempt} stalled at {last_bytes} bytes for {STALL_SECS}s; restarting"
            )),
        }
        emit(&app, "retrying", 0, total.load(Ordering::Relaxed));
    }
    let bytes = bytes.ok_or_else(|| "download_failed".to_string())?;

    emit(&app, "installing", 1, 1);
    update.install(bytes).map_err(|e| format!("install_failed: {e}"))?;
    crate::commands::download::log_to_file(&format!("[UPDATE] installed {}; restarting", update.version));
    app.restart();
}
