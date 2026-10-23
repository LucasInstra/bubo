use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalRect, PhysicalSize, WebviewWindow};

const MIN_WIDTH: u32 = 360;
const MIN_HEIGHT: u32 = 260;
const DEFAULT_WIDTH: u32 = 420;
const DEFAULT_HEIGHT: u32 = 640;
const FILE_NAME: &str = "window.json";
const POPUP_FILE_NAME: &str = "popup.json";

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: DEFAULT_WIDTH,
            height: DEFAULT_HEIGHT,
            x: 0,
            y: 0,
        }
    }
}

fn state_path(app: &AppHandle) -> Option<PathBuf> {
    crate::paths::data_dir(app)
        .ok()
        .map(|dir| dir.join(FILE_NAME))
}

/// Reads the last full-mode geometry. A missing or malformed file means "no
/// saved state": callers must keep their normal placement instead of applying
/// the fallback [`WindowState::default`].
pub fn load(app: &AppHandle) -> Option<WindowState> {
    let path = state_path(app)?;
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
struct PopupPosition {
    x: i32,
    y: i32,
}

/// The popup window has a fixed size, so only its top-left corner needs saving.
pub fn load_popup(app: &AppHandle) -> Option<PhysicalPosition<i32>> {
    let dir = crate::paths::data_dir(app).ok()?;
    let raw = fs::read_to_string(dir.join(POPUP_FILE_NAME)).ok()?;
    let saved: PopupPosition = serde_json::from_str(&raw).ok()?;
    Some(PhysicalPosition::new(saved.x, saved.y))
}

pub fn save_popup(app: &AppHandle, position: PhysicalPosition<i32>) {
    let Ok(dir) = crate::paths::data_dir(app) else {
        return;
    };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }

    let saved = PopupPosition {
        x: position.x,
        y: position.y,
    };
    let Ok(raw) = serde_json::to_string_pretty(&saved) else {
        return;
    };

    let path = dir.join(POPUP_FILE_NAME);
    let temp = dir.join(format!("{POPUP_FILE_NAME}.tmp"));
    if fs::write(&temp, &raw).is_err() {
        return;
    }
    if fs::rename(&temp, &path).is_err() {
        let _ = fs::write(&path, &raw);
        let _ = fs::remove_file(&temp);
    }
}

pub fn save(app: &AppHandle, state: WindowState) {
    let Ok(dir) = crate::paths::data_dir(app) else {
        return;
    };
    if fs::create_dir_all(&dir).is_err() {
        return;
    }

    let Ok(raw) = serde_json::to_string_pretty(&state) else {
        return;
    };

    // Write beside the target and rename so a crash mid-write cannot leave a
    // truncated window.json behind.
    let path = dir.join(FILE_NAME);
    let temp = dir.join(format!("{FILE_NAME}.tmp"));
    if fs::write(&temp, &raw).is_err() {
        return;
    }
    if fs::rename(&temp, &path).is_err() {
        // Some Windows setups refuse the replace; a direct write still works.
        let _ = fs::write(&path, &raw);
        let _ = fs::remove_file(&temp);
    }
}

pub fn capture(window: &WebviewWindow) -> Option<WindowState> {
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    Some(WindowState {
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
    })
}

/// Keeps a saved state inside `area`, growing undersized windows up to the
/// minimum and shrinking oversized ones to the available work area.
pub fn fit(mut state: WindowState, area: &PhysicalRect<i32, u32>) -> WindowState {
    let max_width = area.size.width.max(MIN_WIDTH);
    let max_height = area.size.height.max(MIN_HEIGHT);
    state.width = state.width.clamp(MIN_WIDTH, max_width);
    state.height = state.height.clamp(MIN_HEIGHT, max_height);

    let origin_x = area.position.x;
    let origin_y = area.position.y;
    let max_x = (origin_x + area.size.width as i32 - state.width as i32).max(origin_x);
    let max_y = (origin_y + area.size.height as i32 - state.height as i32).max(origin_y);
    state.x = state.x.clamp(origin_x, max_x);
    state.y = state.y.clamp(origin_y, max_y);

    state
}

