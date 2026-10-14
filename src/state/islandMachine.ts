/** Central island state machine — pure, deterministic, unit-testable. */

export type IslandLevel = "compact" | "preview" | "expanded" | "hidden";
export type PanelView = "home" | "settings";
export type Emphasis = "idle" | "notification" | "timer" | "media";

export interface IslandState {
  level: IslandLevel;
  view: PanelView;
  emphasis: Emphasis;
  /** Timestamp until which hover-leave must be ignored (anti-flicker hysteresis). */
  holdUntil: number;
  lastTransitionAt: number;
  /** Number of undismissed notifications waiting in the queue. */
  badge: number;
}

export type IslandEvent =
  | { type: "HOVER_ENTER"; now: number }
  | { type: "HOVER_LEAVE"; now: number }
  | { type: "CLICK"; now: number }
  | { type: "CLICK_OUTSIDE"; now: number }
  | { type: "ESCAPE"; now: number }
  | { type: "GLOBAL_TOGGLE"; now: number }
  | { type: "SET_VIEW"; view: PanelView }
  | { type: "NOTIFICATION_ARRIVED"; now: number }
  | { type: "SET_BADGE"; badge: number }
  | { type: "SET_EMPHASIS"; emphasis: Emphasis }
  | { type: "AUTO_COLLAPSE"; now: number }
  | { type: "HIDE" }
  | { type: "SHOW"; now: number };

/** Minimum dwell before the island may contract — kills hover boundary flicker.
 *  Overridable at runtime via `configureIsland` so the Settings slider works. */
export let MIN_DWELL_MS = 350;

/** Runtime-tweakable knobs (hover dwell, etc.). Called from useIsland. */
export function configureIsland(opts: { minDwellMs?: number }): void {
  if (typeof opts.minDwellMs === "number" && Number.isFinite(opts.minDwellMs)) {
    MIN_DWELL_MS = Math.max(50, Math.min(3000, opts.minDwellMs));
  }
}

export const initialIslandState: IslandState = {
  level: "compact",
  view: "home",
  emphasis: "idle",
  holdUntil: 0,
  lastTransitionAt: 0,
  badge: 0,
};

function isHeld(state: IslandState, now: number): boolean {
  return now < state.holdUntil;
}

function toExpanded(state: IslandState, now: number): IslandState {
  return {
    ...state,
    level: "expanded",
    view: state.view === "settings" ? state.view : "home",
    holdUntil: now + MIN_DWELL_MS,
    lastTransitionAt: now,
  };
}

function toCompact(state: IslandState, now: number): IslandState {
  return {
    ...state,
    level: "compact",
    view: "home",
    holdUntil: now + MIN_DWELL_MS,
    lastTransitionAt: now,
  };
}

export function islandReducer(state: IslandState, event: IslandEvent): IslandState {
  switch (event.type) {
    case "HOVER_ENTER": {
      if (state.level !== "compact") return state;
      return { ...state, level: "preview", holdUntil: event.now + MIN_DWELL_MS, lastTransitionAt: event.now };
    }
    case "HOVER_LEAVE": {
      if (state.level !== "preview") return state;
      if (isHeld(state, event.now)) return state;
      return { ...state, level: "compact", lastTransitionAt: event.now };
    }
    case "CLICK": {
      if (state.level === "expanded") return toCompact(state, event.now);
      if (state.level === "hidden") return state;
      return toExpanded(state, event.now);
    }
    case "CLICK_OUTSIDE":
    case "AUTO_COLLAPSE": {
      if (state.level !== "expanded") return state;
      if (isHeld(state, event.now)) return state;
      return toCompact(state, event.now);
    }
    case "ESCAPE": {
      if (state.level !== "expanded") return state;
      if (state.view === "settings") {
        return { ...state, view: "home", lastTransitionAt: event.now };
      }
      return toCompact(state, event.now);
    }
    case "GLOBAL_TOGGLE": {
      if (state.level === "hidden") {
        // Hotkey must always be able to bring the island back.
        return { ...state, level: "compact", lastTransitionAt: event.now };
      }
      if (state.level === "expanded") return toCompact(state, event.now);
      return toExpanded(state, event.now);
    }
    case "SET_VIEW": {
      // Allow setting the view even when currently hidden — the next SHOW
      // will open directly into it (tray "Configuración…").
      if (state.level === "hidden") {
        return { ...state, view: event.view, lastTransitionAt: state.lastTransitionAt };
      }
      if (state.level !== "expanded") return state;
      return { ...state, view: event.view, lastTransitionAt: state.lastTransitionAt };
    }
    case "NOTIFICATION_ARRIVED": {
      return { ...state, emphasis: "notification", holdUntil: event.now + MIN_DWELL_MS };
    }
    case "SET_BADGE":
      return { ...state, badge: Math.max(0, event.badge) };
    case "SET_EMPHASIS":
      return { ...state, emphasis: event.emphasis };
    case "HIDE":
      return { ...state, level: "hidden", view: "home" };
    case "SHOW":
      if (state.level !== "hidden") return state;
      return { ...state, level: "compact", lastTransitionAt: event.now };
    default:
      return state;
  }
}
