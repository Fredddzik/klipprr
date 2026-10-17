mod paths;
mod output;
mod commands;
mod http;
mod preview_cache;
mod dash;
mod export_control;
mod support;
mod updates;
mod storage;
mod license;
mod quota;
mod body;
mod agent_token;

/// Supabase URL and anon key embedded at build from cliptool/.env.local (fallback when frontend has none).
mod supabase_embed {
    include!(concat!(env!("OUT_DIR"), "/supabase_embed.rs"));
}

use crate::http::handle_http;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_single_instance::init as single_instance;
use tauri::{Emitter, Manager};
use std::env;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use serde_json::json;
use url;

pub static PENDING_AUTH: Lazy<Mutex<Option<(String, String)>>> =
    Lazy::new(|| Mutex::new(None));

// =============================================================
// HTTP SERVER BOOTSTRAP (plain HTTP)
// =============================================================
async fn start_http_server(app: tauri::AppHandle) {
    let listener = match tokio::net::TcpListener::bind(("127.0.0.1", 4000)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("ClipAgent HTTP failed to bind 127.0.0.1:4000: {e}");
            return;
        }
    };
    println!("ClipAgent HTTP running at http://localhost:4000");
    loop {
        let (tcp, _) = match listener.accept().await {
            Ok(v) => v,
            Err(_) => continue,
        };

let app_handle = app.clone();

        tokio::spawn(async move {
            let svc = hyper::service::service_fn(move |req| handle_http(req, app_handle.clone()));
            let _ = hyper::server::conn::http1::Builder::new()
                .keep_alive(true)
                .serve_connection(hyper_util::rt::TokioIo::new(tcp), svc)
                .await;
        });
    }
}

use std::path::PathBuf;

// The HTTPS server on :4001 (self-signed certificate, its own router) served the editor
// when it ran on klipprr.com. Nothing has called it since the UI moved into the app, and
// its /download-all skipped every check the :4000 router makes. Removed in 0.1.38.

use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;

fn init_file_logger() {
    let mut log_dir = dirs::home_dir().unwrap_or(PathBuf::from("/tmp"));
    log_dir.push("Library/Logs/ClipAgent");

    let _ = create_dir_all(&log_dir);

    let mut log_path = log_dir.clone();
    log_path.push("clipagent.log");

    // Every module appends to this one file, and nothing ever trimmed it. Past 5 MB it
    // moves to clipagent.1.log at launch, so a support request has the last two runs'
    // worth and the disk never fills.
    const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
    if std::fs::metadata(&log_path).map_or(false, |m| m.len() > MAX_LOG_BYTES) {
        let _ = std::fs::rename(&log_path, log_dir.join("clipagent.1.log"));
    }

    if let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = writeln!(file, "\n--- ClipAgent Started ---");
    }
}

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

