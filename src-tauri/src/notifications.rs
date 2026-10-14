//! Windows notification listener integration.
//!
//! Uses `UserNotificationListener` (`Windows.UI.Notifications.Management`), which requires the
//! process to own an AppUserModelId and a notification association registered under HKCU.
//! Halo registers both on first run (HKCU only — no admin rights, no machine-wide changes).
//! If Windows does not grant access, Halo reports `denied`/`unavailable` and renders an honest
//! state instead of fabricating notifications.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter};
use windows::ApplicationModel::{AppDisplayInfo, AppInfo};
use windows::core::Interface;
use windows::Foundation::{Size, TypedEventHandler};
use windows::Storage::Streams::{DataReader, RandomAccessStreamReference};
use windows::UI::Notifications::Management::{UserNotificationListener, UserNotificationListenerAccessStatus};
use windows::UI::Notifications::{
    NotificationKinds, ToastNotification, UserNotificationChangedKind, UserNotificationChangedEventArgs,
    UserNotification,
};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
use windows::Win32::System::Registry::{
    RegCloseKey, RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, REG_DWORD,
    REG_OPTION_NON_VOLATILE, REG_SAM_FLAGS, REG_SZ,
};
use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;

use crate::payloads::{
    ListenerStatus, NotificationAccess, NotificationAction, NotificationActionKind, NotificationItem,
    NotificationPrivacyFlags,
};

pub const AUMID: &str = "HaloIsland.Desktop";
static APP: OnceLock<AppHandle> = OnceLock::new();
/// Ensures the change listener is only wired up once, even if the user re-requests access.
static SUBSCRIBED: AtomicBool = AtomicBool::new(false);
/// Last known listener access status, so `notification_access` can answer without a round-trip
/// and so the UI does not flash "pending" after a restart once Windows already granted access.
static ACCESS: Mutex<Option<NotificationAccess>> = Mutex::new(None);

/// Diagnostic log — the app runs as a GUI process so eprintln is invisible.
fn log(msg: &str) {
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(std::env::temp_dir().join("halo-notif.log"))
        .and_then(|mut f| {
            use std::io::Write;
            writeln!(f, "[{}] {msg}", now_unix_ms())
        });
}

const KEY_READ_WRITE: u32 = 0x20019; // KEY_READ | KEY_WRITE
const TICKS_UNIX_EPOCH: i64 = 116_444_736_000_000_000;

/// Must be called once from the main thread before any notification API is touched.
pub fn install_identity() {
    unsafe {
        let wide: Vec<u16> = AUMID.encode_utf16().chain(std::iter::once(0)).collect();
        let _ = SetCurrentProcessExplicitAppUserModelID(windows::core::PWSTR(
            wide.as_ptr() as *mut u16,
        ));
    }
    register_aumid_keys();
}

fn register_aumid_keys() {
    unsafe {
        let subkey: Vec<u16> = format!("Software\\Classes\\AppUserModelId\\{AUMID}")
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();
        let mut hkey = HKEY::default();
        if RegCreateKeyExW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(subkey.as_ptr()),
            None,
            windows::core::PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            REG_SAM_FLAGS(KEY_READ_WRITE),
            None,
            std::ptr::addr_of_mut!(hkey),
            None,
        )
        .is_err()
        {
            return;
        }
        write_sz(&hkey, "DisplayName", "Halo");
        if let Ok(exe) = std::env::current_exe() {
            let exe = exe.display().to_string();
            if !exe.is_empty() {
                write_sz(&hkey, "IconUri", &exe);
            }
        }
        // Windows 10/11 expects "Foreground" activation for classic (Win32) toast owners.
        write_sz(&hkey, "Windows.ToastActivationMode", "Foreground");
        let _ = RegCloseKey(hkey);

        let assoc_key: Vec<u16> = format!(
            "Software\\Microsoft\\Windows\\CurrentVersion\\NotificationAssociations\\{AUMID}"
        )
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
        let mut hkey2 = HKEY::default();
        if RegCreateKeyExW(
            HKEY_CURRENT_USER,
            windows::core::PCWSTR(assoc_key.as_ptr()),
            None,
            windows::core::PCWSTR::null(),
            REG_OPTION_NON_VOLATILE,
            REG_SAM_FLAGS(KEY_READ_WRITE),
            None,
            std::ptr::addr_of_mut!(hkey2),
            None,
        )
        .is_err()
        {
            return;
        }
        let value: u32 = 1;
        let name: Vec<u16> = "Toast".encode_utf16().chain(std::iter::once(0)).collect();
        let bytes = std::slice::from_raw_parts(
            std::ptr::addr_of!(value) as *const u8,
            std::mem::size_of::<u32>(),
        );
        let _ = RegSetValueExW(hkey2, PCWSTR_from(&name), None, REG_DWORD, Some(bytes));
        let _ = RegCloseKey(hkey2);
    }
}

