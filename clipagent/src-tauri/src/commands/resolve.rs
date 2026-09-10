use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use serde_json::Value;
use urlencoding::decode;

use crate::paths::{ffprobe_path, running_from_sandboxed_app, skip_browser_cookies_for_yt_dlp, yt_dlp_path, yt_dlp_cookies_browser};

fn log_to_file(msg: &str) {
    if let Some(mut dir) = dirs::home_dir() {
        dir.push("Library/Logs/ClipAgent/clipagent.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&dir) {
            let _ = writeln!(file, "{}", msg);
        }
    } else {
        let fallback = PathBuf::from("/tmp/ClipAgent/clipagent.log");
        if let Some(parent) = fallback.parent() {
            let _ = create_dir_all(parent);
        }
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&fallback) {
            let _ = writeln!(file, "{}", msg);
        }
    }
}

/// True when the format carries an H.264 video stream. WKWebView can only decode H.264,
/// so VP9 and AV1 renditions are useless both for preview and for a stream-copy export.
fn is_h264(f: &Value) -> bool {
    f["vcodec"]
        .as_str()
        // avc1 (YouTube/Twitch clips), h264 (TikTok, some HLS streams)
        .map(|v| v.starts_with("avc1") || v == "h264")
        .unwrap_or(false)
}