/// Restores the saved full-mode geometry, picking the monitor that contains the
/// saved top-left point (or the primary monitor when that monitor is gone) and
/// clamping the result so the window stays reachable.
pub fn restore(window: &WebviewWindow) {
    let Some(saved) = load(window.app_handle()) else {
        return;
    };

    let area = window
        .available_monitors()
        .ok()
        .and_then(|monitors| {
            monitors
                .into_iter()
                .find(|monitor| {
                    let area = monitor.work_area();
                    saved.x >= area.position.x
                        && saved.y >= area.position.y
                        && saved.x < area.position.x + area.size.width as i32
                        && saved.y < area.position.y + area.size.height as i32
                })
                .map(|monitor| *monitor.work_area())
        })
        .or_else(|| {
            window
                .primary_monitor()
                .ok()
                .flatten()
                .map(|monitor| *monitor.work_area())
        });

    let state = area.as_ref().map(|area| fit(saved, area)).unwrap_or(saved);

    let _ = window.set_size(PhysicalSize::new(state.width, state.height));
    let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn work_area() -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition::new(100, 50),
            size: PhysicalSize::new(1000, 800),
        }
    }

    #[test]
    fn state_inside_the_work_area_is_unchanged() {
        let state = WindowState {
            width: 500,
            height: 700,
            x: 200,
            y: 100,
        };

        assert_eq!(fit(state, &work_area()), state);
    }

    #[test]
    fn negative_positions_clamp_to_the_work_area_origin() {
        let state = WindowState {
            width: 500,
            height: 700,
            x: -40,
            y: -80,
        };

        assert_eq!(
            fit(state, &work_area()),
            WindowState {
                width: 500,
                height: 700,
                x: 100,
                y: 50,
            }
        );
    }

    #[test]
    fn positions_beyond_the_far_edge_clamp_back_inside() {
        let state = WindowState {
            width: 500,
            height: 700,
            x: 5000,
            y: 5000,
        };

        assert_eq!(
            fit(state, &work_area()),
            WindowState {
                width: 500,
                height: 700,
                x: 600,
                y: 150,
            }
        );
    }

    #[test]
    fn oversized_states_clamp_to_the_work_area_origin() {
        let state = WindowState {
            width: 2000,
            height: 1600,
            x: 3000,
            y: 2000,
        };

        assert_eq!(
            fit(state, &work_area()),
            WindowState {
                width: 1000,
                height: 800,
                x: 100,
                y: 50,
            }
        );
    }

    #[test]
    fn size_larger_than_the_work_area_clamps_to_it() {
        let state = WindowState {
            width: 4000,
            height: 3000,
            x: 100,
            y: 50,
        };

        assert_eq!(
            fit(state, &work_area()),
            WindowState {
                width: 1000,
                height: 800,
                x: 100,
                y: 50,
            }
        );
    }

    #[test]
    fn size_smaller_than_the_minimum_clamps_up() {
        let state = WindowState {
            width: 200,
            height: 100,
            x: 300,
            y: 300,
        };

        assert_eq!(
            fit(state, &work_area()),
            WindowState {
                width: MIN_WIDTH,
                height: MIN_HEIGHT,
                x: 300,
                y: 300,
            }
        );
    }

    #[test]
    fn serialization_round_trip_uses_camel_case_keys() {
        let state = WindowState {
            width: 480,
            height: 720,
            x: -12,
            y: 34,
        };

        let raw = serde_json::to_string(&state).expect("state should serialize");
        assert_eq!(
            raw, r#"{"width":480,"height":720,"x":-12,"y":34}"#,
            "window state keys must stay camelCase"
        );

        let parsed: WindowState = serde_json::from_str(&raw).expect("state should deserialize");
        assert_eq!(parsed, state);
    }
}
