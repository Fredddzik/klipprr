mod paths;
mod output;
mod commands;
mod http;
mod storage;
mod license;

/// Supabase URL and anon key embedded at build from cliptool/.env.local (fallback when frontend has none).
mod supabase_embed {
    include!(concat!(env!("OUT_DIR"), "/supabase_embed.rs"));
}

use crate::commands::download::handle_download_all;
use crate::commands::ping::handle_ping;
use crate::http::{with_cors, json_response, text_response, handle_http};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_single_instance::init as single_instance;
use tauri::{Emitter, Manager};
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
    let svc = hyper::service::service_fn(move |req| {
        handle_http(req, app_handle.clone())
    });

            let _ = hyper::server::conn::Http::new()
                .http1_only(true)
                .http1_keep_alive(true)
                .serve_connection(tcp, svc)
                .await;
        });
    }
}

use std::path::PathBuf;



use std::fs;
use std::sync::Arc;

use hyper::{Body, Method, Request, Response};
use hyper::service::service_fn;
use hyper::body::to_bytes;
use hyper::server::conn::Http;

use tokio::net::TcpListener;

use tokio_rustls::TlsAcceptor;
use rustls::{Certificate, PrivateKey, ServerConfig};

use rcgen::generate_simple_self_signed;

// =============================================================
// TLS HELPERS
// =============================================================
fn tls_paths() -> (PathBuf, PathBuf) {
    let base = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("ClipAgent");

    fs::create_dir_all(&base).ok();

    (
        base.join("cert.pem"),
        base.join("key.pem"),
    )
}

fn load_or_generate_cert() -> (Vec<Certificate>, PrivateKey) {
    let (cert_path, key_path) = tls_paths();

    if cert_path.exists() && key_path.exists() {
        let cert = fs::read(&cert_path).unwrap();
        let key = fs::read(&key_path).unwrap();

        return (
            vec![Certificate(cert)],
            PrivateKey(key),
        );
    }

    let cert = generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let cert_der = cert.serialize_der().unwrap();
    let key_der = cert.serialize_private_key_der();

    fs::write(&cert_path, &cert_der).unwrap();
    fs::write(&key_path, &key_der).unwrap();

    (
        vec![Certificate(cert_der)],
        PrivateKey(key_der),
    )
}



