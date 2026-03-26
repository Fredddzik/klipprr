use std::path::{Path, PathBuf};
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use hyper::{Body, Response, StatusCode};
use hyper::body::to_bytes;
use hyper::{Method, Request};
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;
use crate::commands::download;
use crate::paths::{ffmpeg_path, ffprobe_path};
use urlencoding::decode as url_decode;
use std::net::IpAddr;
use url::Url;

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

fn origin_is_allowed(req: &Request<Body>) -> bool {
    let Some(origin) = req.headers().get("origin") else {
        // Non-browser or same-process calls may not send Origin.
        return true;
    };
    let Ok(origin_str) = origin.to_str() else {
        return false;
    };
    let Ok(url) = Url::parse(origin_str) else {
        return false;
    };

    let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
    if host == "localhost" || host == "127.0.0.1" || host == "tauri.localhost" {
        return true;
    }
    url.scheme() == "tauri" && host == "localhost"
}

fn is_blocked_preview_target(decoded: &str) -> bool {
    let Ok(url) = Url::parse(decoded) else {
        return true;
    };

    let Some(host) = url.host_str() else {
        return true;
    };
    let host_lc = host.to_ascii_lowercase();
    if host_lc == "localhost" || host_lc.ends_with(".localhost") || host_lc.ends_with(".local") {
        return true;
    }

    if let Ok(ip) = host_lc.parse::<IpAddr>() {
        if ip.is_loopback() || ip.is_unspecified() || ip.is_multicast() {
            return true;
        }
        match ip {
            IpAddr::V4(v4) => {
                if v4.is_private() || v4.is_link_local() || v4.is_broadcast() || v4.is_documentation() {
                    return true;
                }
            }
            IpAddr::V6(v6) => {
                if v6.is_unique_local() || v6.is_unicast_link_local() {
                    return true;
                }
            }
        }
    }
    false
}

fn needs_pcm_preview_fix(file_path: &Path) -> bool {
    let path_str = file_path.to_string_lossy().to_string();
    let out = std::process::Command::new(ffprobe_path())
        .args([
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=codec_name",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path_str.as_str(),
        ])
        .output();
    let codec = match out {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().to_ascii_lowercase(),
        Err(_) => return false,
    };
    codec.starts_with("pcm") || codec == "lpcm"
}

