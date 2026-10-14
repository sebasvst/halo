/** Typed bridge to the Rust backend. Every call is failure-tolerant outside Tauri. */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  Commands,
  Events,
  type AudioState,
  type LayoutInfo,
  type LayoutRequest,
  type MediaState,
  type NotificationAccess,
  type NotificationItem,
  type SettingsStoreInfo,
  type ShortcutTarget,
  type ShortcutValidation,
} from "../types/bridge";
import type { HaloSettings } from "../types/settings";

const isTauri =
  typeof window !== "undefined" &&
  (("__TAURI_INTERNALS__" in window) || ("__TAURI__" in window));

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch {
    return null;
  }
}

export async function applyLayout(request: LayoutRequest): Promise<LayoutInfo | null> {
  return call<LayoutInfo>(Commands.islandApplyLayout, { request });
}

export const media = {
  refresh: (): Promise<null> => call(Commands.mediaGetState),
  playPause: (): Promise<null> => call(Commands.mediaPlayPause),
  next: (): Promise<null> => call(Commands.mediaNext),
  previous: (): Promise<null> => call(Commands.mediaPrevious),
};

export const audio = {
  getState: async (): Promise<AudioState | null> =>
    call<AudioState>(Commands.audioGetState),
  setLevel: async (level: number): Promise<AudioState | null> =>
    call<AudioState>(Commands.audioSetLevel, { level }),
  toggleMute: async (): Promise<AudioState | null> =>
    call<AudioState>(Commands.audioToggleMute),
  openSettings: (): Promise<null> => call(Commands.audioOpenSettings),
};

export const shortcuts = {
  validate: async (target: ShortcutTarget): Promise<ShortcutValidation | null> =>
    call<ShortcutValidation>(Commands.shortcutValidate, { target }),
  open: (target: ShortcutTarget): Promise<null> =>
    call(Commands.shortcutOpen, { target }),
  requiresConfirmation: async (target: ShortcutTarget): Promise<boolean> =>
    (await call<boolean>(Commands.shortcutRequiresConfirmation, { target })) ?? true,
};

export const settingsApi = {
  export: async (): Promise<string | null> =>
    (await call<string>(Commands.settingsExport)) ?? null,
  import: (json: string): Promise<null> =>
    call(Commands.settingsImport, { json }),
  storeInfo: async (): Promise<SettingsStoreInfo | null> =>
    call<SettingsStoreInfo>(Commands.settingsStoreInfo),
};

export const app = {
  notificationAccess: async (): Promise<NotificationAccess | null> =>
    call<NotificationAccess>(Commands.notificationAccess),
  /** Re-shows the Windows consent dialog and (re)subscribes the listener. */
  notificationRequestAccess: (): Promise<null> =>
    call(Commands.notificationRequestAccess),
  /** Re-seeds Action Center without prompting (used once the webview is listening). */
  notificationResubscribe: (): Promise<null> =>
    call(Commands.notificationResubscribe),
  quit: (): Promise<null> => call(Commands.haloQuit),
};

export const system = {
  setCloseToTray: (enabled: boolean): Promise<null> =>
    call(Commands.systemSetCloseToTray, { enabled }),
  setTrayVisible: (visible: boolean): Promise<null> =>
    call(Commands.systemSetTrayVisible, { visible }),
  setDnd: (enabled: boolean): Promise<null> =>
    call(Commands.systemSetDnd, { enabled }),
};

export type Listener<T> = (payload: T) => void;

/** Subscribes to a backend event; always returns an unlisten fn for cleanup. */
export async function onEvent<T>(
  name: string,
  handler: Listener<T>,
): Promise<UnlistenFn> {
  if (!isTauri) return () => undefined;
  try {
    return await listen<T>(name, (event) => handler(event.payload));
  } catch {
    return () => undefined;
  }
}

export const bridgeEvents = {
  mediaState: (h: Listener<MediaState>) => onEvent(Events.mediaState, h),
  notificationReceived: (h: Listener<NotificationItem>) =>
    onEvent(Events.notificationReceived, h),
  notificationAccess: (h: Listener<NotificationAccess>) =>
    onEvent(Events.notificationAccess, h),
  /** Smoothed WASAPI peak (0..=1) at ~20 Hz — drives the live waveform. */
  audioPeak: (h: Listener<number>) => onEvent(Events.audioPeak, h),
  relayout: (h: Listener<void>) => onEvent(Events.islandRelayout, () => h()),
  visibility: (h: Listener<boolean>) => onEvent(Events.islandVisibility, h),
  openSettings: (h: Listener<void>) => onEvent(Events.openSettings, () => h()),
  dndChanged: (h: Listener<boolean>) => onEvent(Events.dndChanged, h),
  settingsImported: (h: Listener<HaloSettings>) =>
    onEvent(Events.settingsImported, h),
};
