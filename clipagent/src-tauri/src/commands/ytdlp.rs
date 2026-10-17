//! Running yt-dlp for exports: flags, progress parsing, and retrying refused downloads.

use std::io::Read;
use std::process::{Command, Stdio};

use super::download::log_to_file;
use super::media::parse_ffmpeg_stats_time;
use crate::export_control;
use crate::paths::{running_from_sandboxed_app, skip_browser_cookies_for_yt_dlp, yt_dlp_cookies_browser};

/// If not sandboxed and not skipping cookies (e.g. Windows DPAPI), returns [\"--cookies-from-browser\", browser]; otherwise [].
pub(super) fn yt_dlp_cookie_args() -> Vec<&'static str> {
    if running_from_sandboxed_app() || skip_browser_cookies_for_yt_dlp() {
        vec![]
    } else {
        vec!["--cookies-from-browser", yt_dlp_cookies_browser()]
    }
}

/// yt-dlp flags that improve throughput on DASH/HLS sources (YouTube, Twitch Clips).
/// Progressive HTTP sources (IG, X) ignore these.
pub(super) fn yt_dlp_speed_args() -> &'static [&'static str] {
    &["--concurrent-fragments", "4"]
}

pub(super) fn parse_ytdlp_progress_pct(line: &str) -> Option<f32> {
    // [download]  45.2% of 123.45MiB at 2.34MiB/s ETA 00:30
    let rest = line.trim().strip_prefix("[download]")?.trim_start();
    let pct_str = rest.split('%').next()?.trim();
    pct_str.parse::<f32>().ok().filter(|&p| p >= 0.0 && p <= 100.0)
}

/// Waits between attempts when a download is refused. YouTube's 403s come in bursts of
/// 20-30 seconds (two exports in a row refused, the next one fine), so the waits grow.
pub(super) const YTDLP_RETRY_DELAYS_SECS: [u64; 2] = [3, 10];

/// Failures that another attempt will not fix. Everything else (403, 429, 5xx, timeouts,
/// dropped connections) is retried, since yt-dlp extracts fresh stream URLs every run.
pub(super) fn ytdlp_failure_is_permanent(stderr: &str) -> bool {
    const PERMANENT: [&str; 10] = [
        "Private video",
        "Video unavailable",
        "This video is not available",
        "Sign in to confirm your age",
        "members-only",
        "Join this channel",
        "Requested format is not available",
        "Unsupported URL",
        "This live event will begin",
        "No video formats found",
    ];
    PERMANENT.iter().any(|m| stderr.contains(m))
}

/// Sleeps for `secs`, waking early if the clip is cancelled. Returns false when cancelled.
pub(super) fn wait_unless_cancelled(job: export_control::Job, secs: u64) -> bool {
    let end = std::time::Instant::now() + std::time::Duration::from_secs(secs);
    while std::time::Instant::now() < end {
        if export_control::is_cancelled(job) {
            return false;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    !export_control::is_cancelled(job)
}

/// Spawn yt-dlp with stderr piped, calling `on_progress(pct)` with 0.0..=100.0 as it
/// works. Returns (success, stderr_string) after the process exits.
///
/// `section_secs` is the section length for `--download-sections` downloads: those print
/// no percentage at all, only ffmpeg's `time=` position, which is turned into one here.
/// The process is tracked under `job` so a cancel can stop it.
///
/// A refused or dropped download is tried up to three times in all; the stderr returned
/// is the last attempt's.
pub(super) fn run_ytdlp_with_progress<F>(
    cmd: &mut Command,
    job: export_control::Job,
    section_secs: Option<f64>,
    mut on_progress: F,
) -> (bool, String)
where
    F: FnMut(f32),
{
    let mut attempt = 0;
    loop {
        let (ok, stderr) = run_ytdlp_once(cmd, job, section_secs, &mut on_progress);
        if ok || stderr.is_empty() || export_control::is_cancelled(job) || ytdlp_failure_is_permanent(&stderr) {
            return (ok, stderr);
        }
        let Some(&delay) = YTDLP_RETRY_DELAYS_SECS.get(attempt) else {
            return (ok, stderr);
        };
        attempt += 1;
        let tail: String = stderr.lines().rev().take(3).collect::<Vec<_>>().join(" | ");
        log_to_file(&format!("[RETRY] yt-dlp attempt {} failed, retrying in {}s: {}", attempt, delay, tail.chars().take(300).collect::<String>()));
        if !wait_unless_cancelled(job, delay) {
            return (false, "cancelled".to_string());
        }
    }
}

pub(super) fn run_ytdlp_once<F>(
    cmd: &mut Command,
    job: export_control::Job,
    section_secs: Option<f64>,
    on_progress: &mut F,
) -> (bool, String)
where
    F: FnMut(f32),
{
    if export_control::is_cancelled(job) {
        return (false, "cancelled".to_string());
    }
    let mut child = match export_control::prepare(cmd).stdout(Stdio::null()).stderr(Stdio::piped()).spawn() {
        Ok(c) => c,
        Err(e) => {
            log_to_file(&format!("yt-dlp spawn error: {}", e));
            return (false, String::new());
        }
    };
    let pid = child.id();
    export_control::track(job, pid);
    let mut stderr_buf = String::new();
    if let Some(mut stderr) = child.stderr.take() {
        // ffmpeg rewrites its stats line with `\r`, so split on both line endings.
        let mut pending: Vec<u8> = Vec::new();
        let mut chunk = [0u8; 8192];
        loop {
            let n = match stderr.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => n,
            };
            for &b in &chunk[..n] {
                if b != b'\n' && b != b'\r' {
                    pending.push(b);
                    continue;
                }
                if pending.is_empty() {
                    continue;
                }
                let line = String::from_utf8_lossy(&pending).into_owned();
                pending.clear();
                if stderr_buf.len() < 200_000 {
                    stderr_buf.push_str(&line);
                    stderr_buf.push('\n');
                }
                if let Some(pct) = parse_ytdlp_progress_pct(&line) {
                    on_progress(pct);
                } else if let (Some(total), Some(t)) = (section_secs, parse_ffmpeg_stats_time(&line)) {
                    if total > 0.0 {
                        on_progress(((t / total) * 100.0).clamp(0.0, 100.0) as f32);
                    }
                }
            }
        }
    }
    let success = child.wait().map(|s| s.success()).unwrap_or(false);
    export_control::untrack(job, pid);
    (success, stderr_buf)
}
