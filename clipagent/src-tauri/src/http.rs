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

/// How much of the file the head proxy covers, chosen against how long the full proxy
/// will take to arrive. When the video can be stream-copied the full proxy is seconds
/// away, so a short head is enough to bridge the gap and is ready almost instantly. A
/// re-encode (ProRes, DNxHD) can take minutes, so the head has to carry the user longer.
fn head_proxy_seconds(copy_video: bool) -> u32 {
    if copy_video { 30 } else { 120 }
}

/// True when the source's video stream is something the webview can decode as-is, so the
/// proxy only has to fix the audio and can stream-copy the video. H.264 covers camera and
/// screen-recorder output; ProRes/DNxHD and friends genuinely need a re-encode.
fn source_video_is_playable(file_path: &Path) -> bool {
    let path_str = file_path.to_string_lossy().to_string();
    let out = std::process::Command::new(ffprobe_path())
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path_str.as_str(),
        ])
        .output();
    match out {
        Ok(o) => String::from_utf8_lossy(&o.stdout).trim().eq_ignore_ascii_case("h264"),
        Err(_) => false,
    }
}

fn head_proxy_path(file_path: &Path) -> PathBuf {
    let key = file_cache_key(file_path);
    let cache_dir = std::env::temp_dir().join("clipagent_preview_cache");
    cache_dir.join(format!("local_preview_head_{key:x}.mp4"))
}

/// Build (or wait for) the head proxy: the first `HEAD_PROXY_SECONDS` of the source with
/// playable audio, so the viewport has something real within about a second.
///
/// Two things this must never do, both of which the previous full-file remux did:
///
///  * **Serve a partially written file.** ffmpeg creates the output immediately and only
///    writes the index at the end, so "the file exists" means nothing. A concurrent range
///    request — and the video element always makes several — was handed a file with no
///    moov atom, could not parse it, and stalled until the whole remux finished and it
///    happened to retry. That was the reported "seeking takes 30 seconds".
///  * **Read the entire source.** Remuxing 2.6 GB just to fix the audio track costs
///    seconds of pure I/O before the first frame, and the full proxy re-reads it anyway.
fn ensure_head_proxy(file_path: &Path) -> Option<PathBuf> {
    let out_path = head_proxy_path(file_path);
    let lock = out_path.with_extension("lock");
    if let Some(dir) = out_path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }

    // Another request is already building it. Wait for that one rather than starting a
    // second ffmpeg over the same source or, worse, serving its half-written output.
    if lock_is_active(&lock) {
        for _ in 0..600 {
            std::thread::sleep(std::time::Duration::from_millis(100));
            if !lock.is_file() {
                break;
            }
        }
    }
    if out_path.is_file() && !lock.is_file() {
        return Some(out_path);
    }

    let _ = std::fs::write(&lock, b"");
    // Write to a scratch name and rename on success: a rename is atomic, so the cache
    // path only ever exists as a complete, playable file.
    let tmp_path = out_path.with_extension("partial.mp4");
    let in_str = file_path.to_string_lossy().to_string();
    let tmp_str = tmp_path.to_string_lossy().to_string();
    let copy_video = source_video_is_playable(file_path);
    let secs = head_proxy_seconds(copy_video).to_string();

    let mut args: Vec<String> = vec![
        "-y".into(),
        "-i".into(), in_str,
        "-t".into(), secs,
        "-map".into(), "0:v:0".into(),
        "-map".into(), "0:a:0?".into(),
    ];
    if copy_video {
        // Already H.264 — copying keeps the source resolution and costs well under a second.
        args.extend(["-c:v".to_string(), "copy".to_string()]);
    } else {
        #[cfg(target_os = "macos")]
        {
            args.extend(["-vf".to_string(), "scale=-2:720".to_string()]);
            args.extend(["-c:v".to_string(), "h264_videotoolbox".to_string()]);
            args.extend(download::videotoolbox_speed_args().iter().map(|s| s.to_string()));
            args.extend(["-b:v".to_string(), "6M".to_string()]);
            args.extend(["-pix_fmt".to_string(), "yuv420p".to_string()]);
        }
        #[cfg(not(target_os = "macos"))]
        {
            args.extend(["-vf".to_string(), "scale=-2:720".to_string()]);
            args.extend(["-c:v".to_string(), "libx264".to_string()]);
            args.extend(["-preset".to_string(), "ultrafast".to_string()]);
            args.extend(["-b:v".to_string(), "6M".to_string()]);
            args.extend(["-pix_fmt".to_string(), "yuv420p".to_string()]);
        }
    }
    args.extend([
        "-c:a".to_string(), "aac".to_string(),
        "-movflags".to_string(), "+faststart".to_string(),
        tmp_str,
    ]);

    let ok = std::process::Command::new(ffmpeg_path())
        .args(&args)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);

    if ok && tmp_path.is_file() {
        let _ = std::fs::rename(&tmp_path, &out_path);
    } else {
        let _ = std::fs::remove_file(&tmp_path);
    }
    let _ = std::fs::remove_file(&lock);

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

