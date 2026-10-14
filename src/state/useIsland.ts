import { useCallback, useEffect, useReducer, useRef } from "react";
import { bridgeEvents, applyLayout } from "../services/bridge";
import { CAPSULE, PANEL, MARGIN, PREVIEW_GROWTH } from "../utils/layout";
import type { LayoutInfo } from "../types/bridge";
import {
  islandReducer,
  initialIslandState,
  configureIsland,
  type IslandEvent,
  type IslandState,
} from "./islandMachine";

interface UseIslandOptions {
  hoverPreview: boolean;
  autoCollapse: boolean;
  autoCollapseMs: number;
  hoverPreviewMs: number;
  panelScale: number;
  capsuleScale: number;
}

export function useIsland(options: UseIslandOptions) {
  const [state, dispatch] = useReducer(islandReducer, initialIslandState);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const expandedRef = useRef(false);
  expandedRef.current = state.level === "expanded";
  /** Physical bounds of the island window as last reported by the backend. */
  const lastRectRef = useRef<LayoutInfo | null>(null);

  const send = useCallback((event: IslandEvent) => dispatch(event), []);

  /** Resizes/repositions the native window to match the current level.
   *  The window is sized for the *base* geometry; visual scale is applied
   *  via CSS `transform: scale()` so type stays crisp and proportional. */
  const syncLayout = useCallback(async (level: IslandState["level"]) => {
    const { capsuleScale, panelScale } = optionsRef.current;
    const expanded = level === "expanded";
    const previewing = level === "preview";
    // The window carries transparent margins so shadows/glow are never clipped,
    // and grows slightly while the island wakes up on hover.
    const capsuleW = Math.round(
      (CAPSULE.w + (previewing ? PREVIEW_GROWTH.w : 0)) * capsuleScale,
    );
    const capsuleH = Math.round(
      (CAPSULE.h + (previewing ? PREVIEW_GROWTH.h : 0)) * capsuleScale,
    );
    await applyLayout({
      capsuleW: capsuleW + MARGIN.x * 2,
      capsuleH: capsuleH + MARGIN.y * 2,
      expandedW: Math.round(PANEL.w * panelScale) + MARGIN.x * 2,
      expandedH: Math.round(PANEL.h * panelScale) + MARGIN.y * 2,
      expanded,
    }).then((info) => {
      if (info) lastRectRef.current = info;
    });
  }, []);

  // Keep the window geometry in sync with state transitions.
  useEffect(() => {
    void syncLayout(state.level);
  }, [state.level, syncLayout]);

  // Re-apply layout when Windows reports display/DPI changes.
  useEffect(() => {
    const un = bridgeEvents.relayout(() => {
      void syncLayout(expandedRef.current ? "expanded" : "compact");
    });
    return () => {
      void un.then((fn) => fn());
    };
  }, [syncLayout]);

  // Collapse when the window loses focus (real "click outside" at OS level).
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        const off = await win.onFocusChanged((focused) => {
          if (!focused && expandedRef.current) {
            dispatch({ type: "CLICK_OUTSIDE", now: Date.now() });
          }
        });
        if (disposed) off();
        else unlisten = off;
      } catch {
        // Not running under Tauri (tests) — ignore.
      }
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Is the cursor physically over the island window? Hover events alone are not
  // enough: when the window resizes under a motionless cursor, Chromium never
  // fires mouseenter, and auto-collapse would close the panel the user is reading.
  const cursorOverIsland = useCallback(async (): Promise<boolean> => {
    const rect = lastRectRef.current;
    if (!rect) return false;
    try {
      const { cursorPosition } = await import("@tauri-apps/api/window");
      const pos = await cursorPosition();
      return (
        pos.x >= rect.x &&
        pos.x <= rect.x + rect.width &&
        pos.y >= rect.y &&
        pos.y <= rect.y + rect.height
      );
    } catch {
      // Outside Tauri (tests) — fall back to the hover flag only.
      return false;
    }
  }, []);

  // Wire the hover-dwell setting into the pure machine.
  useEffect(() => {
    configureIsland({ minDwellMs: options.hoverPreviewMs });
  }, [options.hoverPreviewMs]);

  // Auto-collapse while expanded. The user has `autoCollapseMs` of grace
  // after the cursor leaves the island before it actually collapses.
  const hoveringRef = useRef(false);
  const cursorLeftAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (state.level !== "expanded" || !options.autoCollapse) {
      cursorLeftAtRef.current = null;
      return;
    }
    const grace = options.autoCollapseMs;
    let busy = false;
    const id = window.setInterval(() => {
      if (busy || hoveringRef.current) {
        cursorLeftAtRef.current = null;
        return;
      }
      busy = true;
      void cursorOverIsland()
        .then((inside) => {
          if (inside) {
            cursorLeftAtRef.current = null;
            return;
          }
          const now = Date.now();
          if (cursorLeftAtRef.current === null) {
            cursorLeftAtRef.current = now;
            return;
          }
          if (now - cursorLeftAtRef.current >= grace) {
            dispatch({ type: "AUTO_COLLAPSE", now });
            cursorLeftAtRef.current = null;
          }
        })
        .finally(() => {
          busy = false;
        });
    }, 400);
    return () => window.clearInterval(id);
  }, [state.level, options.autoCollapse, options.autoCollapseMs, cursorOverIsland]);

  const setHovering = useCallback((inside: boolean) => {
    hoveringRef.current = inside;
  }, []);

  const hoverEnter = useCallback(() => {
    if (!optionsRef.current.hoverPreview) return;
    dispatch({ type: "HOVER_ENTER", now: Date.now() });
  }, []);

  const hoverLeave = useCallback(() => {
    dispatch({ type: "HOVER_LEAVE", now: Date.now() });
  }, []);

  return {
    state,
    send,
    syncLayout,
    hoverEnter,
    hoverLeave,
    setHovering,
  };
}