#[allow(non_snake_case)]
unsafe fn PCWSTR_from(v: &[u16]) -> windows::core::PCWSTR {
    windows::core::PCWSTR(v.as_ptr())
}

unsafe fn write_sz(hkey: &HKEY, name: &str, value: &str) {
    let wide: Vec<u16> = value.encode_utf16().chain(std::iter::once(0)).collect();
    let name_wide: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
    let _ = RegSetValueExW(
        *hkey,
        windows::core::PCWSTR(name_wide.as_ptr()),
        None,
        REG_SZ,
        Some(std::slice::from_raw_parts(
            wide.as_ptr() as *const u8,
            wide.len() * 2,
        )),
    );
}

pub fn init(app: AppHandle) {
    let _ = APP.set(app.clone());
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        run_access_flow(&app);
        park_forever();
    });
}

/// Re-runs the consent flow. Windows only shows its access dialog while the status is
/// unresolved; calling this again from the UI's "retry" button re-prompts the user and,
/// once granted, immediately seeds the notifications that are already in Action Center.
pub fn request_access(app: AppHandle) {
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        run_access_flow(&app);
    });
}

unsafe fn run_access_flow(app: &AppHandle) {
    log("Requesting listener access...");
    let listener = match UserNotificationListener::Current() {
        Ok(l) => l,
        Err(e) => {
            log(&format!("UserNotificationListener::Current failed: {e}"));
            emit_access(app, ListenerStatus::Unavailable, Some(e.to_string()));
            return;
        }
    };

    let status = match listener.RequestAccessAsync().and_then(|op| op.join()) {
        Ok(UserNotificationListenerAccessStatus::Allowed) => ListenerStatus::Allowed,
        Ok(UserNotificationListenerAccessStatus::Denied) => ListenerStatus::Denied,
        Ok(_) => ListenerStatus::Pending,
        Err(e) => {
            log(&format!("RequestAccessAsync failed: {e}"));
            emit_access(app, ListenerStatus::Unavailable, Some(e.to_string()));
            return;
        }
    };
    log(&format!("Access status: {status:?}"));
    emit_access(app, status.clone(), None);

    if status == ListenerStatus::Allowed {
        subscribe_and_seed(app, &listener);
    }
}

/// Seeds Action Center history without re-prompting. Called after the webview is ready so
/// the first UI frame can subscribe before any `notification://received` events fire.
pub fn resubscribe_and_seed(app: AppHandle) {
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        log("resubscribe_and_seed called");
        let listener = match UserNotificationListener::Current() {
            Ok(l) => l,
            Err(e) => {
                log(&format!("resubscribe: Current failed: {e}"));
                return;
            }
        };
        // Prefer the live status; fall back to the last emitted one.
        let live = match listener
            .RequestAccessAsync()
            .and_then(|op| op.join())
        {
            Ok(UserNotificationListenerAccessStatus::Allowed) => ListenerStatus::Allowed,
            Ok(UserNotificationListenerAccessStatus::Denied) => ListenerStatus::Denied,
            Ok(_) => ListenerStatus::Pending,
            Err(e) => {
                log(&format!("resubscribe: RequestAccess failed: {e}"));
                ListenerStatus::Unavailable
            }
        };
        log(&format!("resubscribe: live status = {live:?}"));
        if live != current_access_status() {
            emit_access(&app, live.clone(), None);
        }
        if live == ListenerStatus::Allowed {
            subscribe_and_seed(&app, &listener);
        }
    });
}

