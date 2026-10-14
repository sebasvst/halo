# Building Halo on Windows

## 1. Toolchain

| Tool | Check | Notes |
| --- | --- | --- |
| Node.js 20+ | `node -v` | Node 26 verified |
| npm | `npm -v` | |
| Rust (stable, MSVC) | `rustc -vV` | `rustup default stable-x86_64-pc-windows-msvc` |
| VS 2022 Build Tools | `vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64` | Workload: **Desktop development with C++** |
| WebView2 | usually preinstalled | https://developer.microsoft.com/microsoft-edge/webview2/ |

If `cargo` cannot find `link.exe`, run the VS Installer and add the MSVC v143 C++ build tools
+ Windows SDK.

## 2. Install & develop

```powershell
npm install
npm run tauri:dev      # starts Vite on :1420 and launches the app with live reload
```

## 3. Checks before a release

```powershell
npm run typecheck      # tsc -b --force (strict)
npm test               # Vitest suite
cargo test --lib       # Rust unit tests (run in src-tauri)
npm run build          # production frontend bundle
```

## 4. Release build + installer

```powershell
npm run tauri:build
```

Outputs:

- Executable: `src-tauri\target\release\halo.exe`
- NSIS installer: `src-tauri\target\release\bundle\nsis\Halo_0.1.0_x64-setup.exe`

Rough time on a laptop: ~15 minutes first run (full Rust release compile), much faster on
incremental changes.

## 5. Configuration files

- `src-tauri/tauri.conf.json` — app id, window, CSP, NSIS options, icons
- `src-tauri/capabilities/default.json` — least-privilege permissions for the webview
- `src-tauri/Cargo.toml` — Rust deps and the required `windows` crate features
- `vite.config.ts` — dev server, Vitest config

## 6. Icons

Icons are generated from the original halo mark:

```powershell
npm run icons    # regenerates src-tauri/icons/* from scripts/generate-icons.mjs
```

## Troubleshooting

- **`transformWithEsbuild` / missing esbuild** — Vite 8 minifies with oxc; keep
  `minify: "oxc"` in `vite.config.ts`.
- **`link.exe not found`** — reinstall MSVC build tools (see above).
- **Notification listener returns `unavailable`** — run on Windows 10 1809+ and accept the
  Windows permission prompt once.
- **Window invisible after DPI change** — Halo listens for `WM_DISPLAYCHANGE` and re-anchors;
  toggle the tray icon's *Show* item to force a relayout.
