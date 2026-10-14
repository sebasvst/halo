import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { bridgeEvents, settingsApi } from "../services/bridge";
import { loadSettings, saveSettings } from "../services/storage";
import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  type HaloSettings,
} from "../types/settings";

interface SettingsContextValue {
  settings: HaloSettings;
  ready: boolean;
  update: (patch: DeepPatch) => void;
  replaceAll: (settings: HaloSettings) => void;
  exportSettings: () => Promise<string | null>;
  importSettings: (json: string) => Promise<string | null>;
}

export type DeepPatch = {
  [K in keyof HaloSettings]?: HaloSettings[K] extends object
    ? Partial<HaloSettings[K]>
    : HaloSettings[K];
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<HaloSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let disposed = false;
    void (async () => {
      const loaded = await loadSettings();
      if (!disposed) {
        setSettings(loaded);
        setReady(true);
      }
    })();
    const un = bridgeEvents.settingsImported((imported) => {
      setSettings(sanitizeSettings(imported));
    });
    return () => {
      disposed = true;
      void un.then((fn) => fn());
    };
  }, []);

  // Persist whenever settings change (after initial load).
  useEffect(() => {
    if (!ready) return;
    void saveSettings(settings);
  }, [settings, ready]);

  // Reflect theme/motion/transparency onto the document root.
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (): void => {
      const theme =
        settings.appearance.theme === "auto"
          ? window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : settings.appearance.theme;
      root.dataset.theme = theme;
    };
    applyTheme();
    root.dataset.anim = settings.appearance.animationSpeed;
    // "reduce" → force 0ms; "allow" → override OS reduced-motion; "system" → defer to OS.
    if (settings.appearance.reduceMotion === "reduce") {
      root.dataset.motion = "reduce";
    } else if (settings.appearance.reduceMotion === "allow") {
      root.dataset.motion = "allow";
    } else {
      delete root.dataset.motion;
    }
    root.style.setProperty(
      "--halo-transparency",
      String(settings.appearance.transparency),
    );
    // Visual scale: the native window is already sized for the scaled
    // geometry; this CSS transform makes the *content* match so type and
    // controls actually grow/shrink instead of just stretching the window.
    root.style.setProperty(
      "--halo-capsule-scale",
      String(settings.appearance.capsuleScale),
    );
    root.style.setProperty(
      "--halo-panel-scale",
      String(settings.appearance.panelScale),
    );
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", applyTheme);
    return () => mq.removeEventListener("change", applyTheme);
  }, [settings.appearance.theme, settings.appearance.animationSpeed, settings.appearance.reduceMotion, settings.appearance.transparency, settings.appearance.capsuleScale, settings.appearance.panelScale]);

  const update = useCallback((patch: DeepPatch) => {
    setSettings((prev) => {
      const next: HaloSettings = structuredClone(prev);
      for (const key of Object.keys(patch) as Array<keyof HaloSettings>) {
        const value = patch[key];
        if (value === undefined) continue;
        const current = next[key];
        if (
          current !== null &&
          typeof current === "object" &&
          !Array.isArray(current) &&
          typeof value === "object" &&
          value !== null
        ) {
          Object.assign(next[key] as object, value);
        } else {
          (next as unknown as Record<string, unknown>)[key] = value;
        }
      }
      return sanitizeSettings(next);
    });
  }, []);

  const replaceAll = useCallback((next: HaloSettings) => {
    setSettings(sanitizeSettings(next));
  }, []);

  const exportSettings = useCallback(() => settingsApi.export(), []);

  const importSettings = useCallback(async (json: string): Promise<string | null> => {
    const ok = await settingsApi.import(json);
    return ok === null ? "No se pudo importar la configuración." : null;
  }, []);

  const value = useMemo(
    () => ({
      settings,
      ready,
      update,
      replaceAll,
      exportSettings,
      importSettings,
    }),
    [settings, ready, update, replaceAll, exportSettings, importSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
