use std::path::PathBuf;

/// Path to bundled yt-dlp binary
pub fn yt_dlp_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join("yt-dlp")
}

/// Path to bundled ffmpeg binary
pub fn ffmpeg_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("bin")
        .join("ffmpeg")
}