// =============================================================
// HTTPS REQUEST HANDLER
// =============================================================
async fn handle_request(req: Request<Body>, app: tauri::AppHandle) -> Result<Response<Body>, hyper::Error> {
    // CORS preflight
    if req.method() == Method::OPTIONS {
        return Ok(with_cors(Response::new(Body::empty())));
    }

    let method = req.method().clone();
    let path = req.uri().path().to_string();

    // /ping
    if method == Method::GET && path == "/ping" {
        return Ok(with_cors(handle_ping()));
    }

    // GET /resolve?url=...
    if method == Method::GET && path == "/resolve" {
        let query = req.uri().query().unwrap_or("");
        let mut url_val: Option<String> = None;

        for part in query.split('&') {
            let mut it = part.splitn(2, '=');
            let k = it.next().unwrap_or("");
            let v = it.next().unwrap_or("");
            if k == "url" {
                url_val = Some(v.to_string());
                break;
            }
        }

        if let Some(u) = url_val {
            if u.trim().is_empty() {
                return Ok(json_response(400, r#"{\"error\":\"missing_url\"}"#.to_string()));
            }
            let json = commands::resolve::handle_resolve(u);
            return Ok(json_response(200, json));
        }

        return Ok(json_response(400, r#"{\"error\":\"missing_url\"}"#.to_string()));
    }

    // GET /preview?id=VIDEO_ID
    if method == Method::GET && path == "/preview" {
        let query = req.uri().query().unwrap_or("");
        let mut id: Option<String> = None;

        for part in query.split('&') {
            let mut it = part.splitn(2, '=');
            if it.next() == Some("id") {
                id = it.next().map(|v| v.to_string());
                break;
            }
        }

        let video_id = match id {
            Some(v) if !v.is_empty() => v,
            _ => return Ok(text_response(400, "missing_id")),
        };

        let url = format!("https://www.youtube.com/watch?v={}", video_id);
        let json = commands::resolve::handle_resolve(url);

        let parsed: serde_json::Value = match serde_json::from_str(&json) {
            Ok(v) => v,
            Err(_) => return Ok(text_response(500, "resolve_parse_failed")),
        };

        let preview_url = parsed
            .get("preview")
            .and_then(|p| p.get("url"))
            .and_then(|u| u.as_str());

        let preview_url = match preview_url {
            Some(u) => u,
            None => return Ok(text_response(500, "no_preview_url")),
        };

        return Ok(with_cors(
            Response::builder()
                .status(302)
                .header("Location", preview_url)
                .body(Body::empty())
                .unwrap(),
        ));
    }

    // POST /download-all
    if method == Method::POST && path == "/download-all" {
        let bytes = to_bytes(req.into_body()).await?;
        let body = String::from_utf8_lossy(&bytes).to_string();
        let json = handle_download_all(app.clone(), &body);
        return Ok(json_response(200, json));
    }

    Ok(text_response(404, "Not Found"))
}

// =============================================================
// HTTPS SERVER BOOTSTRAP
// =============================================================
async fn start_https_server(app: tauri::AppHandle) {
    let (certs, key) = load_or_generate_cert();

    let tls_config = ServerConfig::builder()
        .with_safe_defaults()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .unwrap();

    let tls_acceptor = TlsAcceptor::from(Arc::new(tls_config));

    let listener = match TcpListener::bind(("127.0.0.1", 4001)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("ClipAgent HTTPS failed to bind 127.0.0.1:4001: {e}");
            return;
        }
    };

    println!("🔒 ClipAgent HTTPS running at https://localhost:4001");

    loop {
        let (tcp, _) = match listener.accept().await {
            Ok(v) => v,
            Err(_) => continue,
        };

        let acceptor = tls_acceptor.clone();
        let app_handle = app.clone();

        tokio::spawn(async move {
            let tls = match acceptor.accept(tcp).await {
                Ok(s) => s,
                Err(_) => return,
            };

            let svc = service_fn(move |req| {
                let app_handle = app_handle.clone();
                async move {
                    match handle_request(req, app_handle).await {
                        Ok(res) => Ok::<_, hyper::Error>(res),
                        Err(e) => Err(e),
                    }
                }
            });

            let _ = Http::new()
                .http1_only(true)
                .http1_keep_alive(true)
                .serve_connection(tls, svc)
                .await;
        });
    }
}




use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;

fn init_file_logger() {
    let mut log_dir = dirs::home_dir().unwrap_or(PathBuf::from("/tmp"));
    log_dir.push("Library/Logs/ClipAgent");

    let _ = create_dir_all(&log_dir);

    let mut log_path = log_dir.clone();
    log_path.push("clipagent.log");

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
    std::fs::write(
        "/tmp/clipagent_proof.txt",
        "MAIN EXECUTED\n"
    ).ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(single_instance(|app, argv, _cwd| {
            for arg in argv {
                if arg.starts_with("clipagent://") {
                    let msg = format!("[SECOND INSTANCE] URL: {arg}");
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
        .invoke_handler(tauri::generate_handler![
            commands::download::get_default_export_dir,
            commands::download::get_export_path,
            commands::download::set_export_path,
            commands::download::clear_export_path,
            commands::download::open_export_folder,
            commands::download::get_local_video_info,
            commands::license_commands::get_license_status,
            commands::license_commands::get_capabilities,
            commands::license_commands::activate_license,
            commands::license_commands::clear_license_cmd,
            commands::license_commands::set_license_from_server,
            commands::license_commands::set_supabase_session,
            commands::license_commands::sync_license_from_supabase,
            commands::license_commands::consume_auth_tokens,
            commands::license_commands::get_stored_session_tokens,
        ])
        .setup(|app| {
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
                    append_file_log(&format!("[DEEP LINK] RAW URL: {}", raw));

                    if let Some(fragment) = raw.split('#').nth(1) {
                        append_file_log(&format!("[DEEP LINK] FRAGMENT: {}", fragment));

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

                                if let Err(e) = crate::commands::license_commands::sync_license_from_supabase(
                                    app_for_async.clone(),
                                    None,
                                    None,
                                ).await {
                                    append_file_log(&format!("[DEEP LINK] License sync failed: {:?}", e));
                                } else {
                                    append_file_log("[DEEP LINK] License sync successful");
                                }

                                // Hand off tokens to frontend so it can setSession and avoid clearing license on load
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

            // HTTPS
            let https_handle = app_handle.clone();
            std::thread::spawn(move || {
                tauri::async_runtime::block_on(async {
                    start_https_server(https_handle).await;
                });
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}