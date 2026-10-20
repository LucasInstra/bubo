use std::fs::OpenOptions;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const MAX_LOG_BYTES: u64 = 1_000_000;

/// Append-only diagnostics for a background app: the user never sees a console,
/// so failures must land somewhere readable.
pub fn write(app: &AppHandle, level: &str, message: &str) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("bubo.log");

    if std::fs::metadata(&path)
        .map(|m| m.len() > MAX_LOG_BYTES)
        .unwrap_or(false)
    {
        // Keep the most recent lines instead of losing the crash trail.
        if let Ok(content) = std::fs::read_to_string(&path) {
            let recent: Vec<&str> = content.lines().rev().take(500).collect();
            let kept = recent.into_iter().rev().collect::<Vec<_>>().join("\n");
            let _ = std::fs::write(&path, format!("{kept}\n"));
        }
    }

    let line = format!("[{}] {level}: {message}\n", stamp());
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn stamp() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}
