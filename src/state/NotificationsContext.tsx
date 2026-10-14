import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { bridgeEvents, app as appApi } from "../services/bridge";
import type { NotificationAccess, NotificationItem } from "../types/bridge";
import { useSettings } from "./SettingsContext";

interface NotificationsContextValue {
  queue: NotificationItem[];
  access: NotificationAccess;
  current: NotificationItem | null;
  flash: NotificationItem | null;
  index: number;
  select: (index: number) => void;
  next: () => void;
  previous: () => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  refreshAccess: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

/** Queue entry plus when Halo first saw it — history is pruned from *that* clock,
 *  not from the toast's CreationTime (Action Center seeds can be hours old). */
type QueuedNotification = NotificationItem & { haloAt: number };

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [queue, setQueue] = useState<QueuedNotification[]>([]);
  const [index, setIndex] = useState(0);
  const [flash, setFlash] = useState<NotificationItem | null>(null);
  const [access, setAccess] = useState<NotificationAccess>({
    status: "pending",
    detail: null,
  });
  const flashTimer = useRef<number | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    let disposed = false;
    const unAccess = bridgeEvents.notificationAccess((a) => {
      if (!disposed) setAccess(a);
    });
    const unReceived = bridgeEvents.notificationReceived((item) => {
      if (disposed) return;
      const prefs = settingsRef.current.notifications;
      if (!prefs.enabled) return;

      setQueue((prev) => {
        const without = prev.filter((n) => n.id !== item.id);
        const next: QueuedNotification[] = [
          { ...item, haloAt: Date.now() },
          ...without,
        ];
        return next.slice(0, prefs.queueLimit);
      });
      // Only jump to the newest item when the user is already at the top —
      // never yank the card out from under someone reading #3.
      setIndex((i) => (i === 0 ? 0 : i));

      // Visual flash only for genuinely new notifications, when alerts are on
      // and DND is off. Seeded items (already in Action Center) arrive silently.
      if (!item.seed && prefs.visualAlerts && !prefs.doNotDisturb) {
        setFlash(item);
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(
          () => setFlash(null),
          prefs.durationMs,
        );
      }
    });

    // Subscribe first, then pull state: snapshot for the banner, resubscribe so the
    // backend can seed Action Center *after* these listeners exist (events fired
    // during setup would otherwise be lost to an empty webview).
    void appApi.notificationAccess().then((a) => {
      if (a && !disposed) setAccess(a);
    });
    void appApi.notificationResubscribe();

    return () => {
      disposed = true;
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      void unAccess.then((fn) => fn());
      void unReceived.then((fn) => fn());
    };
  }, []);

  // Prune history older than the configured window, measured from when Halo
  // first saw the item (so Action Center seeds are not wiped for being "old").
  useEffect(() => {
    const id = window.setInterval(() => {
      const minutes = settingsRef.current.notifications.historyMinutes;
      if (minutes <= 0) return;
      const cutoff = Date.now() - minutes * 60_000;
      setQueue((prev) => {
        const kept = prev.filter((n) => n.haloAt >= cutoff);
        return kept.length === prev.length ? prev : kept;
      });
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const dismiss = useCallback((id: string) => {
    setQueue((prev) => {
      const next = prev.filter((n) => n.id !== id);
      setIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    setQueue([]);
    setIndex(0);
  }, []);

  const select = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(queue.length - 1, i)));
    },
    [queue.length],
  );

  const next = useCallback(() => {
    setIndex((i) => (queue.length === 0 ? 0 : (i + 1) % queue.length));
  }, [queue.length]);

  const previous = useCallback(() => {
    setIndex((i) =>
      queue.length === 0 ? 0 : (i - 1 + queue.length) % queue.length,
    );
  }, [queue.length]);

  const refreshAccess = useCallback(() => {
    // Re-running the request re-shows Windows' consent dialog while the status is
    // unresolved, and seeds Action Center once the user grants access.
    void appApi.notificationRequestAccess();
  }, []);

  const current = queue.length > 0 ? (queue[Math.min(index, queue.length - 1)] ?? null) : null;

  const value = useMemo(
    () => ({
      queue,
      access,
      current,
      flash,
      index,
      select,
      next,
      previous,
      dismiss,
      dismissAll,
      refreshAccess,
    }),
    [queue, access, current, flash, index, select, next, previous, dismiss, dismissAll, refreshAccess],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}
