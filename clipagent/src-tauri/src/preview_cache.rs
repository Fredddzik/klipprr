//! Disk-backed byte-range cache for `/preview-stream` (FR-2).
//!
//! Every byte relayed from a remote preview URL is written at its own offset in a
//! sparse file, and the covered ranges are tracked in memory. A seek into a region
//! that has already been fetched is then served from disk instead of the CDN.
//!
//! The cache stores the origin's bytes verbatim, so preview time stays source time
//! (PIPELINES.md invariant 1). It is never an export input (invariant 3).
//!
//! Coverage lives only in memory, so the directory is wiped the first time the cache
//! is used in a process: a file from a previous run has no map saying which of its
//! bytes are real and which are holes.

use once_cell::sync::Lazy;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Instant;

/// Budget for bytes actually written, across all entries. Past it, the least recently
/// used entries are dropped.
const MAX_CACHED_BYTES: u64 = 2 * 1024 * 1024 * 1024;

struct Entry {
    path: PathBuf,
    total: u64,
    content_type: String,
    /// Half-open `[start, end)` ranges, sorted and non-overlapping.
    ranges: Vec<(u64, u64)>,
    last_used: Instant,
}

impl Entry {
    fn covered_bytes(&self) -> u64 {
        self.ranges.iter().map(|(s, e)| e - s).sum()
    }
}

struct Cache {
    entries: HashMap<u64, Entry>,
    dir_ready: bool,
}

static CACHE: Lazy<Mutex<Cache>> = Lazy::new(|| {
    Mutex::new(Cache {
        entries: HashMap::new(),
        dir_ready: false,
    })
});

fn cache_dir() -> PathBuf {
    std::env::temp_dir()
        .join("clipagent_preview_cache")
        .join("stream")
}

fn key(url: &str) -> u64 {
    let mut h = DefaultHasher::new();
    url.hash(&mut h);
    h.finish()
}

/// Total size and content type, if this URL has an entry.
pub fn lookup(url: &str) -> Option<(u64, String)> {
    let mut c = CACHE.lock().ok()?;
    let e = c.entries.get_mut(&key(url))?;
    e.last_used = Instant::now();
    Some((e.total, e.content_type.clone()))
}

/// Registers a URL once its total size is known. An existing entry with a different
/// size means the origin now serves a different file, so its bytes are discarded.
/// Returns false when the cache cannot be used on this platform.
pub fn ensure_entry(url: &str, total: u64, content_type: &str) -> bool {
    if !cfg!(unix) || total == 0 {
        return false;
    }
    let Ok(mut c) = CACHE.lock() else { return false };
    if !c.dir_ready {
        let dir = cache_dir();
        let _ = std::fs::remove_dir_all(&dir);
        if std::fs::create_dir_all(&dir).is_err() {
            return false;
        }
        c.dir_ready = true;
    }
    let k = key(url);
    if let Some(e) = c.entries.get_mut(&k) {
        if e.total == total {
            e.last_used = Instant::now();
            return true;
        }
        let _ = std::fs::remove_file(&e.path);
        c.entries.remove(&k);
    }
    let path = cache_dir().join(format!("{k:x}.bin"));
    let _ = std::fs::remove_file(&path);
    c.entries.insert(
        k,
        Entry {
            path,
            total,
            content_type: content_type.to_string(),
            ranges: Vec::new(),
            last_used: Instant::now(),
        },
    );
    true
}

pub fn path_for(url: &str) -> Option<PathBuf> {
    let c = CACHE.lock().ok()?;
    c.entries.get(&key(url)).map(|e| e.path.clone())
}

/// If `pos` is cached, the exclusive end of the cached run containing it.
pub fn cached_run_end(url: &str, pos: u64) -> Option<u64> {
    let c = CACHE.lock().ok()?;
    let e = c.entries.get(&key(url))?;
    e.ranges
        .iter()
        .find(|(s, end)| *s <= pos && pos < *end)
        .map(|(_, end)| *end)
}

/// Start of the first cached run after `pos`, capped at `limit`.
pub fn next_cached_start(url: &str, pos: u64, limit: u64) -> u64 {
    let Ok(c) = CACHE.lock() else { return limit };
    let Some(e) = c.entries.get(&key(url)) else { return limit };
    e.ranges
        .iter()
        .map(|(s, _)| *s)
        .find(|s| *s > pos)
        .unwrap_or(limit)
        .min(limit)
}

/// Marks `[start, start + len)` as written, then enforces the size budget.
pub fn record(url: &str, start: u64, len: u64) {
    if len == 0 {
        return;
    }
    let Ok(mut c) = CACHE.lock() else { return };
    let k = key(url);
    let Some(e) = c.entries.get_mut(&k) else { return };
    let end = (start + len).min(e.total);
    e.ranges.push((start, end));
    e.ranges.sort_unstable();
    let mut merged: Vec<(u64, u64)> = Vec::with_capacity(e.ranges.len());
    for (s, en) in e.ranges.drain(..) {
        match merged.last_mut() {
            Some(last) if s <= last.1 => last.1 = last.1.max(en),
            _ => merged.push((s, en)),
        }
    }
    e.ranges = merged;
    e.last_used = Instant::now();

    let mut used: u64 = c.entries.values().map(Entry::covered_bytes).sum();
    while used > MAX_CACHED_BYTES {
        let victim = c
            .entries
            .iter()
            .filter(|(vk, _)| **vk != k)
            .min_by_key(|(_, v)| v.last_used)
            .map(|(vk, _)| *vk);
        let Some(vk) = victim else { break };
        if let Some(v) = c.entries.remove(&vk) {
            used -= v.covered_bytes();
            let _ = std::fs::remove_file(&v.path);
        }
    }
}

// Positional I/O on a page-cached file takes microseconds, so it runs inline rather
// than hopping to the blocking pool once per chunk.

#[cfg(unix)]
pub fn write_at(path: &std::path::Path, offset: u64, data: &[u8]) -> std::io::Result<()> {
    use std::os::unix::fs::FileExt;
    let f = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .open(path)?;
    f.write_all_at(data, offset)
}

#[cfg(unix)]
pub fn read_at(path: &std::path::Path, offset: u64, len: usize) -> std::io::Result<Vec<u8>> {
    use std::os::unix::fs::FileExt;
    let f = std::fs::File::open(path)?;
    let mut buf = vec![0u8; len];
    f.read_exact_at(&mut buf, offset)?;
    Ok(buf)
}

// On Windows, writing past EOF zero-fills the gap, so a seek deep into a large source
// would stall on disk. `ensure_entry` refuses there and these are never reached.

#[cfg(not(unix))]
pub fn write_at(_path: &std::path::Path, _offset: u64, _data: &[u8]) -> std::io::Result<()> {
    Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "preview cache is unix-only"))
}

#[cfg(not(unix))]
pub fn read_at(_path: &std::path::Path, _offset: u64, _len: usize) -> std::io::Result<Vec<u8>> {
    Err(std::io::Error::new(std::io::ErrorKind::Unsupported, "preview cache is unix-only"))
}
