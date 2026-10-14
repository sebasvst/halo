//! Windows SMTC integration (`GlobalSystemMediaTransportControlsSessionManager`).
//!
//! All WinRT session access happens on a single dedicated thread with COM initialised in an
//! MTA apartment; commands are forwarded to it over a channel so the frontend never touches
//! WinRT types directly.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, OnceLock};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use windows::Foundation::TypedEventHandler;
use windows::Media::Control::{
    GlobalSystemMediaTransportControlsSession as Session,
    GlobalSystemMediaTransportControlsSessionManager as SessionManager,
    GlobalSystemMediaTransportControlsSessionPlaybackStatus,
};
use windows::Storage::Streams::{DataReader, IRandomAccessStreamReference};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

use crate::payloads::{MediaState, MediaStatus, SupportedActions};

enum Cmd {
    PlayPause,
    Next,
    Previous,
    Refresh,
}

static CMD_TX: OnceLock<mpsc::Sender<Cmd>> = OnceLock::new();
static LAST_STATE_HASH: AtomicU64 = AtomicU64::new(0);

pub fn init(app: AppHandle) {
    let (tx, rx) = mpsc::channel::<Cmd>();
    let _ = CMD_TX.set(tx);

    std::thread::spawn(move || {
        unsafe {
            // HRESULT ignored: COM may already be initialised on this fresh thread.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }

        let manager = match SessionManager::RequestAsync().and_then(|op| op.join()) {
            Ok(m) => m,
            Err(_) => {
                let _ = app.emit("media://state", MediaState::default());
                return;
            }
        };

        attach_manager_handlers(&app, &manager);
        refresh_now(&app);

        let mut attached_session: Option<Session> = manager.GetCurrentSession().ok();
        attach_session_handlers(&app, attached_session.as_ref());

        let mut tick: u64 = 0;
        loop {
            let cmd = rx.recv_timeout(Duration::from_millis(500));
            match cmd {
                Ok(Cmd::PlayPause) => {
                    if let Ok(s) = manager.GetCurrentSession() {
                        if let Ok(info) = s.GetPlaybackInfo() {
                            let playing = info
                                .PlaybackStatus()
                                .map(|st| {
                                    st == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
                                })
                                .unwrap_or(false);
                            let _ = if playing {
                                s.TryPauseAsync()
                            } else {
                                s.TryPlayAsync()
                            };
                        }
                    }
                    std::thread::sleep(Duration::from_millis(80));
                    refresh_now(&app);
                }
                Ok(Cmd::Next) => {
                    if let Ok(s) = manager.GetCurrentSession() {
                        let _ = s.TrySkipNextAsync();
                    }
                    std::thread::sleep(Duration::from_millis(150));
                    refresh_now(&app);
                }
                Ok(Cmd::Previous) => {
                    if let Ok(s) = manager.GetCurrentSession() {
                        let _ = s.TrySkipPreviousAsync();
                    }
                    std::thread::sleep(Duration::from_millis(150));
                    refresh_now(&app);
                }
                Ok(Cmd::Refresh) => refresh_now(&app),
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }

            tick += 1;
            // Session replacement check every ~1s is enough; live position while
            // playing is refreshed on every 500ms tick so the bar feels real-time.
            if tick % 2 == 0 {
                let current = manager.GetCurrentSession().ok();
                let changed = match (current.as_ref(), attached_session.as_ref()) {
                    (Some(a), Some(b)) => a != b,
                    (Some(_), None) => true,
                    (None, Some(_)) => true,
                    (None, None) => false,
                };
                if changed {
                    attached_session = current;
                    attach_session_handlers(&app, attached_session.as_ref());
                    refresh_now(&app);
                } else {
                    let playing = attached_session
                        .as_ref()
                        .and_then(|s| s.GetPlaybackInfo().ok())
                        .and_then(|i| i.PlaybackStatus().ok())
                        .map(|st| {
                            st == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing
                        })
                        .unwrap_or(false);
                    if playing {
                        refresh_now(&app);
                    }
                }
            }
        }
    });
}

fn attach_manager_handlers(app: &AppHandle, manager: &SessionManager) {
    let app_for = app.clone();
    let _ = manager.CurrentSessionChanged(&TypedEventHandler::new(move |_, _| {
        refresh_now(&app_for);
        Ok(())
    }));
}

fn attach_session_handlers(app: &AppHandle, session: Option<&Session>) {
    let Some(session) = session else { return };
    let app_for = app.clone();
    let _ = session.MediaPropertiesChanged(&TypedEventHandler::new(move |_, _| {
        refresh_now(&app_for);
        Ok(())
    }));
    let app_for = app.clone();
    let _ = session.PlaybackInfoChanged(&TypedEventHandler::new(move |_, _| {
        refresh_now(&app_for);
        Ok(())
    }));
    let app_for = app.clone();
    let _ = session.TimelinePropertiesChanged(&TypedEventHandler::new(move |_, _| {
        refresh_now(&app_for);
        Ok(())
    }));
}

pub fn play_pause() {
    let _ = CMD_TX.get().map(|tx| tx.send(Cmd::PlayPause));
}

pub fn next() {
    let _ = CMD_TX.get().map(|tx| tx.send(Cmd::Next));
}

pub fn previous() {
    let _ = CMD_TX.get().map(|tx| tx.send(Cmd::Previous));
}

pub fn refresh() {
    let _ = CMD_TX.get().map(|tx| tx.send(Cmd::Refresh));
}

fn refresh_now(app: &AppHandle) {
    let state = build_state().unwrap_or_default();
    let h = state_hash(&state);
    if h != LAST_STATE_HASH.swap(h, Ordering::Relaxed) {
        let _ = app.emit("media://state", state);
    }
}

fn state_hash(s: &MediaState) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    let mut mix = |v: &str| {
        for b in v.as_bytes() {
            h ^= u64::from(*b);
            h = h.wrapping_mul(0x100000001b3);
        }
    };
    mix(&format!(
        "{}|{:?}|{}|{}|{}|{}|{}",
        s.available,
        s.status,
        s.title.as_deref().unwrap_or(""),
        s.artist.as_deref().unwrap_or(""),
        s.app_id.as_deref().unwrap_or(""),
        s.duration_ms.unwrap_or(0),
        s.art_data_url.is_some()
    ));
    // Quantise position to whole seconds so 500ms ticks do not re-emit constantly.
    mix(&format!("{}", s.position_ms.unwrap_or(0) / 1000));
    h
}