fn subscribe_and_seed(app: &AppHandle, listener: &UserNotificationListener) {
    // Try the event-driven path (best-effort — some Windows builds return
    // 0x80070490 for NotificationChanged even with a valid AUMID).
    if !SUBSCRIBED.swap(true, Ordering::SeqCst) {
        log("Registering NotificationChanged handler...");
        let app_for_events = app.clone();
        let listener_for_handler = listener.clone();
        let handler = TypedEventHandler::new(
            move |_sender: windows::core::Ref<UserNotificationListener>,
                  args: windows::core::Ref<UserNotificationChangedEventArgs>| {
                if let Ok(a) = args.ok() {
                    if let Ok(UserNotificationChangedKind::Added) = a.ChangeKind() {
                        if let Ok(nid) = a.UserNotificationId() {
                            std::thread::sleep(std::time::Duration::from_millis(80));
                            let item = build_item(&listener_for_handler, nid).unwrap_or_else(|_| {
                                NotificationItem {
                                    id: fnv1a(&format!("live|{nid}|{}", now_unix_ms())),
                                    app_name: None,
                                    title: Some("Nueva notificación".into()),
                                    preview: None,
                                    icon: None,
                                    received_at: now_unix_ms(),
                                    seed: false,
                                    category: None,
                                    tag: None,
                                    actions: Vec::new(),
                                    privacy: NotificationPrivacyFlags {
                                        has_launch_target: false,
                                        has_body: false,
                                    },
                                }
                            });
                            log(&format!("EVENT: app={:?} title={:?}", item.app_name, item.title));
                            let _ = app_for_events.emit("notification://received", item);
                        }
                    }
                }
                Ok(())
            },
        );
        match listener.NotificationChanged(&handler) {
            Ok(_) => log("NotificationChanged handler registered OK"),
            Err(e) => {
                log(&format!("NotificationChanged failed ({e}) — falling back to polling"));
                // Keep the handler alive for the lifetime of the process by
                // leaking it; if the event fires later it still works.
                std::mem::forget(handler);
            }
        }
    }
    // Always start the poller (idempotent — guarded by POLLING flag).
    start_poller(app.clone(), listener.clone());
    // Surface what is already sitting in Action Center, newest first.
    seed_existing(app, listener);
}

/// Polling fallback: checks Action Center every 1.2 s for toasts we haven't
/// seen yet. This is the reliable path on Windows builds where
/// `NotificationChanged` returns 0x80070490.
static POLLING: AtomicBool = AtomicBool::new(false);
static SEEN_IDS: Mutex<Option<std::collections::HashSet<u32>>> = Mutex::new(None);

