import { useEffect, useRef } from "react";
import { SettingsProvider, useSettings } from "../state/SettingsContext";
import { MediaProvider } from "../state/MediaContext";
import { NotificationsProvider } from "../state/NotificationsContext";
import { TimersProvider } from "../state/TimersContext";
import { AudioProvider } from "../state/AudioContext";
import { HaloIsland } from "../components/HaloIsland/HaloIsland";
import { system } from "../services/bridge";

export default function App() {
  return (
    <SettingsProvider>
      <MediaProvider>
        <NotificationsProvider>
          <AudioProvider>
            <TimersHost>
              <SystemIntegration />
              <HaloIsland />
            </TimersHost>
          </AudioProvider>
        </NotificationsProvider>
      </MediaProvider>
    </SettingsProvider>
  );
}

function TimersHost({ children }: { children: React.ReactNode }) {
  return <TimersProvider>{children}</TimersProvider>;
}

/** Registers the global shortcut, autostart and startup preferences. */
function SystemIntegration() {
  const { settings, update } = useSettings();

  // Sync native tray / close-to-tray behaviour with settings.
  useEffect(() => {
    void system.setCloseToTray(settings.system.closeToTray);
  }, [settings.system.closeToTray]);
  useEffect(() => {
    void system.setTrayVisible(settings.system.showTrayIcon);
  }, [settings.system.showTrayIcon]);
  useEffect(() => {
    void system.setDnd(settings.notifications.doNotDisturb);
  }, [settings.notifications.doNotDisturb]);

  // Global shortcut (default Ctrl+Alt+H) — re-registered when the user edits it.
  const shortcut = settings.interaction.globalShortcut;
  const registered = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const gs = await import("@tauri-apps/plugin-global-shortcut");
        if (registered.current && registered.current !== shortcut) {
          await gs.unregister(registered.current);
          registered.current = null;
        }
        if (shortcut && !cancelled) {
          const already = await gs.isRegistered(shortcut);
          if (!already) {
            await gs.register(shortcut, () => {
              window.dispatchEvent(new CustomEvent("halo://global-toggle"));
            });
          }
          registered.current = shortcut;
        }
      } catch {
        // Not running under Tauri (tests/dev browser) — ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shortcut]);

  // Autostart follows the "launch at startup" switch.
  const launch = settings.system.launchAtStartup;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const autostart = await import("@tauri-apps/plugin-autostart");
        const enabled = await autostart.isEnabled();
        if (cancelled) return;
        if (launch && !enabled) await autostart.enable();
        else if (!launch && enabled) await autostart.disable();
      } catch {
        // Outside Tauri — ignore.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [launch]);

  // Keep the store in sync when the OS-level autostart changes elsewhere.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const autostart = await import("@tauri-apps/plugin-autostart");
        const enabled = await autostart.isEnabled();
        if (!cancelled && enabled !== launch) update({ system: { launchAtStartup: enabled } });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [launch, update]);

  return null;
}
