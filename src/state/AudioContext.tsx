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
import { audio as audioApi, bridgeEvents } from "../services/bridge";
import type { AudioState } from "../types/bridge";

interface AudioContextValue {
  audio: AudioState | null;
  available: boolean;
  /** Smoothed system peak 0..=1 from WASAPI — drives the live waveform. */
  peak: number;
  refresh: () => void;
  setLevel: (level: number) => void;
  toggleMute: () => void;
  openWindowsSettings: () => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [audio, setAudio] = useState<AudioState | null>(null);
  const [available, setAvailable] = useState(true);
  const [peak, setPeak] = useState(0);
  const debounce = useRef<number | null>(null);
  const lastSent = useRef(0);

  const refresh = useCallback(() => {
    void audioApi.getState().then((state) => {
      if (state) {
        setAudio(state);
        setAvailable(true);
      } else {
        setAudio(null);
        setAvailable(false);
      }
    });
  }, []);

  // Read on mount so the capsule/panel can show the real level immediately,
  // then keep it live (volume changes from the OS volume OSD still sync).
  useEffect(() => {
    refresh();
    const id = window.setInterval(() => refresh(), 1500);
    return () => {
      window.clearInterval(id);
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [refresh]);

  // Live peak samples from the backend WASAPI meter (~20 Hz when audio is playing).
  useEffect(() => {
    let disposed = false;
    const un = bridgeEvents.audioPeak((value) => {
      if (!disposed && typeof value === "number" && Number.isFinite(value)) {
        setPeak(Math.min(1, Math.max(0, value)));
      }
    });
    return () => {
      disposed = true;
      void un.then((fn) => fn());
      setPeak(0);
    };
  }, []);

  const setLevel = useCallback((level: number) => {
    const clamped = Math.min(1, Math.max(0, level));
    lastSent.current = clamped;
    setAudio((prev) => (prev ? { ...prev, level: clamped } : prev));
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      void audioApi.setLevel(lastSent.current).then((state) => {
        if (state) {
          setAudio(state);
          setAvailable(true);
        }
      });
    }, 90);
  }, []);

  const toggleMute = useCallback(() => {
    void audioApi.toggleMute().then((state) => {
      if (state) {
        setAudio(state);
        setAvailable(true);
      } else {
        setAvailable(false);
      }
    });
  }, []);

  const openWindowsSettings = useCallback(() => {
    void audioApi.openSettings();
  }, []);

  const value = useMemo(
    () => ({
      audio,
      available,
      peak,
      refresh,
      setLevel,
      toggleMute,
      openWindowsSettings,
    }),
    [audio, available, peak, refresh, setLevel, toggleMute, openWindowsSettings],
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error("useAudio must be used within AudioProvider");
  return ctx;
}
