use hyper::{Body, Response, StatusCode};
use hyper::body::to_bytes;
use hyper::{Method, Request};
use serde::Deserialize;
use tauri::AppHandle;
use crate::commands::license_commands;
use crate::commands::download;

pub fn with_cors(mut res: Response<Body>) -> Response<Body> {
    let headers = res.headers_mut();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        "Content-Type".parse().unwrap(),
    );
    res
}

pub fn json_response(status: u16, body: String) -> Response<Body> {
    let mut res = Response::new(Body::from(body));
    *res.status_mut() = StatusCode::from_u16(status).unwrap();
    res.headers_mut()
        .insert("Content-Type", "application/json".parse().unwrap());
    with_cors(res)
}

pub fn text_response(status: u16, body: &str) -> Response<Body> {
    let mut res = Response::new(Body::from(body.to_string()));
    *res.status_mut() = StatusCode::from_u16(status).unwrap();
    with_cors(res)
}

#[derive(Deserialize)]
struct LicenseRequest {
  email: String,
  plan: String,
  #[serde(default)]
  exp: Option<u64>,
}

pub async fn handle_http(
    req: Request<Body>,
    app: AppHandle,
) -> Result<Response<Body>, hyper::Error> {
    let method = req.method().clone();
    let path = req.uri().path().to_string();

    if method == Method::OPTIONS {
        return Ok(with_cors(Response::new(Body::empty())));
    }

    if method == Method::GET && path == "/ping" {
        return Ok(json_response(200, "{\"status\":\"ok\"}".to_string()));
    }

    if method == Method::GET && path == "/capabilities" {
        let caps = crate::license::get_capabilities(&app);
        let body = serde_json::to_string(&caps)
            .unwrap_or_else(|_| "{}".to_string());
        return Ok(json_response(200, body));
    }

    if method == Method::GET && path == "/resolve" {
        let query = req.uri().query().unwrap_or("");

        let mut url: Option<String> = None;
        for part in query.split('&') {
            let mut it = part.splitn(2, '=');
            if it.next() == Some("url") {
                url = it.next().map(|v| v.to_string());
                break;
            }
        }

        let url = match url {
            Some(u) if !u.is_empty() => u,
            _ => {
                return Ok(json_response(
                    400,
                    "{\"error\":\"missing_url\"}".to_string(),
                ));
            }
        };

        let json = crate::commands::resolve::handle_resolve(url);
        return Ok(json_response(200, json));
    }

    if method == Method::POST && path == "/license" {
        let body_bytes = to_bytes(req.into_body()).await?;
        let parsed: LicenseRequest = match serde_json::from_slice(&body_bytes) {
            Ok(v) => v,
            Err(_) => {
                return Ok(json_response(400, "{\"error\":\"invalid_json\"}".to_string()));
            }
        };

        println!(
            "[License] HTTP install request received for {} ({})",
            parsed.email, parsed.plan
        );

        match license_commands::set_license_from_server(
	    app.clone(),
	    parsed.email,
	    parsed.plan,
	    parsed.exp,
	) {
            Ok(_) => {
                println!("[License] License installed successfully");
                return Ok(json_response(200, "{\"ok\":true}".to_string()));
            }
            Err(e) => {
                println!("[License] License install failed: {}", e);
                return Ok(json_response(
                    500,
                    format!("{{\"error\":\"{}\"}}", e),
                ));
            }
        }
    }

    if method == Method::POST && path == "/download-all" {
        let body_bytes = to_bytes(req.into_body()).await?;
        let body_str = String::from_utf8_lossy(&body_bytes).to_string();

        let json = download::handle_download_all(app.clone(), &body_str);
        return Ok(json_response(200, json));
    }

    Ok(text_response(404, "not_found"))
}