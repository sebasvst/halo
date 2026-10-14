/** Types mirroring the Rust payloads in `src-tauri/src/payloads.rs`. */

export interface MediaState {
  available: boolean;
  title: string | null;
  artist: string | null;
  album: string | null;
  status: MediaStatus;
  positionMs: number | null;
  durationMs: number | null;
  appId: string | null;
  artDataUrl: string | null;
  supported: SupportedActions;
}

export type MediaStatus = "playing" | "paused" | "stopped" | "unknown";

export interface SupportedActions {
  play: boolean;
  pause: boolean;
  next: boolean;
  previous: boolean;
}

export interface NotificationItem {
  id: string;
  appName: string | null;
  title: string | null;
  preview: string | null;
  icon: string | null;
  receivedAt: number;
  /** Seeded from Action Center at startup — must not flash or pop the island. */
  seed: boolean;
  category: string | null;
  tag: string | null;
  actions: NotificationAction[];
  privacy: NotificationPrivacyFlags;
}

export interface NotificationAction {
  id: string;
  label: string;
  kind: "openApp" | "openUri";
  payload: string | null;
}

export interface NotificationPrivacyFlags {
  hasLaunchTarget: boolean;
  hasBody: boolean;
}

export type ListenerStatus = "allowed" | "denied" | "unavailable" | "pending";

export interface NotificationAccess {
  status: ListenerStatus;
  detail: string | null;
}

export interface AudioState {
  level: number;
  muted: boolean;
  deviceName: string | null;
}

export interface LayoutInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  workAreaX: number;
  workAreaY: number;
  workAreaWidth: number;
  workAreaHeight: number;
}

/** Where settings are persisted for this run (installed vs portable). */
export interface SettingsStoreInfo {
  path: string;
  portable: boolean;
}

export type ShortcutKind = "web" | "file" | "folder" | "app";

export interface ShortcutTarget {
  kind: ShortcutKind;
  target: string;
}

export type ShortcutValidity =
  | "valid"
  | "missing"
  | "invalidScheme"
  | "invalidPath"
  | "empty";

export interface ShortcutValidation {
  validity: ShortcutValidity;
  resolved: string | null;
  detail: string | null;
}

export interface LayoutRequest {
  capsuleW: number;
  capsuleH: number;
  expandedW: number;
  expandedH: number;
  expanded: boolean;
}

/** Event names emitted by the Rust backend. */
export const Events = {
  mediaState: "media://state",
  notificationReceived: "notification://received",
  notificationAccess: "notification://access",
  audioPeak: "audio://peak",
  islandRelayout: "island://relayout",
  islandVisibility: "island://visibility",
  openSettings: "app://open-settings",
  dndChanged: "settings://dnd",
  settingsImported: "settings://imported",
} as const;

/** Command names exposed by the Rust backend. */
export const Commands = {
  islandApplyLayout: "island_apply_layout",
  mediaGetState: "media_get_state",
  mediaPlayPause: "media_play_pause",
  mediaNext: "media_next",
  mediaPrevious: "media_previous",
  audioGetState: "audio_get_state",
  audioSetLevel: "audio_set_level",
  audioToggleMute: "audio_toggle_mute",
  audioOpenSettings: "audio_open_settings",
  shortcutValidate: "shortcut_validate",
  shortcutOpen: "shortcut_open",
  shortcutRequiresConfirmation: "shortcut_requires_confirmation",
  settingsExport: "settings_export",
  settingsImport: "settings_import",
  settingsStoreInfo: "settings_store_info",
  notificationAccess: "notification_access",
  notificationRequestAccess: "notification_request_access",
  notificationResubscribe: "notification_resubscribe",
  systemSetCloseToTray: "system_set_close_to_tray",
  systemSetTrayVisible: "system_set_tray_visible",
  systemSetDnd: "system_set_dnd",
  haloQuit: "halo_quit",
} as const;

export const EMPTY_MEDIA_STATE: MediaState = {
  available: false,
  title: null,
  artist: null,
  album: null,
  status: "stopped",
  positionMs: null,
  durationMs: null,
  appId: null,
  artDataUrl: null,
  supported: { play: false, pause: false, next: false, previous: false },
};
