# Halo

**Dynamic Island for Windows** — a floating widget at the top of your screen that shows your music, notifications, timers, volume and shortcuts in one place.

Real integrations only — no fake data, no AI, no telemetry.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?logo=typescript&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-MSVC-orange?logo=rust&logoColor=white)
![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white)
![Tests](https://img.shields.io/badge/tests-34%20passed-brightgreen)

---

## Features

| Feature | How it works |
| --- | --- |
| **Music player** | Title, artist, album artwork, progress bar, play/pause/next/prev via Windows SMTC |
| **Notifications** | Real-time queue from Windows Action Center with app icons, titles, previews |
| **Timers** | Countdown with alarm tone, multiple simultaneous timers |
| **Volume** | System volume slider and mute toggle via Core Audio |
| **Shortcuts** | Launch any web URL, app, file, or folder with one click |
| **Global hotkey** | `Ctrl+Alt+H` toggles the panel from anywhere |
| **Autostart** | Launches on login, minimizes to tray |
| **Halo Studio** | Full settings panel with export/import |

## Install

Download the latest release and run the installer:

```
Halo_0.1.0_x64-setup.exe
```

- Installs **per-user** (no admin rights needed)
- Requires Windows 10 1809+ or Windows 11
- WebView2 Runtime (preinstalled on Windows 11)

Or grab the **portable** version — no install, runs from any folder.

## Usage

| Action | Result |
| --- | --- |
| Hover the capsule | Live preview expands |
| Click the capsule | Full panel opens |
| `Ctrl+Alt+H` | Toggle panel from anywhere |
| `Esc` | Collapse (or step back in Halo Studio) |
| Close window | Hides to tray (not quit) |
| Tray → Salir | Quit Halo |

## Build from source

### Prerequisites

- **Node.js** 20+
- **Rust** stable (MSVC toolchain)
- **VS Build Tools 2022** with C++ workload
- **WebView2 SDK** (installed automatically by Tauri CLI)

### Commands

```powershell
# Install dependencies
npm install

# Development (hot reload)
npm run tauri:dev

# Release build (creates .exe + NSIS installer)
npm run tauri:build

# Portable build (single .exe, no installer)
npm run portable
```

The installer appears at:
```
src-tauri\target\release\bundle\nsis\Halo_0.1.0_x64-setup.exe
```

## Tests

```powershell
npm test           # 34 Vitest tests (state machine, queue, timers, settings)
npm run typecheck  # Strict TypeScript check
cargo test --lib   # Rust tests (XML parsing, validation)
```

## Architecture

```
src/                          React 19 + TypeScript (strict)
├── app/App.tsx               Root providers + system integration
├── components/
│   ├── HaloIsland/           Capsule + ExpandedPanel
│   ├── MusicPlayer/          Media controls + volume
│   ├── Notifications/        Queue panel
│   ├── Timer/                Timer panel
│   ├── QuickActions/         Shortcut grid
│   └── Settings/             Halo Studio
├── state/
│   ├── islandMachine.ts      Pure reducer (finite state machine)
│   ├── NotificationsContext.tsx
│   ├── TimersContext.tsx
│   └── SettingsContext.tsx
└── services/bridge.ts        Typed, failure-tolerant Tauri IPC

src-tauri/src/                Rust backend
├── media.rs                  Windows SMTC integration
├── notifications.rs          UserNotificationListener + polling fallback
├── audio.rs                  Core Audio (IAudioEndpointVolume)
├── window_pos.rs             Screen positioning + DPI
├── tray.rs                   System tray menu
├── shortcuts.rs              Launch URLs, apps, files
├── settings.rs               Persistent settings (JSON)
├── commands.rs               IPC command handlers
└── payloads.rs               Shared types (TS ↔ Rust)
```

## Privacy

Halo runs **entirely on your machine**. No cloud, no AI, no telemetry, no analytics.

- Notifications are read locally via Windows `UserNotificationListener`
- Music metadata comes from Windows SMTC (local session)
- Settings are stored in a local JSON file
- See [docs/PRIVACY.md](docs/PRIVACY.md) for full details

## Documentation

- [docs/BUILD_WINDOWS.md](docs/BUILD_WINDOWS.md) — Full toolchain setup
- [docs/TESTING.md](docs/TESTING.md) — Test strategy and how to extend
- [docs/PRIVACY.md](docs/PRIVACY.md) — Data handling
- [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) — Honest limitations
- [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) — Feature status

## License

MIT
