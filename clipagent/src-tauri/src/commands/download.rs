use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use serde_json::Value;
use tauri::AppHandle;
#[cfg(unix)]
use std::os::unix::process::ExitStatusExt;
#[cfg(windows)]
use std::os::windows::process::ExitStatusExt;

use crate::output::{unique_output_path, unique_output_path_with_ext};
use crate::paths::{running_from_sandboxed_app, yt_dlp_path, ffmpeg_path, ffprobe_path, yt_dlp_cookies_browser};
use crate::storage;
use tauri::Emitter;

/// Watermark image embedded at build time so it cannot be removed or replaced from the app bundle.
static EMBEDDED_WATERMARK: &[u8] = include_bytes!("../../assets/watermark.png");

/// If not sandboxed, returns [\"--cookies-from-browser\", browser]; otherwise [] so we don't hit "Operation not permitted" on cookie access.
fn yt_dlp_cookie_args() -> Vec<&'static str> {
    if running_from_sandboxed_app() {
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

/// Get duration and video codec of a local file via ffprobe (for local file load + same-format export).
#[tauri::command]
pub fn get_local_video_info(path: String) -> Result<(f64, Option<String>), String> {
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

    Ok((duration, codec_name))
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

    let url = parsed.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string();
    let local_path_opt = parsed.get("local_path").and_then(|x| x.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());

    let clips = parsed.get("clips").and_then(|c| c.as_array());
    if clips.is_none() || clips.unwrap().is_empty() {
        return r#"{"error":"no_clips"}"#.to_string();
    }
    let clips = clips.unwrap();
    let total_clips = clips.len();
    let _ = app.emit("export-progress", serde_json::json!({
        "totalClips": total_clips,
        "phase": "starting"
    }));

    let export_stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let mode = parsed.get("mode").and_then(|x| x.as_str()).unwrap_or("quality");
    let fast_cap = parsed.get("fast_max_height").and_then(|x| x.as_i64());
    let keep_full = parsed.get("keep_full").and_then(|x| x.as_bool()).unwrap_or(false);
    let has_watermark = parsed.get("has_watermark").and_then(|x| x.as_bool()).unwrap_or(false);

    let watermark_path_buf = if has_watermark {
        watermark_path_for_export(export_stamp).ok()
    } else {
        None
    };
    let codec = parsed.get("codec").and_then(|x| x.as_str()).unwrap_or("universal");

    let export_path_opt = parsed.get("export_path").and_then(|x| x.as_str());
    let _preview_url = parsed.get("preview_url").and_then(|x| x.as_str()).unwrap_or("");

    println!("[WM] has_watermark = {:?}", parsed.get("has_watermark"));

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

    // -------- LOCAL FILE SOURCE: no yt-dlp, ffmpeg only, same format (stream copy unless watermark or lower quality) --------
    if let Some(ref local_path_str) = local_path_opt {
        let local_path = PathBuf::from(local_path_str);
        if !local_path.is_file() {
            return r#"{"error":"local_file_not_found"}"#.to_string();
        }
        let ext = local_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("mp4");
        let local_str = local_path.to_string_lossy().to_string();
        let base_str = base_dir.display().to_string();

        let source_codec = Command::new(ffprobe_path())
            .args([
                "-v", "error", "-select_streams", "v:0",
                "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1",
                local_str.as_str(),
            ])
            .output()
            .ok()
            .and_then(|o| {
                let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
                if s.is_empty() { None } else { Some(s) }
            });

        let mut results = vec![];
        for (i, c) in clips.iter().enumerate() {
            let _ = app.emit("export-progress", serde_json::json!({
                "clipIndex": i, "totalClips": total_clips, "phase": "clip"
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

            let (success, written_path) = if has_watermark {
                let wm_str = watermark_path_buf.as_ref().map(|p| p.to_string_lossy().to_string()).expect("watermark path when has_watermark");
                let is_av1 = source_codec.as_deref() == Some("av1");
                let (vcodec, pix_fmt, out_ext) = if is_av1 {
                    ("libaom-av1", "yuv420p", "webm")
                } else {
                    ("h264_videotoolbox", "yuv420p", ext)
                };
                let out_path_wm = if out_ext != ext {
                    unique_output_path_with_ext(&base_dir, &safe, out_ext)
                } else {
                    out_path.clone()
                };
                let temp_wm = std::env::temp_dir().join(format!("klipprr_export_{}_{}.{}", export_stamp, i, out_ext));
                let temp_str_wm = temp_wm.to_string_lossy().to_string();
                let ok = Command::new(ffmpeg_path())
                    .current_dir(&base_dir)
                    .args([
                        "-ss", &format!("{:.3}", start),
                        "-to", &format!("{:.3}", end),
                        "-i", &local_str,
                        "-i", &wm_str,
                        "-filter_complex", "[1:v]scale=iw*0.35:-1[wm];[0:v][wm]overlay=W-w-30:H-h-30",
                        "-c:v", vcodec,
                        "-pix_fmt", pix_fmt,
                        "-b:v", if is_av1 { "2M" } else { "6M" },
                        "-c:a", if is_av1 { "libopus" } else { "aac" },
                        "-y", &temp_str_wm,
                    ])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false);
                let ok = ok && move_temp_to_final(&temp_wm, &out_path_wm).is_ok();
                (ok, out_path_wm.to_string_lossy().to_string())
            } else if let Some(h) = fast_cap {
                let h = h as i32;
                let temp_path = std::env::temp_dir().join(format!("klipprr_export_{}_{}.{}", export_stamp, i, ext));
                let temp_str = temp_path.to_string_lossy().to_string();
                let ok = Command::new(ffmpeg_path())
                    .current_dir(&base_dir)
                    .args([
                        "-ss", &format!("{:.3}", start),
                        "-to", &format!("{:.3}", end),
                        "-i", &local_str,
                        "-vf", &format!("scale=-2:min({},ih)", h),
                        "-c:v", "h264_videotoolbox",
                        "-pix_fmt", "yuv420p",
                        "-c:a", "aac",
                        "-y", &temp_str,
                    ])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false);
                let ok = ok && move_temp_to_final(&temp_path, &out_path).is_ok();
                (ok, out_str.clone())
            } else {
                let temp_path = std::env::temp_dir().join(format!("klipprr_export_{}_{}.{}", export_stamp, i, ext));
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
                (ok, out_str.clone())
            };

            if success {
                results.push(serde_json::json!({"index": i, "name": name, "ok": true, "path": written_path}));
                let _ = app.emit("export-clip-done", serde_json::json!({"clip_name": name, "export_dir": base_str}));
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
        let mut results = vec![];
        let base_str = base_dir.display().to_string();

        for (i, c) in clips.iter().enumerate() {
            let _ = app.emit("export-progress", serde_json::json!({
                "clipIndex": i, "totalClips": total_clips, "phase": "clip"
            }));
            let start = c.get("start").and_then(|x| x.as_f64()).unwrap_or(0.0);
            let end = c.get("end").and_then(|x| x.as_f64()).unwrap_or(start);
            let name = c.get("name").and_then(|x| x.as_str()).unwrap_or("clip");

            if end <= start {
                results.push(serde_json::json!({
                    "index": i,
                    "name": name,
                    "ok": false,
                    "reason": "invalid_range"
                }));
                continue;
            }

            let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
            let out_path = unique_output_path(&base_dir, &safe);
            let out_str = out_path.to_string_lossy().to_string();

            let format_selector = match fast_cap {
                Some(h) => format!("bv*[ext=mp4][height<={}] + ba[ext=m4a]/best", h),
                None => "bv*[ext=mp4]+ba[ext=m4a]/best".to_string(),
            };

            let status = {
                let needs_reencode = has_watermark || codec == "universal";

                if needs_reencode {
                    println!("[FAST] Re-encoding (watermark or universal codec)");

                    let tmp_path = std::env::temp_dir()
                        .join(format!("klipprr_wm_tmp_{}_{}.mp4", export_stamp, i));
                    let tmp_str = tmp_path.to_string_lossy().to_string();

                    // 1) Download clip to temp file (use browser cookies when not sandboxed)
                    let section_range = format!("*{}-{}", start, end);
                    let ffmpeg_str = ffmpeg_path().to_string_lossy().into_owned();
                    let mut dl_args: Vec<&str> = yt_dlp_cookie_args();
                    dl_args.extend([
                        "-f",
                        &format_selector,
                        "--download-sections",
                        &section_range,
                        "--ffmpeg-location",
                        &ffmpeg_str,
                        "-o",
                        tmp_str.as_str(),
                        &url,
                    ]);
                    let dl_output = Command::new(yt_dlp_path())
                        .current_dir(&base_dir)
                        .args(&dl_args)
                        .output();

                    let dl_success = match dl_output {
                        Ok(o) => {
                            log_to_file(&format!("yt-dlp status: {:?}", o.status));
                            log_to_file(&format!("yt-dlp stdout: {}", String::from_utf8_lossy(&o.stdout)));
                            log_to_file(&format!("yt-dlp stderr: {}", String::from_utf8_lossy(&o.stderr)));
                            o.status.success()
                        }
                        Err(e) => {
                            log_to_file(&format!("yt-dlp spawn error: {}", e));
                            false
                        }
                    };

                    if !dl_success {
                        println!("[FAST] yt-dlp failed");
                        results.push(serde_json::json!({
                            "index": i,
                            "name": name,
                            "ok": false,
                            "reason": "yt_dlp_failed"
                        }));
                        continue;
                    }

                    // Newer yt-dlp may leave the merged file as .part; rename to expected path so ffmpeg can read it
                    if !tmp_path.exists() {
                        let part_path = PathBuf::from(format!("{}.part", tmp_path.display()));
                        if part_path.exists() {
                            let _ = std::fs::rename(&part_path, &tmp_path);
                            log_to_file(&format!("[FAST] renamed yt-dlp .part to {}", tmp_path.display()));
                        }
                    }

                    // Write ffmpeg output to temp, then move to final path when done
                    let out_temp = std::env::temp_dir()
                        .join(format!("klipprr_export_{}_{}.mp4", export_stamp, i));
                    let out_temp_str = out_temp.to_string_lossy().to_string();

                    let mut ffmpeg_args = vec![
                        "-i".to_string(),
                        tmp_str.clone(),
                    ];

                    if has_watermark {
                        let watermark_str = watermark_path_buf.as_ref().map(|p| p.to_string_lossy().to_string()).expect("watermark path when has_watermark");
                        ffmpeg_args.extend(vec![
                            "-i".to_string(),
                            watermark_str,
                            "-filter_complex".to_string(),
                            "[1:v]scale=iw*0.35:-1[wm];[0:v][wm]overlay=W-w-30:H-h-30".to_string(),
                        ]);
                    }

                    ffmpeg_args.extend(vec![
                        "-c:v".to_string(),
                        "h264_videotoolbox".to_string(),
                        "-pix_fmt".to_string(),
                        "yuv420p".to_string(),
                        "-b:v".to_string(),
                        "6M".to_string(),
                        "-c:a".to_string(),
                        "aac".to_string(),
                        "-y".to_string(),
                        out_temp_str.clone(),
                    ]);

                    let ffmpeg_output = Command::new(ffmpeg_path())
                        .current_dir(&base_dir)
                        .args(&ffmpeg_args)
                        .output();

                    let _ = std::fs::remove_file(&tmp_path);

                    let success = match ffmpeg_output {
                        Ok(o) => {
                            log_to_file(&format!("ffmpeg status: {:?}", o.status));
                            log_to_file(&format!("ffmpeg stdout: {}", String::from_utf8_lossy(&o.stdout)));
                            log_to_file(&format!("ffmpeg stderr: {}", String::from_utf8_lossy(&o.stderr)));
                            o.status.success()
                        }
                        Err(e) => {
                            log_to_file(&format!("Failed to spawn ffmpeg: {:?}", e));
                            false
                        }
                    };

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

                    let section_range = format!("*{}-{}", start, end);
                    let ffmpeg_str = ffmpeg_path().to_string_lossy().into_owned();
                    let mut dl_args: Vec<&str> = yt_dlp_cookie_args();
                    dl_args.extend([
                        "-f",
                        &format_selector,
                        "--download-sections",
                        &section_range,
                        "--ffmpeg-location",
                        &ffmpeg_str,
                        "-o",
                        &temp_out_str,
                        &url,
                    ]);
                    match Command::new(yt_dlp_path())
                        .current_dir(&base_dir)
                        .args(&dl_args)
                        .output()
                    {
                        Ok(o) => {
                            log_to_file(&format!("yt-dlp status: {:?}", o.status));
                            log_to_file(&format!("yt-dlp stdout: {}", String::from_utf8_lossy(&o.stdout)));
                            log_to_file(&format!("yt-dlp stderr: {}", String::from_utf8_lossy(&o.stderr)));
                            // Newer yt-dlp may leave the merged file as .part; use it if final path is missing
                            if !temp_out.exists() {
                                let part_path = PathBuf::from(format!("{}.part", temp_out.display()));
                                if part_path.exists() {
                                    let _ = std::fs::rename(&part_path, &temp_out);
                                    log_to_file(&format!("[FAST] renamed yt-dlp .part to {}", temp_out.display()));
                                }
                            }
                            if o.status.success() {
                                let move_ok = move_temp_to_final(&temp_out, &out_path).is_ok();
                                if !move_ok {
                                    log_to_file(&format!("[FAST] move to final failed, clip left at {}", temp_out.display()));
                                }
                                Ok((o.status, if move_ok { None } else { Some(temp_out_str) }))
                            } else {
                                let _ = std::fs::remove_file(&temp_out);
                                Err(std::io::Error::new(std::io::ErrorKind::Other, "move_failed"))
                            }
                        }
                        Err(e) => {
                            log_to_file(&format!("yt-dlp spawn error: {}", e));
                            Err(e)
                        }
                    }
                }
            };

            match status {
                Ok((s, fallback_path)) if s.success() => {
                    let path: String = fallback_path.unwrap_or_else(|| out_str.clone());
                    results.push(serde_json::json!({
                        "index": i,
                        "name": name,
                        "ok": true,
                        "path": path
                    }));
                    let _ = app.emit("export-clip-done", serde_json::json!({
                        "clip_name": name,
                        "export_dir": base_str,
                    }));
                }
                _ => results.push(serde_json::json!({
                    "index": i,
                    "name": name,
                    "ok": false
                })),
            }
        }

        let _ = app.emit("export-all-done", serde_json::json!({
            "export_dir": base_str,
            "totalClips": total_clips,
        }));
        return serde_json::json!({ "ok": true, "results": results, "export_dir": base_str }).to_string();
    }

    // QUALITY MODE (existing behavior)
    let full_path = base_dir.join(format!("source_full_{}.mp4", export_stamp));
    let full_str = full_path.to_string_lossy().to_string();

    let video_tmp = base_dir.join(format!("video_{}.mp4", export_stamp));
    let audio_tmp = base_dir.join(format!("audio_{}.m4a", export_stamp));

    let video_tmp_str = video_tmp.to_string_lossy().into_owned();
    let mut video_args: Vec<&str> = yt_dlp_cookie_args();
    video_args.extend([
        "-f",
        "bv*[ext=mp4]/bv*",
        "-o",
        &video_tmp_str,
        &url,
    ]);
    let _ = Command::new(yt_dlp_path())
        .current_dir(&base_dir)
        .args(&video_args)
        .status();

    let audio_tmp_str = audio_tmp.to_string_lossy().into_owned();
    let mut audio_args: Vec<&str> = yt_dlp_cookie_args();
    audio_args.extend([
        "-f",
        "ba[ext=m4a]/ba",
        "-o",
        &audio_tmp_str,
        &url,
    ]);
    let _ = Command::new(yt_dlp_path())
        .current_dir(&base_dir)
        .args(&audio_args)
        .status();

    let _ = Command::new(ffmpeg_path())
        .current_dir(&base_dir)
        .args([
            "-i", &video_tmp.to_string_lossy(),
            "-i", &audio_tmp.to_string_lossy(),
            "-c:v", "copy",
            "-c:a", "aac",
            "-y", &full_str,
        ])
        .status();

    let mut results = vec![];
    let base_str = base_dir.display().to_string();

    for (i, c) in clips.iter().enumerate() {
        let _ = app.emit("export-progress", serde_json::json!({
            "clipIndex": i, "totalClips": total_clips, "phase": "clip"
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

            Command::new(ffmpeg_path())
                .current_dir(&base_dir)
                .args([
                    "-ss", &format!("{:.3}", start),
                    "-to", &format!("{:.3}", end),
                    "-i", &full_str,
                    "-i", &wm_str,
                    "-filter_complex", "[1:v]scale=iw*0.35:-1[wm];[0:v][wm]overlay=W-w-30:H-h-30",
                    "-c:v", "h264_videotoolbox",
                    "-pix_fmt", "yuv420p",
                    "-b:v", "6M",
                    "-c:a", "aac",
                    "-y", &temp_out_str,
                ])
                .status()
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
            let _ = app.emit("export-clip-done", serde_json::json!({
                "clip_name": name,
                "export_dir": base_str,
            }));
        }
    }

    if !keep_full {
        let _ = fs::remove_file(&full_str);
    }

    let _ = app.emit("export-all-done", serde_json::json!({
        "export_dir": base_str,
        "totalClips": total_clips,
    }));
    serde_json::json!({ "ok": true, "results": results, "export_dir": base_str }).to_string()
}