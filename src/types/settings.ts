import type { ShortcutKind } from "./bridge";

export type ThemeName = "dark" | "light" | "auto";
export type AnimSpeed = "slow" | "normal" | "fast";
export type ReduceMotionPref = "system" | "reduce" | "allow";

export interface AppearanceSettings {
  theme: ThemeName;
  transparency: number;
  capsuleScale: number;
  panelScale: number;
  animationSpeed: AnimSpeed;
  reduceMotion: ReduceMotionPref;
}

export interface InteractionSettings {
  hoverPreview: boolean;
  hoverPreviewMs: number;
  autoCollapse: boolean;
  autoCollapseMs: number;
  globalShortcut: string | null;
  focusBehavior: "none" | "take";
}

export interface MusicSettings {
  showArtwork: boolean;
  showArtist: boolean;
  showProgress: boolean;
  waveform: boolean;
}

export interface NotificationSettings {
  enabled: boolean;
  visualAlerts: boolean;
  durationMs: number;
  doNotDisturb: boolean;
  hidePreviews: boolean;
  hideSensitive: boolean;
  showAppIcons: boolean;
  queueLimit: number;
  grouping: boolean;
  animations: boolean;
  sounds: boolean;
  historyMinutes: number;
}

export interface TimerSettings {
  persistAcrossRestarts: boolean;
  alertSound: boolean;
  keepIslandVisible: boolean;
}

export interface ShortcutEntry {
  id: string;
  name: string;
  kind: ShortcutKind;
  target: string;
  icon?: string | null;
}

export interface SystemSettings {
  launchAtStartup: boolean;
  startHidden: boolean;
  showTrayIcon: boolean;
  closeToTray: boolean;
}

export interface HaloSettings {
  version: number;
  appearance: AppearanceSettings;
  interaction: InteractionSettings;
  music: MusicSettings;
  notifications: NotificationSettings;
  timers: TimerSettings;
  shortcuts: ShortcutEntry[];
  system: SystemSettings;
}

export const DEFAULT_SETTINGS: HaloSettings = {
  version: 1,
  appearance: {
    theme: "dark",
    transparency: 0.15,
    capsuleScale: 1,
    panelScale: 1,
    animationSpeed: "normal",
    reduceMotion: "system",
  },
  interaction: {
    hoverPreview: true,
    hoverPreviewMs: 350,
    autoCollapse: true,
    autoCollapseMs: 4000,
    globalShortcut: "Ctrl+Alt+H",
    focusBehavior: "none",
  },
  music: {
    showArtwork: true,
    showArtist: true,
    showProgress: true,
    waveform: true,
  },
  notifications: {
    enabled: true,
    visualAlerts: true,
    durationMs: 4000,
    doNotDisturb: false,
    hidePreviews: false,
    hideSensitive: false,
    showAppIcons: true,
    queueLimit: 20,
    grouping: false,
    animations: true,
    sounds: false,
    historyMinutes: 30,
  },
  timers: {
    persistAcrossRestarts: false,
    alertSound: true,
    keepIslandVisible: true,
  },
  shortcuts: [],
  system: {
    launchAtStartup: false,
    startHidden: true,
    showTrayIcon: true,
    closeToTray: true,
  },
};

