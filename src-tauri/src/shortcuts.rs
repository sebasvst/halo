//! Shortcuts: validation and safe opening of user-configured targets.
//!
//! Security rules:
//! - Web targets must be `http`/`https` URLs (no `file:`, `javascript:`, `ms-settings:` smuggling).
//! - File/folder/app targets must exist on disk and are opened through `ShellExecuteW`
//!   (lpFile + no shell string), so no shell metacharacter interpretation occurs.
//! - Nothing here executes arbitrary command lines from imported data.

use std::path::{Path, PathBuf};

use url::Url;

use crate::payloads::{ShortcutKind, ShortcutTarget, ShortcutValidity, ShortcutValidation};

pub fn validate(target: &ShortcutTarget) -> ShortcutValidation {
    let raw = target.target.trim();
    if raw.is_empty() {
        return ShortcutValidation {
            validity: ShortcutValidity::Empty,
            resolved: None,
            detail: Some("La ruta o URL está vacía.".into()),
        };
    }
    if raw.contains('\0') {
        return ShortcutValidation {
            validity: ShortcutValidity::InvalidPath,
            resolved: None,
            detail: Some("La ruta contiene caracteres no válidos.".into()),
        };
    }

    match target.kind {
        ShortcutKind::Web => match Url::parse(raw) {
            Ok(url)
                if matches!(url.scheme(), "http" | "https") && url.host_str().is_some() =>
            {
                ShortcutValidation {
                    validity: ShortcutValidity::Valid,
                    resolved: Some(url.to_string()),
                    detail: None,
                }
            }
            Ok(url) => ShortcutValidation {
                validity: ShortcutValidity::InvalidScheme,
                resolved: None,
                detail: Some(format!("Esquema no permitido: {}", url.scheme())),
            },
            Err(e) => ShortcutValidation {
                validity: ShortcutValidity::InvalidPath,
                resolved: None,
                detail: Some(format!("URL no válida: {e}")),
            },
        },
        ShortcutKind::File | ShortcutKind::Folder | ShortcutKind::App => {
            let path = expand(raw);
            match std::fs::metadata(&path) {
                Ok(meta) => {
                    let is_dir = meta.is_dir();
                    let expect_dir = target.kind == ShortcutKind::Folder;
                    if expect_dir && !is_dir {
                        return ShortcutValidation {
                            validity: ShortcutValidity::InvalidPath,
                            resolved: None,
                            detail: Some("Se esperaba una carpeta.".into()),
                        };
                    }
                    if !expect_dir && is_dir {
                        return ShortcutValidation {
                            validity: ShortcutValidity::InvalidPath,
                            resolved: None,
                            detail: Some("Se esperaba un archivo.".into()),
                        };
                    }
                    if target.kind == ShortcutKind::App && !is_executable(&path) {
                        return ShortcutValidation {
                            validity: ShortcutValidity::InvalidPath,
                            resolved: None,
                            detail: Some("El destino no es un ejecutable o acceso directo.".into()),
                        };
                    }
                    ShortcutValidation {
                        validity: ShortcutValidity::Valid,
                        resolved: Some(path.display().to_string()),
                        detail: None,
                    }
                }
                Err(_) => ShortcutValidation {
                    validity: ShortcutValidity::Missing,
                    resolved: None,
                    detail: Some("El destino ya no existe.".into()),
                },
            }
        }
    }
}

pub fn expand(raw: &str) -> PathBuf {
    let expanded = if raw.starts_with('~') {
        if let Some(home) = std::env::var_os("USERPROFILE") {
            PathBuf::from(home).join(raw.trim_start_matches('~').trim_start_matches(['/', '\\']))
        } else {
            PathBuf::from(raw)
        }
    } else {
        PathBuf::from(raw)
    };
    expanded
}

fn is_executable(path: &Path) -> bool {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    matches!(
        ext.as_str(),
        "exe" | "com" | "bat" | "cmd" | "msc" | "lnk" | "msix" | "appref-ms"
    )
}

