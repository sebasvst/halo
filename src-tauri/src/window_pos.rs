//! Island window geometry: centres the capsule horizontally at the top of the primary
//! monitor's work area (taskbar-aware) and reacts to display changes through a real
//! message-only HWND listening for `WM_DISPLAYCHANGE` / `WM_DPICHANGED`.

use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Position, Size};

use crate::payloads::LayoutInfo;

/// Distance from the top of the work area to the window. The window itself adds
/// `MARGIN.y` transparent padding (see `utils/layout.ts`), so the visible capsule
/// ends up ~18px below the top edge — tight, like the real Dynamic Island.
const TOP_GAP: f64 = 4.0;

pub fn apply_layout(
    app: &AppHandle,
    capsule_w: f64,
    capsule_h: f64,
    expanded_w: f64,
    expanded_h: f64,
    expanded: bool,
) -> Result<LayoutInfo, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "ventana principal no encontrada".to_string())?;

    let monitor = window
        .primary_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.current_monitor().ok().flatten())
        .ok_or_else(|| "monitor no disponible".to_string())?;

    let scale = monitor.scale_factor();
    let work = monitor.work_area();

    let (w_logical, h_logical) = if expanded {
        (expanded_w, expanded_h)
    } else {
        (capsule_w, capsule_h)
    };

    let width = ((w_logical * scale).round() as u32).max(32);
    let height = ((h_logical * scale).round() as u32).max(24);

    window
        .set_size(Size::Physical(PhysicalSize { width, height }))
        .map_err(|e| e.to_string())?;

    let work_x = work.position.x as i32;
    let work_y = work.position.y as i32;
    let work_w = work.size.width as i32;
    let work_h = work.size.height as i32;

    let x = work_x + ((work_w - width as i32) / 2).max(0);
    let mut y = work_y + TOP_GAP as i32;
    // If the taskbar sits on top, push the island below it.
    if work_y > 0 {
        y = work_y + TOP_GAP as i32;
    }
    let max_y = work_y + work_h - height as i32;
    if y > max_y {
        y = max_y.max(work_y);
    }

    window
        .set_position(Position::Physical(PhysicalPosition { x, y }))
        .map_err(|e| e.to_string())?;

    Ok(LayoutInfo {
        x,
        y,
        width,
        height,
        scale_factor: scale,
        work_area_x: work_x,
        work_area_y: work_y,
        work_area_width: work_w as u32,
        work_area_height: work_h as u32,
    })
}

/// Spawns a hidden message-only window that relays display/topology changes so the island
/// can re-centre itself. The thread exits when the process exits.
pub fn spawn_display_watcher(app: AppHandle) {
    std::thread::spawn(move || unsafe {
        use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
        use windows::Win32::UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, PostQuitMessage,
            RegisterClassW, TranslateMessage, CS_HREDRAW, CS_VREDRAW, CW_USEDEFAULT,
            MSG, WINDOW_EX_STYLE, WM_DESTROY, WM_DISPLAYCHANGE, WM_DPICHANGED,
            WNDCLASSW, WS_OVERLAPPED,
        };

        thread_local! {
            static APP_HANDLE: std::cell::RefCell<Option<AppHandle>> = const { std::cell::RefCell::new(None) };
        }
        APP_HANDLE.with(|h| *h.borrow_mut() = Some(app.clone()));

        const CLASS_NAME: windows::core::PCWSTR = windows::core::w!("HaloDisplayWatcher");

        unsafe extern "system" fn wnd_proc(
            hwnd: HWND,
            msg: u32,
            wparam: WPARAM,
            lparam: LPARAM,
        ) -> LRESULT {
            match msg {
                WM_DISPLAYCHANGE | WM_DPICHANGED => {
                    APP_HANDLE.with(|h| {
                        if let Some(app) = h.borrow().as_ref() {
                            let _ = app.emit("island://relayout", ());
                        }
                    });
                    DefWindowProcW(hwnd, msg, wparam, lparam)
                }
                WM_DESTROY => {
                    PostQuitMessage(0);
                    LRESULT(0)
                }
                _ => DefWindowProcW(hwnd, msg, wparam, lparam),
            }
        }

        let class = WNDCLASSW {
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(wnd_proc),
            hInstance: HINSTANCE::default(),
            lpszClassName: CLASS_NAME,
            ..Default::default()
        };
        if RegisterClassW(&class) == 0 {
            return;
        }

        // HWND_MESSAGE (-3) creates a message-only window: never visible, never interactive.
        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            CLASS_NAME,
            windows::core::w!(""),
            WS_OVERLAPPED,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            CW_USEDEFAULT,
            None,
            None,
            Some(HINSTANCE::default()),
            None,
        );
        match hwnd {
            Ok(hwnd) if !hwnd.is_invalid() => {}
            _ => return,
        }

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    });
}
