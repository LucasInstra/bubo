use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const FOLDER: &str = "bubo";
const LEGACY_FOLDER: &str = "com.lucas.bubo";
const DATA_FILES: [&str; 7] = [
    "settings.json",
    "bubo.db",
    "bubo.db-wal",
    "bubo.db-shm",
    "bubo.log",
    "window.json",
    "popup.json",
];

/// All user data lives in a short, easy-to-find folder. The bundle identifier
/// stays `com.lucas.bubo` so the installer and updater keep their identity.
pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().data_dir().map_err(|e| e.to_string())?;
    Ok(base.join(FOLDER))
}

/// Moves a pre-0.8.1 installation from `%APPDATA%\com.lucas.bubo` to
/// `%APPDATA%\bubo`. Renaming the directory keeps SQLite's WAL and SHM files
/// together. If the rename fails (a locked file or an existing destination),
/// the known data files are copied instead and the old folder stays as a
/// fallback.
pub fn migrate_legacy(app: &AppHandle) -> Result<(), String> {
    let base = app.path().data_dir().map_err(|e| e.to_string())?;
    migrate_dirs(&base.join(LEGACY_FOLDER), &base.join(FOLDER))
}

fn migrate_dirs(old: &Path, new: &Path) -> Result<(), String> {
    if !old.exists() {
        return Ok(());
    }
    if !new.exists() && fs::rename(old, new).is_ok() {
        return Ok(());
    }

    fs::create_dir_all(new).map_err(|e| e.to_string())?;
    for name in DATA_FILES {
        let source = old.join(name);
        if !source.exists() {
            continue;
        }
        let target = new.join(name);
        if target.exists() {
            continue;
        }
        fs::copy(&source, &target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::migrate_dirs;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0);
        let dir =
            std::env::temp_dir().join(format!("bubo-paths-{name}-{}-{stamp}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn moves_the_legacy_folder_when_possible() {
        let base = temp_dir("move");
        let old = base.join("com.lucas.bubo");
        let new = base.join("bubo");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("settings.json"), "{}").unwrap();
        fs::write(old.join("bubo.db"), "db").unwrap();

        migrate_dirs(&old, &new).unwrap();

        assert!(!old.exists());
        assert_eq!(fs::read_to_string(new.join("settings.json")).unwrap(), "{}");
        assert_eq!(fs::read_to_string(new.join("bubo.db")).unwrap(), "db");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn copies_files_when_the_new_folder_already_exists() {
        let base = temp_dir("copy");
        let old = base.join("com.lucas.bubo");
        let new = base.join("bubo");
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::write(old.join("settings.json"), "old").unwrap();
        fs::write(new.join("settings.json"), "new").unwrap();
        fs::write(old.join("bubo.log"), "log").unwrap();

        migrate_dirs(&old, &new).unwrap();

        assert!(old.exists());
        assert_eq!(
            fs::read_to_string(new.join("settings.json")).unwrap(),
            "new"
        );
        assert_eq!(fs::read_to_string(new.join("bubo.log")).unwrap(), "log");
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn does_nothing_without_a_legacy_folder() {
        let base = temp_dir("none");
        let new = base.join("bubo");

        migrate_dirs(&base.join("missing"), &new).unwrap();

        assert!(!new.exists());
        let _ = fs::remove_dir_all(&base);
    }
}
