//! Cancelling running exports (FR-11).
//!
//! Each clip's yt-dlp and ffmpeg processes are tracked per export, so a cancel can stop
//! one clip or all of them. Processes start in their own process group: yt-dlp runs
//! ffmpeg as a child for section downloads, and signalling the group stops both.

use once_cell::sync::Lazy;
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::sync::Mutex;

/// Processes that serve every clip at once, like High Quality mode's full download.
pub const SHARED: usize = usize::MAX;

#[derive(Default)]
struct Export {
    all: bool,
    clips: HashSet<usize>,
    pids: HashMap<usize, Vec<u32>>,
}

static EXPORTS: Lazy<Mutex<HashMap<String, Export>>> = Lazy::new(|| Mutex::new(HashMap::new()));

/// One clip of one export, for the functions below. `export_id` is None only for callers
/// that predate client export ids; those simply cannot be cancelled.
#[derive(Clone, Copy)]
pub struct Job<'a> {
    pub export_id: Option<&'a str>,
    pub clip: usize,
}

pub fn begin(export_id: &str) {
    if let Ok(mut m) = EXPORTS.lock() {
        m.insert(export_id.to_string(), Export::default());
    }
}

pub fn end(export_id: &str) {
    if let Ok(mut m) = EXPORTS.lock() {
        m.remove(export_id);
    }
}

pub fn is_cancelled(job: Job) -> bool {
    let (Some(id), Ok(m)) = (job.export_id, EXPORTS.lock()) else { return false };
    m.get(id).map_or(false, |e| e.all || e.clips.contains(&job.clip))
}

pub fn all_cancelled(export_id: Option<&str>) -> bool {
    let (Some(id), Ok(m)) = (export_id, EXPORTS.lock()) else { return false };
    m.get(id).map_or(false, |e| e.all)
}

/// Runs the command in its own process group so a cancel reaches its children too.
pub fn prepare(cmd: &mut Command) -> &mut Command {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    cmd
}

pub fn track(job: Job, pid: u32) {
    let (Some(id), Ok(mut m)) = (job.export_id, EXPORTS.lock()) else { return };
    if let Some(e) = m.get_mut(id) {
        e.pids.entry(job.clip).or_default().push(pid);
    }
    // A cancel that landed between the check and the spawn must still stop this process.
    if is_cancelled_locked(&m, id, job.clip) {
        kill_tree(pid);
    }
}

pub fn untrack(job: Job, pid: u32) {
    let (Some(id), Ok(mut m)) = (job.export_id, EXPORTS.lock()) else { return };
    if let Some(list) = m.get_mut(id).and_then(|e| e.pids.get_mut(&job.clip)) {
        list.retain(|p| *p != pid);
    }
}

fn is_cancelled_locked(m: &HashMap<String, Export>, id: &str, clip: usize) -> bool {
    m.get(id).map_or(false, |e| e.all || e.clips.contains(&clip))
}

/// Cancels one clip, or the whole export when `clip` is None. Returns false when the
/// export is not running (already finished, or unknown).
pub fn cancel(export_id: &str, clip: Option<usize>) -> bool {
    let Ok(mut m) = EXPORTS.lock() else { return false };
    let Some(e) = m.get_mut(export_id) else { return false };
    let victims: Vec<u32> = match clip {
        None => {
            e.all = true;
            e.pids.values().flatten().copied().collect()
        }
        Some(i) => {
            e.clips.insert(i);
            e.pids.get(&i).cloned().unwrap_or_default()
        }
    };
    drop(m);
    for pid in victims {
        kill_tree(pid);
    }
    true
}

fn kill_tree(pid: u32) {
    #[cfg(unix)]
    {
        // A negative pid addresses the whole process group `prepare` created.
        let _ = Command::new("kill").args(["-TERM", &format!("-{pid}")]).status();
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).status();
    }
}
