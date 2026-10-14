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
import { useSettings } from "./SettingsContext";

export type TimerStatus = "running" | "paused" | "done";

export interface TimerItem {
  id: string;
  label: string;
  durationMs: number;
  /** Absolute end timestamp while running; null when paused/done. */
  endsAt: number | null;
  /** Remaining ms while paused/done. */
  remainingMs: number;
  status: TimerStatus;
  finishedAt: number | null;
}

interface TimersContextValue {
  timers: TimerItem[];
  /** Remaining ms for a timer at `now` (timestamp-based, not interval-based). */
  remainingOf: (timer: TimerItem, now: number) => number;
  create: (label: string, durationMs: number) => void;
  start: (id: string) => void;
  pause: (id: string) => void;
  reset: (id: string) => void;
  cancel: (id: string) => void;
}

const TimersContext = createContext<TimersContextValue | null>(null);

const STORAGE_KEY = "halo.timers";

function loadPersisted(): TimerItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((t): t is TimerItem =>
        !!t &&
        typeof t === "object" &&
        typeof (t as TimerItem).id === "string" &&
        typeof (t as TimerItem).durationMs === "number",
      )
      .map((t) => ({
        id: t.id,
        label: typeof t.label === "string" ? t.label : "Temporizador",
        durationMs: Math.max(1000, t.durationMs),
        endsAt: typeof t.endsAt === "number" ? t.endsAt : null,
        remainingMs: Math.max(0, t.remainingMs ?? 0),
        status: t.status === "running" || t.status === "paused" || t.status === "done" ? t.status : "paused",
        finishedAt: typeof t.finishedAt === "number" ? t.finishedAt : null,
      }))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Single alert tone generated locally with Web Audio — no files, no capture. */
export function playAlert(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.75);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio unavailable — timer still finishes silently.
  }
}

export function TimersProvider({
  children,
  onFinished,
}: {
  children: ReactNode;
  onFinished?: (timer: TimerItem) => void;
}) {
  const { settings, ready: settingsReady } = useSettings();
  // Start empty; restore once settings have actually loaded (the lazy
  // initializer would read DEFAULT_SETTINGS and never persist).
  const [timers, setTimers] = useState<TimerItem[]>([]);
  const restoredRef = useRef(false);
  const [, forceTick] = useState(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  // Restore persisted timers once settings are ready.
  useEffect(() => {
    if (!settingsReady || restoredRef.current) return;
    restoredRef.current = true;
    if (settings.timers.persistAcrossRestarts) {
      const loaded = loadPersisted();
      if (loaded.length) setTimers(loaded);
    }
  }, [settingsReady, settings.timers.persistAcrossRestarts]);

  // Persist timers when the user opted in. Do NOT wipe the store when the
  // toggle is off — the user may re-enable it and expect timers to still be there.
  useEffect(() => {
    if (!settingsReady || !restoredRef.current) return;
    if (!settings.timers.persistAcrossRestarts) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
    } catch {
      // Quota errors are non-fatal.
    }
  }, [timers, settings.timers.persistAcrossRestarts, settingsReady]);

  // One shared ticker: recomputes from timestamps, never accumulates drift.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      let finished: TimerItem | null = null;
      setTimers((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (t.status === "running" && t.endsAt !== null && t.endsAt <= now) {
            changed = true;
            finished = { ...t, status: "done", endsAt: null, remainingMs: 0, finishedAt: now };
            return finished;
          }
          return t;
        });
        return changed ? next : prev;
      });
      if (finished) {
        if (settingsRef.current.timers.alertSound) playAlert();
        onFinishedRef.current?.(finished);
      } else {
        forceTick((n) => (n + 1) % 1_000_000);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, []);

  const remainingOf = useCallback((timer: TimerItem, now: number): number => {
    if (timer.status === "running" && timer.endsAt !== null) {
      return Math.max(0, timer.endsAt - now);
    }
    return Math.max(0, timer.remainingMs);
  }, []);

  const create = useCallback((label: string, durationMs: number) => {
    const clamped = Math.min(24 * 3600_000, Math.max(1000, durationMs));
    setTimers((prev) =>
      [
        ...prev,
        {
          id: makeId(),
          label: label.trim() || "Temporizador",
          durationMs: clamped,
          endsAt: null,
          remainingMs: clamped,
          status: "paused" as const,
          finishedAt: null,
        },
      ].slice(0, 20),
    );
  }, []);

  const start = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const remaining = t.remainingMs > 0 ? t.remainingMs : t.durationMs;
        return {
          ...t,
          status: "running" as const,
          endsAt: Date.now() + remaining,
          remainingMs: remaining,
          finishedAt: null,
        };
      }),
    );
  }, []);

  const pause = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) => {
        if (t.id !== id || t.status !== "running") return t;
        const remaining = t.endsAt ? Math.max(0, t.endsAt - Date.now()) : t.remainingMs;
        return { ...t, status: "paused" as const, endsAt: null, remainingMs: remaining };
      }),
    );
  }, []);

  const reset = useCallback((id: string) => {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              status: "paused" as const,
              endsAt: null,
              remainingMs: t.durationMs,
              finishedAt: null,
            }
          : t,
      ),
    );
  }, []);

  const cancel = useCallback((id: string) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      timers,
      remainingOf,
      create,
      start,
      pause,
      reset,
      cancel,
    }),
    [timers, remainingOf, create, start, pause, reset, cancel],
  );

  return <TimersContext.Provider value={value}>{children}</TimersContext.Provider>;
}

export function useTimers(): TimersContextValue {
  const ctx = useContext(TimersContext);
  if (!ctx) throw new Error("useTimers must be used within TimersProvider");
  return ctx;
}
