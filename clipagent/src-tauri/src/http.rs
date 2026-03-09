use hyper::{Body, Response, StatusCode};
use hyper::body::to_bytes;
use hyper::{Method, Request};
use tauri::AppHandle;
use crate::commands::download;
use urlencoding::decode as url_decode;

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

    // Proxy remote preview URLs so the video element can load them (avoids CORS; fixes Instagram/X audio and TikTok black screen)
    if method == Method::GET && path == "/preview-stream" {
        let query = req.uri().query().unwrap_or("");
        let mut raw_url: Option<String> = None;
        for part in query.split('&') {
            let mut it = part.splitn(2, '=');
            if it.next() == Some("url") {
                raw_url = it.next().map(|s| s.to_string());
                break;
            }
        }
        let encoded = match raw_url {
            Some(u) if !u.is_empty() => u,
            _ => return Ok(json_response(400, "{\"error\":\"missing_url\"}".to_string())),
        };
        let decoded = match url_decode(&encoded) {
            Ok(u) => u.into_owned(),
            Err(_) => return Ok(text_response(400, "bad_url_encoding")),
        };
        if !decoded.starts_with("https://") && !decoded.starts_with("http://") {
            return Ok(text_response(400, "url_must_be_http_or_https"));
        }
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .build();
        let client = match client {
            Ok(c) => c,
            Err(_) => return Ok(text_response(500, "client_build")),
        };
        let mut proxy_req = client.get(&decoded);
        if decoded.contains("youtube.com") || decoded.contains("youtu.be") {
            proxy_req = proxy_req.header("Referer", "https://www.youtube.com/");
        }
        let upstream = match proxy_req.send().await {
            Ok(r) => r,
            Err(e) => {
                let msg = format!(r#"{{"error":"proxy_fetch","details":"{}"}}"#, e.to_string().replace('"', "\\\""));
                return Ok(json_response(502, msg));
            }
        };
        if !upstream.status().is_success() {
            return Ok(text_response(502, "upstream_error"));
        }
        let content_type = upstream
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("video/mp4")
            .to_string();
        let content_length = upstream.headers().get("content-length").cloned();
        // Stream the body so the video can start playing as bytes arrive (no ~1 min wait for full download)
        let body = Body::wrap_stream(upstream.bytes_stream());
        let mut res = Response::new(body);
        *res.status_mut() = StatusCode::OK;
        res.headers_mut()
            .insert("Content-Type", content_type.parse().unwrap());
        if let Some(clen) = content_length {
            res.headers_mut().insert("Content-Length", clen);
        }
        res.headers_mut()
            .insert("Access-Control-Allow-Origin", "*".parse().unwrap());
        return Ok(res);
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

    if method == Method::POST && path == "/download-all" {
        let body_bytes = to_bytes(req.into_body()).await?;
        let body_str = String::from_utf8_lossy(&body_bytes).to_string();

        let json = download::handle_download_all(app.clone(), &body_str);
        return Ok(json_response(200, json));
    }

    Ok(text_response(404, "not_found"))
}