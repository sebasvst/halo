import { useEffect, useRef, useState } from "react";
import { useIsland } from "../../state/useIsland";
import { useSettings } from "../../state/SettingsContext";
import { useMedia } from "../../state/MediaContext";
import { useNotifications } from "../../state/NotificationsContext";
import { useTimers } from "../../state/TimersContext";
import { useAudio } from "../../state/AudioContext";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { bridgeEvents } from "../../services/bridge";
import { Capsule } from "./Capsule";
import { ExpandedPanel } from "./ExpandedPanel";
import type { PanelView } from "../../state/islandMachine";

export function HaloIsland() {
  const { settings, update } = useSettings();
  const { media, togglePlayPause, next, previous } = useMedia();
  const notifications = useNotifications();
  const timers = useTimers();
  const audio = useAudio();
  const reducedMotion = useReducedMotion(settings.appearance.reduceMotion);

  const island = useIsland({
    hoverPreview: settings.interaction.hoverPreview,
    autoCollapse: settings.interaction.autoCollapse,
    autoCollapseMs: settings.interaction.autoCollapseMs,
    hoverPreviewMs: settings.interaction.hoverPreviewMs,
    panelScale: settings.appearance.panelScale,
    capsuleScale: settings.appearance.capsuleScale,
  });
  const { state, send } = island;

  // Keep badge in sync with the queue length.
  useEffect(() => {
    send({ type: "SET_BADGE", badge: notifications.queue.length });
  }, [notifications.queue.length, send]);

  // Emphasis: newest relevant signal wins.
  useEffect(() => {
    if (notifications.flash) {
      send({ type: "SET_EMPHASIS", emphasis: "notification" });
      return;
    }
    if (timers.timers.some((t) => t.status === "running")) {
      send({ type: "SET_EMPHASIS", emphasis: "timer" });
      return;
    }
    if (media.available && media.status === "playing") {
      send({ type: "SET_EMPHASIS", emphasis: "media" });
      return;
    }
    send({ type: "SET_EMPHASIS", emphasis: "idle" });
  }, [notifications.flash, timers.timers, media.status, media.available, send]);

  // Notifications arriving while visible produce a hold so the capsule doesn't flicker,
  // and the island performs its signature "grab attention" pop. If the island is
  // hidden, reveal it so the flash is never lost.
  const flashId = notifications.flash?.id ?? null;
  const [pop, setPop] = useState(false);
  useEffect(() => {
    if (!flashId) return;
    send({ type: "NOTIFICATION_ARRIVED", now: Date.now() });
    send({ type: "SHOW", now: Date.now() });
    setPop(true);
    const id = window.setTimeout(() => setPop(false), 700);
    return () => window.clearTimeout(id);
  }, [flashId, send]);

  // Escape collapses (or returns from Halo Studio); the global shortcut toggles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") send({ type: "ESCAPE", now: Date.now() });
    };
    const onGlobalToggle = (): void => {
      send({ type: "GLOBAL_TOGGLE", now: Date.now() });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("halo://global-toggle", onGlobalToggle as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("halo://global-toggle", onGlobalToggle as EventListener);
    };
  }, [send]);

  // Backend events: open settings, show/hide island, DND toggle.
  const viewRef = useRef<PanelView>(state.view);
  viewRef.current = state.view;
  useEffect(() => {
    const subs = [
      bridgeEvents.openSettings(() => {
        send({ type: "CLICK", now: Date.now() });
        send({ type: "SET_VIEW", view: "settings" });
      }),
      bridgeEvents.visibility((visible) => {
        send({ type: visible ? "SHOW" : "HIDE", now: Date.now() });
      }),
      bridgeEvents.dndChanged((enabled) => {
        update({ notifications: { doNotDisturb: enabled } });
      }),
    ];
    return () => {
      for (const sub of subs) {
        void sub.then((fn) => fn());
      }
    };
  }, [send, update]);

  // Timer finished while the island is hidden → reveal it (optional) and pop.
  // Track *all* seen finished ids so a second timer completion also pops.
  const seenFinished = useRef<Set<string>>(new Set());
  useEffect(() => {
    const doneList = timers.timers.filter((t) => t.status === "done" && t.finishedAt);
    const fresh = doneList.filter((t) => !seenFinished.current.has(t.id));
    if (fresh.length === 0) return;
    for (const t of fresh) seenFinished.current.add(t.id);
    setPop(true);
    const id = window.setTimeout(() => setPop(false), 700);
    if (settings.timers.keepIslandVisible) {
      send({ type: "SHOW", now: Date.now() });
      send({ type: "SET_VIEW", view: "home" });
    }
    return () => window.clearTimeout(id);
  }, [timers.timers, settings.timers.keepIslandVisible, send]);

  const reducedForWave = reducedMotion;
  const expanded = state.level === "expanded";

  if (state.level === "hidden") return null;

  return (
    <div
      className="halo-root"
      data-level={state.level}
      data-emphasis={state.emphasis}
      data-pop={pop || undefined}
      onMouseEnter={island.hoverEnter}
      onMouseLeave={island.hoverLeave}
    >
      {!expanded ? (
        <button
          type="button"
          className="halo-hit"
          aria-label="Abrir Halo"
          aria-expanded={false}
          onClick={() => send({ type: "CLICK", now: Date.now() })}
        >
          <Capsule
            media={media}
            flash={notifications.flash}
            timers={timers.timers}
            remainingOf={timers.remainingOf}
            badge={state.badge}
            expanded={state.level === "preview"}
            reducedMotion={reducedForWave}
            showWaveform={settings.music.waveform}
            showArtist={settings.music.showArtist}
            hidePreviews={settings.notifications.hidePreviews}
            showAppIcons={settings.notifications.showAppIcons}
            peak={audio.peak}
          />
        </button>
      ) : (
        <ExpandedPanel
          view={state.view}
          settings={settings}
          media={media}
          audio={audio.audio}
          audioAvailable={audio.available}
          audioPeak={audio.peak}
          notifications={notifications.queue}
          currentNotification={notifications.current}
          notificationIndex={notifications.index}
          access={notifications.access}
          timers={timers.timers}
          remainingOf={timers.remainingOf}
          reducedMotion={reducedForWave}
          onSetView={(view) => send({ type: "SET_VIEW", view })}
          onHoverChange={island.setHovering}
          onMediaPlayPause={togglePlayPause}
          onMediaNext={next}
          onMediaPrevious={previous}
          onAudioLevel={audio.setLevel}
          onAudioMute={audio.toggleMute}
          onAudioOpenSettings={audio.openWindowsSettings}
          onAudioRefresh={audio.refresh}
          onSelectNotification={notifications.select}
          onNextNotification={notifications.next}
          onPreviousNotification={notifications.previous}
          onDismissNotification={notifications.dismiss}
          onDismissAllNotifications={notifications.dismissAll}
          onRefreshAccess={notifications.refreshAccess}
          onCreateTimer={timers.create}
          onStartTimer={timers.start}
          onPauseTimer={timers.pause}
          onResetTimer={timers.reset}
          onCancelTimer={timers.cancel}
        />
      )}
    </div>
  );
}
