use std::fs::OpenOptions;
use std::io::{self, Write, BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use serde_json::Value;
use tauri::AppHandle;
#[cfg(unix)]
use std::os::unix::process::ExitStatusExt;
#[cfg(windows)]
use std::os::windows::process::ExitStatusExt;

use crate::output::{unique_output_path, unique_output_path_with_ext};
use crate::paths::{running_from_sandboxed_app, skip_browser_cookies_for_yt_dlp, yt_dlp_path, ffmpeg_path, ffprobe_path, yt_dlp_cookies_browser};
use crate::storage;
use tauri::Emitter;

/// Watermark image embedded at build time so it cannot be removed or replaced from the app bundle.
static EMBEDDED_WATERMARK: &[u8] = include_bytes!("../../assets/watermark.png");

/// If not sandboxed and not skipping cookies (e.g. Windows DPAPI), returns [\"--cookies-from-browser\", browser]; otherwise [].
fn yt_dlp_cookie_args() -> Vec<&'static str> {
    if running_from_sandboxed_app() || skip_browser_cookies_for_yt_dlp() {
        vec![]
    } else {
        vec!["--cookies-from-browser", yt_dlp_cookies_browser()]
    }
}

/// Returns a path to the watermark image for ffmpeg. Always uses the embedded asset so deleting
/// or replacing assets/watermark.png in the bundle has no effect. Writes to a temp file per export run.
fn watermark_path_for_export(export_stamp: u128) -> Result<PathBuf, String> {
    let temp = std::env::temp_dir().join(format!("klipprr_watermark_{}.png", export_stamp));
    std::fs::write(&temp, EMBEDDED_WATERMARK).map_err(|e| e.to_string())?;
    Ok(temp)
}

/// Full H.264 encoder args tuned for speed on the target platform.
/// macOS: h264_videotoolbox with power/speed hints that default to "auto" on battery
/// and can cap throughput at real-time; forcing prio_speed=1 and power_efficient=0 lifts
/// the cap to 5–15x realtime on Apple Silicon.
/// Windows/Linux: libx264 with veryfast preset.
fn h264_encoder_args() -> Vec<&'static str> {
    #[cfg(target_os = "macos")]
    {
        vec![
            "-c:v", "h264_videotoolbox",
            "-prio_speed", "1",
            "-power_efficient", "0",
            "-pix_fmt", "yuv420p",
            "-b:v", "6M",
        ]
    }
    #[cfg(not(target_os = "macos"))]
    {
        vec![
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-b:v", "6M",
        ]
    }
}

/// yt-dlp flags that improve throughput on DASH/HLS sources (YouTube, Twitch Clips).
/// Progressive HTTP sources (IG, X) ignore these.
fn yt_dlp_speed_args() -> &'static [&'static str] {
    &["--concurrent-fragments", "4"]
}

/// Probe a single codec name (e.g. "h264", "aac", "av1") for the given stream.
fn probe_codec_name(path: &Path, stream: &str) -> Option<String> {
    let path_str = path.to_string_lossy();
    let out = Command::new(ffprobe_path())
        .args([
            "-v", "error",
            "-select_streams", stream,
            "-show_entries", "stream=codec_name",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path_str.as_ref(),
        ])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

/// Conservative check: can we stream-copy this file into an MP4 container and get a
/// video that plays everywhere (QuickTime, Windows Media, browsers)?
/// Only H.264 + AAC qualifies. Watermarking requires a filter graph, so forces re-encode.
fn can_stream_copy_to_mp4(path: &Path, has_watermark: bool) -> bool {
    if has_watermark {
        return false;
    }
    let vcodec = probe_codec_name(path, "v:0");
    let acodec = probe_codec_name(path, "a:0");
    matches!(vcodec.as_deref(), Some("h264")) && matches!(acodec.as_deref(), Some("aac"))
}

/// Returns the default export directory path (e.g. ~/Downloads) for the UI to display.
#[tauri::command]
pub fn get_default_export_dir() -> String {
    dirs::download_dir()
        .unwrap_or_else(std::env::temp_dir)
        .display()
        .to_string()
}

/// Load persisted export path; None if missing or invalid (e.g. directory removed).
#[tauri::command]
pub fn get_export_path(app: AppHandle) -> Option<String> {
    storage::load_export_path(&app)
}

/// Persist export path for next launch. Call when user picks a folder (Pro only).
#[tauri::command]
pub fn set_export_path(app: AppHandle, path: String) -> Result<(), String> {
    let p = path.trim();
    if p.is_empty() {
        storage::clear_export_path(&app)?;
        return Ok(());
    }
    let candidate = PathBuf::from(p);
    if !candidate.is_dir() {
        return Err("path is not a directory".to_string());
    }
    storage::save_export_path(&app, p)
}

/// Clear persisted export path (e.g. when user switches to Free).
#[tauri::command]
pub fn clear_export_path(app: AppHandle) -> Result<(), String> {
    storage::clear_export_path(&app)
}

/// Get duration, video codec, and audio codec of a local file via ffprobe.
#[tauri::command]
pub fn get_local_video_info(path: String) -> Result<(f64, Option<String>, Option<String>), String> {
    let p = PathBuf::from(path.trim());
    if !p.is_file() {
        return Err("not a file".to_string());
    }
    let path_str = p.to_string_lossy();

    let out_duration = Command::new(ffprobe_path())
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path_str.as_ref(),
        ])
        .output()
        .map_err(|e| e.to_string())?;
    let duration: f64 = String::from_utf8_lossy(&out_duration.stdout)
        .trim()
        .parse()
        .map_err(|_| "could not parse duration".to_string())?;

    let out_codec = Command::new(ffprobe_path())
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=codec_name",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path_str.as_ref(),
        ])
        .output();
    let codec_name = out_codec
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        });

    let out_audio_codec = Command::new(ffprobe_path())
        .args([
            "-v", "error",
            "-select_streams", "a:0",
            "-show_entries", "stream=codec_name",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path_str.as_ref(),
        ])
        .output();
    let audio_codec_name = out_audio_codec
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        });

    Ok((duration, codec_name, audio_codec_name))
}

