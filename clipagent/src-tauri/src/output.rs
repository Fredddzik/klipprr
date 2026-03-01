use std::path::PathBuf;

/// Generate a unique output path so exports never overwrite files (default .mp4).
pub fn unique_output_path(base_dir: &PathBuf, base_name: &str) -> PathBuf {
    unique_output_path_with_ext(base_dir, base_name, "mp4")
}

/// Generate a unique output path with a given extension (e.g. "mp4", "webm").
pub fn unique_output_path_with_ext(base_dir: &PathBuf, base_name: &str, ext: &str) -> PathBuf {
    let ext = ext.trim_start_matches('.');
    let mut path = base_dir.join(format!("{}.{}", base_name, ext));
    let mut i = 1;

    while path.exists() {
        path = base_dir.join(format!("{} ({}).{}", base_name, i, ext));
        i += 1;
    }

    path
}