/** Runtime guard used for values coming from storage or imported files. */
export function sanitizeSettings(raw: unknown): HaloSettings {
  const base = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== "object") return structuredClone(base);
  const s = raw as Partial<HaloSettings>;
  const num = (v: unknown, fallback: number, min: number, max: number): number =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : fallback;
  const bool = (v: unknown, fallback: boolean): boolean =>
    typeof v === "boolean" ? v : fallback;

  const appearance = (s.appearance ?? {}) as Partial<AppearanceSettings>;
  const interaction = (s.interaction ?? {}) as Partial<InteractionSettings>;
  const music = (s.music ?? {}) as Partial<MusicSettings>;
  const notifications = (s.notifications ?? {}) as Partial<NotificationSettings>;
  const timers = (s.timers ?? {}) as Partial<TimerSettings>;
  const system = (s.system ?? {}) as Partial<SystemSettings>;
  const shortcuts = Array.isArray(s.shortcuts)
    ? s.shortcuts
        .filter(
          (sc): sc is ShortcutEntry =>
            !!sc &&
            typeof sc.id === "string" &&
            typeof sc.name === "string" &&
            typeof sc.target === "string" &&
            ["web", "file", "folder", "app"].includes(sc.kind),
        )
        .slice(0, 100)
        .map((sc) => ({
          id: sc.id,
          name: sc.name,
          kind: sc.kind,
          target: sc.target,
          icon: typeof sc.icon === "string" ? sc.icon : null,
        }))
    : [];

  return {
    version: 1,
    appearance: {
      theme: ["dark", "light", "auto"].includes(appearance.theme ?? "")
        ? (appearance.theme as ThemeName)
        : base.appearance.theme,
      transparency: num(appearance.transparency, base.appearance.transparency, 0, 0.6),
      capsuleScale: num(appearance.capsuleScale, base.appearance.capsuleScale, 0.85, 1.3),
      panelScale: num(appearance.panelScale, base.appearance.panelScale, 0.85, 1.3),
      animationSpeed: ["slow", "normal", "fast"].includes(appearance.animationSpeed ?? "")
        ? (appearance.animationSpeed as AnimSpeed)
        : base.appearance.animationSpeed,
      reduceMotion: ["system", "reduce", "allow"].includes(appearance.reduceMotion ?? "")
        ? (appearance.reduceMotion as ReduceMotionPref)
        : base.appearance.reduceMotion,
    },
    interaction: {
      hoverPreview: bool(interaction.hoverPreview, base.interaction.hoverPreview),
      hoverPreviewMs: num(interaction.hoverPreviewMs, base.interaction.hoverPreviewMs, 150, 1500),
      autoCollapse: bool(interaction.autoCollapse, base.interaction.autoCollapse),
      autoCollapseMs: num(interaction.autoCollapseMs, base.interaction.autoCollapseMs, 1000, 60000),
      globalShortcut:
        typeof interaction.globalShortcut === "string" && interaction.globalShortcut.trim()
          ? interaction.globalShortcut.trim().slice(0, 64)
          : null,
      focusBehavior: interaction.focusBehavior === "take" ? "take" : "none",
    },
    music: {
      showArtwork: bool(music.showArtwork, base.music.showArtwork),
      showArtist: bool(music.showArtist, base.music.showArtist),
      showProgress: bool(music.showProgress, base.music.showProgress),
      waveform: bool(music.waveform, base.music.waveform),
    },
    notifications: {
      enabled: bool(notifications.enabled, base.notifications.enabled),
      visualAlerts: bool(notifications.visualAlerts, base.notifications.visualAlerts),
      durationMs: num(notifications.durationMs, base.notifications.durationMs, 1000, 15000),
      doNotDisturb: bool(notifications.doNotDisturb, base.notifications.doNotDisturb),
      hidePreviews: bool(notifications.hidePreviews, base.notifications.hidePreviews),
      hideSensitive: bool(notifications.hideSensitive, base.notifications.hideSensitive),
      showAppIcons: bool(notifications.showAppIcons, base.notifications.showAppIcons),
      queueLimit: num(notifications.queueLimit, base.notifications.queueLimit, 5, 50),
      grouping: bool(notifications.grouping, base.notifications.grouping),
      animations: bool(notifications.animations, base.notifications.animations),
      sounds: bool(notifications.sounds, base.notifications.sounds),
      historyMinutes: num(notifications.historyMinutes, base.notifications.historyMinutes, 0, 240),
    },
    timers: {
      persistAcrossRestarts: bool(timers.persistAcrossRestarts, base.timers.persistAcrossRestarts),
      alertSound: bool(timers.alertSound, base.timers.alertSound),
      keepIslandVisible: bool(timers.keepIslandVisible, base.timers.keepIslandVisible),
    },
    shortcuts,
    system: {
      launchAtStartup: bool(system.launchAtStartup, base.system.launchAtStartup),
      startHidden: bool(system.startHidden, base.system.startHidden),
      showTrayIcon: bool(system.showTrayIcon, base.system.showTrayIcon),
      closeToTray: bool(system.closeToTray, base.system.closeToTray),
    },
  };
}
