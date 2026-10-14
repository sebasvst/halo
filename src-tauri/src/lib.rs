#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod audio;
mod commands;
mod media;
mod notifications;
mod payloads;
mod settings;
mod shortcuts;
mod tray;
mod window_pos;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second launch simply reveals the existing island.
            tray::set_visible(app, true);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::island_apply_layout,
            commands::media_get_state,
            commands::media_play_pause,
            commands::media_next,
            commands::media_previous,
            commands::audio_get_state,
            commands::audio_set_level,
            commands::audio_toggle_mute,
            commands::audio_open_settings,
            commands::shortcut_validate,
            commands::shortcut_open,
            commands::shortcut_requires_confirmation,
            commands::settings_export,
            commands::settings_import,
            commands::settings_store_info,
            commands::notification_access,
            commands::notification_request_access,
            commands::notification_resubscribe,
            commands::system_set_close_to_tray,
            commands::system_set_tray_visible,
            commands::system_set_dnd,
            commands::halo_quit,
        ])
        .setup(|app| {
            // Identity first: the notification listener requires an AUMID.
            notifications::install_identity();

            let handle = app.handle().clone();
            media::init(handle.clone());
            notifications::init(handle.clone());
            audio::start_peak_meter(handle.clone());
            tray::init(app.handle())?;
            window_pos::spawn_display_watcher(handle.clone());

            if let Some(window) = app.get_webview_window("main") {
                // Place the capsule at top-center even before the webview finishes
                // loading, so the island is never left at Windows' cascade position.
                // Sizes mirror `src/utils/layout.ts` (capsule 220x46 + margin 18/14).
                let _ = window_pos::apply_layout(&handle, 232.0, 70.0, 444.0, 576.0, false);

                let app_handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if crate::tray::close_to_tray() {
                            // Closing the floating window hides it; only "Salir" ends the process.
                            api.prevent_close();
                            let _ = tray::set_visible(&app_handle, false);
                        }
                        // Otherwise let the window close normally → process exits.
                    }
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Halo");
}
