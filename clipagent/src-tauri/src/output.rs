use std::path::PathBuf;

/// Generate a unique output path so exports never overwrite files
pub fn unique_output_path(base_dir: &PathBuf, base_name: &str) -> PathBuf {
    let mut path = base_dir.join(format!("{}.mp4", base_name));
    let mut i = 1;

    while path.exists() {
        path = base_dir.join(format!("{} ({}){}.mp4", base_name, i, ""));
        i += 1;
    }

    path
}