/// Cheap validity check for a directly streamable preview URL.
///
/// YouTube's one remaining muxed rendition (itag 18) is served inconsistently: it
/// sometimes answers with an empty body, and sometimes with a header that advertises the
/// full duration but carries no decodable frames — the "black screen with correct
/// duration" symptom. Both look identical to resolve, and identical to a healthy URL,
/// until something actually decodes them.
///
/// ffprobe reads only as much of the stream as the first two frames need (~200 ms) and
/// prints one line per frame, so non-empty stdout means the URL really plays.
fn preview_url_is_playable(url: &str) -> bool {
    let out = Command::new(ffprobe_path())
        .args([
            "-v", "error",
            // Give up rather than hang if the CDN stops responding mid-probe.
            "-rw_timeout", "8000000",
            "-user_agent", "Mozilla/5.0",
            "-read_intervals", "%+#2",
            "-select_streams", "v:0",
            "-show_entries", "frame=pict_type",
            "-of", "csv=p=0",
            url,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    match out {
        // A truncated or frameless stream still exits 0, so the frame lines are the signal.
        Ok(o) => o.stdout.iter().any(|b| !b.is_ascii_whitespace()),
        Err(_) => false,
    }
}

pub fn handle_resolve(url: String) -> String {
    let decoded_url = match decode(&url) {
        Ok(u) => u.into_owned(),
        Err(_) => url.clone(),
    };

    let yt_dlp_exe = yt_dlp_path();
    let yt_dlp_exe_str = yt_dlp_exe.to_string_lossy().to_string();
    let arg0 = "--dump-single-json";
    let arg1 = "--no-warnings";
    let arg2 = "--no-progress";
    let use_cookies = !running_from_sandboxed_app() && !skip_browser_cookies_for_yt_dlp();
    let cookies_browser = yt_dlp_cookies_browser();

    let args: Vec<&str> = if use_cookies {
        log_to_file(&format!("[RESOLVE] using cookies from browser: {}", cookies_browser));
        vec![
            "--cookies-from-browser",
            cookies_browser,
            arg0,
            arg1,
            arg2,
            "--no-playlist",
            decoded_url.as_str(),
        ]
    } else {
        log_to_file("[RESOLVE] sandboxed app: not using browser cookies");
        vec![arg0, arg1, arg2, "--no-playlist", decoded_url.as_str()]
    };

    log_to_file("[RESOLVE] starting");
    log_to_file(&format!("[RESOLVE] yt_dlp_path: {}", yt_dlp_exe_str));
    log_to_file(&format!("[RESOLVE] args: {:?}", args));

    let output = Command::new(&yt_dlp_exe)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let out = match output {
        Ok(o) => o,
        Err(e) => {
            return format!(
                r#"{{"error":"unable_to_spawn_yt_dlp","details":"{}"}}"#,
                e
            );
        }
    };

    log_to_file(&format!("[RESOLVE] exit status: {:?}", out.status));
    let stdout_sample = String::from_utf8_lossy(&out.stdout);
    let stderr_sample = String::from_utf8_lossy(&out.stderr);
    log_to_file(&format!(
        "[RESOLVE] output sizes: stdout_bytes={} stderr_bytes={}",
        out.stdout.len(),
        out.stderr.len()
    ));

    let stdout_raw = stdout_sample.trim().to_string();
    let stderr_raw = stderr_sample.to_string();

    if !out.status.success() {
        let stderr_lower = stderr_raw.to_lowercase();
        let err: String = if (stderr_lower.contains("operation not permitted") || stderr_lower.contains("errno 1"))
            && (stderr_lower.contains("cookies") || stderr_lower.contains("binarycookies"))
        {
            r#"{"error":"cookies_not_accessible"}"#.to_string()
        } else if stderr_lower.contains("sign in to confirm") || stderr_lower.contains("not a bot") {
            r#"{"error":"youtube_bot_block"}"#.to_string()
        } else if stderr_lower.contains("private video") || stderr_lower.contains("video is private")
            || stderr_lower.contains("login required") || stderr_lower.contains("sign in to view")
            || stderr_lower.contains("this video is not available")
        {
            r#"{"error":"login_or_private"}"#.to_string()
        } else if stderr_lower.contains("video unavailable")
            || stderr_lower.contains("removed by the uploader")
            || stderr_lower.contains("account associated with this video has been terminated")
        {
            // yt-dlp's wording for removed, terminated and region-blocked videos. Without
            // this arm they surfaced as a raw "yt_dlp_failed" dump in the UI.
            r#"{"error":"video_unavailable"}"#.to_string()
        } else {
            let details = stderr_raw.chars().take(500).collect::<String>();
            let escaped = details.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " ");
            format!(r#"{{"error":"yt_dlp_failed","details":"{}"}}"#, escaped)
        };
        return err;
    }

    let json_start = stdout_raw.find('{');
let json_end = stdout_raw.rfind('}');

let json_str = match (json_start, json_end) {
    (Some(start), Some(end)) if end > start => &stdout_raw[start..=end],
    _ => {
        return r#"{"error":"resolve_bad_json"}"#.to_string();
    }
};

let parsed: Value = match serde_json::from_str(json_str) {
    Ok(v) => v,
    Err(e) => {
        return format!(
            r#"{{"error":"invalid_json_from_yt_dlp","details":"{}"}}"#,
            e
        );
    }
};

    let empty_formats: Vec<Value> = Vec::new();
    let formats = parsed["formats"].as_array().unwrap_or(&empty_formats);

    // Tallest H.264 rendition in the source. This is the ceiling for anything that has to
    // avoid a re-encode — a stream copy, and an in-app preview — because it is the only
    // codec both a plain MP4 remux and WKWebView handle.
    let max_h264_height = formats
        .iter()
        .filter(|f| is_h264(f))
        .filter_map(|f| f["height"].as_i64())
        .max()
        .unwrap_or(0);

    // "Fast" export stream-copies the source into MP4, so only H.264 renditions qualify.
    // The container alone is not enough: YouTube publishes its VP9 and AV1 renditions in
    // .mp4 too, and copying one of those produces a file most players and editors refuse.
    let mut fast_export_heights: Vec<i64> = formats
        .iter()
        .filter(|f| {
            is_h264(f)
                && matches!(f["ext"].as_str(), Some("mp4") | Some("ts"))
                && f["height"].as_i64().unwrap_or(0) >= 360
        })
        .filter_map(|f| f["height"].as_i64())
        .collect();

    fast_export_heights.sort_unstable();
    let fast_max_height = fast_export_heights.last().cloned().unwrap_or(0);

    let mut any_video: Vec<(&Value, i64)> = formats
        .iter()
        .filter(|f| f["vcodec"] != "none")
        .filter_map(|f| f["height"].as_i64().map(|h| (f, h)))
        .collect();

    any_video.sort_by_key(|(_, h)| *h);

    let true_max_height = any_video.last().map(|(_, h)| *h).unwrap_or(0);

    // Reaching the true maximum needs a re-encode whenever no H.264 rendition goes that
    // high. Testing the container of whichever format happens to sort last was both wrong
    // (AV1 and VP9 ship in .mp4) and unstable, since several formats share the top height.
    let true_max_requires_reencode = true_max_height > 0 && true_max_height > max_h264_height;

    let mut progressive: Vec<&Value> = formats
        .iter()
        .filter(|f| {
            f["acodec"] != "none"
                && f["vcodec"] != "none"
                && matches!(f["ext"].as_str(), Some("mp4") | Some("ts"))
                && is_h264(f)
                && f["height"].as_i64().unwrap_or(0) > 0
        })
        .collect();

    progressive.sort_by_key(|f| {
        let is_direct = f["protocol"].as_str()
            .map(|p| p == "https" || p == "http")
            .unwrap_or(false);
        let h = f["height"].as_i64().unwrap_or(0);
        // Strongly prefer direct HTTPS/HTTP over HLS/m3u8 (Chromium webview can't play m3u8)
        if is_direct { h + 10000 } else { h }
    });

    let best_preview = progressive
        .iter()
        .rev()
        .find(|f| f["height"].as_i64().unwrap_or(0) <= 1080)
        .copied()
        .or_else(|| progressive.last().copied());

    let mut preview_url = best_preview
        .and_then(|f| f["url"].as_str())
        .unwrap_or("")
        .to_string();
    // Height of whichever format actually supplied `preview_url`, tracked through the
    // fallback below so the upgrade decision judges the URL being served, not the
    // progressive candidate that was passed over.
    let mut preview_height = best_preview
        .and_then(|f| f["height"].as_i64())
        .unwrap_or(0);

    // Fallback: some platforms may not have progressive MP4; use format with both audio and video so preview has sound (Instagram, X, etc.)
    if preview_url.is_empty() {
        let fallback = formats
            .iter()
            .filter(|f| {
                f["acodec"] != "none"
                    && f["vcodec"] != "none"
                    && f["height"].as_i64().unwrap_or(0) > 0
                    && f["url"].as_str().map(|u| !u.is_empty()).unwrap_or(false)
            })
            .filter(|f| {
                let ext = f["ext"].as_str().unwrap_or("");
                // mp4/webm are always safe; ts covers HLS-delivered streams (Twitch VODs etc.)
                ext == "mp4" || ext == "webm" || ext == "ts"
            })
            .max_by_key(|f| {
                let is_direct = f["protocol"].as_str()
                    .map(|p| p == "https" || p == "http")
                    .unwrap_or(false);
                let h = f["height"].as_i64().unwrap_or(0);
                if is_direct { h + 10000 } else { h }
            });
        if let Some(f) = fallback {
            preview_url = f["url"].as_str().unwrap_or("").to_string();
            preview_height = f["height"].as_i64().unwrap_or(0);
        }
    }

    // How tall a locally merged preview would be, when that is worth building at all.
    //
    // YouTube is the case this exists for. Where it still publishes a muxed format it is
    // only ever itag 18 — 360p — while the same video offers 720p or better as separate
    // H.264 streams. Streaming itag 18 is what made previews look poor, and it is also
    // the rendition that intermittently serves no frames. So whenever the one directly
    // playable format is well below what merging locally could produce, the frontend is
    // told to fetch the better copy in the background and swap to it.
    //
    // Sources whose muxed format already is the best H.264 rendition (TikTok, X,
    // Instagram, Twitch) compare equal here and keep streaming directly, as before.
    let local_upgrade_height = if max_h264_height >= 720 && preview_height < 720 {
        std::cmp::min(max_h264_height, 720)
    } else {
        0
    };

    // A muxed URL is only worth handing to the <video> element if it actually decodes.
    // Probe the ones there is reason to distrust — those we already know are a downgrade,
    // which is exactly the flaky itag 18 case — and drop the URL when it yields no frames,
    // so the local path takes over instead of the player showing a black screen.
    if local_upgrade_height > 0 && !preview_url.is_empty() && !preview_url_is_playable(&preview_url) {
        log_to_file(&format!(
            "[RESOLVE] muxed preview at {}p decoded no frames — falling back to a local preview",
            preview_height
        ));
        preview_url.clear();
    }

    // YouTube no longer publishes muxed (audio+video) formats for many videos, so there is
    // often no single URL a <video> element can play. That is not a failure: the frontend
    // falls back to a locally merged preview built by /yt-preview-cache. Only a source with
    // no video streams whatsoever is genuinely unpreviewable.
    let requires_local_preview = preview_url.is_empty();
    if requires_local_preview {
        if any_video.is_empty() {
            log_to_file("[RESOLVE] no video formats at all — cannot preview");
            return r#"{"error":"no_progressive_preview"}"#.to_string();
        }
        log_to_file(&format!(
            "[RESOLVE] no muxed format (progressive={}); frontend will build a local merged preview",
            progressive.len()
        ));
    } else {
        log_to_file(&format!(
            "[RESOLVE] selected preview {}p url_len={} local_upgrade={}",
            preview_height,
            preview_url.len(),
            local_upgrade_height
        ));
    }

    let id = parsed.get("id").and_then(|v| v.as_str()).unwrap_or("");
    let title = parsed.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let duration = parsed.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let thumbnail = parsed.get("thumbnail").and_then(|v| v.as_str());

    if id.is_empty() || title.is_empty() || duration <= 0.0 {
        return r#"{"error":"invalid_core_fields"}"#.to_string();
    }

    let result = serde_json::json!({
        "id": id,
        "title": title,
        "duration": duration,
        "thumbnail": thumbnail,
        "preview": {
            "url": preview_url,
            "requires_local_preview": requires_local_preview,
            // 0 when the direct URL is already the best preview available.
            "local_upgrade_height": local_upgrade_height
        },
        "capabilities": {
            "fast_max_height": fast_max_height,
            "true_max_height": true_max_height,
            "true_max_requires_reencode": true_max_requires_reencode
        }
    });

    result.to_string()
}