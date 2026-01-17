use std::process::{Command, Stdio};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use serde_json::Value;
use tauri::AppHandle;
use tauri::Manager;

use crate::output::unique_output_path;
use crate::paths::{yt_dlp_path, ffmpeg_path};


pub fn handle_download_all(app: AppHandle, body: &str) -> String {
    use std::env;
    use std::fs;

    let parsed: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(e) => return format!(r#"{{"error":"bad_request","details":"{}"}}"#, e),
    };

    let url = parsed.get("url").and_then(|x| x.as_str()).unwrap_or("").to_string();
    if url.is_empty() {
        return r#"{"error":"missing_url"}"#.to_string();
    }

    let clips = parsed.get("clips").and_then(|c| c.as_array());
    if clips.is_none() || clips.unwrap().is_empty() {
        return r#"{"error":"no_clips"}"#.to_string();
    }
    let clips = clips.unwrap();

    let export_stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let mode = parsed.get("mode").and_then(|x| x.as_str()).unwrap_or("quality");
    let fast_cap = parsed.get("fast_max_height").and_then(|x| x.as_i64());
    let keep_full = parsed.get("keep_full").and_then(|x| x.as_bool()).unwrap_or(false);
    let has_watermark = parsed.get("has_watermark").and_then(|x| x.as_bool()).unwrap_or(false);

    let export_path_opt = parsed.get("export_path").and_then(|x| x.as_str());
    let _preview_url = parsed.get("preview_url").and_then(|x| x.as_str()).unwrap_or("");

    println!("[WM] has_watermark = {:?}", parsed.get("has_watermark"));

    let default_base_dir = {
        let home = env::var("HOME").unwrap_or(".".into());
        PathBuf::from(&home).join("Downloads").join("ClipTool")
    };

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

    // FAST MODE
    if mode == "speed" {
        let mut results = vec![];

        for (i, c) in clips.iter().enumerate() {
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

            let status = if has_watermark {
                println!("[WM][FAST] Watermark ENABLED — re-encoding");

                let tmp_path = std::env::temp_dir().join(format!("klipprr_wm_tmp_{}_{}.mp4", export_stamp, i));
                let tmp_str = tmp_path.to_string_lossy().to_string();

                // 1) Download clip to temp file
                let dl = Command::new(yt_dlp_path())
                    .args([
                        "-f", &format_selector,
                        "--download-sections", &format!("*{}-{}", start, end),
                        "-o", &tmp_str,
                        &url,
                    ])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status();

                if !dl.map(|s| s.success()).unwrap_or(false) {
                    println!("[WM][FAST] yt-dlp failed");
                    results.push(serde_json::json!({
                        "index": i,
                        "name": name,
                        "ok": false,
                        "reason": "yt_dlp_failed"
                    }));
                    continue;
                }

                use tauri::path::BaseDirectory;

                let watermark = app
                    .path()
                    .resolve("assets/watermark.png", BaseDirectory::Resource)
                    .expect("failed to resolve watermark");

                println!("[WM][FAST] watermark = {:?}", watermark);

                // 2) Overlay watermark → final output
                let status = Command::new(ffmpeg_path())
                    .args([
                        "-i", &tmp_str,
                        "-i", watermark.to_string_lossy().as_ref(),
                        "-filter_complex", "[1:v]scale=iw*0.35:-1[wm];[0:v][wm]overlay=W-w-30:H-h-30",
                        "-c:v", "libx264",
                        "-preset", "veryfast",
                        "-crf", "23",
                        "-c:a", "copy",
                        "-y", &out_str,
                    ])
                    .status();

                let _ = std::fs::remove_file(&tmp_path);

                status
            } else {
                println!("[FAST] No watermark — stream copy");

                Command::new(yt_dlp_path())
                    .args([
                        "-f", &format_selector,
                        "--download-sections", &format!("*{}-{}", start, end),
                        "-o", &out_str,
                        &url,
                    ])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
            };

            match status {
                Ok(s) if s.success() => results.push(serde_json::json!({
                    "index": i,
                    "name": name,
                    "ok": true,
                    "path": out_str
                })),
                _ => results.push(serde_json::json!({
                    "index": i,
                    "name": name,
                    "ok": false
                })),
            }
        }

        return serde_json::json!({ "ok": true, "results": results }).to_string();
    }

    // QUALITY MODE (existing behavior)
    let full_path = base_dir.join(format!("source_full_{}.mp4", export_stamp));
    let full_str = full_path.to_string_lossy().to_string();

    let video_tmp = base_dir.join(format!("video_{}.mp4", export_stamp));
    let audio_tmp = base_dir.join(format!("audio_{}.m4a", export_stamp));

    let _ = Command::new(yt_dlp_path())
        .args(["-f", "bv*[ext=mp4]/bv*", "-o", &video_tmp.to_string_lossy(), &url])
        .status();

    let _ = Command::new(yt_dlp_path())
        .args(["-f", "ba[ext=m4a]/ba", "-o", &audio_tmp.to_string_lossy(), &url])
        .status();

    let _ = Command::new(ffmpeg_path())
        .args([
            "-i", &video_tmp.to_string_lossy(),
            "-i", &audio_tmp.to_string_lossy(),
            "-c:v", "copy",
            "-c:a", "aac",
            "-y", &full_str,
        ])
        .status();

    let mut results = vec![];

    for (i, c) in clips.iter().enumerate() {
        let start = c.get("start").and_then(|x| x.as_f64()).unwrap_or(0.0);
        let end = c.get("end").and_then(|x| x.as_f64()).unwrap_or(start);
        let name = c.get("name").and_then(|x| x.as_str()).unwrap_or("clip");

        let safe: String = name.chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '_' }).collect();
        let out_path = unique_output_path(&base_dir, &safe);
        let out_str = out_path.to_string_lossy().to_string();

        let status = if has_watermark {
            use tauri::path::BaseDirectory;

            let watermark = app
                .path()
                .resolve("assets/watermark.png", BaseDirectory::Resource)
                .expect("failed to resolve watermark");

            println!("[WM] Applying watermark");
            println!("[WM] watermark path = {:?}", watermark);
            println!("[WM] watermark exists = {}", watermark.exists());
            println!("[WM] output = {}", out_str);

            Command::new(ffmpeg_path())
                .args([
                    "-ss", &format!("{:.3}", start),
                    "-to", &format!("{:.3}", end),
                    "-i", &full_str,
                    "-i", watermark.to_string_lossy().as_ref(),
                    "-filter_complex", "[1:v]scale=iw*0.35:-1[wm];[0:v][wm]overlay=W-w-30:H-h-30",
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-crf", "23",
                    "-c:a", "copy",
                    "-y", &out_str,
                ])
                .status()
        } else {
            Command::new(ffmpeg_path())
                .args([
                    "-ss", &format!("{:.3}", start),
                    "-to", &format!("{:.3}", end),
                    "-i", &full_str,
                    "-c", "copy",
                    "-y", &out_str,
                ])
                .status()
        };

        results.push(serde_json::json!({
            "index": i,
            "name": name,
            "ok": status.map(|s| s.success()).unwrap_or(false),
            "path": out_str
        }));
    }

    if !keep_full {
        let _ = fs::remove_file(&full_str);
    }

    serde_json::json!({ "ok": true, "results": results }).to_string()
}