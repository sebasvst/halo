//! Shared, typed payloads exchanged between the Rust backend and the React frontend.
//! Keep this file in sync with `src/types/bridge.ts`.

use serde::{Deserialize, Serialize};

/// Where the settings store lives for this run (see `settings::store_file`).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SettingsStoreInfo {
    /// Absolute path of the settings JSON file.
    pub path: String,
    /// `true` when the settings travel next to the executable (portable mode).
    pub portable: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub available: bool,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub status: MediaStatus,
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    pub app_id: Option<String>,
    pub art_data_url: Option<String>,
    pub supported: SupportedActions,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum MediaStatus {
    Playing,
    Paused,
    #[default]
    Stopped,
    Unknown,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SupportedActions {
    pub play: bool,
    pub pause: bool,
    pub next: bool,
    pub previous: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NotificationItem {
    pub id: String,
    /// Origin application, when it can be derived from the payload. `None` when unknown —
    /// never invented.
    pub app_name: Option<String>,
    pub title: Option<String>,
    pub preview: Option<String>,
    pub icon: Option<String>,
    pub received_at: i64,
    /// `true` for notifications that already sat in Action Center when Halo started
    /// (seeded, so the UI must not flash/pop for them).
    #[serde(default)]
    pub seed: bool,
    pub category: Option<String>,
    pub tag: Option<String>,
    /// Actions that the payload advertises and Halo can actually perform.
    pub actions: Vec<NotificationAction>,
    pub privacy: NotificationPrivacyFlags,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAction {
    pub id: String,
    pub label: String,
    pub kind: NotificationActionKind,
    pub payload: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum NotificationActionKind {
    #[allow(dead_code)]
    OpenApp,
    OpenUri,
}

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPrivacyFlags {
    /// Source application publishes a launch URI we validated as safe to open.
    pub has_launch_target: bool,
    /// Payload contained body text that Halo is allowed to display.
    pub has_body: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ListenerStatus {
    Allowed,
    Denied,
    Unavailable,
    Pending,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NotificationAccess {
    pub status: ListenerStatus,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AudioState {
    pub level: f32,
    pub muted: bool,
    pub device_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LayoutInfo {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub work_area_x: i32,
    pub work_area_y: i32,
    pub work_area_width: u32,
    pub work_area_height: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ShortcutKind {
    Web,
    File,
    Folder,
    App,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutTarget {
    pub kind: ShortcutKind,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ShortcutValidity {
    Valid,
    Missing,
    InvalidScheme,
    InvalidPath,
    Empty,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutValidation {
    pub validity: ShortcutValidity,
    pub resolved: Option<String>,
    pub detail: Option<String>,
}
