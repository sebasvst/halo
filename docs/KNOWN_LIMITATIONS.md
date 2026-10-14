# Known limitations

Halo deliberately reports honest states instead of inventing data.

## Windows API limitations

- **Notification access** — Windows prompts the user once for listener access. If access is
  denied, Halo shows an explicit `denied` banner with instructions instead of an empty
  "you have no notifications" message. Dismissing a notification inside Halo removes it from
  Halo's queue only; it does **not** dismiss it in Windows (the listener API cannot do that).
- **Media position** — SMTC reports position/duration only for sessions that expose it.
  Some browsers/older apps report `null`; Halo then hides the timestamps rather than showing
  `0:00`.
- **Artwork** — provided only when the session supplies an image stream.
- **Volume** — Core Audio controls the *default* output device. Switching devices updates the
  name on refresh; apps with exclusive-mode access may ignore volume changes briefly.
- **AUMID** — Halo registers `HaloIsland.Desktop` under HKCU so Windows attributes
  notifications to it. It does not register a Start-menu shortcut or a Start-menu identity.

## Platform limitations

- Windows only (Tauri's other platforms are untested and the Rust code uses Win32 APIs).
- Multiple monitors: the island anchors to the work area of the display containing the
  cursor at startup and follows `WM_DISPLAYCHANGE`; per-monitor manual placement is not yet
  offered.
- The island is top-centre and floating; it is not draggable to arbitrary positions yet.
- Full-screen games with exclusive cursor capture may prevent hover/click until you
  `Alt+Tab`; the global hotkey still works.
- WebView2 Runtime is required (preinstalled on Windows 11; the installer does not bundle it).

## Behaviour notes

- The waveform is decorative — it reflects play/pause state, not the audio signal.
- Closing the window hides Halo (tray); only *Salir* quits.
- Settings import/export uses a JSON file you choose; no settings are ever uploaded.
