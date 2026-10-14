# Privacy

Halo is a local-only desktop widget. Nothing about your usage leaves your computer.

## What Halo reads

- **Media metadata** of the *currently playing* session via Windows SMTC: title, artist,
  album, artwork, position/duration, supported controls. Read on demand and when Windows
  notifies of a session change. Never the audio itself.
- **Notification metadata** via the Windows `UserNotificationListener`: app name, title,
  body text, timestamp, icon and action labels of notifications already delivered to you.
  Stored **in memory only**, pruned by the configured history window (default 30 min), and
  discarded when the app exits.
- **System volume level and mute state** via Core Audio, and the default output device name.

## What Halo never does

- No AI, no model inference, no cloud calls of any kind.
- No telemetry, analytics, crash reporting or usage tracking.
- No audio capture: Halo never records or analyses sound. The waveform in the music card is
  a decorative animation driven by the play/pause state.
- No notification contents in logs. Errors are reported without payload text.
- No screen capture, no keylogging. The global hotkey is registered through the Windows
  hotkey API, not by reading keystrokes.
- No network requests, except opening URLs *you* explicitly click through a shortcut or a
  notification action (and only `http`/`https`).

## Where data lives

| Data | Location |
| --- | --- |
| Settings | `%APPDATA%/Halo/halo-settings.json` (Tauri store, local disk) |
| Timer state (optional) | `localStorage` of the app webview — only if you enable "Record timers across restarts" |
| Notification queue | RAM only |
| AUMID registration | `HKCU\Software\Classes\AppUserModelId\HaloIsland.Desktop` (needed for Windows to attribute notifications) |

## Controls

- **Hide notification previews** — body text is never rendered.
- **Do not disturb** — suppresses visual alerts.
- **History window** — how long notifications stay in the queue.
- **Disable notifications** — Halo stops listening entirely.
- **Launch at startup** — registered per-user in your own registry hive; nothing machine-wide.

Deleting `%APPDATA%/Halo` removes every trace of Halo's configuration.