fn make_pcm_fixed_preview(file_path: &Path) -> Option<PathBuf> {
    let meta = std::fs::metadata(file_path).ok()?;
    let mut hasher = DefaultHasher::new();
    file_path.to_string_lossy().hash(&mut hasher);
    meta.len().hash(&mut hasher);
    if let Ok(modified) = meta.modified() {
        if let Ok(since_epoch) = modified.duration_since(std::time::UNIX_EPOCH) {
            since_epoch.as_secs().hash(&mut hasher);
            since_epoch.subsec_nanos().hash(&mut hasher);
        }
    }
    let key = hasher.finish();

    let mut cache_dir = std::env::temp_dir();
    cache_dir.push("clipagent_preview_cache");
    let _ = std::fs::create_dir_all(&cache_dir);
    let out_path = cache_dir.join(format!("local_preview_pcmfix_{key:x}.mp4"));
    if out_path.is_file() {
        return Some(out_path);
    }

    let in_str = file_path.to_string_lossy().to_string();
    let out_str = out_path.to_string_lossy().to_string();
    let status = std::process::Command::new(ffmpeg_path())
        .args([
            "-y",
            "-i", in_str.as_str(),
            "-map", "0:v:0",
            "-map", "0:a:0?",
            "-c:v", "copy",
            "-c:a", "aac",
            "-movflags", "+faststart",
            out_str.as_str(),
        ])
        .status()
        .ok()?;
    if !status.success() {
        return None;
    }
    if out_path.is_file() { Some(out_path) } else { None }
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
        if !origin_is_allowed(&req) {
            return Ok(text_response(403, "forbidden_origin"));
        }
        return Ok(with_cors(Response::new(Body::empty())));
    }

    if method == Method::GET && path == "/ping" {
        return Ok(json_response(200, "{\"status\":\"ok\"}".to_string()));
    }

    if method == Method::GET && path == "/capabilities" {
        if !origin_is_allowed(&req) {
            return Ok(text_response(403, "forbidden_origin"));
        }
        let caps = crate::license::get_capabilities(&app);
        let body = serde_json::to_string(&caps)
            .unwrap_or_else(|_| "{}".to_string());
        return Ok(json_response(200, body));
    }

    // Stream a local file for video preview; supports Range for seeking (long videos)
    if method == Method::GET && path == "/local-preview" {
        if !origin_is_allowed(&req) {
            return Ok(text_response(403, "forbidden_origin"));
        }
        let query = req.uri().query().unwrap_or("");
        let mut raw_path: Option<String> = None;
        for part in query.split('&') {
            let mut it = part.splitn(2, '=');
            if it.next() == Some("path") {
                raw_path = it.next().map(|s| s.to_string());
                break;
            }
        }
        let encoded = match raw_path {
            Some(p) if !p.is_empty() => p,
            _ => return Ok(json_response(400, "{\"error\":\"missing_path\"}".to_string())),
        };
        let decoded = match url_decode(&encoded) {
            Ok(u) => u.into_owned(),
            Err(_) => return Ok(text_response(400, "bad_path_encoding")),
        };
        let mut force_pcm_fix = false;
        for part in query.split('&') {
            let mut it = part.splitn(2, '=');
            if it.next() == Some("pcm_fix") && it.next() == Some("1") {
                force_pcm_fix = true;
                break;
            }
        }

        let mut resolved_path = PathBuf::from(&decoded);
        if force_pcm_fix {
            let p = Path::new(&decoded);
            if p.is_file() && needs_pcm_preview_fix(p) {
                if let Some(converted) = make_pcm_fixed_preview(p) {
                    resolved_path = converted;
                } else {
                    return Ok(text_response(
                        500,
                        "pcm_fix_failed: ffmpeg could not create a preview-safe file (attempted -c:v copy -c:a aac). This usually means the container/streams are unusual or the file is partially corrupted.",
                    ));
                }
            }
        }

        let file_path = resolved_path.as_path();
        if !file_path.is_file() {
            return Ok(text_response(404, "not_a_file"));
        }
        let file_size = match tokio::fs::metadata(file_path).await {
            Ok(m) => m.len(),
            Err(_) => return Ok(text_response(403, "cannot_stat")),
        };
        let mut file = match tokio::fs::File::open(file_path).await {
            Ok(f) => f,
            Err(_) => return Ok(text_response(403, "cannot_open")),
        };
        let content_type = match file_path.extension().and_then(|e| e.to_str()) {
            Some("mp4") | Some("m4v") => "video/mp4",
            Some("webm") => "video/webm",
            Some("mov") => "video/quicktime",
            Some("avi") => "video/x-msvideo",
            Some("mkv") => "video/x-matroska",
            _ => "application/octet-stream",
        };
        let (status, body, content_range_opt, content_length_opt) = if let Some(range_hdr) = req.headers().get("range") {
            let range_str = range_hdr.to_str().unwrap_or("");
            let (start, end) = if range_str.starts_with("bytes=") {
                let rest = range_str.trim_start_matches("bytes=").trim();
                let parts: Vec<&str> = rest.split('-').collect();
                match parts.as_slice() {
                    [s, e] if !s.is_empty() && !e.is_empty() => {
                        let start: u64 = s.parse().unwrap_or(0);
                        let end: u64 = e.parse().unwrap_or(file_size.saturating_sub(1));
                        (start, end.min(file_size.saturating_sub(1)))
                    }
                    [s, ""] if !s.is_empty() => {
                        let start: u64 = s.parse().unwrap_or(0);
                        (start, file_size.saturating_sub(1))
                    }
                    _ => (0, file_size.saturating_sub(1)),
                }
            } else {
                (0, file_size.saturating_sub(1))
            };
            let start = start.min(file_size);
            let end = end.min(file_size.saturating_sub(1)).max(start);
            let len = end - start + 1;
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return Ok(text_response(500, "seek_failed"));
            }
            let limited = file.take(len);
            let stream = ReaderStream::new(limited);
            let body = Body::wrap_stream(stream);
            let content_range = format!("bytes {}-{}/{}", start, end, file_size);
            (StatusCode::PARTIAL_CONTENT, body, Some(content_range), Some(len))
        } else {
            let stream = ReaderStream::new(file);
            let body = Body::wrap_stream(stream);
            (StatusCode::OK, body, None, Some(file_size))
        };
        let mut res = Response::new(body);
        *res.status_mut() = status;
        res.headers_mut()
            .insert("Content-Type", content_type.parse().unwrap());
        res.headers_mut()
            .insert("Accept-Ranges", "bytes".parse().unwrap());
        if let Some(cl) = content_length_opt {
            res.headers_mut()
                .insert("Content-Length", cl.to_string().parse().unwrap());
        }
        if let Some(cr) = content_range_opt {
            res.headers_mut()
                .insert("Content-Range", cr.parse().unwrap());
        }
        res.headers_mut()
            .insert("Access-Control-Allow-Origin", "*".parse().unwrap());
        return Ok(res);
    }

    // Proxy remote preview URLs so the video element can load them (avoids CORS; fixes Instagram/X audio and TikTok black screen)
    if method == Method::GET && path == "/preview-stream" {
        if !origin_is_allowed(&req) {
            return Ok(text_response(403, "forbidden_origin"));
        }
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
        if is_blocked_preview_target(&decoded) {
            return Ok(text_response(400, "blocked_target_host"));
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
        if !origin_is_allowed(&req) {
            return Ok(text_response(403, "forbidden_origin"));
        }
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
        if !origin_is_allowed(&req) {
            return Ok(text_response(403, "forbidden_origin"));
        }
        let body_bytes = to_bytes(req.into_body()).await?;
        let body_str = String::from_utf8_lossy(&body_bytes).to_string();

        let json = download::handle_download_all(app.clone(), &body_str);
        return Ok(json_response(200, json));
    }

    Ok(text_response(404, "not_found"))
}