fn start_poller(app: AppHandle, listener: UserNotificationListener) {
    if POLLING.swap(true, Ordering::SeqCst) {
        return; // already running
    }
    // Mark all currently-known notification ids as seen so the first poll
    // doesn't re-emit the entire Action Center.
    if let Ok(op) = listener.GetNotificationsAsync(NotificationKinds::Toast) {
        if let Ok(list) = op.join() {
            if let Ok(count) = list.Size() {
                if let Ok(mut seen) = SEEN_IDS.lock() {
                    let set = seen.get_or_insert_with(Default::default);
                    for i in 0..count {
                        if let Ok(un) = list.GetAt(i) {
                            if let Ok(id) = un.Id() {
                                set.insert(id);
                            }
                        }
                    }
                    log(&format!("Poller seeded {} known ids", set.len()));
                }
            }
        }
    }
    std::thread::spawn(move || unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        loop {
            std::thread::sleep(std::time::Duration::from_millis(1200));
            let Ok(op) = listener.GetNotificationsAsync(NotificationKinds::Toast) else { continue };
            let Ok(list) = op.join() else { continue };
            let Ok(count) = list.Size() else { continue };
            // Collect ids first, then emit (avoid holding the lock during build_item).
            let mut fresh: Vec<u32> = Vec::new();
            if let Ok(mut seen_guard) = SEEN_IDS.lock() {
                let seen = seen_guard.get_or_insert_with(Default::default);
                for i in 0..count {
                    if let Ok(un) = list.GetAt(i) {
                        if let Ok(id) = un.Id() {
                            if !seen.contains(&id) {
                                seen.insert(id);
                                fresh.push(id);
                            }
                        }
                    }
                }
                // Cap the seen-set so it doesn't grow forever.
                if seen.len() > 500 {
                    seen.clear();
                }
            }
            // Newest first.
            fresh.sort_unstable_by(|a, b| b.cmp(a));
            for nid in fresh {
                // Give Windows time to finish writing the toast XML before we read it.
                std::thread::sleep(std::time::Duration::from_millis(350));
                // Try the rich builder first; if it fails, extract what we can
                // from the raw UserNotification so the flash still appears.
                let item = build_item(&listener, nid).unwrap_or_else(|e| {
                    log(&format!("poll build_item failed for {nid}: {e}"));
                    // Salvage app name / timestamp from the raw object.
                    let (app_name, received_at) = match listener.GetNotification(nid) {
                        Ok(un) => {
                            let name = un.AppInfo().ok().and_then(|info| display_name(&info));
                            let ts = un.CreationTime().ok()
                                .map(|dt| win_ticks_to_unix_ms(dt.UniversalTime))
                                .filter(|ms| *ms > 0)
                                .unwrap_or_else(now_unix_ms);
                            (name.or_else(|| Some("Notificación".into())), ts)
                        }
                        Err(_) => (None, now_unix_ms()),
                    };
                    NotificationItem {
                        id: fnv1a(&format!("poll|{nid}|{}", now_unix_ms())),
                        app_name,
                        title: Some("Nueva notificación".into()),
                        preview: None,
                        icon: None,
                        received_at,
                        seed: false,
                        category: None,
                        tag: None,
                        actions: Vec::new(),
                        privacy: NotificationPrivacyFlags {
                            has_launch_target: false,
                            has_body: false,
                        },
                    }
                });
                log(&format!("POLL: app={:?} title={:?}", item.app_name, item.title));
                let _ = app.emit("notification://received", item);
            }
        }
    });
    log("Poller started");
}

/// Loads the notifications Windows already holds and emits them as seeded items.
fn seed_existing(app: &AppHandle, listener: &UserNotificationListener) {
    const MAX_SEED: usize = 25;
    log("Seeding existing notifications...");
    let Ok(op) = listener.GetNotificationsAsync(NotificationKinds::Toast) else {
        log("GetNotificationsAsync failed");
        return;
    };
    let Ok(list) = op.join() else {
        log("GetNotificationsAsync join failed");
        return;
    };
    let Ok(count) = list.Size() else {
        log("list.Size() failed");
        return;
    };
    log(&format!("Found {count} notifications in Action Center"));
    let mut items: Vec<NotificationItem> = Vec::new();
    for i in 0..count {
        let Ok(un) = list.GetAt(i) else { continue };
        let id = un.Id().unwrap_or(i);
        // Prefer the rich builder; fall back to a minimal item so one bad payload
        // (missing AppInfo, non-toast, unreadable XML) does not empty the whole seed.
        let mut item = build_item(listener, id).unwrap_or_else(|_| NotificationItem {
            id: fnv1a(&format!("seed|{id}")),
            app_name: un
                .AppInfo()
                .ok()
                .and_then(|info| display_name(&info))
                .or_else(|| Some("Notificación".into())),
            title: None,
            preview: None,
            icon: None,
            received_at: un
                .CreationTime()
                .ok()
                .map(|dt| win_ticks_to_unix_ms(dt.UniversalTime))
                .filter(|ms| *ms > 0)
                .unwrap_or_else(now_unix_ms),
            seed: true,
            category: None,
            tag: None,
            actions: Vec::new(),
            privacy: NotificationPrivacyFlags {
                has_launch_target: false,
                has_body: false,
            },
        });
        // Never surface a bare "?" — give the UI something honest to render.
        if item.app_name.as_deref().unwrap_or("").trim().is_empty() {
            item.app_name = Some("Notificación".into());
        }
        if item.title.is_none() && item.preview.is_none() {
            item.title = Some("Notificación de Windows".into());
        }
        item.seed = true;
        items.push(item);
    }
    items.sort_by(|a, b| b.received_at.cmp(&a.received_at));
    items.truncate(MAX_SEED);
    for item in items {
        let _ = app.emit("notification://received", item);
    }
}

