//! Typed commands exposed to the React frontend. Every command validates its input.

use serde::Deserialize;
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

use crate::payloads::{LayoutInfo, ShortcutTarget, ShortcutValidation};
use crate::settings::{self, HaloSettings};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutRequest {
    pub capsule_w: f64,
    pub capsule_h: f64,
    pub expanded_w: f64,
    pub expanded_h: f64,
    pub expanded: bool,
}

#[tauri::command]
pub fn island_apply_layout(app: AppHandle, request: LayoutRequest) -> Result<LayoutInfo, String> {
    crate::window_pos::apply_layout(
        &app,
        request.capsule_w,
        request.capsule_h,
        request.expanded_w,
        request.expanded_h,
        request.expanded,
    )
}

#[tauri::command]
pub fn media_get_state() -> Result<(), String> {
    crate::media::refresh();
    Ok(())
}

#[tauri::command]
pub fn media_play_pause() -> Result<(), String> {
    crate::media::play_pause();
    Ok(())
}

#[tauri::command]
pub fn media_next() -> Result<(), String> {
    crate::media::next();
    Ok(())
}

#[tauri::command]
pub fn media_previous() -> Result<(), String> {
    crate::media::previous();
    Ok(())
}

#[tauri::command]
pub fn audio_get_state() -> Result<crate::payloads::AudioState, String> {
    crate::audio::get_state()
}

#[tauri::command]
pub fn audio_set_level(level: f32) -> Result<crate::payloads::AudioState, String> {
    crate::audio::set_level(crate::audio::clamp_level(level))
}

#[tauri::command]
pub fn audio_toggle_mute() -> Result<crate::payloads::AudioState, String> {
    crate::audio::toggle_mute()
}

#[tauri::command]
pub fn audio_open_settings() -> Result<(), String> {
    crate::audio::open_sound_settings();
    Ok(())
}

#[tauri::command]
pub fn shortcut_validate(target: ShortcutTarget) -> ShortcutValidation {
    crate::shortcuts::validate(&target)
}

#[tauri::command]
pub fn shortcut_open(target: ShortcutTarget) -> Result<(), String> {
    crate::shortcuts::open(&target)
}

#[tauri::command]
pub fn shortcut_requires_confirmation(target: ShortcutTarget) -> bool {
    crate::shortcuts::requires_confirmation(&target)
}

#[tauri::command]
pub fn settings_export(app: AppHandle) -> Result<String, String> {
    let store = app
        .store(settings::store_file())
        .map_err(|e| format!("no se pudo abrir el almacén: {e}"))?;
    let value = store.get("settings");
    let parsed: HaloSettings = match value {
        Some(v) => serde_json::from_value(v)
            .map_err(|e| format!("preferencias corruptas: {e}"))
            .map(settings::clamp)?,
        None => HaloSettings::default(),
    };
    settings::to_export_string(&parsed)
}

#[tauri::command]
pub fn settings_import(app: AppHandle, json: String) -> Result<(), String> {
    let parsed = settings::parse_export(&json)?;
    let store = app
        .store(settings::store_file())
        .map_err(|e| format!("no se pudo abrir el almacén: {e}"))?;
    let json_value = serde_json::to_value(&parsed).map_err(|e| e.to_string())?;
    store.set("settings", json_value);
    let _ = store.save();
    let _ = app.emit("settings://imported", parsed);
    Ok(())
}

#[tauri::command]
pub fn settings_store_info(app: AppHandle) -> crate::payloads::SettingsStoreInfo {
    crate::settings::store_info(&app)
}

#[tauri::command]
pub fn notification_access() -> crate::payloads::NotificationAccess {
    crate::notifications::access_snapshot()
}

#[tauri::command]
pub fn notification_request_access(app: AppHandle) {
    crate::notifications::request_access(app);
}

/// Re-reads Action Center after the webview is listening. Does not re-prompt for consent.
#[tauri::command]
pub fn notification_resubscribe(app: AppHandle) {
    crate::notifications::resubscribe_and_seed(app);
}

/// Syncs the "close to tray" preference into the native close handler.
#[tauri::command]
pub fn system_set_close_to_tray(enabled: bool) {
    crate::tray::set_close_to_tray(enabled);
}

/// Shows or hides the tray icon at runtime.
#[tauri::command]
pub fn system_set_tray_visible(app: AppHandle, visible: bool) {
    crate::tray::set_tray_visible(&app, visible);
}

/// Syncs the "Do Not Disturb" flag into the tray check-item.
#[tauri::command]
pub fn system_set_dnd(app: AppHandle, enabled: bool) {
    crate::tray::set_dnd(&app, enabled);
}

#[tauri::command]
pub fn halo_quit(app: AppHandle) {
    app.exit(0);
}