/// A lock only means "in flight" for as long as this process lives. Quitting the app
/// mid-download leaves the sentinel behind, and nothing ever removes it: the background
/// job then refuses to start ("already running") while the status endpoint reports it as
/// still running, so the quality upgrade never arrives again for that file or URL.
/// Treat a lock older than an hour — far longer than any real encode or download — as
/// abandoned, and delete it so the next request restarts the work.
fn lock_is_active(lock: &Path) -> bool {
    let Ok(meta) = std::fs::metadata(lock) else {
        return false;
    };
    let stale = meta
        .modified()
        .ok()
        .and_then(|m| m.elapsed().ok())
        .map(|age| age.as_secs() > 3600)
        .unwrap_or(false);
    if stale {
        let _ = std::fs::remove_file(lock);
        return false;
    }
    true
}

/// Kick off a background thread that re-encodes `file_path` to a smooth 720p H.264
/// proxy. Returns immediately; the caller polls `/local-proxy-status` for readiness.
/// The proxy is cached keyed on file identity so it is only generated once.
fn start_hq_proxy_bg(file_path: &Path) {
    let hq = hq_proxy_path(file_path);
    // Already done or already in progress — no-op.
    if hq.is_file() { return; }
    let lock = hq_proxy_lock_path(&hq);
    if lock_is_active(&lock) { return; }

    // Mark in-flight
    let _ = std::fs::write(&lock, b"");

    let in_str = file_path.to_string_lossy().into_owned();
    // Encode to a scratch name and rename on success. A rename is atomic, so the cache
    // path only ever exists as a finished, playable file — even if the process is killed
    // mid-encode, or a lock is lost, no reader can be handed a half-written proxy.
    let final_path = hq.clone();
    let tmp_path = hq.with_extension("partial.mp4");
    let out_str = tmp_path.to_string_lossy().into_owned();
    let lock_str = lock.to_string_lossy().into_owned();
    let ffmpeg = ffmpeg_path();

    let copy_video = source_video_is_playable(file_path);

    std::thread::spawn(move || {
        let mut args: Vec<&str> = vec![
            "-y",
            "-i", &in_str,
            "-map", "0:v:0",
            "-map", "0:a:0?",
        ];

        // Re-encoding is only worth it when the webview cannot play the source video at
        // all (ProRes, DNxHD, a 10 GB 4K master). When the source is already H.264 —
        // every screen recorder and most cameras — copying the video keeps the original
        // resolution, finishes several times faster, and is just as scrubbable, because
        // what makes a file scrub badly is the codec, not its size.
        #[cfg(target_os = "macos")]
        let vcodec_args: Vec<&str> = if copy_video {
            vec!["-c:v", "copy"]
        } else {
            // Built from a capability probe rather than hard-coded: -power_efficient only
            // exists from ffmpeg 6.1, and an unknown option aborts the entire command.
            let mut a = vec!["-vf", "scale=-2:720", "-c:v", "h264_videotoolbox"];
            a.extend(download::videotoolbox_speed_args());
            a.extend(["-b:v", "4M", "-pix_fmt", "yuv420p"]);
            a
        };
        #[cfg(not(target_os = "macos"))]
        let vcodec_args: Vec<&str> = if copy_video {
            vec!["-c:v", "copy"]
        } else {
            vec!["-vf", "scale=-2:720", "-c:v", "libx264", "-preset", "ultrafast",
                 "-b:v", "4M", "-pix_fmt", "yuv420p"]
        };

        args.extend(vcodec_args.iter().copied());
        args.extend_from_slice(&[
            "-c:a", "aac",
            "-movflags", "+faststart",
            &out_str,
        ]);

        let ok = std::process::Command::new(ffmpeg)
            .args(&args)
            .status()
            .map(|s| s.success())
            .unwrap_or(false);

        if ok && tmp_path.is_file() {
            let _ = std::fs::rename(&tmp_path, &final_path);
        } else {
            // FFmpeg failed: drop the scratch file so nothing can ever report "ready" for
            // an invalid or incomplete encode.
            let _ = std::fs::remove_file(&tmp_path);
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
    if lock_is_active(&lock) {
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


/// Resolve which file `/local-preview` should actually stream: the whole-file proxy when
/// it exists, otherwise a freshly built head. Blocking — call it from spawn_blocking.
fn resolve_local_preview_path(decoded: &str, force_pcm_fix: bool) -> Result<PathBuf, String> {
    let mut resolved_path = PathBuf::from(decoded);
    if force_pcm_fix {
        let p = Path::new(decoded);
        if p.is_file() && needs_pcm_preview_fix(p) {
            let hq = hq_proxy_path(p);
            // The lock has to be checked first, exactly as /local-proxy-status does. While
            // ffmpeg is writing, the output already exists and is enormous — a 2.6 GB
            // source is hundreds of megabytes in within seconds — but has no moov atom
            // yet, so the video element cannot parse it and fails. Size proves nothing.
            let hq_ready = !lock_is_active(&hq_proxy_lock_path(&hq))
                && hq.is_file()
                && std::fs::metadata(&hq).map(|m| m.len()).unwrap_or(0) > 1024;

            if hq_ready {
                // Best path: the whole-file proxy exists, so every seek is local and cheap.
                resolved_path = hq;
            } else {
                // Head first, then the full proxy. Overlapping them means two ffmpeg
                // processes writing gigabytes to the same disk at once; on a 40 Mbps
                // source that contention pushed the first frame from ~1s out to ~12s.
                //
                // The timeline still spans the whole source — its duration comes from
                // ffprobe on the original, not from this file — so scrubbing past the
                // head just waits for the full proxy to land.
                match ensure_head_proxy(p) {
                    Some(head) => {
                        resolved_path = head;
                        start_hq_proxy_bg(p);
                    }
                    None => {
                        return Err("pcm_fix_failed: ffmpeg could not build a preview-safe copy of this file. This usually means the container/streams are unusual or the file is partially corrupted.".to_string());
                    }
                }
            }
        }
    }
    Ok(resolved_path)
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

        // ffprobe and ffmpeg below block for seconds. The video element opens several
        // range requests at once, so doing this inline would tie up one tokio worker per
        // request and stall every other endpoint until they finished.
        let decoded_for_fix = decoded.clone();
        let resolved = tokio::task::spawn_blocking(move || {
            resolve_local_preview_path(&decoded_for_fix, force_pcm_fix)
        })
        .await
        .unwrap_or_else(|_| Err("preview_resolution_panicked".to_string()));

        let resolved_path = match resolved {
            Ok(p) => p,
            Err(msg) => return Ok(text_response(500, &msg)),
        };

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
        let status_json = if lock_is_active(&lock) {
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
    //   bg    "1" returns as soon as the hq job is queued, without downloading anything
    //         inline. Used when the source already has a directly playable URL and only
    //         the quality upgrade has to be fetched.
    if method == Method::GET && path == "/yt-preview-cache" {
        if !origin_is_allowed(&req) {
            return Ok(text_response(403, "forbidden_origin"));
        }
        let query = req.uri().query().unwrap_or("");
        let mut raw_url: Option<String> = None;
        let mut q_param: Option<u32> = None;
        let mut hq_param: Option<u32> = None;
        let mut full = false;
        let mut background_only = false;
        for part in query.split('&') {
            let mut it = part.splitn(2, '=');
            match it.next() {
                Some("url") => raw_url = it.next().map(|s| s.to_string()),
                Some("q") => q_param = it.next().and_then(|v| v.parse::<u32>().ok()),
                Some("hq") => hq_param = it.next().and_then(|v| v.parse::<u32>().ok()),
                Some("full") => full = it.next() == Some("1"),
                Some("bg") => background_only = it.next() == Some("1"),
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

        // Nothing to download inline: the caller already has something to play and is
        // only asking for the upgrade to be queued.
        if background_only {
            return Ok(json_response(200, r#"{"ok":true,"background":true}"#.to_string()));
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

        let status_json = if lock_is_active(&lock) {
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

        // handle_resolve shells out to yt-dlp and ffprobe and blocks for seconds. Running
        // it directly on the executor stalled every other request on the same worker —
        // including the /local-preview range reads the player issues while a second tab
        // resolves.
        let json = tokio::task::spawn_blocking(move || crate::commands::resolve::handle_resolve(url))
            .await
            .unwrap_or_else(|_| r#"{"error":"resolve_panicked"}"#.to_string());
        return Ok(json_response(200, json));
    }

    if method == Method::POST && path == "/download-all" {
        if !origin_is_allowed(&req) {
            return Ok(text_response(403, "forbidden_origin"));
        }
        let body_bytes = to_bytes(req.into_body()).await?;
        let body_str = String::from_utf8_lossy(&body_bytes).to_string();

        // An export runs yt-dlp and ffmpeg to completion — minutes, for a batch. Holding a
        // tokio worker for that starves everything sharing it, including the /ping the UI
        // uses to decide the agent is alive and the /local-preview range reads the player
        // issues while the user keeps scrubbing.
        let app_for_export = app.clone();
        let json = tokio::task::spawn_blocking(move || {
            download::handle_download_all(app_for_export, &body_str)
        })
        .await
        .unwrap_or_else(|_| r#"{"error":"export_panicked"}"#.to_string());
        return Ok(json_response(200, json));
    }

    Ok(text_response(404, "not_found"))
}