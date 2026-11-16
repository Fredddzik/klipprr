//! Starting helper programs (ffmpeg, ffprobe, yt-dlp, sysctl, pbpaste).

use std::ffi::OsStr;
use std::process::Command;

/// `Command::new` that does not open a console window on Windows. The release build is a
/// windowed app (main.rs), so without CREATE_NO_WINDOW every ffmpeg and yt-dlp run would
/// flash its own black console. A no-op elsewhere.
pub fn command<S: AsRef<OsStr>>(program: S) -> Command {
    #[allow(unused_mut)]
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