// =============================================================
// MAIN ENTRYPOINT
// =============================================================
fn main() {
    println!("ClipAgent started.");
    init_file_logger();
    let _ = std::fs::write(env::temp_dir().join("clipagent_proof.txt"), "MAIN EXECUTED\n");

    tauri::Builder::default()
        // single_instance must be registered before deep-link (Tauri desktop + deep-link docs).
        .plugin(single_instance(|app, argv, _cwd| {
            for arg in argv {
                if arg.starts_with("clipagent://") {
                    let msg = "[SECOND INSTANCE] Deep-link URL received";
                    println!("{msg}");
                    append_file_log(&msg);
                    let _ = app.emit("deep-link", arg);
                    // Bring app window to front when opened via deep link (e.g. after browser login).
                    if let Some(win) = app.get_webview_window("main") {
                        let _ = win.set_focus();
                    }
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::download::get_default_export_dir,
            commands::download::get_export_path,
            commands::download::set_export_path,
            commands::download::clear_export_path,
            commands::download::open_export_folder,
            commands::download::get_local_video_info,
            commands::license_commands::get_license_status,
            commands::license_commands::get_capabilities,
            commands::license_commands::clear_license_cmd,
            commands::license_commands::set_supabase_session,
            commands::license_commands::sync_license_from_supabase,
            commands::license_commands::consume_auth_tokens,
            commands::license_commands::get_stored_session_tokens,
            support::open_support_email,
            updates::install_update,
            agent_token::agent_token,
        ])
        .setup(|app| {
            agent_token::write_for_scripts(app.handle());
            // macOS: the standard menu, plus Help → Contact Support… (a pre-filled email).
            // Windows has no menu bar; its support links live in the app's own UI.
            #[cfg(target_os = "macos")]
            {
                use tauri::menu::{Menu, MenuItem, MenuItemKind, HELP_SUBMENU_ID};
                let menu = Menu::default(app.handle())?;
                let contact = MenuItem::with_id(app, support::MENU_ID, "Contact Support…", true, None::<&str>)?;
                if let Some(MenuItemKind::Submenu(help)) = menu.get(HELP_SUBMENU_ID) {
                    help.append(&contact)?;
                }
                app.set_menu(menu)?;
                app.on_menu_event(|app, event| {
                    if event.id() == support::MENU_ID {
                        if let Err(e) = support::open(app, None, None) {
                            append_file_log(&format!("[SUPPORT] could not open mail: {e}"));
                        }
                    }
                });
            }

            // Register clipagent:// with the OS (required for browser "Open Klipprr"; WiX/NSIS use
            // plugins.deep-link.desktop.schemes). register_all points the scheme at this executable,
            // which also makes deep links work in `tauri dev` without an MSI install.
            //
            // macOS: do not call register_all here — Tauri documents it for Windows/Linux only.
            // The .app bundle registers the scheme via Info.plist (bundle.macOS.infoPlist); the
            // bundler merges that file after generated keys, so CFBundleURLTypes from Info.plist wins.
            #[cfg(any(target_os = "windows", target_os = "linux"))]
            if let Err(e) = app.deep_link().register_all() {
                let msg = format!("[DEEP LINK] register_all failed: {e}");
                eprintln!("{msg}");
                append_file_log(&msg);
            }

            // Windows: set resource dir so paths.rs can resolve bundled bin/ (yt-dlp, ffmpeg, ffprobe)
            if let Ok(res_dir) = app.path().resource_dir() {
                crate::paths::init_resource_dir(res_dir);
            }
            let app_handle = app.handle().clone();
            // Forward deep link URLs to the frontend via a simple event, and handle Supabase magic links.
            let deep_link_handle = app_handle.clone();
            app.deep_link().on_open_url(move |event| {
                // Bring app window to front when opened via deep link (e.g. after browser login).
                if let Some(win) = deep_link_handle.get_webview_window("main") {
                    let _ = win.set_focus();
                }
                if let Some(url) = event.urls().first() {
                    let raw = url.to_string();
                    append_file_log("[DEEP LINK] URL received");

                    if let Some(fragment) = raw.split('#').nth(1) {
                        append_file_log("[DEEP LINK] URL fragment present");

                        let params: std::collections::HashMap<_, _> =
                            url::form_urlencoded::parse(fragment.as_bytes())
                                .into_owned()
                                .collect();

                        if let (Some(access), Some(refresh)) =
                            (params.get("access_token"), params.get("refresh_token"))
                        {
                            append_file_log("[DEEP LINK] Access + Refresh tokens received");

                            let app_for_async = deep_link_handle.clone();
                            let access_clone = access.clone();
                            let refresh_clone = refresh.clone();

                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = crate::commands::license_commands::set_supabase_session(
                                    app_for_async.clone(),
                                    access_clone.clone(),
                                    refresh_clone.clone(),
                                ) {
                                    append_file_log(&format!("[DEEP LINK] Failed to set session: {:?}", e));
                                    return;
                                }

                                append_file_log("[DEEP LINK] Session stored in backend");
                                // Do not sync here: we have no Supabase URL/key (None, None). Frontend will
                                // receive auth-success and call sync_license_from_supabase(getSupabaseConfigForBackend()).

                                // Hand off tokens to frontend so it can setSession and sync with URL/key
                                if let Ok(mut guard) = crate::PENDING_AUTH.lock() {
                                    *guard = Some((access_clone.clone(), refresh_clone.clone()));
                                    append_file_log("[DEEP LINK] Tokens stored in PENDING_AUTH for frontend");
                                }
                                // Notify already-open frontend so it can setSession and refresh (app-already-open flow)
                                let _ = app_for_async.emit("auth-success", json!({
                                    "access_token": access_clone,
                                    "refresh_token": refresh_clone,
                                }));
                            });
                        }
                    }
                }
            });

            // HTTP
            let http_handle = app_handle.clone();
            std::thread::spawn(move || {
                tauri::async_runtime::block_on(async {
                    start_http_server(http_handle).await;
                });
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}