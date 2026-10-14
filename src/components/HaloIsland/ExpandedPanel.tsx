import { useEffect, useRef } from "react";
import { Settings2, Timer, Home, Zap, Volume2, Music, Bell } from "lucide-react";
import { IconButton } from "../common/IconButton";
import { MusicPlayer } from "../MusicPlayer/MusicPlayer";
import { VolumeControl } from "../MusicPlayer/VolumeControl";
import { NotificationPanel } from "../Notifications/NotificationPanel";
import { TimerPanel } from "../Timer/TimerPanel";
import { QuickActions } from "../QuickActions/QuickActions";
import { SettingsPanel } from "../Settings/SettingsPanel";
import type { MediaState, NotificationAccess, NotificationItem, AudioState } from "../../types/bridge";
import type { HaloSettings } from "../../types/settings";
import type { TimerItem } from "../../state/TimersContext";
import type { PanelView } from "../../state/islandMachine";

interface ExpandedPanelProps {
  view: PanelView;
  settings: HaloSettings;
  media: MediaState;
  audio: AudioState | null;
  audioAvailable: boolean;
  audioPeak: number;
  notifications: NotificationItem[];
  currentNotification: NotificationItem | null;
  notificationIndex: number;
  access: NotificationAccess;
  timers: TimerItem[];
  remainingOf: (t: TimerItem, now: number) => number;
  reducedMotion: boolean;
  onSetView: (view: PanelView) => void;
  onHoverChange: (inside: boolean) => void;
  onMediaPlayPause: () => void;
  onMediaNext: () => void;
  onMediaPrevious: () => void;
  onAudioLevel: (level: number) => void;
  onAudioMute: () => void;
  onAudioOpenSettings: () => void;
  onAudioRefresh: () => void;
  onSelectNotification: (i: number) => void;
  onNextNotification: () => void;
  onPreviousNotification: () => void;
  onDismissNotification: (id: string) => void;
  onDismissAllNotifications: () => void;
  onRefreshAccess: () => void;
  onCreateTimer: (label: string, durationMs: number) => void;
  onStartTimer: (id: string) => void;
  onPauseTimer: (id: string) => void;
  onResetTimer: (id: string) => void;
  onCancelTimer: (id: string) => void;
}

export function ExpandedPanel(props: ExpandedPanelProps) {
  const { view, settings, reducedMotion } = props;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [view]);

  if (view === "settings") {
    return (
      <div
        className="panel panel--settings"
        ref={ref}
        tabIndex={-1}
        onMouseEnter={() => props.onHoverChange(true)}
        onMouseLeave={() => props.onHoverChange(false)}
      >
        <SettingsPanel onBack={() => props.onSetView("home")} />
      </div>
    );
  }

  const runningTimers = props.timers.filter((t) => t.status === "running").length;
  const notiCount = props.notifications.length;
  const playing = props.media.available && props.media.status === "playing";
  // Keep chip and panel header in lockstep: both derive from the same queue.
  const notiLabel = notiCount > 99 ? "99+" : String(notiCount);

  return (
    <div
      className="panel"
      ref={ref}
      tabIndex={-1}
      onMouseEnter={() => props.onHoverChange(true)}
      onMouseLeave={() => props.onHoverChange(false)}
    >
      <header className="panel__topbar">
        <div className="panel__tabs" role="tablist" aria-label="Secciones">
          <span role="tab" aria-selected="true" className="panel__tab panel__tab--active">
            <Home size={13} aria-hidden="true" />
            Inicio
          </span>
          {/* Live activity chips — glanceable status at a glance */}
          <span className={`panel__chip panel__chip--media ${playing ? "panel__chip--live" : ""}`.trim()}>
            <Music size={11} aria-hidden="true" />
            {playing ? "En vivo" : props.media.available ? "Pausa" : "—"}
          </span>
          <span className={`panel__chip panel__chip--noti ${notiCount > 0 ? "panel__chip--live" : ""}`.trim()}>
            <Bell size={11} aria-hidden="true" />
            {notiLabel}
          </span>
          <span className={`panel__chip panel__chip--timer ${runningTimers > 0 ? "panel__chip--live" : ""}`.trim()}>
            <Timer size={11} aria-hidden="true" />
            {runningTimers}
          </span>
        </div>
        <IconButton
          label="Abrir Halo Studio"
          size="sm"
          onClick={() => props.onSetView("settings")}
        >
          <Settings2 size={14} />
        </IconButton>
      </header>

      <div className="panel__scroll">
        <MusicPlayer
          media={props.media}
          showArtwork={settings.music.showArtwork}
          showArtist={settings.music.showArtist}
          showProgress={settings.music.showProgress}
          showWaveform={settings.music.waveform}
          reducedMotion={reducedMotion}
          peak={props.audioPeak}
          onPlayPause={props.onMediaPlayPause}
          onNext={props.onMediaNext}
          onPrevious={props.onMediaPrevious}
        />

        <VolumeControl
          audio={props.audio}
          available={props.audioAvailable}
          onLevel={props.onAudioLevel}
          onToggleMute={props.onAudioMute}
          onOpenSettings={props.onAudioOpenSettings}
          onRefresh={props.onAudioRefresh}
        />

        <NotificationPanel
          queue={props.notifications}
          current={props.currentNotification}
          index={props.notificationIndex}
          access={props.access}
          hidePreviews={settings.notifications.hidePreviews}
          showAppIcons={settings.notifications.showAppIcons}
          onSelect={props.onSelectNotification}
          onNext={props.onNextNotification}
          onPrevious={props.onPreviousNotification}
          onDismiss={props.onDismissNotification}
          onDismissAll={props.onDismissAllNotifications}
          onRefreshAccess={props.onRefreshAccess}
        />

        <TimerPanel
          timers={props.timers}
          remainingOf={props.remainingOf}
          onCreate={props.onCreateTimer}
          onStart={props.onStartTimer}
          onPause={props.onPauseTimer}
          onReset={props.onResetTimer}
          onCancel={props.onCancelTimer}
          reducedMotion={reducedMotion}
        />

        <QuickActions
          shortcuts={settings.shortcuts}
          onOpenSettings={() => props.onSetView("settings")}
        />
      </div>

      <footer className="panel__footer">
        <span className="panel__footer-hint">
          <Zap size={10} aria-hidden="true" />
          Esc para cerrar
        </span>
        <span className="panel__footer-hint">
          <Timer size={10} aria-hidden="true" />
          {runningTimers} en curso
        </span>
        <span className="panel__footer-hint">
          <Volume2 size={10} aria-hidden="true" />
          {props.audio ? `${Math.round((props.audio.muted ? 0 : props.audio.level) * 100)}%` : "—"}
        </span>
        <span className="panel__footer-hint panel__footer-hint--brand">Halo</span>
      </footer>
    </div>
  );
}