fn build_state() -> Result<MediaState, String> {
    let manager = SessionManager::RequestAsync()
        .and_then(|op| op.join())
        .map_err(|e| e.to_string())?;
    let session = manager
        .GetCurrentSession()
        .map_err(|_| "no media session".to_string())?;

    let info = session.GetPlaybackInfo().map_err(|e| e.to_string())?;
    let status = match info.PlaybackStatus() {
        Ok(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing) => MediaStatus::Playing,
        Ok(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Paused) => MediaStatus::Paused,
        Ok(GlobalSystemMediaTransportControlsSessionPlaybackStatus::Stopped) => MediaStatus::Stopped,
        Ok(_) => MediaStatus::Unknown,
        Err(_) => MediaStatus::Unknown,
    };

    let controls = info.Controls().map_err(|e| e.to_string())?;
    let supported = SupportedActions {
        play: controls.IsPlayEnabled().unwrap_or(false),
        pause: controls.IsPauseEnabled().unwrap_or(false),
        next: controls.IsNextEnabled().unwrap_or(false),
        previous: controls.IsPreviousEnabled().unwrap_or(false),
    };

    let (title, artist, album, art) =
        match session.TryGetMediaPropertiesAsync().and_then(|op| op.join()) {
            Ok(props) => {
                let title = non_empty(props.Title().ok().map(|s| s.to_string()));
                let artist = non_empty(props.Artist().ok().map(|s| s.to_string()));
                let album = non_empty(props.AlbumTitle().ok().map(|s| s.to_string()));
                let art = props
                    .Thumbnail()
                    .ok()
                    .and_then(|_| read_art(&session).ok().flatten());
                (title, artist, album, art)
            }
            Err(_) => (None, None, None, None),
        };

    let (position_ms, duration_ms) = match session.GetTimelineProperties() {
        Ok(tl) => {
            let pos = tl
                .Position()
                .ok()
                .map(|t| (t.Duration.max(0) / 10_000) as u64);
            let end = tl
                .EndTime()
                .ok()
                .map(|t| (t.Duration.max(0) / 10_000) as u64)
                .filter(|d| *d > 0);
            (pos, end)
        }
        Err(_) => (None, None),
    };

    let app_id = non_empty(session.SourceAppUserModelId().ok().map(|s| s.to_string()));

    Ok(MediaState {
        available: true,
        title,
        artist,
        album,
        status,
        position_ms,
        duration_ms,
        app_id,
        art_data_url: art,
        supported,
    })
}

fn non_empty(v: Option<String>) -> Option<String> {
    v.filter(|s| !s.trim().is_empty())
}

fn read_art(session: &Session) -> Result<Option<String>, String> {
    let props = session
        .TryGetMediaPropertiesAsync()
        .and_then(|op| op.join())
        .map_err(|e| e.to_string())?;
    let thumb: IRandomAccessStreamReference = props.Thumbnail().map_err(|e| e.to_string())?;
    let stream = thumb
        .OpenReadAsync()
        .and_then(|op| op.join())
        .map_err(|e| e.to_string())?;
    let size = stream.Size().map_err(|e| e.to_string())?;
    if size == 0 || size > 5_000_000 {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn base_state() -> MediaState {
        MediaState {
            available: true,
            title: Some("Song".into()),
            artist: Some("Artist".into()),
            status: MediaStatus::Playing,
            position_ms: Some(1000),
            duration_ms: Some(180_000),
            app_id: Some("player.exe".into()),
            art_data_url: None,
            ..Default::default()
        }
    }

    #[test]
    fn hash_ignores_sub_second_position_changes() {
        let mut a = base_state();
        let mut b = base_state();
        a.position_ms = Some(1000);
        b.position_ms = Some(1400);
        assert_eq!(state_hash(&a), state_hash(&b));
        b.position_ms = Some(2100);
        assert_ne!(state_hash(&a), state_hash(&b));
    }

    #[test]
    fn hash_changes_with_title_and_status() {
        let a = base_state();
        let mut b = base_state();
        b.title = Some("Other".into());
        assert_ne!(state_hash(&a), state_hash(&b));
        let mut c = base_state();
        c.status = MediaStatus::Paused;
        assert_ne!(state_hash(&a), state_hash(&c));
    }
}
