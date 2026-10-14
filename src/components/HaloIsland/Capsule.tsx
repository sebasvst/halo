import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Music2, Bell, Timer, ChevronUp, Pause } from "lucide-react";
import { AudioWaveform } from "../AudioWaveform/AudioWaveform";
import type { MediaState, NotificationItem } from "../../types/bridge";
import { truncate, formatShortClock } from "../../utils/format";
import type { TimerItem } from "../../state/TimersContext";

interface CapsuleProps {
  media: MediaState;
  flash: NotificationItem | null;
  timers: TimerItem[];
  remainingOf: (t: TimerItem, now: number) => number;
  badge: number;
  expanded: boolean;
  reducedMotion: boolean;
  showWaveform: boolean;
  showArtist: boolean;
  hidePreviews: boolean;
  showAppIcons: boolean;
  /** Smoothed system audio peak 0..=1 for the live waveform. */
  peak?: number;
}

/** Segment separator — a soft hairline between simultaneous activities. */
function Segment({ tone }: { tone: "media" | "notif" | "timer" }) {
  return <span className={`capsule__seg capsule__seg--${tone}`} aria-hidden="true" />;
}

function formatClockLocal(d: Date): string {
  const h24 = d.getHours();
  const m = d.getMinutes();
  const h = h24 % 12 || 12;
  const suffix = h24 < 12 ? "AM" : "PM";
  return `${h}:${m.toString().padStart(2, "0")} ${suffix}`;
}

export function Capsule({
  media,
  flash,
  timers,
  remainingOf,
  badge,
  expanded,
  reducedMotion,
  showWaveform,
  showArtist,
  hidePreviews,
  showAppIcons,
  peak = 0,
}: CapsuleProps) {
  const now = Date.now();
  const running = timers.find((t) => t.status === "running");
  const playing = media.available && media.status === "playing";
  const hasMedia = media.available && (media.title || media.artist);
  const hasNoti = !!flash;
  const hasTimer = !!running;
  const activityCount = Number(hasMedia) + Number(hasNoti) + Number(hasTimer);

  // Live wall clock — ticks every second so the island is a real glanceable clock.
  const [clock, setClock] = useState(() => formatClockLocal(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => {
      setClock(formatClockLocal(new Date()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const segments: ReactNode[] = [];

  // Primary: notification flash (transient, highest urgency).
  if (hasNoti && flash) {
    // Respect the privacy toggle — never leak body text in the capsule.
    const notiTitle = flash.title ?? "Notificación";
    const notiPreview = hidePreviews ? null : flash.preview;
    segments.push(
      <div key="noti" className="capsule__seg-body capsule__seg-body--notif" role="status">
        {showAppIcons && flash.icon ? (
          <img className="capsule__notif-icon" src={flash.icon} alt="" draggable={false} />
        ) : (
          <span className="capsule__notif-dot" aria-hidden="true" />
        )}
        <div className="capsule__notif-text">
          <span className="capsule__notif-title">{truncate(notiTitle, 24)}</span>
          {notiPreview && (
            <span className="capsule__notif-preview">{truncate(notiPreview, 36)}</span>
          )}
        </div>
      </div>,
    );
    if (hasMedia || hasTimer) segments.push(<Segment key="s1" tone="notif" />);
  }

  // Secondary: music — always visible when a session exists.
  if (hasMedia) {
    segments.push(
      <div key="media" className="capsule__seg-body capsule__seg-body--media" role="status">
        {media.artDataUrl ? (
          <img
            className={`capsule__media-art ${playing ? "capsule__media-art--playing" : ""}`}
            src={media.artDataUrl}
            alt=""
            draggable={false}
          />
        ) : playing ? (
          showWaveform ? (
            <AudioWaveform playing={playing} reducedMotion={reducedMotion} peak={peak} compact />
          ) : (
            <Music2 size={12} aria-hidden="true" />
          )
        ) : (
          <Pause size={12} className="capsule__media-paused" aria-hidden="true" />
        )}
        <span className="capsule__media-text">
          {truncate(media.title ?? "Sin título", activityCount > 1 ? 12 : 20)}
          {showArtist && media.artist && activityCount === 1 ? (
            <span className="capsule__media-artist"> · {truncate(media.artist, 14)}</span>
          ) : null}
        </span>
      </div>,
    );
    if (hasTimer) segments.push(<Segment key="s2" tone="media" />);
  }

  // Tertiary: running timer.
  if (hasTimer && running) {
    segments.push(
      <div key="timer" className="capsule__seg-body capsule__seg-body--timer" role="status">
        <Timer size={12} aria-hidden="true" />
        <span className="capsule__timer-label">{truncate(running.label, 10)}</span>
        <span className="capsule__countdown">
          {formatShortClock(remainingOf(running, now))}
        </span>
      </div>,
    );
  }

  // Idle: just the Halo mark (no wordmark) — the clock lives on the right edge.
  if (segments.length === 0) {
    segments.push(
      <div key="idle" className="capsule__seg-body capsule__seg-body--idle">
        <HaloMark size={14} />
      </div>,
    );
  }

  return (
    <div className={`capsule ${expanded ? "capsule--expanded" : ""}`.trim()}>
      <div className="capsule__content">{segments}</div>
      {badge > 0 && !hasNoti ? (
        <span className="capsule__badge" aria-label={`${badge} notificaciones sin leer`}>
          <Bell size={9} aria-hidden="true" />
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
      <span className="capsule__clock" aria-label={`Hora ${clock}`}>
        {clock}
      </span>
      <ChevronUp size={12} className="capsule__chevron" aria-hidden="true" />
    </div>
  );
}

/** Original Halo mark: open ring with a cool-blue arc, matching the app icon. */
export function HaloMark({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="halo-mark"
    >
      <path
        d="M12 3.2a8.8 8.8 0 1 1-6.22 2.58"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M15.6 3.4a8.8 8.8 0 0 1 4.4 6.2"
        stroke="var(--halo-accent)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="2.2" fill="var(--halo-accent)" />
    </svg>
  );
}
