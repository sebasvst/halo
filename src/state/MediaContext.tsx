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
import { bridgeEvents, media as mediaApi } from "../services/bridge";
import { EMPTY_MEDIA_STATE, type MediaState } from "../types/bridge";

interface MediaContextValue {
  media: MediaState;
  error: string | null;
  togglePlayPause: () => void;
  next: () => void;
  previous: () => void;
}

const MediaContext = createContext<MediaContextValue | null>(null);

export function MediaProvider({ children }: { children: ReactNode }) {
  const [media, setMedia] = useState<MediaState>(EMPTY_MEDIA_STATE);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void mediaApi.refresh();
    const un = bridgeEvents.mediaState((state) => {
      if (!mounted.current) return;
      setMedia(state);
      setError(null);
    });

    // Live position ticker + occasional full refresh so track changes land in <1s.
    const id = window.setInterval(() => {
      if (!mounted.current) return;
      void mediaApi.refresh();
    }, 1000);

    return () => {
      mounted.current = false;
      window.clearInterval(id);
      void un.then((fn) => fn());
    };
  }, []);

  const togglePlayPause = useCallback(() => {
    void mediaApi.playPause();
  }, []);
  const next = useCallback(() => {
    void mediaApi.next();
  }, []);
  const previous = useCallback(() => {
    void mediaApi.previous();
  }, []);

  const value = useMemo(
    () => ({ media, error, togglePlayPause, next, previous }),
    [media, error, togglePlayPause, next, previous],
  );

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

export function useMedia(): MediaContextValue {
  const ctx = useContext(MediaContext);
  if (!ctx) throw new Error("useMedia must be used within MediaProvider");
  return ctx;
}