pub fn open(target: &ShortcutTarget) -> Result<(), String> {
    let check = validate(target);
    if check.validity != ShortcutValidity::Valid {
        return Err(check
            .detail
            .unwrap_or_else(|| "Destino no válido.".into()));
    }
    let resolved = check.resolved.ok_or("Destino no resuelto.")?;
    match target.kind {
        ShortcutKind::Web => {
            tauri_plugin_opener::open_url(&resolved, None::<&str>)
                .map_err(|e| format!("No se pudo abrir el enlace: {e}"))
        }
        _ => tauri_plugin_opener::open_path(&resolved, None::<&str>)
            .map_err(|e| format!("No se pudo abrir el destino: {e}")),
    }
}

pub fn requires_confirmation(target: &ShortcutTarget) -> bool {
    match target.kind {
        ShortcutKind::App => true,
        ShortcutKind::File | ShortcutKind::Folder => true,
        ShortcutKind::Web => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn web(url: &str) -> ShortcutTarget {
        ShortcutTarget {
            kind: ShortcutKind::Web,
            target: url.into(),
        }
    }

    #[test]
    fn rejects_empty() {
        assert_eq!(validate(&web("")).validity, ShortcutValidity::Empty);
        assert_eq!(validate(&web("   ")).validity, ShortcutValidity::Empty);
    }

    #[test]
    fn accepts_http_and_https() {
        assert_eq!(
            validate(&web("https://example.com/a")).validity,
            ShortcutValidity::Valid
        );
        assert_eq!(
            validate(&web("http://example.com")).validity,
            ShortcutValidity::Valid
        );
    }

    #[test]
    fn rejects_dangerous_schemes() {
        for url in [
            "javascript:alert(1)",
            "file:///C:/Windows/System32/calc.exe",
            "ms-settings:privacy",
            "data:text/html,x",
            "ftp://example.com",
        ] {
            assert_ne!(
                validate(&web(url)).validity,
                ShortcutValidity::Valid,
                "debería rechazar {url}"
            );
        }
    }

    #[test]
    fn rejects_null_bytes_in_paths() {
        let t = ShortcutTarget {
            kind: ShortcutKind::File,
            target: "C:\\a\0b.txt".into(),
        };
        assert_eq!(validate(&t).validity, ShortcutValidity::InvalidPath);
    }

    #[test]
    fn reports_missing_files() {
        let t = ShortcutTarget {
            kind: ShortcutKind::File,
            target: "Z:\\no\\existe\\archivo.txt".into(),
        };
        assert_eq!(validate(&t).validity, ShortcutValidity::Missing);
    }

    #[test]
    fn finds_existing_windows_files() {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
        let t = ShortcutTarget {
            kind: ShortcutKind::File,
            target: format!("{windir}\\notepad.exe"),
        };
        assert_eq!(validate(&t).validity, ShortcutValidity::Valid);
    }

    #[test]
    fn folder_must_be_a_directory() {
        let windir = std::env::var("WINDIR").unwrap_or_else(|_| "C:\\Windows".into());
        let t = ShortcutTarget {
            kind: ShortcutKind::Folder,
            target: format!("{windir}\\notepad.exe"),
        };
        assert_eq!(validate(&t).validity, ShortcutValidity::InvalidPath);
    }

    #[test]
    fn app_must_be_executable() {
        let t = ShortcutTarget {
            kind: ShortcutKind::App,
            target: env!("WINDIR").to_string() + "\\notepad.exe",
        };
        assert_eq!(validate(&t).validity, ShortcutValidity::Valid);

        let not_exe = ShortcutTarget {
            kind: ShortcutKind::App,
            target: env!("WINDIR").to_string() + "\\win.ini",
        };
        assert_eq!(validate(&not_exe).validity, ShortcutValidity::InvalidPath);
    }

    #[test]
    fn only_apps_really_need_confirmation() {
        assert!(requires_confirmation(&ShortcutTarget {
            kind: ShortcutKind::App,
            target: "x".into(),
        }));
        assert!(!requires_confirmation(&web("https://example.com")));
    }
}
