import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
} from "../src/types/settings";

describe("sanitizeSettings", () => {
  it("returns defaults for garbage input", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings("nope")).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps numeric ranges", () => {
    const s = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      appearance: { ...DEFAULT_SETTINGS.appearance, transparency: 9, capsuleScale: 0.1 },
      notifications: {
        ...DEFAULT_SETTINGS.notifications,
        queueLimit: 9999,
        durationMs: 1,
        historyMinutes: -3,
      },
      interaction: { ...DEFAULT_SETTINGS.interaction, autoCollapseMs: 1 },
    });
    expect(s.appearance.transparency).toBe(0.6);
    expect(s.appearance.capsuleScale).toBe(0.85);
    expect(s.notifications.queueLimit).toBe(50);
    expect(s.notifications.durationMs).toBe(1000);
    expect(s.notifications.historyMinutes).toBe(0);
    expect(s.interaction.autoCollapseMs).toBe(1000);
  });

  it("rejects unknown enum values", () => {
    const s = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      appearance: { ...DEFAULT_SETTINGS.appearance, theme: "neon" as never },
      interaction: { ...DEFAULT_SETTINGS.interaction, focusBehavior: "steal" as never },
    });
    expect(s.appearance.theme).toBe("dark");
    expect(s.interaction.focusBehavior).toBe("none");
  });

  it("filters invalid shortcut entries and enforces the cap", () => {
    const good = { id: "a", name: "Docs", kind: "web", target: "https://example.com" };
    const bad = { id: "", name: "", kind: "drop", target: "" };
    const many = Array.from({ length: 150 }, (_, i) => ({
      id: `sc-${i}`,
      name: `n${i}`,
      kind: "web",
      target: `https://e${i}.com`,
    }));
    const s = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      shortcuts: [good, bad, ...many],
    });
    expect(s.shortcuts.length).toBe(100);
    expect(s.shortcuts[0]?.id).toBe("a");
    expect(s.shortcuts.every((sc) => sc.kind === "web")).toBe(true);
  });

  it("keeps global shortcut only when non-empty string", () => {
    const s1 = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      interaction: { ...DEFAULT_SETTINGS.interaction, globalShortcut: "   " },
    });
    expect(s1.interaction.globalShortcut).toBeNull();
    const s2 = sanitizeSettings({
      ...DEFAULT_SETTINGS,
      interaction: { ...DEFAULT_SETTINGS.interaction, globalShortcut: "Ctrl+Shift+K" },
    });
    expect(s2.interaction.globalShortcut).toBe("Ctrl+Shift+K");
  });

  it("does not mutate the default settings object", () => {
    const before = JSON.stringify(DEFAULT_SETTINGS);
    sanitizeSettings({ ...DEFAULT_SETTINGS, appearance: { ...DEFAULT_SETTINGS.appearance, transparency: 0.5 } });
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(before);
  });
});
