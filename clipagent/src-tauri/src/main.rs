mod paths;
mod output;
mod commands;
mod http;
mod storage;
mod license;

use crate::commands::download::handle_download_all;
use crate::commands::ping::handle_ping;
use crate::http::{with_cors, json_response, text_response, handle_http};

// =============================================================
// HTTP SERVER BOOTSTRAP (plain HTTP)
// =============================================================
async fn start_http_server(app: tauri::AppHandle) {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", 4000))
        .await
        .expect("Failed to bind ClipAgent HTTP server");
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

        let mut res = Response::new(Body::empty());
        *res.status_mut() = hyper::StatusCode::FOUND;
        res.headers_mut()
            .insert(hyper::header::LOCATION, preview_url.parse().unwrap());
        return Ok(with_cors(res));
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

    let listener = TcpListener::bind(("127.0.0.1", 4001))
        .await
        .expect("Failed to bind ClipAgent HTTPS server");

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




// =============================================================
// MAIN ENTRYPOINT
// =============================================================
#[tokio::main]
async fn main() {
    // Start the local HTTP and HTTPS servers in the background.
    // (each runs an infinite accept loop)

    println!("ClipAgent started.");

tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::license_commands::get_license_status,
            commands::license_commands::get_capabilities,
            commands::license_commands::activate_license,
            commands::license_commands::clear_license_cmd,
	    commands::license_commands::set_license_from_server,

        ])
        .setup(|app| {

let app_handle = app.handle().clone();

std::thread::spawn(move || {
    tauri::async_runtime::block_on(async {
        start_http_server(app_handle).await;
    });
});

let https_handle = app.handle().clone();

std::thread::spawn(move || {
    tauri::async_runtime::block_on(async {
        start_https_server(https_handle).await;
    });
});

            // Enable auto-start on login using Tauri 2 autostart plugin replacement (macOS only)
            #[cfg(target_os = "macos")]
            {
                let _ = app.handle().plugin(
                    tauri_plugin_autostart::init(
                        tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                        None,
                    )
                );
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Error running ClipAgent");
}