/// Open the given path in the system file manager (Finder on macOS, Explorer on Windows, etc.).
#[tauri::command]
pub fn open_export_folder(path: String) -> Result<(), String> {
    let p = path.trim();
    if p.is_empty() {
        return Err("path is empty".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(p).status()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(p).status()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        std::process::Command::new("xdg-open").arg(p).status()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn log_to_file(msg: &str) {
    if let Some(mut dir) = dirs::home_dir() {
        dir.push("Library/Logs/ClipAgent/clipagent.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(dir) {
            let _ = writeln!(file, "{}", msg);
        }
    }
}

fn parse_ffmpeg_out_time_ms(line: &str) -> Option<i64> {
    // When using `-progress pipe:2`, ffmpeg prints lines like:
    // out_time_ms=12345678
    if let Some(rest) = line.strip_prefix("out_time_ms=") {
        return rest.trim().parse::<i64>().ok();
    }
    None
}

fn parse_ytdlp_progress_pct(line: &str) -> Option<f32> {
    // [download]  45.2% of 123.45MiB at 2.34MiB/s ETA 00:30
    let rest = line.trim().strip_prefix("[download]")?.trim_start();
    let pct_str = rest.split('%').next()?.trim();
    pct_str.parse::<f32>().ok().filter(|&p| p >= 0.0 && p <= 100.0)
}

/// Spawn yt-dlp with stderr piped, calling `on_progress(pct)` for each parsed download
/// percentage (0.0..=100.0). Returns (success, stderr_string) after the process exits.
fn run_ytdlp_with_progress<F>(cmd: &mut Command, mut on_progress: F) -> (bool, String)
where
    F: FnMut(f32),
{
    let mut child = match cmd.stdout(Stdio::null()).stderr(Stdio::piped()).spawn() {
        Ok(c) => c,
        Err(e) => {
            log_to_file(&format!("yt-dlp spawn error: {}", e));
            return (false, String::new());
        }
    };
    let mut stderr_buf = String::new();
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            if stderr_buf.len() < 200_000 {
                stderr_buf.push_str(&line);
                stderr_buf.push('\n');
            }
            if let Some(pct) = parse_ytdlp_progress_pct(&line) {
                on_progress(pct);
            }
        }
    }
    let success = child.wait().map(|s| s.success()).unwrap_or(false);
    (success, stderr_buf)
}

fn pick_existing_with_ext(base: &Path, exts: &[&str]) -> Option<PathBuf> {
    for ext in exts {
        let p = PathBuf::from(format!("{}.{}", base.display(), ext));
        if p.exists() {
            return Some(p);
        }
        let part = PathBuf::from(format!("{}.part", p.display()));
        if part.exists() {
            // Rename .part → final so ffmpeg can open it reliably.
            let _ = std::fs::rename(&part, &p);
            return Some(p);
        }
    }
    None
}

fn probe_duration_secs(path: &Path) -> Option<f64> {
    let path_str = path.to_string_lossy();
    let out = Command::new(ffprobe_path())
        .args([
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path_str.as_ref(),
        ])
        .output()
        .ok()?;
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    s.parse::<f64>().ok()
}

fn probe_video_dims(path: &Path) -> Option<(i64, i64)> {
    let path_str = path.to_string_lossy();
    let out = Command::new(ffprobe_path())
        .args([
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0",
            path_str.as_ref(),
        ])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let mut parts = s.split('x');
    let w = parts.next()?.trim().parse::<i64>().ok()?;
    let h = parts.next()?.trim().parse::<i64>().ok()?;
    if w > 0 && h > 0 { Some((w, h)) } else { None }
}

fn watermark_target_width(video_w: i64, video_h: i64) -> i64 {
    // Classic watermark behavior: preserve watermark AR; size relative to video width with caps.
    let vertical = video_h > video_w;
    let frac = if vertical { 0.38_f64 } else { 0.18_f64 };
    let raw = (video_w as f64 * frac).round() as i64;
    raw.clamp(140, 320)
}

/// Move temp file to final path so the file appears in the user's folder only when fully complete.
fn move_temp_to_final(temp_path: &Path, final_path: &Path) -> io::Result<()> {
    std::fs::rename(temp_path, final_path).or_else(|_| {
        std::fs::copy(temp_path, final_path)?;
        std::fs::remove_file(temp_path)
    })
}

pub fn handle_download_all(app: AppHandle, body: &str) -> String {
    log_to_file("About to spawn ffmpeg");
    log_to_file(&format!("Working dir: {:?}", std::env::current_dir()));
    log_to_file(&format!("PATH: {:?}", std::env::var("PATH")));
    log_to_file(&format!("yt_dlp_path(): {:?}", yt_dlp_path()));
    log_to_file(&format!("ffmpeg_path(): {:?}", ffmpeg_path()));

    println!("WORKING DIR: {:?}", std::env::current_dir());
    println!("HOME: {:?}", std::env::var("HOME"));
    println!("PATH: {:?}", std::env::var("PATH"));
    println!("TMPDIR: {:?}", std::env::var("TMPDIR"));
    
    use std::fs;

    let parsed: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(e) => return format!(r#"{{"error":"bad_request","details":"{}"}}"#, e),
    };

    let client_export_id = parsed
        .get("client_export_id")
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let source_title = parsed
        .get("source_title")
        .and_then(|x| x.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let quality_reencode_h264 = parsed
        .get("quality_reencode_h264")
        .and_then(|x| x.as_bool())
        .unwrap_or(false);

    let url = parsed.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let local_path_opt = parsed.get("local_path").and_then(|x| x.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

    let clips = parsed.get("clips").and_then(|c| c.as_array());
    if clips.is_none() || clips.unwrap().is_empty() {
        return r#"{"error":"no_clips"}"#.to_string();
    }
    let clips = clips.unwrap();
    let total_clips = clips.len();
    log_to_file(&format!(
        "[EXPORT] start total_clips={} client_export_id={:?}",
        total_clips, client_export_id
    ));
    let _ = app.emit("export-progress", serde_json::json!({
        "totalClips": total_clips,
        "phase": "starting",
        "client_export_id": client_export_id,
    }));

    let export_stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let mode = parsed.get("mode").and_then(|x| x.as_str()).unwrap_or("quality");
    let fast_cap_in = parsed.get("fast_max_height").and_then(|x| x.as_i64());
    let keep_full = parsed.get("keep_full").and_then(|x| x.as_bool()).unwrap_or(false);

    // IMPORTANT: do not trust the client for watermarking. Decide based on backend license/capabilities.
    let caps = crate::license::get_capabilities(&app);
    let has_watermark = caps.has_watermark;

    // Free mode (watermarked) exports are capped at 720p, but still allow choosing lower values.
    let fast_cap: Option<i64> = if has_watermark {
        Some(std::cmp::min(720, fast_cap_in.unwrap_or(720)))
    } else {
        fast_cap_in
    };

    let watermark_path_buf = if has_watermark {
        watermark_path_for_export(export_stamp).ok()
    } else {
        None
    };
    let codec = parsed.get("codec").and_then(|x| x.as_str()).unwrap_or("universal");

    let export_path_opt = parsed.get("export_path").and_then(|x| x.as_str());
    let _preview_url = parsed.get("preview_url").and_then(|x| x.as_str()).unwrap_or("");

    println!(
        "[WM] has_watermark (client={:?}, effective={})",
        parsed.get("has_watermark"),
        has_watermark
    );
    log_to_file(&format!(
        "[WM] has_watermark effective={} (caps={:?})",
        has_watermark, caps
    ));

    let default_base_dir = dirs::download_dir().unwrap_or(std::env::temp_dir());
    
    let base_dir = if let Some(p) = export_path_opt {
        let candidate = PathBuf::from(p);
        if candidate.is_dir() {
            candidate
        } else {
            default_base_dir
        }
    } else {
        default_base_dir
    };

    let _ = fs::create_dir_all(&base_dir);

    // -------- LOCAL FILE SOURCE --------
    // Local exports are always raw trim/copy from the selected local file:
    // - never watermark
    // - never resolution-cap
    // - never force re-encode
    if let Some(ref local_path_str) = local_path_opt {
        let local_path = PathBuf::from(local_path_str);
        if !local_path.is_file() {
            return r#"{"error":"local_file_not_found"}"#.to_string();
        }
        let ext = local_path.extension().and_then(|e| e.to_str()).unwrap_or("mp4");
        let local_str = local_path.to_string_lossy().to_string();
        let base_str = base_dir.display().to_string();

        let mut results = vec![];
        for (i, c) in clips.iter().enumerate() {
            let _ = app.emit("export-progress", serde_json::json!({
                "clipIndex": i, "totalClips": total_clips, "phase": "clip", "clipPercent": 0
            }));
            let start = c.get("start").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let end = c.get("end").and_then(|x| x.as_f64()).unwrap_or(start);
            let name = c.get("name").and_then(|x| x.as_str()).unwrap_or("clip");
            if end <= start {
                results.push(serde_json::json!({"index": i, "name": name, "ok": false, "reason": "invalid_range"}));
                continue;
            }
            let safe: String = name.chars().map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' }).collect();
            let out_path = unique_output_path_with_ext(&base_dir, &safe, ext);
            let out_str = out_path.to_string_lossy().to_string();

            let temp_path =
                std::env::temp_dir().join(format!("klipprr_export_{}_{}.{}", export_stamp, i, ext));
            let temp_str = temp_path.to_string_lossy().to_string();

            let ok = Command::new(ffmpeg_path())
                .current_dir(&base_dir)
                .args([
                    "-ss", &format!("{:.3}", start),
                    "-to", &format!("{:.3}", end),
                    "-i", &local_str,
                    "-c", "copy",
                    "-y", &temp_str,
                ])
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false);
            let ok = ok && move_temp_to_final(&temp_path, &out_path).is_ok();
            let (success, written_path) = (ok, out_str.clone());

            if success {
                results.push(serde_json::json!({"index": i, "name": name, "ok": true, "path": written_path}));
                let _ = app.emit("export-clip-done", serde_json::json!({"clipIndex": i, "clip_name": name, "export_dir": base_str}));
            } else {
                results.push(serde_json::json!({"index": i, "name": name, "ok": false}));
            }
        }
        let _ = app.emit("export-all-done", serde_json::json!({
            "export_dir": base_str,
            "totalClips": total_clips,
        }));
        return serde_json::json!({ "ok": true, "results": results, "export_dir": base_str }).to_string();
    }

    if url.is_empty() {
        return r#"{"error":"missing_url"}"#.to_string();
    }

    // FAST MODE (URL source)
    if mode == "speed" {
        let base_str = base_dir.display().to_string();

        // Format selector and needs_reencode are invariant across clips in a single export.
        // Compute once so every thread can cheaply clone the resulting String.
        //   Universal (re-encode): allow any bestvideo container/codec; output MP4 via ffmpeg.
        //   Original (stream copy): must stay MP4-compatible, constrain to MP4 video + M4A audio.
        let format_selector: String = if codec == "universal" || has_watermark {
            match fast_cap {
                Some(h) => format!("bv*[height<={}] + ba/best", h),
                None => "bv*+ba/best".to_string(),
            }
        } else {
            // "Original" / stream-copy mode: prefer MP4 container for clean remux.
            // Tiered fallback so platforms without separate m4a (X/Twitter, TikTok) still work:
            //   1. bv[mp4]+ba[m4a]   — best-case: separate H.264/m4a → perfect stream copy
            //   2. bv[mp4]+ba        — MP4 video + any audio codec
            //   3. best[ext=mp4]     — best single progressive MP4 (handles TikTok h264, X/Twitter)
            //   4. best              — absolute fallback (may be WebM/VP9 but still valid)
            match fast_cap {
                Some(h) => format!(
                    "bv*[ext=mp4][height<={}]+ba[ext=m4a]/bv*[ext=mp4][height<={}]+ba/best[ext=mp4][height<={}]/best[height<={}]",
                    h, h, h, h
                ),
                None => "bv*[ext=mp4]+ba[ext=m4a]/bv*[ext=mp4]+ba/best[ext=mp4]/best".to_string(),
            }
        };
        let needs_reencode_branch: bool = has_watermark || codec == "universal";

        // Up to 3 clips run in parallel. Each clip spawns its own yt-dlp + ffmpeg;
        // 3x memory and network is fine for typical batch exports and the M-series
        // hardware encoder can sustain 2–3 concurrent 1080p encodes. Capped at 3 to
        // avoid ISP throttling on long batches and stay polite to upstream sources.
        let max_concurrent: usize = std::cmp::min(4, total_clips.max(1));
        let sem: Arc<(Mutex<usize>, Condvar)> =
            Arc::new((Mutex::new(max_concurrent), Condvar::new()));
        let results_arr: Arc<Mutex<Vec<Option<Value>>>> =
            Arc::new(Mutex::new(vec![None; total_clips]));

        std::thread::scope(|scope| {
            for (i, c) in clips.iter().enumerate() {
                // Clone per-thread captures. Values borrowed from the outer scope
                // (base_dir, url, etc.) live long enough because thread::scope joins
                // all threads before returning.
                let app_t = app.clone();
                let sem_t = Arc::clone(&sem);
                let results_t = Arc::clone(&results_arr);
                let base_dir_t = base_dir.clone();
                let base_str_t = base_str.clone();
                let format_selector_t = format_selector.clone();
                let url_t = url.clone();
                let watermark_path_t = watermark_path_buf.clone();
                let client_export_id_t = client_export_id.clone();
                let c_t: Value = c.clone();

                scope.spawn(move || {
                    // Acquire a permit (blocking until one is free).
                    {
                        let (m, cv) = &*sem_t;
                        let mut g = m.lock().unwrap();
                        while *g == 0 {
                            g = cv.wait(g).unwrap();
                        }
                        *g -= 1;
                    }

                    let result: Value = (|| {
                        let app = &app_t;
                        let base_dir = &base_dir_t;
                        let base_str = base_str_t.as_str();
                        let format_selector = format_selector_t.as_str();
                        let url = url_t.as_str();
                        let watermark_path_buf = watermark_path_t.as_ref();
                        let client_export_id = client_export_id_t.as_deref();
                        let c = &c_t;

                        log_to_file(&format!("[EXPORT] fast clip_start i={}", i));
                        let _ = app.emit("export-progress", serde_json::json!({
                            "clipIndex": i, "totalClips": total_clips, "phase": "clip", "clipPercent": 0, "client_export_id": client_export_id
                        }));
                        let start = c.get("start").and_then(|x| x.as_f64()).unwrap_or(0.0);
                        let end = c.get("end").and_then(|x| x.as_f64()).unwrap_or(start);
                        let name = c.get("name").and_then(|x| x.as_str()).unwrap_or("clip");

                        if end <= start {
                            return serde_json::json!({
                                "index": i, "name": name, "ok": false, "reason": "invalid_range"
                            });
                        }

                        let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
                        let out_path = unique_output_path(base_dir, &safe);
                        let out_str = out_path.to_string_lossy().to_string();

                        let emit_failed = |reason: &str| {
                            let _ = app.emit("export-clip-failed", serde_json::json!({
                                "clipIndex": i,
                                "reason": reason,
                                "export_dir": base_str,
                                "client_export_id": client_export_id,
                            }));
                        };

                        let status = {
                            let needs_reencode = needs_reencode_branch;

                            if needs_reencode {
                    println!("[FAST] Re-encoding (watermark or universal codec)");

                    // Let yt-dlp choose the container/extension. We'll re-encode to MP4 anyway.
                    // Use an output template and then locate the produced file (mp4/webm/mkv).
                    let tmp_base = std::env::temp_dir()
                        .join(format!("klipprr_wm_tmp_{}_{}", export_stamp, i));
                    let tmp_template = format!("{}.%(ext)s", tmp_base.display());

                    // 1) Download the requested section. yt-dlp may include keyframe padding.
                    // We correct deterministically by trimming from the tail based on actual duration.
                    let desired_dur = (end - start).max(0.001);
                    let section_range = format!("*{:.3}-{:.3}", start, end);
                    let ffmpeg_str = ffmpeg_path().to_string_lossy().into_owned();
                    let mut dl_args: Vec<&str> = yt_dlp_cookie_args();
                    dl_args.extend(yt_dlp_speed_args());
                    dl_args.extend([
                        "-f",
                        &format_selector,
                        "--download-sections",
                        &section_range,
                        "--ffmpeg-location",
                        &ffmpeg_str,
                        "-o",
                        tmp_template.as_str(),
                        "--newline",
                        &url,
                    ]);
                    let mut last_dl_pct: i64 = -1;
                    let (dl_success, dl_stderr) = run_ytdlp_with_progress(
                        Command::new(yt_dlp_path())
                            .current_dir(&base_dir)
                            .args(&dl_args),
                        |pct| {
                            let p = (pct / 2.0).round() as i64;
                            if p > last_dl_pct {
                                last_dl_pct = p;
                                let _ = app.emit("export-progress", serde_json::json!({
                                    "clipIndex": i, "totalClips": total_clips, "phase": "clip", "clipPercent": p, "client_export_id": client_export_id
                                }));
                            }
                        },
                    );
                    log_to_file(&format!("yt-dlp status: success={}", dl_success));
                    log_to_file(&format!("yt-dlp stderr: {}", dl_stderr));

                    if !dl_success {
                        println!("[FAST] yt-dlp failed");
                        emit_failed("yt_dlp_failed");
                        return serde_json::json!({
                            "index": i,
                            "name": name,
                            "ok": false,
                            "reason": "yt_dlp_failed"
                        });
                    }

                    log_to_file(&format!("[EXPORT] fast yt-dlp done i={} -> encoding", i));

                    // --- Validate section-download output ---
                    // Some platforms (X/Twitter HLS CMAF, certain Twitch formats) produce an
                    // empty or corrupt intermediate file when --download-sections splices CMAF
                    // segments (ffmpeg logs "Invalid NAL unit size" / "Output file is empty").
                    // Detect by checking size + probeable duration. If bad, retry as a full
                    // download and use FFmpeg input-side -ss to seek to the clip start instead.
                    let section_dl_path = pick_existing_with_ext(&tmp_base, &["mp4", "webm", "mkv"]);
                    let section_bad = match &section_dl_path {
                        Some(p) => {
                            let sz = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
                            let dur_ok = probe_duration_secs(p).is_some();
                            if !dur_ok || sz < 1024 {
                                log_to_file(&format!(
                                    "[FAST] section dl bad i={} size={} dur_ok={}, will retry as full dl",
                                    i, sz, dur_ok
                                ));
                                if let Some(bad) = &section_dl_path { let _ = std::fs::remove_file(bad); }
                                true
                            } else { false }
                        }
                        None => true,
                    };

                    // `ffmpeg_input_ss`: pre-input seek injected when we fall back to full download.
                    // For normal section downloads this is None (tail-trim handles any padding).
                    let ffmpeg_input_ss: Option<f64>;

                    if section_bad {
                        // Full download fallback: yt-dlp without --download-sections.
                        // FFmpeg will seek to `start` in the complete source file.
                        log_to_file(&format!("[FAST] running full-download fallback i={} start={:.3}", i, start));
                        let mut rdl: Vec<&str> = yt_dlp_cookie_args();
                        rdl.extend(yt_dlp_speed_args());
                        rdl.extend([
                            "-f", format_selector,
                            "--ffmpeg-location", &ffmpeg_str,
                            "-o", tmp_template.as_str(),
                            "--newline",
                            url,
                        ]);
                        let mut last_rdl_pct: i64 = -1;
                        let (rdl_ok, rdl_stderr) = run_ytdlp_with_progress(
                            Command::new(yt_dlp_path())
                                .current_dir(base_dir)
                                .args(&rdl),
                            |pct| {
                                let p = (pct / 2.0).round() as i64;
                                if p > last_rdl_pct {
                                    last_rdl_pct = p;
                                    let _ = app.emit("export-progress", serde_json::json!({
                                        "clipIndex": i, "totalClips": total_clips, "phase": "clip", "clipPercent": p, "client_export_id": client_export_id
                                    }));
                                }
                            },
                        );
                        log_to_file(&format!("[FAST] full-dl success={} stderr={}", rdl_ok,
                            rdl_stderr.chars().take(800).collect::<String>()));
                        if !rdl_ok {
                            emit_failed("yt_dlp_full_dl_failed");
                            return serde_json::json!({"index": i, "name": name, "ok": false, "reason": "yt_dlp_full_dl_failed"});
                        }
                        ffmpeg_input_ss = Some(start); // seek to clip start in full video
                    } else {
                        ffmpeg_input_ss = None; // normal section download; use tail-trim if needed
                    }

                    let tmp_path = match pick_existing_with_ext(&tmp_base, &["mp4", "webm", "mkv"]) {
                        Some(p) => p,
                        None => {
                            log_to_file(&format!("[FAST] no output after download i={}", i));
                            emit_failed("yt_dlp_output_missing");
                            return serde_json::json!({
                                "index": i, "name": name, "ok": false, "reason": "yt_dlp_output_missing"
                            });
                        }
                    };
                    let tmp_str = tmp_path.to_string_lossy().to_string();

                    // For section downloads: detect keyframe padding and trim from tail.
                    // For full downloads (ffmpeg_input_ss is Some): no tail padding; -ss handles start.
                    let mut trim_tail_start: Option<f64> = None;
                    if ffmpeg_input_ss.is_none() {
                        if let Some(actual) = probe_duration_secs(&tmp_path) {
                            if actual > desired_dur + 0.25 {
                                trim_tail_start = Some((actual - desired_dur).max(0.0));
                                log_to_file(&format!(
                                    "[FAST] section padding detected i={} actual={:.3}s desired={:.3}s trim={:.3}s",
                                    i, actual, desired_dur, trim_tail_start.unwrap_or(0.0)
                                ));
                            }
                        }
                    }

                    let _ = app.emit("export-progress", serde_json::json!({
                        "clipIndex": i, "totalClips": total_clips, "phase": "encoding", "clipPercent": 50, "client_export_id": client_export_id
                    }));

                    // Write ffmpeg output to temp, then move to final path when done
                    let out_temp = std::env::temp_dir()
                        .join(format!("klipprr_export_{}_{}.mp4", export_stamp, i));
                    let out_temp_str = out_temp.to_string_lossy().to_string();

                    // Smart auto-skip: if yt-dlp gave us H.264 + AAC (common for YouTube <=720p,
                    // IG Reels, X/Twitter, Twitch Clips), remux into MP4 with -c copy instead
                    // of re-encoding. Cuts ~1-3s off a 10s clip. Forced off when watermarking.
                    let stream_copy_mode = can_stream_copy_to_mp4(&tmp_path, has_watermark);
                    if stream_copy_mode {
                        log_to_file(&format!(
                            "[FAST] auto stream-copy (H.264/AAC detected, no re-encode) i={}",
                            i
                        ));
                    } else {
                        log_to_file(&format!(
                            "[FAST] re-encoding (watermark={} or non-H.264/AAC source) i={}",
                            has_watermark, i
                        ));
                    }

                    // IMPORTANT: ffmpeg options between `-i` inputs apply to the *next input*.
                    // We must not place `-ss/-t` between the video input and watermark input.
                    // Pre-input seek: ffmpeg_input_ss (full-dl seek) takes priority over trim_tail_start
                    // (section-dl keyframe padding). Only one is ever non-None at a time.
                    let mut ffmpeg_args: Vec<String> = vec![];
                    let pre_input_ss = ffmpeg_input_ss.or(trim_tail_start);
                    if let Some(ss) = pre_input_ss {
                        ffmpeg_args.push("-ss".to_string());
                        ffmpeg_args.push(format!("{:.3}", ss));
                    }
                    ffmpeg_args.push("-i".to_string());
                    ffmpeg_args.push(tmp_str.clone());

                    if has_watermark {
                        let watermark_str = watermark_path_buf
                            .as_ref()
                            .map(|p| p.to_string_lossy().to_string())
                            .expect("watermark path when has_watermark");
                        let (vw, vh) = probe_video_dims(&tmp_path).unwrap_or((1280, 720));
                        let wm_w = watermark_target_width(vw, vh);
                        ffmpeg_args.extend(vec![
                            "-loop".to_string(),
                            "1".to_string(),
                            "-i".to_string(),
                            watermark_str,
                            "-filter_complex".to_string(),
                            format!(
                                "[1:v]format=rgba,colorchannelmixer=aa=0.8,scale={wm_w}:-1[wm];\
[0:v][wm]overlay=x='max(0,W-w-32)':y='max(0,H-h-72)'"
                            ),
                        ]);
                    }

                    ffmpeg_args.extend(vec![
                        "-t".to_string(),
                        format!("{:.3}", desired_dur),
                        "-shortest".to_string(),
                        "-progress".to_string(),
                        "pipe:2".to_string(),
                        "-nostats".to_string(),
                    ]);
                    if stream_copy_mode {
                        ffmpeg_args.extend(vec![
                            "-c".to_string(), "copy".to_string(),
                            "-movflags".to_string(), "+faststart".to_string(),
                            "-f".to_string(), "mp4".to_string(),
                        ]);
                    } else {
                        ffmpeg_args.extend(h264_encoder_args().into_iter().map(String::from));
                        ffmpeg_args.extend(vec!["-c:a".to_string(), "aac".to_string()]);
                    }
                    ffmpeg_args.extend(vec![
                        "-y".to_string(),
                        out_temp_str.clone(),
                    ]);

                    // Stream ffmpeg stderr so we can emit real progress.
                    // We map encoding time (0..clip_dur) into clipPercent 50..99.
                    let clip_dur = (end - start).max(0.001);
                    let mut child = match Command::new(ffmpeg_path())
                        .current_dir(&base_dir)
                        .args(&ffmpeg_args)
                        .stdout(Stdio::piped())
                        .stderr(Stdio::piped())
                        .spawn()
                    {
                        Ok(c) => c,
                        Err(e) => {
                            log_to_file(&format!("Failed to spawn ffmpeg: {:?}", e));
                            let _ = std::fs::remove_file(&tmp_path);
                            let _ = std::fs::remove_file(&out_temp);
                            emit_failed("ffmpeg_spawn_failed");
                            return serde_json::json!({
                                "index": i,
                                "name": name,
                                "ok": false,
                                "reason": "ffmpeg_spawn_failed"
                            });
                        }
                    };

                    let mut stderr_buf = String::new();
                    let mut last_emitted: i64 = 50;
                    if let Some(stderr) = child.stderr.take() {
                        let reader = BufReader::new(stderr);
                        for line in reader.lines().flatten() {
                            if stderr_buf.len() < 200_000 {
                                stderr_buf.push_str(&line);
                                stderr_buf.push('\n');
                            }
                            if let Some(ms) = parse_ffmpeg_out_time_ms(&line) {
                                let t = (ms as f64) / 1_000_000.0;
                                let frac = (t / clip_dur).clamp(0.0, 1.0);
                                let pct = (50.0 + frac * 49.0).round() as i64; // 50..99
                                if pct > last_emitted {
                                    last_emitted = pct;
                                    let _ = app.emit("export-progress", serde_json::json!({
                                        "clipIndex": i, "totalClips": total_clips, "phase": "encoding", "clipPercent": pct, "client_export_id": client_export_id
                                    }));
                                }
                            }
                        }
                    }

                    let ffmpeg_status = child.wait();

                    let mut success = match ffmpeg_status {
                        Ok(s) => {
                            log_to_file(&format!("ffmpeg status: {:?}", s));
                            if !stderr_buf.is_empty() {
                                log_to_file(&format!("ffmpeg stderr (capped): {}", stderr_buf));
                            }
                            s.success()
                        }
                        Err(e) => {
                            log_to_file(&format!("Failed to wait on ffmpeg: {:?}", e));
                            false
                        }
                    };

                    // Reliability fallback: if stream-copy remux failed (bad stream flags,
                    // timestamp issues, etc.), retry with full H.264 re-encode so the user
                    // still gets a playable file.
                    if !success && stream_copy_mode {
                        log_to_file(&format!(
                            "[FAST] stream-copy failed, falling back to re-encode i={}",
                            i
                        ));
                        let _ = std::fs::remove_file(&out_temp);
                        let mut fb_args: Vec<String> = vec![];
                        if let Some(ss) = trim_tail_start {
                            fb_args.push("-ss".to_string());
                            fb_args.push(format!("{:.3}", ss));
                        }
                        fb_args.push("-i".to_string());
                        fb_args.push(tmp_str.clone());
                        fb_args.extend(vec![
                            "-t".to_string(), format!("{:.3}", desired_dur),
                            "-shortest".to_string(),
                        ]);
                        fb_args.extend(h264_encoder_args().into_iter().map(String::from));
                        fb_args.extend(vec![
                            "-c:a".to_string(), "aac".to_string(),
                            "-y".to_string(), out_temp_str.clone(),
                        ]);
                        let fb_status = Command::new(ffmpeg_path())
                            .current_dir(&base_dir)
                            .args(&fb_args)
                            .status();
                        success = fb_status.as_ref().map(|s| s.success()).unwrap_or(false);
                        log_to_file(&format!("[FAST] fallback re-encode success={} i={}", success, i));
                    }

                    let _ = std::fs::remove_file(&tmp_path);

                    let move_ok = success && move_temp_to_final(&out_temp, &out_path).is_ok();
                    if success && !move_ok {
                        log_to_file(&format!("[FAST] move to final failed (e.g. sandbox), clip left at {}", out_temp.display()));
                    }
                    if success {
                        let _ = std::process::ExitStatus::from_raw(0);
                        // When move failed, file is still in temp; caller will use fallback_path
                        Ok((std::process::ExitStatus::from_raw(0), if move_ok { None } else { Some(out_temp_str) }))
                    } else {
                        let _ = std::fs::remove_file(&out_temp);
                        Err(std::io::Error::new(std::io::ErrorKind::Other, "ffmpeg_failed"))
                    }
                } else {
                    println!("[FAST] Original codec — stream copy");

                    let temp_out = std::env::temp_dir()
                        .join(format!("klipprr_export_{}_{}.mp4", export_stamp, i));
                    let temp_out_str = temp_out.to_string_lossy().to_string();

                    // Download requested section; then stream-copy trim from tail if padded.
                    let desired_dur = (end - start).max(0.001);
                    let section_range = format!("*{:.3}-{:.3}", start, end);
                    let ffmpeg_str = ffmpeg_path().to_string_lossy().into_owned();
                    let mut dl_args: Vec<&str> = yt_dlp_cookie_args();
                    dl_args.extend(yt_dlp_speed_args());
                    dl_args.extend([
                        "-f",
                        &format_selector,
                        "--download-sections",
                        &section_range,
                        "--ffmpeg-location",
                        &ffmpeg_str,
                        "-o",
                        &temp_out_str,
                        "--newline",
                        &url,
                    ]);
                    let mut last_dl_pct: i64 = -1;
                    let (dl_ok, dl_stderr) = run_ytdlp_with_progress(
                        Command::new(yt_dlp_path())
                            .current_dir(&base_dir)
                            .args(&dl_args),
                        |pct| {
                            let p = (pct / 2.0).round() as i64;
                            if p > last_dl_pct {
                                last_dl_pct = p;
                                let _ = app.emit("export-progress", serde_json::json!({
                                    "clipIndex": i, "totalClips": total_clips, "phase": "clip", "clipPercent": p, "client_export_id": client_export_id
                                }));
                            }
                        },
                    );
                    log_to_file(&format!("yt-dlp status: success={}", dl_ok));
                    log_to_file(&format!("yt-dlp stderr: {}", dl_stderr));
                    // Newer yt-dlp may leave the merged file as .part; use it if final path is missing
                    if !temp_out.exists() {
                        let part_path = PathBuf::from(format!("{}.part", temp_out.display()));
                        if part_path.exists() {
                            let _ = std::fs::rename(&part_path, &temp_out);
                            log_to_file(&format!("[FAST] renamed yt-dlp .part to {}", temp_out.display()));
                        }
                    }
                    if dl_ok {
                        log_to_file(&format!("[EXPORT] fast yt-dlp done (copy) i={} -> finalize", i));
                        let _ = app.emit("export-progress", serde_json::json!({
                            "clipIndex": i, "totalClips": total_clips, "phase": "encoding", "clipPercent": 50, "client_export_id": client_export_id
                        }));

                        // If yt-dlp padded the section, trim from the tail so duration matches.
                        if let Some(actual) = probe_duration_secs(&temp_out) {
                            if actual > desired_dur + 0.25 {
                                let ss = (actual - desired_dur).max(0.0);
                                log_to_file(&format!(
                                    "[FAST] copy trim padded section i={} desired={:.3}s actual={:.3}s ss={:.3}s",
                                    i, desired_dur, actual, ss
                                ));
                                let trimmed = std::env::temp_dir().join(format!(
                                    "klipprr_export_trim_{}_{}.mp4",
                                    export_stamp, i
                                ));
                                let trimmed_str = trimmed.to_string_lossy().to_string();
                                let status = Command::new(ffmpeg_path())
                                    .args([
                                        "-y",
                                        "-ss",
                                        &format!("{:.3}", ss),
                                        "-t",
                                        &format!("{:.3}", desired_dur),
                                        "-i",
                                        &temp_out_str,
                                        "-c",
                                        "copy",
                                        &trimmed_str,
                                    ])
                                    .status();
                                match status {
                                    Ok(s) if s.success() => {
                                        let _ = std::fs::remove_file(&temp_out);
                                        let _ = std::fs::rename(&trimmed, &temp_out);
                                    }
                                    Ok(s) => {
                                        log_to_file(&format!(
                                            "[FAST] copy trim ffmpeg failed status={:?} i={}",
                                            s, i
                                        ));
                                        let _ = std::fs::remove_file(&trimmed);
                                    }
                                    Err(e) => {
                                        log_to_file(&format!(
                                            "[FAST] copy trim ffmpeg spawn error {:?} i={}",
                                            e, i
                                        ));
                                        let _ = std::fs::remove_file(&trimmed);
                                    }
                                }
                            }
                        }

                        let move_ok = move_temp_to_final(&temp_out, &out_path).is_ok();
                        if !move_ok {
                            log_to_file(&format!("[FAST] move to final failed, clip left at {}", temp_out.display()));
                        }
                        Ok((std::process::ExitStatus::from_raw(0), if move_ok { None } else { Some(temp_out_str) }))
                    } else {
                        let _ = std::fs::remove_file(&temp_out);
                        Err(std::io::Error::new(std::io::ErrorKind::Other, "yt_dlp_failed"))
                    }
                }
            };

                        match status {
                            Ok((s, fallback_path)) if s.success() => {
                                log_to_file(&format!("[EXPORT] fast clip_done i={}", i));
                                let path: String = fallback_path.unwrap_or_else(|| out_str.clone());
                                let _ = app.emit("export-clip-done", serde_json::json!({
                                    "clipIndex": i,
                                    "clip_name": name,
                                    "export_dir": base_str,
                                    "client_export_id": client_export_id,
                                }));
                                serde_json::json!({
                                    "index": i,
                                    "name": name,
                                    "ok": true,
                                    "path": path
                                })
                            }
                            _ => {
                                emit_failed("clip_failed");
                                serde_json::json!({
                                    "index": i,
                                    "name": name,
                                    "ok": false,
                                    "reason": "clip_failed"
                                })
                            },
                        }
                    })();

                    // Store indexed result.
                    if let Ok(mut g) = results_t.lock() {
                        g[i] = Some(result);
                    }

                    // Release permit.
                    {
                        let (m, cv) = &*sem_t;
                        let mut g = m.lock().unwrap();
                        *g += 1;
                        cv.notify_one();
                    }
                });
            }
        });

        let results: Vec<Value> = Arc::try_unwrap(results_arr)
            .ok()
            .expect("results_arr still has outstanding refs")
            .into_inner()
            .unwrap()
            .into_iter()
            .enumerate()
            .map(|(i, o)| o.unwrap_or_else(|| serde_json::json!({
                "index": i, "ok": false, "reason": "missing_result"
            })))
            .collect();

        log_to_file("[EXPORT] fast export-all-done emit");
        let _ = app.emit("export-all-done", serde_json::json!({
            "export_dir": base_str,
            "totalClips": total_clips,
            "client_export_id": client_export_id,
        }));
        return serde_json::json!({ "ok": true, "results": results, "export_dir": base_str }).to_string();
    }

    // QUALITY MODE (existing behavior)
    // QUALITY MODE (revamped): download best streams, then merge to a single file
    // that clips can be cut from without section/keyframe padding issues.
    let _ = app.emit("export-progress", serde_json::json!({
        "totalClips": total_clips,
        "phase": "quality_download_video",
        "globalPercent": 10,
        "client_export_id": client_export_id,
    }));

    // Download big intermediates to temp so they don't clutter the user's export folder.
    let quality_tmp = std::env::temp_dir().join(format!("klipprr_quality_{}", export_stamp));
    let _ = std::fs::create_dir_all(&quality_tmp);
    let video_base = quality_tmp.join(format!("quality_video_{}", export_stamp));
    let audio_base = quality_tmp.join(format!("quality_audio_{}", export_stamp));
    let video_template = format!("{}.%(ext)s", video_base.display());
    let audio_template = format!("{}.%(ext)s", audio_base.display());

    let mut video_args: Vec<&str> = yt_dlp_cookie_args();
    video_args.extend(yt_dlp_speed_args());
    video_args.extend(["-f", "bestvideo/bv*", "-o", &video_template, "--newline", &url]);
    let mut last_video_pct: i64 = 10;
    run_ytdlp_with_progress(
        Command::new(yt_dlp_path())
            .current_dir(&base_dir)
            .args(&video_args),
        |pct| {
            let p = (10.0 + pct * 0.25).round() as i64; // 10..35
            if p > last_video_pct {
                last_video_pct = p;
                let _ = app.emit("export-progress", serde_json::json!({
                    "totalClips": total_clips,
                    "phase": "quality_download_video",
                    "globalPercent": p,
                    "client_export_id": client_export_id,
                }));
            }
        },
    );

    let _ = app.emit("export-progress", serde_json::json!({
        "totalClips": total_clips,
        "phase": "quality_download_audio",
        "globalPercent": 35,
        "client_export_id": client_export_id,
    }));

    let mut audio_args: Vec<&str> = yt_dlp_cookie_args();
    audio_args.extend(yt_dlp_speed_args());
    audio_args.extend(["-f", "bestaudio/ba*", "-o", &audio_template, "--newline", &url]);
    let mut last_audio_pct: i64 = 35;
    run_ytdlp_with_progress(
        Command::new(yt_dlp_path())
            .current_dir(&base_dir)
            .args(&audio_args),
        |pct| {
            let p = (35.0 + pct * 0.20).round() as i64; // 35..55
            if p > last_audio_pct {
                last_audio_pct = p;
                let _ = app.emit("export-progress", serde_json::json!({
                    "totalClips": total_clips,
                    "phase": "quality_download_audio",
                    "globalPercent": p,
                    "client_export_id": client_export_id,
                }));
            }
        },
    );

    let video_path = match pick_existing_with_ext(&video_base, &["mp4", "webm", "mkv"]) {
        Some(p) => p,
        None => return r#"{"error":"quality_video_missing"}"#.to_string(),
    };
    let audio_path = match pick_existing_with_ext(&audio_base, &["m4a", "webm", "mp3", "opus"]) {
        Some(p) => p,
        None => return r#"{"error":"quality_audio_missing"}"#.to_string(),
    };

    let _ = app.emit("export-progress", serde_json::json!({
        "totalClips": total_clips,
        "phase": "quality_merge",
        "globalPercent": 55,
        "client_export_id": client_export_id,
    }));

    let vcodec = probe_codec_name(&video_path, "v:0").unwrap_or_else(|| "unknown".to_string());
    let acodec = probe_codec_name(&audio_path, "a:0").unwrap_or_else(|| "unknown".to_string());
    // MP4 container compatibility (for stream copy)
    let video_mp4_ok = matches!(vcodec.as_str(), "h264" | "av1" | "hevc");
    let audio_mp4_ok = matches!(acodec.as_str(), "aac");
    let force_reencode = quality_reencode_h264 || !video_mp4_ok || !audio_mp4_ok;

    let full_work = std::env::temp_dir().join(format!("klipprr_quality_full_{}.mp4", export_stamp));
    let full_str = full_work.to_string_lossy().to_string();

    let merge_dur = probe_duration_secs(&video_path).unwrap_or(0.0).max(0.001);

    let merge_status = {
        let mut args: Vec<String> = vec![
            "-i".to_string(),
            video_path.to_string_lossy().to_string(),
            "-i".to_string(),
            audio_path.to_string_lossy().to_string(),
        ];

        if !force_reencode {
            args.extend(vec![
                "-c:v".to_string(),
                "copy".to_string(),
                "-c:a".to_string(),
                "copy".to_string(),
            ]);
        } else {
            args.extend(h264_encoder_args().into_iter().map(String::from));
            args.extend(vec!["-c:a".to_string(), "aac".to_string()]);
        }

        args.extend(vec![
            "-progress".to_string(),
            "pipe:2".to_string(),
            "-nostats".to_string(),
            "-movflags".to_string(),
            "+faststart".to_string(),
            "-y".to_string(),
            full_str.clone(),
        ]);

        let mut child = match Command::new(ffmpeg_path())
            .current_dir(&base_dir)
            .args(&args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                log_to_file(&format!("[QUALITY] merge spawn failed: {:?}", e));
                // Fake a failure status by returning Err.
                return r#"{"error":"quality_merge_spawn_failed"}"#.to_string();
            }
        };

        let mut last_emit: i64 = 55;
        if let Some(stderr) = child.stderr.take() {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if let Some(ms) = parse_ffmpeg_out_time_ms(&line) {
                    let t = (ms as f64) / 1_000_000.0;
                    let frac = (t / merge_dur).clamp(0.0, 1.0);
                    let pct = (55.0 + frac * 40.0).round() as i64; // 55..95
                    if pct > last_emit {
                        last_emit = pct;
                        let _ = app.emit("export-progress", serde_json::json!({
                            "totalClips": total_clips,
                            "phase": "quality_merge",
                            "globalPercent": pct,
                            "client_export_id": client_export_id,
                        }));
                    }
                }
            }
        }

        child.wait()
    };

    if merge_status.as_ref().map(|s| s.success()).unwrap_or(false) == false {
        // Fallback: if copy merge fails for any reason, re-encode for maximum compatibility.
        let video_path_str = video_path.to_string_lossy().to_string();
        let audio_path_str = audio_path.to_string_lossy().to_string();
        let mut fallback_args: Vec<String> = vec![
            "-i".to_string(), video_path_str,
            "-i".to_string(), audio_path_str,
        ];
        fallback_args.extend(h264_encoder_args().into_iter().map(String::from));
        fallback_args.extend(vec![
            "-c:a".to_string(), "aac".to_string(),
            "-movflags".to_string(), "+faststart".to_string(),
            "-y".to_string(), full_str.clone(),
        ]);
        let _ = Command::new(ffmpeg_path())
            .current_dir(&base_dir)
            .args(&fallback_args)
            .status();
    }

    // If user wants to keep the whole video, write it to export dir at the end (after cutting clips).
    let keep_target_path: Option<PathBuf> = if keep_full {
        let title = source_title.clone().unwrap_or_else(|| "Video".to_string());
        let safe: String = title.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
        Some(unique_output_path(&base_dir, &safe))
    } else {
        None
    };

    // Clean up raw downloaded stream files and temp folder
    let _ = std::fs::remove_file(&video_path);
    let _ = std::fs::remove_file(&audio_path);
    let _ = std::fs::remove_dir_all(&quality_tmp);

    let mut results = vec![];
    let base_str = base_dir.display().to_string();

    for (i, c) in clips.iter().enumerate() {
        log_to_file(&format!("[EXPORT] quality clip_start i={}", i));
        let _ = app.emit("export-progress", serde_json::json!({
            "clipIndex": i, "totalClips": total_clips, "phase": "clip", "clipPercent": 0, "client_export_id": client_export_id
        }));
        let start = c.get("start").and_then(|x| x.as_f64()).unwrap_or(0.0);
        let end = c.get("end").and_then(|x| x.as_f64()).unwrap_or(start);
        let name = c.get("name").and_then(|x| x.as_str()).unwrap_or("clip");

        let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
        let out_path = unique_output_path(&base_dir, &safe);
        let out_str = out_path.to_string_lossy().to_string();

        let temp_out = std::env::temp_dir().join(format!("klipprr_export_{}_{}.mp4", export_stamp, i));
        let temp_out_str = temp_out.to_string_lossy().to_string();

        let status = if has_watermark {
            let wm_str = watermark_path_buf.as_ref().map(|p| p.to_string_lossy().to_string()).expect("watermark path when has_watermark");
            println!("[WM] Applying watermark (embedded)");
            println!("[WM] output = {}", out_str);

            // Stream ffmpeg stderr so we can emit progress for watermark re-encode.
            let clip_dur = (end - start).max(0.001);
            let (vw, vh) = probe_video_dims(&PathBuf::from(&full_str)).unwrap_or((1280, 720));
            let wm_w = watermark_target_width(vw, vh);
            let mut wm_args: Vec<String> = vec![
                "-ss".to_string(), format!("{:.3}", start),
                "-to".to_string(), format!("{:.3}", end),
                "-i".to_string(), full_str.clone(),
                "-loop".to_string(), "1".to_string(),
                "-i".to_string(), wm_str.clone(),
                "-filter_complex".to_string(), format!(
                    "[1:v]format=rgba,colorchannelmixer=aa=0.8,scale={wm_w}:-1[wm];\
[0:v][wm]overlay=x='max(0,W-w-32)':y='max(0,H-h-72)'"
                ),
                "-progress".to_string(), "pipe:2".to_string(),
                "-nostats".to_string(),
            ];
            wm_args.extend(h264_encoder_args().into_iter().map(String::from));
            wm_args.extend(vec![
                "-c:a".to_string(), "aac".to_string(),
                "-y".to_string(), temp_out_str.clone(),
            ]);
            let child = Command::new(ffmpeg_path())
                .current_dir(&base_dir)
                .args(&wm_args)
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn();

            match child {
                Ok(mut c) => {
                    let mut last_emitted: i64 = 0;
                    if let Some(stderr) = c.stderr.take() {
                        let reader = BufReader::new(stderr);
                        for line in reader.lines().flatten() {
                            if let Some(ms) = parse_ffmpeg_out_time_ms(&line) {
                                let t = (ms as f64) / 1_000_000.0;
                                let frac = (t / clip_dur).clamp(0.0, 1.0);
                                let pct = (frac * 99.0).round() as i64; // 0..99
                                if pct > last_emitted {
                                    last_emitted = pct;
                                    let _ = app.emit("export-progress", serde_json::json!({
                                        "clipIndex": i, "totalClips": total_clips, "phase": "encoding", "clipPercent": pct, "client_export_id": client_export_id
                                    }));
                                }
                            }
                        }
                    }
                    c.wait()
                }
                Err(e) => {
                    log_to_file(&format!("Failed to spawn ffmpeg (quality+wm): {:?}", e));
                    Err(e)
                }
            }
        } else {
            Command::new(ffmpeg_path())
                .current_dir(&base_dir)
                .args([
                    "-ss", &format!("{:.3}", start),
                    "-to", &format!("{:.3}", end),
                    "-i", &full_str,
                    "-c", "copy",
                    "-y", &temp_out_str,
                ])
                .status()
        };

        let ok = status.as_ref().map(|s| s.success()).unwrap_or(false)
            && move_temp_to_final(&temp_out, &out_path).is_ok();
        results.push(serde_json::json!({
            "index": i,
            "name": name,
            "ok": ok,
            "path": out_str
        }));
        if ok {
            log_to_file(&format!("[EXPORT] quality clip_done i={}", i));
            let _ = app.emit("export-clip-done", serde_json::json!({
                "clipIndex": i,
                "clip_name": name,
                "export_dir": base_str,
                "client_export_id": client_export_id,
            }));
        }
    }

    if let Some(keep_path) = keep_target_path {
        // Copy (or move) the merged full video into the export folder using the source title.
        // Use copy+remove (via move_temp_to_final) to avoid partial files.
        let _ = move_temp_to_final(&full_work, &keep_path);
    } else {
        let _ = fs::remove_file(&full_str);
    }

    log_to_file("[EXPORT] quality export-all-done emit");
    let _ = app.emit("export-all-done", serde_json::json!({
        "export_dir": base_str,
        "totalClips": total_clips,
        "client_export_id": client_export_id,
    }));
    serde_json::json!({ "ok": true, "results": results, "export_dir": base_str }).to_string()
}