//! Settings schema and import/export validation.
//!
//! The same shape is mirrored in `src/types/settings.ts`. Imported files are strictly
//! validated and clamped before touching disk; unknown fields are rejected.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::Manager;

use crate::payloads::SettingsStoreInfo;

/// Relative store file name: resolves against the app-data dir (installed mode).
const RELATIVE_STORE: &str = "halo-settings.json";
/// Folder created next to the executable when Halo runs in portable mode.
pub const PORTABLE_DIR: &str = "halo-portable";

/// Resolves the settings store for this run.
///
/// * Installed copy (NSIS / Program Files) **or debug build** → `halo-settings.json`
///   relative to the app-data directory (standard Windows behaviour).
/// * Portable copy (any other location, e.g. a USB stick or the Desktop) →
///   `<exe dir>/halo-portable/halo-settings.json`, so the configuration travels
///   with the executable.
///
/// The store plugin resolves absolute paths as-is and relative paths against the
/// app-data dir, so both callers and the frontend can use this path directly.
pub fn store_file() -> PathBuf {
    if cfg!(debug_assertions) {
        return PathBuf::from(RELATIVE_STORE);
    }
    let Ok(exe) = std::env::current_exe() else {
        return PathBuf::from(RELATIVE_STORE);
    };
    let Some(dir) = exe.parent() else {
        return PathBuf::from(RELATIVE_STORE);
    };
    if is_install_location(dir, &install_roots()) {
        return PathBuf::from(RELATIVE_STORE);
    }
    let portable = dir.join(PORTABLE_DIR);
    match std::fs::create_dir_all(&portable) {
        Ok(()) => portable.join(RELATIVE_STORE),
        // Read-only folder (e.g. Program Files) → keep settings in app data.
        Err(_) => PathBuf::from(RELATIVE_STORE),
    }
}

/// Describes where settings live, for the UI (Halo Studio).
pub fn store_info(app: &tauri::AppHandle) -> SettingsStoreInfo {
    let file = store_file();
    let portable = file.is_absolute();
    let path = if portable {
        file
    } else {
        app.path()
            .app_data_dir()
            .unwrap_or_default()
            .join(&file)
    };
    SettingsStoreInfo {
        path: path.to_string_lossy().into_owned(),
        portable,
    }
}

/// Well-known installation roots on this machine.
fn install_roots() -> Vec<PathBuf> {
    ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"]
        .into_iter()
        .filter_map(std::env::var_os)
        .map(PathBuf::from)
        .collect()
}

