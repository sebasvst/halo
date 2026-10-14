//! Real system volume control through the Windows Core Audio (MMDevice) API.
//!
//! Audio state is read on demand (when the panel opens or after a command). A lightweight
//! peak-meter thread also samples the default render endpoint ~20×/s while the app is alive
//! so the island waveform can react to real system audio (WASAPI loopback meter).

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
use windows::Win32::Media::Audio::{
    eConsole, eRender, IMMDevice, IMMDeviceEnumerator, MMDeviceEnumerator,
};
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED, STGM_READ,
};
use windows::Win32::System::Variant::VARENUM;
use windows::Win32::UI::Shell::ShellExecuteW;

use crate::payloads::AudioState;
const VT_LPWSTR: VARENUM = VARENUM(31);

/// Latest peak sample scaled to 0..=1000 (u32) so it crosses the Tauri IPC cheaply.
static PEAK_MILLI: AtomicU32 = AtomicU32::new(0);
/// Flips false when the peak thread should exit (app quit).
static PEAK_ALIVE: AtomicBool = AtomicBool::new(false);
static PEAK_APP: OnceLock<AppHandle> = OnceLock::new();

fn with_com<T>(f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    unsafe {
        // S_OK/S_FALSE => this call owns the init and must uninitialise. RPC_E_CHANGED_MODE
        // (negative) means an apartment already exists on this thread; that is fine.
        let hr = CoInitializeEx(None, COINIT_MULTITHREADED).0;
        let owned = hr >= 0;
        let result = f();
        if owned {
            windows::Win32::System::Com::CoUninitialize();
        }
        result
    }
}

fn default_device() -> Result<IMMDevice, String> {
    unsafe {
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|e| format!("dispositivo de audio no disponible: {e}"))?;
        enumerator
            .GetDefaultAudioEndpoint(eRender, eConsole)
            .map_err(|e| format!("sin endpoint de salida por defecto: {e}"))
    }
}

fn volume_interface(device: &IMMDevice) -> Result<IAudioEndpointVolume, String> {
    unsafe { device.Activate(CLSCTX_ALL, None).map_err(|e| e.to_string()) }
}

fn meter_interface(device: &IMMDevice) -> Result<IAudioMeterInformation, String> {
    unsafe { device.Activate(CLSCTX_ALL, None).map_err(|e| e.to_string()) }
}

