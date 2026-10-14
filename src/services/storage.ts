/** Settings persistence via the Tauri store plugin (file-backed, local only).
 *
 *  The store path is resolved by the backend (`settings_store_info`) so the webview
 *  and the Rust commands always read and write the exact same file — including in
 *  portable mode, where settings live next to the executable.
 */

import { load, type Store } from "@tauri-apps/plugin-store";
import { settingsApi } from "./bridge";
import { DEFAULT_SETTINGS, sanitizeSettings, type HaloSettings } from "../types/settings";

const FALLBACK_FILE = "halo-settings.json";
const KEY = "settings";

let storePromise: Promise<Store | null> | null = null;

function getStore(): Promise<Store | null> {
  if (!storePromise) {
    storePromise = (async () => {
      try {
        const info = await settingsApi.storeInfo();
        return await load(info?.path ?? FALLBACK_FILE, { autoSave: false });
      } catch {
        return null;
      }
    })();
  }
  return storePromise;
}

export async function loadSettings(): Promise<HaloSettings> {
  const store = await getStore();
  if (!store) return structuredClone(DEFAULT_SETTINGS);
  try {
    const raw = await store.get<unknown>(KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    return sanitizeSettings(raw);
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export async function saveSettings(settings: HaloSettings): Promise<void> {
  const store = await getStore();
  if (!store) return;
  try {
    await store.set(KEY, settings);
    await store.save();
  } catch {
    // Persistence failures must never crash the UI.
  }
}