/// True when `dir` is inside a standard Halo installation directory.
fn is_install_location(dir: &Path, roots: &[PathBuf]) -> bool {
    roots.iter().any(|root| {
        dir.starts_with(root.join("Halo")) || dir.starts_with(root.join("Programs").join("Halo"))
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HaloSettings {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub appearance: Appearance,
    #[serde(default)]
    pub interaction: Interaction,
    #[serde(default)]
    pub music: Music,
    #[serde(default)]
    pub notifications: Notifications,
    #[serde(default)]
    pub timers: Timers,
    #[serde(default)]
    pub shortcuts: Vec<ShortcutEntry>,
    #[serde(default)]
    pub system: System,
}

fn default_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Appearance {
    #[serde(default = "theme_default")]
    pub theme: Theme,
    #[serde(default = "transparency_default")]
    pub transparency: f32,
    #[serde(default = "scale_default")]
    pub capsule_scale: f32,
    #[serde(default = "scale_default")]
    pub panel_scale: f32,
    #[serde(default = "anim_default")]
    pub animation_speed: AnimSpeed,
    #[serde(default)]
    pub reduce_motion: ReduceMotion,
}

fn theme_default() -> Theme {
    Theme::Dark
}
fn transparency_default() -> f32 {
    0.15
}
fn scale_default() -> f32 {
    1.0
}
fn anim_default() -> AnimSpeed {
    AnimSpeed::Normal
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    Dark,
    Light,
    Auto,
}

impl Default for Theme {
    fn default() -> Self {
        Theme::Dark
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AnimSpeed {
    Slow,
    Normal,
    Fast,
}

impl Default for AnimSpeed {
    fn default() -> Self {
        AnimSpeed::Normal
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReduceMotion {
    System,
    Reduce,
    Allow,
}

impl Default for ReduceMotion {
    fn default() -> Self {
        ReduceMotion::System
    }
}

impl Default for Appearance {
    fn default() -> Self {
        Appearance {
            theme: theme_default(),
            transparency: transparency_default(),
            capsule_scale: scale_default(),
            panel_scale: scale_default(),
            animation_speed: anim_default(),
            reduce_motion: ReduceMotion::System,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Interaction {
    #[serde(default = "yes_default")]
    pub hover_preview: bool,
    #[serde(default = "hover_ms_default")]
    pub hover_preview_ms: u32,
    #[serde(default = "yes_default")]
    pub auto_collapse: bool,
    #[serde(default = "auto_collapse_ms_default")]
    pub auto_collapse_ms: u32,
    #[serde(default)]
    pub global_shortcut: Option<String>,
    #[serde(default)]
    pub focus_behavior: FocusBehavior,
}

fn yes_default() -> bool {
    true
}
fn hover_ms_default() -> u32 {
    350
}
fn auto_collapse_ms_default() -> u32 {
    4000
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum FocusBehavior {
    #[default]
    None,
    Take,
}

impl Default for Interaction {
    fn default() -> Self {
        Interaction {
            hover_preview: true,
            hover_preview_ms: hover_ms_default(),
            auto_collapse: true,
            auto_collapse_ms: auto_collapse_ms_default(),
            global_shortcut: Some("Ctrl+Alt+H".into()),
            focus_behavior: FocusBehavior::None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Music {
    #[serde(default = "yes_default")]
    pub show_artwork: bool,
    #[serde(default = "yes_default")]
    pub show_artist: bool,
    #[serde(default = "yes_default")]
    pub show_progress: bool,
    #[serde(default = "yes_default")]
    pub waveform: bool,
}

impl Default for Music {
    fn default() -> Self {
        Music {
            show_artwork: true,
            show_artist: true,
            show_progress: true,
            waveform: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Notifications {
    #[serde(default = "yes_default")]
    pub enabled: bool,
    #[serde(default = "yes_default")]
    pub visual_alerts: bool,
    #[serde(default = "duration_default")]
    pub duration_ms: u32,
    #[serde(default)]
    pub do_not_disturb: bool,
    #[serde(default)]
    pub hide_previews: bool,
    #[serde(default)]
    pub hide_sensitive: bool,
    #[serde(default = "yes_default")]
    pub show_app_icons: bool,
    #[serde(default = "queue_default")]
    pub queue_limit: u32,
    #[serde(default)]
    pub grouping: bool,
    #[serde(default = "yes_default")]
    pub animations: bool,
    #[serde(default = "yes_default")]
    pub sounds: bool,
    #[serde(default = "history_default")]
    pub history_minutes: u32,
}

fn duration_default() -> u32 {
    4000
}
fn queue_default() -> u32 {
    20
}
fn history_default() -> u32 {
    30
}

impl Default for Notifications {
    fn default() -> Self {
        Notifications {
            enabled: true,
            visual_alerts: true,
            duration_ms: duration_default(),
            do_not_disturb: false,
            hide_previews: false,
            hide_sensitive: false,
            show_app_icons: true,
            queue_limit: queue_default(),
            grouping: false,
            animations: true,
            sounds: false,
            history_minutes: history_default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Timers {
    #[serde(default)]
    pub persist_across_restarts: bool,
    #[serde(default = "yes_default")]
    pub alert_sound: bool,
    #[serde(default = "yes_default")]
    pub keep_island_visible: bool,
}

impl Default for Timers {
    fn default() -> Self {
        Timers {
            persist_across_restarts: false,
            alert_sound: true,
            keep_island_visible: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ShortcutEntry {
    pub id: String,
    pub name: String,
    pub kind: crate::payloads::ShortcutKind,
    pub target: String,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct System {
    #[serde(default)]
    pub launch_at_startup: bool,
    #[serde(default = "yes_default")]
    pub start_hidden: bool,
    #[serde(default = "yes_default")]
    pub show_tray_icon: bool,
    #[serde(default = "yes_default")]
    pub close_to_tray: bool,
}

impl Default for System {
    fn default() -> Self {
        System {
            launch_at_startup: false,
            start_hidden: true,
            show_tray_icon: true,
            close_to_tray: true,
        }
    }
}

impl Default for HaloSettings {
    fn default() -> Self {
        HaloSettings {
            version: default_version(),
            appearance: Appearance::default(),
            interaction: Interaction::default(),
            music: Music::default(),
            notifications: Notifications::default(),
            timers: Timers::default(),
            shortcuts: Vec::new(),
            system: System::default(),
        }
    }
}

pub fn clamp(mut s: HaloSettings) -> HaloSettings {
    s.version = 1;
    s.appearance.transparency = s.appearance.transparency.clamp(0.0, 0.6);
    s.appearance.capsule_scale = s.appearance.capsule_scale.clamp(0.85, 1.3);
    s.appearance.panel_scale = s.appearance.panel_scale.clamp(0.85, 1.3);
    s.interaction.hover_preview_ms = s.interaction.hover_preview_ms.clamp(150, 1500);
    s.interaction.auto_collapse_ms = s.interaction.auto_collapse_ms.clamp(1000, 60_000);
    if let Some(sc) = s.interaction.global_shortcut.as_mut() {
        *sc = sc.trim().to_string();
        if sc.is_empty() {
            s.interaction.global_shortcut = None;
        } else if sc.len() > 64 {
            s.interaction.global_shortcut = None;
        }
    }
    s.notifications.duration_ms = s.notifications.duration_ms.clamp(1000, 15_000);
    s.notifications.queue_limit = s.notifications.queue_limit.clamp(5, 50);
    s.notifications.history_minutes = s.notifications.history_minutes.min(240);
    if s.shortcuts.len() > 100 {
        s.shortcuts.truncate(100);
    }
    s.shortcuts.retain(|sc| !sc.id.trim().is_empty() && !sc.name.trim().is_empty());
    s
}

pub fn parse_export(json: &str) -> Result<HaloSettings, String> {
    let value: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("JSON no válido: {e}"))?;
    let parsed: HaloSettings =
        serde_json::from_value(value).map_err(|e| format!("Configuración no válida: {e}"))?;
    Ok(clamp(parsed))
}

pub fn to_export_string(s: &HaloSettings) -> Result<String, String> {
    serde_json::to_string_pretty(s).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_are_sane() {
        let d = HaloSettings::default();
        assert_eq!(d.version, 1);
        assert_eq!(d.notifications.queue_limit, 20);
        assert!(!d.system.launch_at_startup);
    }

    #[test]
    fn parses_and_clamps_out_of_range_values() {
        let json = r#"{
            "version": 9,
            "appearance": { "theme": "light", "transparency": 5, "capsuleScale": 10, "panelScale": 0.1, "animationSpeed": "fast", "reduceMotion": "reduce" },
            "notifications": { "durationMs": 999999, "queueLimit": 1, "enabled": true, "visualAlerts": true, "doNotDisturb": false, "hidePreviews": false, "hideSensitive": false, "showAppIcons": true, "grouping": false, "animations": true, "sounds": false, "historyMinutes": 9999 },
            "interaction": { "hoverPreview": true, "hoverPreviewMs": 1, "autoCollapse": true, "autoCollapseMs": 10, "globalShortcut": "  ", "focusBehavior": "none" },
            "music": { "showArtwork": true, "showArtist": true, "showProgress": true, "waveform": true },
            "timers": { "persistAcrossRestarts": false, "alertSound": true, "keepIslandVisible": true },
            "shortcuts": [],
            "system": { "launchAtStartup": false, "startHidden": true, "showTrayIcon": true, "closeToTray": true }
        }"#;
        let s = parse_export(json).expect("válido");
        assert_eq!(s.version, 1);
        assert_eq!(s.appearance.transparency, 0.6);
        assert_eq!(s.appearance.capsule_scale, 1.3);
        assert_eq!(s.appearance.panel_scale, 0.85);
        assert_eq!(s.notifications.duration_ms, 15_000);
        assert_eq!(s.notifications.queue_limit, 5);
        assert_eq!(s.interaction.hover_preview_ms, 150);
        assert_eq!(s.interaction.global_shortcut, None);
    }

    #[test]
    fn rejects_unknown_fields() {
        let json = r#"{"version":1,"telemetry":true,"appearance":{"theme":"dark","transparency":0.1,"capsuleScale":1,"panelScale":1,"animationSpeed":"normal","reduceMotion":"system"}}"#;
        assert!(parse_export(json).is_err());
    }

    #[test]
    fn rejects_garbage() {
        assert!(parse_export("not json").is_err());
        assert!(parse_export("{\"version\":\"x\"}").is_err());
    }

    #[test]
    fn round_trip_export() {
        let original = HaloSettings::default();
        let json = to_export_string(&original).unwrap();
        let parsed = parse_export(&json).unwrap();
        assert_eq!(original, parsed);
    }

    #[test]
    fn install_locations_are_detected() {
        let roots = vec![
            PathBuf::from(r"C:\Users\ana\AppData\Local"),
            PathBuf::from(r"C:\Program Files"),
            PathBuf::from(r"D:\Apps"),
        ];
        // Classic and modern per-user install dirs count as installed…
        assert!(is_install_location(
            Path::new(r"C:\Users\ana\AppData\Local\Halo"),
            &roots
        ));
        assert!(is_install_location(
            Path::new(r"C:\Users\ana\AppData\Local\Programs\Halo"),
            &roots
        ));
        assert!(is_install_location(
            Path::new(r"C:\Program Files\Halo"),
            &roots
        ));
        assert!(is_install_location(
            Path::new(r"D:\Apps\Halo\bin"),
            &roots
        ));
        // …anything else (Desktop, USB stick, temp) is portable.
        assert!(!is_install_location(
            Path::new(r"C:\Users\ana\Desktop\Halo"),
            &roots
        ));
        assert!(!is_install_location(
            Path::new(r"E:\Portable\Halo-portable"),
            &roots
        ));
        assert!(!is_install_location(Path::new(r"C:\Temp"), &roots));
    }

    #[test]
    fn debug_builds_always_use_app_data() {
        // Tests run in debug mode, which must never create portable data folders.
        let file = store_file();
        assert!(!file.is_absolute());
        assert_eq!(file, PathBuf::from("halo-settings.json"));
    }

    #[test]
    fn portable_dir_name_is_stable() {
        // Changing this would orphan users' portable settings.
        assert_eq!(PORTABLE_DIR, "halo-portable");
    }
}
