//! System tray: show/hide, settings, Do-Not-Disturb toggle and a clean quit.

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{CheckMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

static DND: AtomicBool = AtomicBool::new(false);
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

/// Whether the window-close button should hide instead of quitting.
pub fn close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::Relaxed)
}

pub fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Relaxed);
}

/// Shows or hides the tray icon without destroying the menu.
pub fn set_tray_visible(app: &AppHandle, visible: bool) {
    if let Some(tray) = app.tray_by_id("halo-tray") {
        let _ = tray.set_visible(visible);
    }
}

pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostrar Halo", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Ocultar Halo", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Configuración…", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let dnd = CheckMenuItem::with_id(app, "dnd", "No molestar", true, false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &settings, &separator, &dnd, &quit])?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
        .unwrap_or_else(|_| app.default_window_icon().unwrap().clone());

    TrayIconBuilder::with_id("halo-tray")
        .icon(icon)
        .tooltip("Halo")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => set_visible(app, true),
            "hide" => set_visible(app, false),
            "settings" => {
                // Show first so the frontend is alive, then request the settings view.
                set_visible(app, true);
                let _ = app.emit("app://open-settings", ());
            }
            "dnd" => {
                let enabled = !DND.load(Ordering::Relaxed);
                set_dnd(app, enabled);
                let _ = app.emit("settings://dnd", enabled);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                let visible = app
                    .get_webview_window("main")
                    .map(|w| w.is_visible().unwrap_or(false))
                    .unwrap_or(false);
                set_visible(app, !visible);
            }
        })
        .build(app)?;
    Ok(())
}

pub fn set_visible(app: &AppHandle, visible: bool) {
    if let Some(window) = app.get_webview_window("main") {
        if visible {
            let _ = window.show();
            let _ = app.emit("island://visibility", true);
        } else {
            let _ = window.hide();
            let _ = app.emit("island://visibility", false);
        }
    }
}

pub fn set_dnd(app: &AppHandle, enabled: bool) {
    DND.store(enabled, Ordering::Relaxed);
    if let Some(item) = find_dnd_item(app) {
        let _ = item.set_checked(enabled);
    }
}

fn find_dnd_item(app: &AppHandle) -> Option<CheckMenuItem<tauri::Wry>> {
    let menu = app.menu()?;
    let items = menu.items().ok()?;
    items.into_iter().find_map(|item| match item {
        MenuItemKind::Check(check) => Some(check),
        _ => None,
    })
}
