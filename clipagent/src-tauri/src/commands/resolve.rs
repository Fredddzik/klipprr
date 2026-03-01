use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use serde_json::Value;
use urlencoding::decode;

use crate::paths::yt_dlp_path;

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

    log_to_file("[RESOLVE] starting");
    log_to_file(&format!("[RESOLVE] yt_dlp_path: {}", yt_dlp_exe_str));
    log_to_file(&format!("[RESOLVE] args: {} {} {} {}", arg0, arg1, arg2, decoded_url));

    let output = Command::new(&yt_dlp_exe)
        .args([arg0, arg1, arg2, decoded_url.as_str()])
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
        "[RESOLVE] stdout (first 2000): {}",
        stdout_sample.chars().take(2000).collect::<String>()
    ));
    log_to_file(&format!(
        "[RESOLVE] stderr (first 2000): {}",
        stderr_sample.chars().take(2000).collect::<String>()
    ));

    let stdout_raw = stdout_sample.trim().to_string();
    let stderr_raw = stderr_sample.to_string();

    if !out.status.success() {
        return format!(
            r#"{{"error":"yt_dlp_failed","status":"{}","stderr":"{}"}}"#,
            out.status, stderr_raw
        );
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

    let mut fast_export_heights: Vec<i64> = formats
        .iter()
        .filter(|f| {
            f["vcodec"] != "none"
                && f["ext"].as_str() == Some("mp4")
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

    let true_max_requires_reencode = any_video
        .last()
        .and_then(|(f, _)| f["ext"].as_str())
        .map(|ext| ext != "mp4")
        .unwrap_or(false);

    let mut progressive: Vec<&Value> = formats
        .iter()
        .filter(|f| {
            f["acodec"] != "none"
                && f["vcodec"] != "none"
                && f["ext"].as_str() == Some("mp4")
                && f["vcodec"]
                    .as_str()
                    .map(|v| v.starts_with("avc1"))
                    .unwrap_or(false)
                && f["height"].as_i64().unwrap_or(0) > 0
        })
        .collect();

    progressive.sort_by_key(|f| f["height"].as_i64().unwrap_or(0));

    let best_preview = progressive
        .iter()
        .rev()
        .find(|f| f["height"].as_i64().unwrap_or(0) <= 1080)
        .copied()
        .or_else(|| progressive.last().copied());

    let preview_url = best_preview
        .and_then(|f| f["url"].as_str())
        .unwrap_or("")
        .to_string();

    if preview_url.is_empty() {
        return r#"{"error":"no_progressive_preview"}"#.to_string();
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
            "url": preview_url
        },
        "capabilities": {
            "fast_max_height": fast_max_height,
            "true_max_height": true_max_height,
            "true_max_requires_reencode": true_max_requires_reencode
        }
    });

    result.to_string()
}