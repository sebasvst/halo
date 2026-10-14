# Implementation status

Last verified: 2026-10-11 — `npm run typecheck` ✔, `npm test` (34) ✔,
`cargo test --lib` (22) ✔, `npm run build` ✔, `npm run tauri:build` ✔,
installer produced, app boots (≈30 MB working set).

## Done

### Shell & packaging
- Tauri 2 app, transparent borderless always-on-top window, no taskbar entry
- NSIS per-user installer, generated original icons, tray menu, single instance
- Close → hide; only *Salir* quits; second launch reveals the island
- Least-privilege capability file, CSP restricted in `tauri.conf.json`

### Island state
- Pure reducer (`src/state/islandMachine.ts`): compact / preview / expanded / hidden,
  home / settings views, emphasis, badge, `MIN_DWELL_MS` hover hysteresis
- `useIsland` hook: layout sync to the native window, display/DPI relayout, focus-loss
  collapse, auto-collapse paused while hovering
- Global hotkey `Ctrl+Alt+H` (editable), `Esc` handling

### Real integrations (Rust)
- **SMTC media**: dedicated thread session watcher, hash-deduped state emission,
  play/pause/next/previous commands
- **Notifications**: `UserNotificationListener` with access-status reporting, AUMID +
  registry association install, own XML toast parser, `notification://received` events
- **Audio**: Core Audio volume/mute + device name + open Windows sound settings
- **Shortcuts**: validation (scheme/path/existence/confirmation rules) and opening
- **Window**: top-centre placement inside the work area, `WM_DISPLAYCHANGE`/`WM_DPICHANGED`
- **Settings**: strict schema with clamping, export/import strings, store persistence
- **Tray**: show/hide, DND toggle, open settings

### Frontend
- Capsule with contextual content (flash notification / timer / song + waveform / idle)
- Expanded panel: music player, volume control, notification queue, timers, quick actions
- Halo Studio settings (appearance, interaction, music, notifications, timers, system,
  shortcuts, export/import, quit) with live persistence
- Design tokens, dark/light themes, transparency knob, animation-speed & reduced-motion
  (respects `prefers-reduced-motion` unless overridden)
- Strict TypeScript throughout; settings sanitization at the trust boundary

## Remaining / next

- Drag the island to a free position (currently top-centre only)
- Per-monitor preference and multi-monitor awareness beyond auto-follow
- Grouping of notifications from the same app (setting exists, not yet applied)
- Icon extraction for shortcuts (icons accepted in the model, not yet rendered)
- Localization (Spanish strings are hardcoded today; no i18n layer yet)
- Manual checklist pass on a second Windows machine / multi-monitor setup
