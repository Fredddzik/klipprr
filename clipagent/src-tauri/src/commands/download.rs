use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use serde_json::Value;
use tauri::AppHandle;
use tauri::Manager;
use std::os::unix::process::ExitStatusExt;

use crate::output::unique_output_path;
use crate::paths::{yt_dlp_path, ffmpeg_path};

/// Returns the default export directory path (e.g. ~/Downloads) for the UI to display.
#[tauri::command]
pub fn get_default_export_dir() -> String {
    dirs::download_dir()
        .unwrap_or_else(std::env::temp_dir)
        .display()
        .to_string()
}

fn log_to_file(msg: &str) {
    if let Some(mut dir) = dirs::home_dir() {
        dir.push("Library/Logs/ClipAgent/clipagent.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(dir) {
            let _ = writeln!(file, "{}", msg);
        }
    }
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

            let status = {
                let needs_reencode = has_watermark || codec == "universal";

                if needs_reencode {
                    println!("[FAST] Re-encoding (watermark or universal codec)");

                    let tmp_path = std::env::temp_dir()
                        .join(format!("klipprr_wm_tmp_{}_{}.mp4", export_stamp, i));
                    let tmp_str = tmp_path.to_string_lossy().to_string();

                    // 1) Download clip to temp file
                    let dl_output = Command::new(yt_dlp_path())
                        .current_dir(&base_dir)
                        .args([
                            "-f", &format_selector,
                            "--download-sections", &format!("*{}-{}", start, end),
                            "--ffmpeg-location", ffmpeg_path().to_str().unwrap(),
                            "-o", tmp_str.as_str(),
                            &url,
                        ])
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

                    use tauri::path::BaseDirectory;

                    let watermark = app
                        .path()
                        .resolve("assets/watermark.png", BaseDirectory::Resource)
                        .expect("failed to resolve watermark");

                    let watermark_str = watermark.to_string_lossy().to_string();

                    let mut ffmpeg_args = vec![
                        "-i".to_string(),
                        tmp_str.clone(),
                    ];

                    if has_watermark {
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
                        out_str.clone(),
                    ]);

                    let ffmpeg_output = Command::new(ffmpeg_path())
                        .current_dir(&base_dir)
                        .args(&ffmpeg_args)
                        .output();

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

                    let _ = std::fs::remove_file(&tmp_path);

                    if success {
                        Ok(std::process::ExitStatus::from_raw(0))
                    } else {
                        Err(std::io::Error::new(std::io::ErrorKind::Other, "ffmpeg_failed"))
                    }
                } else {
                    println!("[FAST] Original codec — stream copy");

                    match Command::new(yt_dlp_path())
                        .current_dir(&base_dir)
                        .args([
                            "-f", &format_selector,
                            "--download-sections", &format!("*{}-{}", start, end),
                            "--ffmpeg-location", ffmpeg_path().to_str().unwrap(),
                            "-o", &out_str,
                            &url,
                        ])
                        .output()
                    {
                        Ok(o) => {
                            log_to_file(&format!("yt-dlp status: {:?}", o.status));
                            log_to_file(&format!("yt-dlp stdout: {}", String::from_utf8_lossy(&o.stdout)));
                            log_to_file(&format!("yt-dlp stderr: {}", String::from_utf8_lossy(&o.stderr)));
                            Ok(o.status)
                        }
                        Err(e) => {
                            log_to_file(&format!("yt-dlp spawn error: {}", e));
                            Err(e)
                        }
                    }
                }
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
        .current_dir(&base_dir)
        .args(["-f", "bv*[ext=mp4]/bv*", "-o", &video_tmp.to_string_lossy(), &url])
        .status();

    let _ = Command::new(yt_dlp_path())
        .current_dir(&base_dir)
        .args(["-f", "ba[ext=m4a]/ba", "-o", &audio_tmp.to_string_lossy(), &url])
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
                .current_dir(&base_dir)
                .args([
                    "-ss", &format!("{:.3}", start),
                    "-to", &format!("{:.3}", end),
                    "-i", &full_str,
                    "-i", watermark.to_string_lossy().as_ref(),
                    "-filter_complex", "[1:v]scale=iw*0.35:-1[wm];[0:v][wm]overlay=W-w-30:H-h-30",
                    "-c:v", "h264_videotoolbox",
                    "-pix_fmt", "yuv420p",
                    "-b:v", "6M",
                    "-c:a", "aac",
                    "-y", &out_str,
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