fn park_forever() -> ! {
    loop {
        std::thread::park();
    }
}

fn emit_access(app: &AppHandle, status: ListenerStatus, detail: Option<String>) {
    let payload = NotificationAccess {
        status: status.clone(),
        detail,
    };
    if let Ok(mut slot) = ACCESS.lock() {
        *slot = Some(payload.clone());
    }
    let _ = app.emit("notification://access", payload);
}

fn current_access_status() -> ListenerStatus {
    ACCESS
        .lock()
        .ok()
        .and_then(|g| g.as_ref().map(|a| a.status.clone()))
        .unwrap_or(ListenerStatus::Pending)
}

/// Last status as seen by the UI layer. `Pending` only before the first emit.
pub fn access_snapshot() -> NotificationAccess {
    ACCESS
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or(NotificationAccess {
            status: ListenerStatus::Pending,
            detail: None,
        })
}

fn build_item(listener: &UserNotificationListener, id: u32) -> Result<NotificationItem, String> {
    let un: UserNotification = listener
        .GetNotification(id)
        .map_err(|e| e.to_string())?;

    let (app_name, icon) = match un.AppInfo() {
        Ok(info) => (display_name(&info), read_app_icon(&info).ok().flatten()),
        Err(_) => (None, None),
    };

    let received_at = un
        .CreationTime()
        .ok()
        .map(|dt| win_ticks_to_unix_ms(dt.UniversalTime))
        .filter(|ms| *ms > 0)
        .unwrap_or_else(now_unix_ms);

    let notification = un.Notification().map_err(|e| e.to_string())?;

    // Try ToastNotification cast first (gives full XML with launch attr etc.)
    let xml = match notification.cast::<ToastNotification>() {
        Ok(toast) => {
            toast
                .Content()
                .ok()
                .and_then(|doc| doc.GetXml().ok())
                .map(|h| h.to_string())
                .unwrap_or_default()
        }
        Err(_) => {
            // Fallback: extract text from Visual → GetBinding → GetTextElements
            let mut texts: Vec<String> = Vec::new();
            if let Ok(visual) = notification.Visual() {
                for tmpl in ["ToastGeneric", "ToastText02", "ToastText04"] {
                    if let Ok(binding) = visual.GetBinding(&windows::core::HSTRING::from(tmpl)) {
                        if let Ok(elements) = binding.GetTextElements() {
                            if let Ok(n) = elements.Size() {
                                for i in 0..n {
                                    if let Ok(el) = elements.GetAt(i) {
                                        if let Ok(t) = el.Text() {
                                            let s = t.to_string();
                                            if !s.trim().is_empty() {
                                                texts.push(s);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    if !texts.is_empty() {
                        break;
                    }
                }
            }
            // Reconstruct minimal XML from texts
            let t = texts.first().map(|s| s.as_str()).unwrap_or("");
            let p = texts.get(1).map(|s| s.as_str()).unwrap_or("");
            format!(
                "<toast><visual><binding template=\"ToastGeneric\"><text>{t}</text><text>{p}</text></binding></visual></toast>"
            )
        }
    };

    let texts = extract_texts(&xml);
    let title = texts.first().cloned().filter(|s| !s.trim().is_empty());
    let preview = texts.get(1).cloned().filter(|s| !s.trim().is_empty());

    let tag = None; // Tag is on ToastNotification, not INotification

    let launch = extract_attr(&xml, "toast", "launch").filter(|s| !s.is_empty());
    let has_launch_target = launch
        .as_ref()
        .map(|l| l.starts_with("http://") || l.starts_with("https://"))
        .unwrap_or(false);

    let mut actions = Vec::new();
    if has_launch_target {
        if let Some(l) = launch.clone() {
            actions.push(NotificationAction {
                id: "open".into(),
                label: "Abrir".into(),
                kind: NotificationActionKind::OpenUri,
                payload: Some(l),
            });
        }
    }

    let mut id_source = String::with_capacity(xml.len() + 32);
    id_source.push_str(&id.to_string());
    id_source.push('|');
    id_source.push_str(&xml);
    let id_hash = fnv1a(&id_source);
    let has_body = preview.is_some();

    Ok(NotificationItem {
        id: id_hash,
        app_name,
        title,
        preview,
        icon,
        received_at,
        seed: false,
        category: None,
        tag,
        actions,
        privacy: NotificationPrivacyFlags {
            has_launch_target,
            has_body,
        },
    })
}

fn display_name(info: &AppInfo) -> Option<String> {
    info.DisplayInfo()
        .ok()
        .and_then(|d| d.DisplayName().ok())
        .map(|s| s.to_string())
        .filter(|s| !s.trim().is_empty())
}

fn read_app_icon(info: &AppInfo) -> Result<Option<String>, String> {
    let display: AppDisplayInfo = info.DisplayInfo().map_err(|e| e.to_string())?;
    let reference: RandomAccessStreamReference = display
        .GetLogo(Size {
            Width: 64.0,
            Height: 64.0,
        })
        .map_err(|e| e.to_string())?;
    let stream = reference
        .OpenReadAsync()
        .and_then(|op| op.join())
        .map_err(|e| e.to_string())?;
    let size = stream.Size().map_err(|e| e.to_string())?;
    if size == 0 || size > 2_000_000 {
        return Ok(None);
    }
    let reader = DataReader::CreateDataReader(&stream).map_err(|e| e.to_string())?;
    let len = size as u32;
    reader
        .LoadAsync(len)
        .and_then(|op| op.join())
        .map_err(|e| e.to_string())?;
    let mut buf = vec![0u8; len as usize];
    reader.ReadBytes(&mut buf).map_err(|e| e.to_string())?;
    let mime = stream
        .ContentType()
        .map(|h| h.to_string())
        .unwrap_or_else(|_| "image/png".into());
    let mime = if mime.starts_with("image/") {
        mime
    } else {
        "image/png".into()
    };
    use base64::engine::general_purpose::STANDARD as B64;
    use base64::Engine;
    Ok(Some(format!("data:{mime};base64,{}", B64.encode(&buf))))
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

pub fn win_ticks_to_unix_ms(ticks: i64) -> i64 {
    (ticks - TICKS_UNIX_EPOCH).div_euclid(10_000)
}

/// Minimal text extraction from the toast XML payload. Only `<text>` nodes are read;
/// the payload is never written to logs.
pub fn extract_texts(xml: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<text") {
        let after_tag = match rest[start..].find('>') {
            Some(i) => start + i + 1,
            None => break,
        };
        let end = match rest[after_tag..].find("</text>") {
            Some(i) => after_tag + i,
            None => break,
        };
        let inner = &rest[after_tag..end];
        let text = unescape(inner.trim());
        if !text.is_empty() {
            out.push(text);
        }
        rest = &rest[end + 7..];
    }
    out
}

pub fn extract_attr(xml: &str, tag: &str, attr: &str) -> Option<String> {
    let open = format!("<{tag}");
    let start = xml.find(&open)?;
    let tag_end = xml[start..].find('>')? + start;
    let head = &xml[start..=tag_end];
    let needle = format!("{attr}=\"");
    let i = head.find(&needle)? + needle.len();
    let j = head[i..].find('"')? + i;
    Some(unescape(&head[i..j]))
}

pub fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut rest = s;
    while let Some(i) = rest.find('&') {
        out.push_str(&rest[..i]);
        let after = &rest[i + 1..];
        let end = after.find(';').map(|e| e + 1);
        match end {
            Some(len) => {
                let entity = &after[..len - 1];
                let replaced: Option<char> = match entity {
                    "amp" => Some('&'),
                    "lt" => Some('<'),
                    "gt" => Some('>'),
                    "quot" => Some('"'),
                    "apos" => Some('\''),
                    _ => {
                        if let Some(hex) = entity
                            .strip_prefix("#x")
                            .or_else(|| entity.strip_prefix("#X"))
                        {
                            u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
                        } else if let Some(dec) = entity.strip_prefix('#') {
                            dec.parse::<u32>().ok().and_then(char::from_u32)
                        } else {
                            None
                        }
                    }
                };
                match replaced {
                    Some(c) => {
                        out.push(c);
                        rest = &after[len..];
                    }
                    None => {
                        out.push('&');
                        rest = after;
                    }
                }
            }
            None => {
                out.push('&');
                rest = after;
            }
        }
    }
    out.push_str(rest);
    out
}

pub fn fnv1a(input: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in input.as_bytes() {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

#[allow(dead_code)]
fn _kinds_supported() -> NotificationKinds {
    NotificationKinds::Toast
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_text_nodes() {
        let xml = r#"<toast launch="app"><visual><binding><text id="1">Hola</text><text id="2">Mundo &amp; más</text></binding></visual></toast>"#;
        let texts = extract_texts(xml);
        assert_eq!(texts, vec!["Hola".to_string(), "Mundo & más".to_string()]);
    }

    #[test]
    fn extracts_launch_attribute() {
        let xml = r#"<toast launch="https://example.com/x" activationType="protocol">"#;
        assert_eq!(
            extract_attr(xml, "toast", "launch"),
            Some("https://example.com/x".into())
        );
        assert_eq!(extract_attr(xml, "toast", "missing"), None);
    }

    #[test]
    fn unescapes_entities() {
        assert_eq!(
            unescape("a &lt;b&gt; &amp; &quot;c&quot; &#x41;"),
            "a <b> & \"c\" A"
        );
        assert_eq!(unescape("sin entidades"), "sin entidades");
        assert_eq!(unescape("entidad &desconocida;"), "entidad &desconocida;");
    }

    #[test]
    fn dedupe_id_is_stable() {
        let a = fnv1a("payload|tag|123");
        let b = fnv1a("payload|tag|123");
        let c = fnv1a("payload|tag|124");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 16);
    }

    #[test]
    fn converts_win_ticks_to_unix_ms() {
        // 1601-01-01T00:00:00Z => unix epoch (0 ms)
        assert_eq!(win_ticks_to_unix_ms(TICKS_UNIX_EPOCH), 0);
        // +10000 ticks = 1 ms
        assert_eq!(win_ticks_to_unix_ms(TICKS_UNIX_EPOCH + 10_000), 1);
        // 2020-01-01T00:00:00Z = 1577836800000 ms
        let ticks_2020 = TICKS_UNIX_EPOCH + 15_778_368_000_000_000i64;
        assert_eq!(win_ticks_to_unix_ms(ticks_2020), 1_577_836_800_000);
    }
}