/// Starts a background WASAPI peak sampler. Emits `audio://peak` (0..=1) whenever the
/// smoothed peak changes by more than ~1.5% so the waveform feels alive without flooding IPC.
pub fn start_peak_meter(app: AppHandle) {
    if PEAK_APP.set(app.clone()).is_err() {
        return;
    }
    PEAK_ALIVE.store(true, Ordering::Relaxed);
    std::thread::spawn(move || {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
        loop {
            if !PEAK_ALIVE.load(Ordering::Relaxed) {
                break;
            }
            let peak = sample_peak().unwrap_or(0.0);
            // Exponential smoothing — kills zipper noise, keeps the bars musical.
            let prev = PEAK_MILLI.load(Ordering::Relaxed) as f32 / 1000.0;
            let smoothed = prev * 0.45 + peak * 0.55;
            let milli = (smoothed * 1000.0).round() as u32;
            let prev_milli = PEAK_MILLI.swap(milli, Ordering::Relaxed);
            // Emit when the value moved enough to be visible (~1.5%).
            if prev_milli.abs_diff(milli) >= 15 {
                if let Some(handle) = PEAK_APP.get() {
                    let _ = handle.emit("audio://peak", smoothed.clamp(0.0, 1.0));
                }
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        unsafe {
            windows::Win32::System::Com::CoUninitialize();
        }
    });
}
#[allow(dead_code)]
pub fn stop_peak_meter() {
    PEAK_ALIVE.store(false, Ordering::Relaxed);
}

/// Peak of the default render endpoint (0..=1). Returns 0.0 if the meter is unavailable.
fn sample_peak() -> Result<f32, String> {
    with_com(|| {
        let device = default_device()?;
        let meter = meter_interface(&device)?;
        unsafe {
            let peak = meter.GetPeakValue().map_err(|e| e.to_string())?;
            Ok(peak.clamp(0.0, 1.0))
        }
    })
}

/// Latest smoothed peak (0..=1) for tests / synchronous reads.
#[allow(dead_code)]
pub fn current_peak() -> f32 {
    PEAK_MILLI.load(Ordering::Relaxed) as f32 / 1000.0
}

pub fn get_state() -> Result<AudioState, String> {
    with_com(|| {
        let device = default_device()?;
        let vol = volume_interface(&device)?;
        unsafe {
            let level = vol.GetMasterVolumeLevelScalar().map_err(|e| e.to_string())?;
            let muted = vol.GetMute().map_err(|e| e.to_string())?;
            Ok(AudioState {
                level: level.clamp(0.0, 1.0),
                muted: muted.as_bool(),
                device_name: device_name(&device),
            })
        }
    })
}

pub fn set_level(level: f32) -> Result<AudioState, String> {
    with_com(|| {
        let device = default_device()?;
        let vol = volume_interface(&device)?;
        unsafe {
            vol.SetMasterVolumeLevelScalar(level.clamp(0.0, 1.0), std::ptr::null())
                .map_err(|e| e.to_string())?;
        }
        read_back(&vol, &device)
    })
}

pub fn toggle_mute() -> Result<AudioState, String> {
    with_com(|| {
        let device = default_device()?;
        let vol = volume_interface(&device)?;
        unsafe {
            let muted = vol.GetMute().map_err(|e| e.to_string())?;
            vol.SetMute(!muted.as_bool(), std::ptr::null()).map_err(|e| e.to_string())?;
        }
        read_back(&vol, &device)
    })
}

fn read_back(vol: &IAudioEndpointVolume, device: &IMMDevice) -> Result<AudioState, String> {
    unsafe {
        let level = vol.GetMasterVolumeLevelScalar().map_err(|e| e.to_string())?;
        let muted = vol.GetMute().map_err(|e| e.to_string())?;
        Ok(AudioState {
            level: level.clamp(0.0, 1.0),
            muted: muted.as_bool(),
            device_name: device_name(device),
        })
    }
}

fn device_name(device: &IMMDevice) -> Option<String> {
    unsafe {
        let store = device.OpenPropertyStore(STGM_READ).ok()?;
        let key = PKEY_Device_FriendlyName;
        let pv: PROPVARIANT = store.GetValue(std::ptr::addr_of!(key)).ok()?;
        propvariant_wide_string(&pv)
    }
}

/// Reads the wide string carried by a `PROPVARIANT` when its type is `VT_LPWSTR`.
unsafe fn propvariant_wide_string(pv: &PROPVARIANT) -> Option<String> {
    let vt = pv.Anonymous.Anonymous.vt;
    if vt != VT_LPWSTR {
        return None;
    }
    let ptr = pv.Anonymous.Anonymous.Anonymous.pwszVal;
    if ptr.is_null() {
        return None;
    }
    let s = ptr.to_string().ok()?;
    if s.trim().is_empty() { None } else { Some(s) }
}

pub fn open_sound_settings() {
    unsafe {
        ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::w!("ms-settings:sound"),
            None,
            None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        );
    }
}

pub fn clamp_level(level: f32) -> f32 {
    level.clamp(0.0, 1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_volume_level() {
        assert_eq!(clamp_level(-0.5), 0.0);
        assert_eq!(clamp_level(0.42), 0.42);
        assert_eq!(clamp_level(1.7), 1.0);
    }

    #[test]
    fn peak_defaults_to_zero() {
        // The sampler thread is not running under `cargo test`.
        assert_eq!(current_peak(), 0.0);
    }
}
