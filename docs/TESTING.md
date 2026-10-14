# Testing

```powershell
npm test               # frontend (Vitest + jsdom + Testing Library)
npm run test:watch     # watch mode
npm run typecheck      # strict TypeScript project build
cd src-tauri; cargo test --lib   # Rust unit tests
```

Current coverage: **34 frontend tests** (4 files) + **22 Rust tests**, all green.

## Frontend suites

| File | Covers |
| --- | --- |
| `tests/islandMachine.test.ts` | Pure state machine: hover hysteresis (`MIN_DWELL_MS`), click/escape/global-toggle transitions, badge clamping, hide/show, emphasis |
| `tests/notifications.test.tsx` | Queue: dedupe by id, queue limit/eviction, dismiss clamping, wrap-around navigation, flash on arrival |
| `tests/timers.test.tsx` | Create/clamp/pause/resume/reset/cancel, timestamp-based countdown finishing exactly at the deadline, persistence off by default |
| `tests/settings.test.ts` | `sanitizeSettings`: garbage input → defaults, range clamping, enum rejection, shortcut filtering/cap, non-mutation |

`tests/setup.ts` stubs `matchMedia`/`ResizeObserver` for jsdom.

## Rust suites (in-module)

- `notifications.rs` — toast XML parsing, entity unescaping, text-node extraction, launch
  attributes, FILETIME tick conversion
- `settings.rs` — defaults, unknown-field rejection, clamping, export round-trip, garbage input
- `shortcuts.rs` — `http/https` only, null-byte rejection, missing files, folder/app validation,
  confirmation rules

## Conventions

- Tests must pass in a plain browser-less environment (no Tauri): the bridge returns `null`
  and listeners never fire.
- Never assert on invented data — if a backend feature is unavailable, assert the honest
  `unavailable`/`denied` state instead.
- Keep the state machine pure so UI timing bugs are testable without rendering.

## Manual test checklist (before release)

1. Capsule appears top-centre; hover previews, click expands, `Esc` collapses.
2. Play music in Spotify/browser → title/artist/progress appear; controls work.
3. Send yourself a notification → flash in capsule, badge, queue in the panel.
4. Deny notification permission → banner explains how to re-allow (no fake content).
5. Create a 1-minute timer → counts down, alert fires, island re-opens if enabled.
6. Volume slider moves the real system volume; mute toggles it.
7. Change Windows scale/monitor → island re-anchors inside the work area.
8. Close the window → hides to tray; *Salir* quits; relaunching re-uses the same instance.
