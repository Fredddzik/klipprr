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
use crate::paths::{ffmpeg_path, ffprobe_path, yt_dlp_path, running_from_sandboxed_app, skip_browser_cookies_for_yt_dlp, yt_dlp_cookies_browser};
use urlencoding::decode as url_decode;
use std::net::IpAddr;
use url::Url;

pub fn with_cors(mut res: Response<Body>) -> Response<Body> {
    let headers = res.headers_mut();
    headers.insert("Access-Control-Allow-Origin", "*".parse().unwrap());
    headers.insert(
        "Access-Control-Allow-Methods",
        "GET, HEAD, POST, OPTIONS".parse().unwrap(),
    );
    headers.insert(
        "Access-Control-Allow-Headers",
        "Content-Type, Range".parse().unwrap(),
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
    // PCM variants, Apple Lossless (ALAC), FLAC — none of these are natively playable
    // in a browser <video> element embedded in Tauri's WebView.
    codec.starts_with("pcm") || codec == "lpcm" || codec == "alac" || codec == "flac"
}

/// Compute a stable cache key for `file_path` based on path + size + mtime.
fn file_cache_key(file_path: &Path) -> u64 {
    let meta = std::fs::metadata(file_path).ok();
    let mut hasher = DefaultHasher::new();
    file_path.to_string_lossy().hash(&mut hasher);
    if let Some(m) = meta {
        m.len().hash(&mut hasher);
        if let Ok(modified) = m.modified() {
            if let Ok(since_epoch) = modified.duration_since(std::time::UNIX_EPOCH) {
                since_epoch.as_secs().hash(&mut hasher);
                since_epoch.subsec_nanos().hash(&mut hasher);
            }
        }
    }
    hasher.finish()
}

fn make_pcm_fixed_preview(file_path: &Path) -> Option<PathBuf> {
    let key = file_cache_key(file_path);

    let mut cache_dir = std::env::temp_dir();
    cache_dir.push("clipagent_preview_cache");
    let _ = std::fs::create_dir_all(&cache_dir);
    // Phase 1: stream-copy video, re-encode audio → fast, loads immediately.
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

/// Path for the smooth HQ proxy (hardware-accelerated 720p H.264 re-encode).
fn hq_proxy_path(file_path: &Path) -> PathBuf {
    let key = file_cache_key(file_path);
    let cache_dir = std::env::temp_dir().join("clipagent_preview_cache");
    cache_dir.join(format!("local_preview_hq_{key:x}.mp4"))
}

/// Sentinel written while the HQ encode is in-flight so a second request doesn't
/// spawn a duplicate FFmpeg process.
fn hq_proxy_lock_path(hq: &Path) -> PathBuf {
    hq.with_extension("lock")
}

/// Kick off a background thread that re-encodes `file_path` to a smooth 720p H.264
/// proxy. Returns immediately; the caller polls `/local-proxy-status` for readiness.
/// The proxy is cached keyed on file identity so it is only generated once.
fn start_hq_proxy_bg(file_path: &Path) {
    let hq = hq_proxy_path(file_path);
    // Already done or already in progress — no-op.
    if hq.is_file() { return; }
    let lock = hq_proxy_lock_path(&hq);
    if lock.is_file() { return; }

    // Mark in-flight
    let _ = std::fs::write(&lock, b"");

    let in_str = file_path.to_string_lossy().into_owned();
    let out_str = hq.to_string_lossy().into_owned();
    let lock_str = lock.to_string_lossy().into_owned();
    let ffmpeg = ffmpeg_path();

    std::thread::spawn(move || {
        // Hardware-accelerated H.264 on macOS; libx264 ultrafast elsewhere.
        // Scale down to at most 1280 px wide (720-ish), keep aspect ratio.
        // This turns a 10 GB ProRes 4K file into a ~300 MB scrub-friendly proxy.
        #[cfg(target_os = "macos")]
        let vcodec_args: &[&str] = &[
            "-c:v", "h264_videotoolbox",
            "-prio_speed", "1",
            "-power_efficient", "0",
            "-b:v", "4M",
        ];
        #[cfg(not(target_os = "macos"))]
        let vcodec_args: &[&str] = &[
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-b:v", "4M",
        ];

        let mut args: Vec<&str> = vec![
            "-y",
            "-i", &in_str,
            "-map", "0:v:0",
            "-map", "0:a:0?",
            // Scale to at most 720p tall; -2 keeps the width divisible-by-2.
            // Avoid shell-style quoting (single quotes) — Command::new passes args
            // directly without a shell, so they would be passed literally to FFmpeg.
            // `scale=-2:720` is unambiguous and sufficient for a preview proxy.
            "-vf", "scale=-2:720",
        ];
        args.extend_from_slice(vcodec_args);
        args.extend_from_slice(&[
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-movflags", "+faststart",
            &out_str,
        ]);

        let ok = std::process::Command::new(ffmpeg)
            .args(&args)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        if !ok {
            // FFmpeg failed: remove any partial output so /local-proxy-status never
            // reports "ready" for an invalid/incomplete file.
            let _ = std::fs::remove_file(&out_str);
        }
        // Always remove the lock so a retry is possible on the next load.
        let _ = std::fs::remove_file(&lock_str);
    });
}

/// Cache path for a yt-dlp-built preview, keyed on source URL + quality tier.
/// Tiers are independent files so the fast low-res copy stays playable while the
/// high-res one is still downloading.
fn yt_preview_path(url: &str, tier: &str) -> PathBuf {
    let mut h = DefaultHasher::new();
    url.hash(&mut h);
    let key = h.finish();
    let cache_dir = std::env::temp_dir().join("clipagent_preview_cache");
    cache_dir.join(format!("yt_preview_{key:x}_{tier}.mp4"))
}

/// Sentinel written while a download is in flight so a second request does not
/// spawn a duplicate yt-dlp process.
fn yt_preview_lock_path(p: &Path) -> PathBuf {
    p.with_extension("lock")
}

/// Legacy selector: smallest available muxed/any format. Used by the TikTok path,
/// which only needs a throwaway 60s preview.
const YT_PREVIEW_SELECTOR_WORST: &str =
    "worstvideo[ext=mp4]+worstaudio[ext=m4a]/worstvideo+worstaudio/worst[ext=mp4]/worst";

/// Format selector capped at `max_h` px tall, pinned to H.264 + AAC.
/// WKWebView cannot decode VP9 or AV1, and YouTube serves those by default at most
/// heights, so avc1/m4a is requested explicitly with progressively wider fallbacks.
fn yt_preview_format_selector(max_h: u32) -> String {
    format!(
        "bestvideo[height<={h}][vcodec^=avc1]+bestaudio[ext=m4a]/\
         bestvideo[height<={h}][vcodec^=avc1]+bestaudio/\
         best[height<={h}][vcodec^=avc1]/best[height<={h}]/best",
        h = max_h
    )
}

/// Download a merged preview to `out_path`. Blocking; returns whether it succeeded.
/// `max_secs` caps the downloaded span; `None` fetches the whole video so the entire
/// timeline can be scrubbed.
fn run_yt_preview_download(
    url: &str,
    out_path: &Path,
    selector: &str,
    max_secs: Option<u32>,
) -> bool {
    // yt-dlp appends the real container extension, so hand it a stem.
    let stem = out_path.with_extension("");
    let out_template = format!("{}.%(ext)s", stem.to_string_lossy());

    let mut args: Vec<String> = vec![];
    if !running_from_sandboxed_app() && !skip_browser_cookies_for_yt_dlp() {
        args.push("--cookies-from-browser".to_string());
        args.push(yt_dlp_cookies_browser().to_string());
    }
    args.extend([
        "-f".to_string(),
        selector.to_string(),
        "--merge-output-format".to_string(),
        "mp4".to_string(),
        "--no-playlist".to_string(),
        "--ffmpeg-location".to_string(),
        ffmpeg_path().to_string_lossy().to_string(),
    ]);
    if let Some(secs) = max_secs {
        args.push("--download-sections".to_string());
        args.push(format!("*0-{}", secs));
    }
    args.push("-o".to_string());
    args.push(out_template);
    args.push(url.to_string());

    std::process::Command::new(yt_dlp_path())
        .args(&args)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Kick off a background high-quality download for `url`. Returns immediately; the
/// frontend polls `/yt-proxy-status` and swaps the video source once it is ready.
/// Mirrors `start_hq_proxy_bg`, which does the same for local PCM files.
fn start_yt_hq_bg(url: &str, max_h: u32) {
    let out = yt_preview_path(url, "hq");
    if out.is_file() {
        return;
    }
    let lock = yt_preview_lock_path(&out);
    if lock.is_file() {
        return;
    }
    if let Some(dir) = out.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let _ = std::fs::write(&lock, b"");

    let url_owned = url.to_string();
    std::thread::spawn(move || {
        let out = yt_preview_path(&url_owned, "hq");
        let selector = yt_preview_format_selector(max_h);
        let ok = run_yt_preview_download(&url_owned, &out, &selector, None);
        if !ok {
            // Drop any partial file so the status endpoint never reports it ready.
            let _ = std::fs::remove_file(&out);
        }
        let _ = std::fs::remove_file(yt_preview_lock_path(&out));
    });
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
                // Check if the smooth HQ proxy already exists (from a prior background encode).
                let hq = hq_proxy_path(p);
                let hq_ready = hq.is_file()
                    && std::fs::metadata(&hq).map(|m| m.len()).unwrap_or(0) > 1024;

                if hq_ready {
                    // Best path: serve the fully re-encoded, scrub-friendly proxy directly.
                    resolved_path = hq;
                } else {
                    // Phase 1: stream-copy video + AAC audio → immediate playback (may lag on
                    // large ProRes/DNxHD files).
                    if let Some(converted) = make_pcm_fixed_preview(p) {
                        resolved_path = converted;
                    } else {
                        return Ok(text_response(
                            500,
                            "pcm_fix_failed: ffmpeg could not create a preview-safe file (attempted -c:v copy -c:a aac). This usually means the container/streams are unusual or the file is partially corrupted.",
                        ));
                    }
                    // Phase 2 (async): kick off a background 720p H.264 re-encode so future
                    // seeks are smooth. The frontend polls /local-proxy-status and swaps the src
                    // once ready, without requiring a manual reload.
                    start_hq_proxy_bg(p);
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

    // Proxy remote preview URLs (forward Range + HEAD so <video> can seek on Chromium / WebView2).
    if (method == Method::GET || method == Method::HEAD) && path == "/preview-stream" {
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

        let upstream_method = if method == Method::HEAD {
            reqwest::Method::HEAD
        } else {
            reqwest::Method::GET
        };

        let mut proxy_req = client.request(upstream_method, &decoded);
        if method == Method::GET {
            if let Some(range_val) = req.headers().get(hyper::header::RANGE) {
                if let Ok(s) = range_val.to_str() {
                    proxy_req = proxy_req.header(hyper::header::RANGE, s);
                }
            }
        }
        if decoded.contains("youtube.com") || decoded.contains("youtu.be") {
            proxy_req = proxy_req.header("Referer", "https://www.youtube.com/");
        } else if decoded.contains("tiktok.com") {
            proxy_req = proxy_req.header("Referer", "https://www.tiktok.com/");
        } else if decoded.contains("twimg.com") || decoded.contains("twitter.com") || decoded.contains("t.co") {
            proxy_req = proxy_req.header("Referer", "https://x.com/");
        }

        let upstream = match proxy_req.send().await {
            Ok(r) => r,
            Err(e) => {
                let msg = format!(
                    r#"{{"error":"proxy_fetch","details":"{}"}}"#,
                    e.to_string().replace('"', "\\\"")
                );
                return Ok(json_response(502, msg));
            }
        };

        if !upstream.status().is_success() {
            return Ok(text_response(502, "upstream_error"));
        }

        let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::OK);
        let headers = upstream.headers();
        let content_type = headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("video/mp4")
            .to_string();
        let content_length = headers.get("content-length").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
        let content_range = headers
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());
        let accept_ranges = headers
            .get("accept-ranges")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        if method == Method::HEAD {
            let mut res = Response::new(Body::empty());
            *res.status_mut() = status;
            res.headers_mut()
                .insert("Content-Type", content_type.parse().unwrap());
            if let Some(ref cl) = content_length {
                if let Ok(hv) = cl.parse() {
                    res.headers_mut().insert("Content-Length", hv);
                }
            }
            if let Some(ref cr) = content_range {
                if let Ok(hv) = cr.parse() {
                    res.headers_mut().insert("Content-Range", hv);
                }
            }
            if let Some(ref ar) = accept_ranges {
                if let Ok(hv) = ar.parse() {
                    res.headers_mut().insert("Accept-Ranges", hv);
                }
            } else if content_length.is_some() || content_range.is_some() {
                res.headers_mut()
                    .insert("Accept-Ranges", "bytes".parse().unwrap());
            }
            res.headers_mut()
                .insert("Access-Control-Allow-Origin", "*".parse().unwrap());
            return Ok(res);
        }

        // GET: stream body; preserve 200 vs 206 and range headers from upstream.
        let body = Body::wrap_stream(upstream.bytes_stream());
        let mut res = Response::new(body);
        *res.status_mut() = status;
        res.headers_mut()
            .insert("Content-Type", content_type.parse().unwrap());
        if let Some(ref cl) = content_length {
            if let Ok(hv) = cl.parse() {
                res.headers_mut().insert("Content-Length", hv);
            }
        }
        if let Some(ref cr) = content_range {
            if let Ok(hv) = cr.parse() {
                res.headers_mut().insert("Content-Range", hv);
            }
        }
        if let Some(ref ar) = accept_ranges {
            if let Ok(hv) = ar.parse() {
                res.headers_mut().insert("Accept-Ranges", hv);
            }
        } else if content_length.is_some() || content_range.is_some() {
            res.headers_mut()
                .insert("Accept-Ranges", "bytes".parse().unwrap());
        }
        res.headers_mut()
            .insert("Access-Control-Allow-Origin", "*".parse().unwrap());
        return Ok(res);
    }

    // Poll for the HQ proxy generated by start_hq_proxy_bg (background 720p H.264 re-encode).
    // Frontend calls this every few seconds after loading a PCM local file; when status=="ready"
    // it swaps the video src to the smooth proxy path.
    if method == Method::GET && path == "/local-proxy-status" {
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
            _ => return Ok(json_response(400, r#"{"error":"missing_path"}"#.to_string())),
        };
        let decoded = match url_decode(&encoded) {
            Ok(u) => u.into_owned(),
            Err(_) => return Ok(text_response(400, "bad_path_encoding")),
        };
        let orig = Path::new(&decoded);
        let hq = hq_proxy_path(orig);
        let lock = hq_proxy_lock_path(&hq);

        // Check lock FIRST: while FFmpeg is writing, the output file may already exist
        // with >1024 bytes but not yet be a valid MP4. Reporting "ready" at that point
        // would send the frontend a broken file and trigger onError in the video element.
        let status_json = if lock.is_file() {
            r#"{"status":"encoding"}"#.to_string()
        } else if hq.is_file()
            && std::fs::metadata(&hq).map(|m| m.len()).unwrap_or(0) > 65536
        {
            // Lock is gone and file is substantial (>64 KB) — safe to use.
            let path_str = hq.to_string_lossy().to_string();
            let escaped = path_str.replace('\\', "\\\\").replace('"', "\\\"");
            format!(r#"{{"status":"ready","path":"{}"}}"#, escaped)
        } else {
            r#"{"status":"not_started"}"#.to_string()
        };

        return Ok(json_response(200, status_json));
    }

    // yt-dlp backed preview cache.
    //
    // Two platforms need this, for different reasons:
    //   * TikTok  — CDN URLs require signed tokens WKWebView cannot obtain.
    //   * YouTube — it no longer publishes muxed formats at all, so there is no single
    //     progressive URL to stream; video and audio must be fetched and merged locally.
    //
    // Query params:
    //   url   source page URL (required)
    //   q     max height for this download; omitted = legacy "worst" (TikTok behaviour)
    //   full  "1" downloads the whole video instead of only the first 60s, so the
    //         entire timeline is scrubbable
    //   hq    if set, also starts a background download at that height, collected
    //         later via /yt-proxy-status and swapped in transparently
    if method == Method::GET && path == "/yt-preview-cache" {
        if !origin_is_allowed(&req) {
            return Ok(text_response(403, "forbidden_origin"));
        }
        let query = req.uri().query().unwrap_or("");
        let mut raw_url: Option<String> = None;
        let mut q_param: Option<u32> = None;
        let mut hq_param: Option<u32> = None;
        let mut full = false;
        for part in query.split('&') {
            let mut it = part.splitn(2, '=');
            match it.next() {
                Some("url") => raw_url = it.next().map(|s| s.to_string()),
                Some("q") => q_param = it.next().and_then(|v| v.parse::<u32>().ok()),
                Some("hq") => hq_param = it.next().and_then(|v| v.parse::<u32>().ok()),
                Some("full") => full = it.next() == Some("1"),
                _ => {}
            }
        }
        let encoded = match raw_url {
            Some(u) if !u.is_empty() => u,
            _ => return Ok(json_response(400, r#"{"error":"missing_url"}"#.to_string())),
        };
        let original_url = match url_decode(&encoded) {
            Ok(u) => u.into_owned(),
            Err(_) => return Ok(text_response(400, "bad_url_encoding")),
        };

        let tier = match q_param {
            Some(h) => h.to_string(),
            None => "lq".to_string(),
        };
        let out_mp4 = yt_preview_path(&original_url, &tier);
        if let Some(dir) = out_mp4.parent() {
            let _ = std::fs::create_dir_all(dir);
        }

        // Start the background HQ fetch first so it overlaps this download rather
        // than starting only after the low-res copy finishes.
        if let Some(hq_h) = hq_param {
            start_yt_hq_bg(&original_url, hq_h);
        }

        // Serve from cache when a previous run already produced a usable file.
        if out_mp4.is_file() {
            let sz = std::fs::metadata(&out_mp4).map(|m| m.len()).unwrap_or(0);
            if sz > 1024 {
                let path_str = out_mp4.to_string_lossy().to_string();
                let escaped = path_str.replace('\\', "\\\\").replace('"', "\\\"");
                return Ok(json_response(200, format!(r#"{{"ok":true,"path":"{}"}}"#, escaped)));
            }
            let _ = std::fs::remove_file(&out_mp4);
        }

        let selector = match q_param {
            Some(h) => yt_preview_format_selector(h),
            None => YT_PREVIEW_SELECTOR_WORST.to_string(),
        };
        let max_secs = if full { None } else { Some(60) };
        let url_for_dl = original_url.clone();
        let out_for_dl = out_mp4.clone();

        let result = tokio::task::spawn_blocking(move || {
            run_yt_preview_download(&url_for_dl, &out_for_dl, &selector, max_secs)
        })
        .await;

        let dl_ok = result.unwrap_or(false);
        if !dl_ok {
            return Ok(json_response(500, r#"{"ok":false,"reason":"yt_dlp_failed"}"#.to_string()));
        }
        if !out_mp4.is_file() || std::fs::metadata(&out_mp4).map(|m| m.len()).unwrap_or(0) < 1024 {
            return Ok(json_response(500, r#"{"ok":false,"reason":"output_missing_or_empty"}"#.to_string()));
        }

        let path_str = out_mp4.to_string_lossy().to_string();
        let escaped = path_str.replace('\\', "\\\\").replace('"', "\\\"");
        return Ok(json_response(200, format!(r#"{{"ok":true,"path":"{}"}}"#, escaped)));
    }

    // Poll for the background high-quality preview started by start_yt_hq_bg.
    // Returns "ready" only once the lock is gone AND the file is substantial, so the
    // frontend never swaps to a half-written MP4.
    if method == Method::GET && path == "/yt-proxy-status" {
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
            _ => return Ok(json_response(400, r#"{"error":"missing_url"}"#.to_string())),
        };
        let original_url = match url_decode(&encoded) {
            Ok(u) => u.into_owned(),
            Err(_) => return Ok(text_response(400, "bad_url_encoding")),
        };

        let hq = yt_preview_path(&original_url, "hq");
        let lock = yt_preview_lock_path(&hq);

        let status_json = if lock.is_file() {
            r#"{"status":"downloading"}"#.to_string()
        } else if hq.is_file() && std::fs::metadata(&hq).map(|m| m.len()).unwrap_or(0) > 65536 {
            let path_str = hq.to_string_lossy().to_string();
            let escaped = path_str.replace('\\', "\\\\").replace('"', "\\\"");
            format!(r#"{{"status":"ready","path":"{}"}}"#, escaped)
        } else {
            r#"{"status":"not_started"}"#.to_string()
        };

        return Ok(json_response(200, status_json));
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