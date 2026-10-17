//! ffmpeg and ffprobe helpers for the export pipeline: encoder flags, probing, watermark
//! sizing and moving finished files into place.

use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::download::log_to_file;
use crate::paths::{ffmpeg_path, ffprobe_path};

/// Watermark image embedded at build time so it cannot be removed or replaced from the app bundle.
pub(super) static EMBEDDED_WATERMARK: &[u8] = include_bytes!("../../assets/watermark.png");

/// Returns a path to the watermark image for ffmpeg. Always uses the embedded asset so deleting
/// or replacing assets/watermark.png in the bundle has no effect. Writes to a temp file per export run.
pub(super) fn watermark_path_for_export(export_stamp: u128) -> Result<PathBuf, String> {
    let temp = std::env::temp_dir().join(format!("klipprr_watermark_{}.png", export_stamp));
    std::fs::write(&temp, EMBEDDED_WATERMARK).map_err(|e| e.to_string())?;
    Ok(temp)
}

/// Which optional `h264_videotoolbox` tuning options the bundled ffmpeg understands.
///
/// These options were added in different ffmpeg releases (`-prio_speed` in 6.0,
/// `-power_efficient` in 6.1). Passing one the binary does not know is not a warning — it
/// aborts the whole command with "Error splitting the argument list: Option not found",
/// so a hard-coded list turns every macOS export into a failure the moment the bundled
/// ffmpeg is swapped for an older build. Ask the binary instead of assuming.
#[cfg(target_os = "macos")]
pub(super) fn videotoolbox_supported_options() -> &'static (bool, bool) {
    static SUPPORTED: std::sync::OnceLock<(bool, bool)> = std::sync::OnceLock::new();
    SUPPORTED.get_or_init(|| {
        let help = std::process::Command::new(ffmpeg_path())
            .args(["-hide_banner", "-h", "encoder=h264_videotoolbox"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).into_owned())
            .unwrap_or_default();
        let prio = help.contains("-prio_speed");
        let power = help.contains("-power_efficient");
        log_to_file(&format!(
            "[FFMPEG] videotoolbox options: prio_speed={} power_efficient={}",
            prio, power
        ));
        (prio, power)
    })
}

/// The subset of `-prio_speed` / `-power_efficient` this ffmpeg actually accepts, ready to
/// splice into a videotoolbox command line. Shared with the preview proxy encoder in http.rs.
#[cfg(target_os = "macos")]
pub fn videotoolbox_speed_args() -> Vec<&'static str> {
    let (prio, power) = *videotoolbox_supported_options();
    let mut args: Vec<&'static str> = Vec::new();
    if prio {
        args.extend(["-prio_speed", "1"]);
    }
    if power {
        args.extend(["-power_efficient", "0"]);
    }
    args
}

/// Full H.264 encoder args tuned for speed on the target platform.
/// macOS: h264_videotoolbox with power/speed hints that default to "auto" on battery
/// and can cap throughput at real-time; forcing prio_speed=1 and power_efficient=0 lifts
/// the cap to 5–15x realtime on Apple Silicon. Both hints are optional — see above.
/// Windows/Linux: libx264 with veryfast preset.
pub(super) fn h264_encoder_args() -> Vec<&'static str> {
    #[cfg(target_os = "macos")]
    {
        let mut args = vec!["-c:v", "h264_videotoolbox"];
        args.extend(videotoolbox_speed_args());
        args.extend(["-pix_fmt", "yuv420p", "-b:v", "6M"]);
        args
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

/// Probe a single codec name (e.g. "h264", "aac", "av1") for the given stream.
pub(super) fn probe_codec_name(path: &Path, stream: &str) -> Option<String> {
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
pub(super) fn can_stream_copy_to_mp4(path: &Path, has_watermark: bool) -> bool {
    if has_watermark {
        return false;
    }
    let vcodec = probe_codec_name(path, "v:0");
    let acodec = probe_codec_name(path, "a:0");
    matches!(vcodec.as_deref(), Some("h264")) && matches!(acodec.as_deref(), Some("aac"))
}

pub(super) fn parse_ffmpeg_out_time_ms(line: &str) -> Option<i64> {
    // When using `-progress pipe:2`, ffmpeg prints lines like:
    // out_time_ms=12345678
    if let Some(rest) = line.strip_prefix("out_time_ms=") {
        return rest.trim().parse::<i64>().ok();
    }
    None
}

/// `time=00:01:02.50` from ffmpeg's stats line, in seconds. yt-dlp runs ffmpeg for
/// `--download-sections`, and that is the only progress it reports for them.
pub(super) fn parse_ffmpeg_stats_time(line: &str) -> Option<f64> {
    let t = line.split("time=").nth(1)?.split_whitespace().next()?;
    let mut parts = t.split(':');
    let (h, m, s) = (parts.next()?, parts.next()?, parts.next()?);
    Some(h.parse::<f64>().ok()? * 3600.0 + m.parse::<f64>().ok()? * 60.0 + s.parse::<f64>().ok()?)
}

pub(super) fn pick_existing_with_ext(base: &Path, exts: &[&str]) -> Option<PathBuf> {
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

pub(super) fn probe_duration_secs(path: &Path) -> Option<f64> {
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

pub(super) fn probe_video_dims(path: &Path) -> Option<(i64, i64)> {
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

pub(super) fn watermark_target_width(video_w: i64, video_h: i64) -> i64 {
    // Classic watermark behavior: preserve watermark AR; size relative to video width with caps.
    let vertical = video_h > video_w;
    let frac = if vertical { 0.38_f64 } else { 0.18_f64 };
    let raw = (video_w as f64 * frac).round() as i64;
    raw.clamp(140, 320)
}

/// Move temp file to final path so the file appears in the user's folder only when fully complete.
pub(super) fn move_temp_to_final(temp_path: &Path, final_path: &Path) -> io::Result<()> {
    std::fs::rename(temp_path, final_path).or_else(|_| {
        std::fs::copy(temp_path, final_path)?;
        std::fs::remove_file(temp_path)
    })
}
