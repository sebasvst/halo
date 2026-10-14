import { describe, expect, it } from "vitest";
import {
  islandReducer,
  initialIslandState,
  MIN_DWELL_MS,
  type IslandState,
} from "../src/state/islandMachine";

const at = (base: number, delta: number): number => base + delta;

function reduced(event: Parameters<typeof islandReducer>[1], now = 1000): IslandState {
  return islandReducer({ ...initialIslandState, lastTransitionAt: now }, event);
}

describe("islandReducer", () => {
  it("starts compact", () => {
    expect(initialIslandState.level).toBe("compact");
    expect(initialIslandState.badge).toBe(0);
  });

  it("hover enters preview from compact only", () => {
    const s = reduced({ type: "HOVER_ENTER", now: 1000 });
    expect(s.level).toBe("preview");
    const again = islandReducer(s, { type: "HOVER_ENTER", now: 1100 });
    expect(again.level).toBe("preview");
  });

  it("applies hysteresis: hover leave inside dwell window is ignored", () => {
    const enter = islandReducer(initialIslandState, { type: "HOVER_ENTER", now: 1000 });
    const tooSoon = islandReducer(enter, {
      type: "HOVER_LEAVE",
      now: at(1000, MIN_DWELL_MS - 1),
    });
    expect(tooSoon.level).toBe("preview");
    const after = islandReducer(enter, {
      type: "HOVER_LEAVE",
      now: at(1000, MIN_DWELL_MS + 1),
    });
    expect(after.level).toBe("compact");
  });

  it("click expands and click again collapses", () => {
    const open = islandReducer(initialIslandState, { type: "CLICK", now: 1000 });
    expect(open.level).toBe("expanded");
    const close = islandReducer(open, { type: "CLICK", now: at(1000, 5000) });
    expect(close.level).toBe("compact");
    expect(close.view).toBe("home");
  });

  it("click outside collapses only after dwell", () => {
    const open = islandReducer(initialIslandState, { type: "CLICK", now: 1000 });
    const early = islandReducer(open, {
      type: "CLICK_OUTSIDE",
      now: at(1000, MIN_DWELL_MS - 1),
    });
    expect(early.level).toBe("expanded");
    const late = islandReducer(open, {
      type: "CLICK_OUTSIDE",
      now: at(1000, MIN_DWELL_MS + 1),
    });
    expect(late.level).toBe("compact");
  });

  it("auto collapse respects dwell and only fires when expanded", () => {
    const compact = islandReducer(initialIslandState, {
      type: "AUTO_COLLAPSE",
      now: 99999,
    });
    expect(compact.level).toBe("compact");
    const open = islandReducer(initialIslandState, { type: "CLICK", now: 1000 });
    const late = islandReducer(open, { type: "AUTO_COLLAPSE", now: 5000 });
    expect(late.level).toBe("compact");
  });

  it("escape from settings goes home first, then collapses", () => {
    const open = islandReducer(initialIslandState, { type: "CLICK", now: 1000 });
    const settings = islandReducer(open, { type: "SET_VIEW", view: "settings" });
    expect(settings.view).toBe("settings");
    const home = islandReducer(settings, { type: "ESCAPE", now: 2000 });
    expect(home.view).toBe("home");
    expect(home.level).toBe("expanded");
    const closed = islandReducer(home, { type: "ESCAPE", now: 5000 });
    expect(closed.level).toBe("compact");
  });

  it("global toggle expands from compact and collapses from expanded", () => {
    const open = islandReducer(initialIslandState, { type: "GLOBAL_TOGGLE", now: 1000 });
    expect(open.level).toBe("expanded");
    const close = islandReducer(open, { type: "GLOBAL_TOGGLE", now: 5000 });
    expect(close.level).toBe("compact");
  });

  it("SET_VIEW is a no-op unless expanded", () => {
    const s = islandReducer(initialIslandState, { type: "SET_VIEW", view: "settings" });
    expect(s.view).toBe("home");
  });

  it("clamps badge at zero and keeps it non-negative", () => {
    const s = islandReducer(
      { ...initialIslandState, badge: 2 },
      { type: "SET_BADGE", badge: -5 },
    );
    expect(s.badge).toBe(0);
    const up = islandReducer(s, { type: "SET_BADGE", badge: 7 });
    expect(up.badge).toBe(7);
  });

  it("hide then show round-trips to compact and resets view", () => {
    const open = islandReducer(initialIslandState, { type: "CLICK", now: 1000 });
    const settings = islandReducer(open, { type: "SET_VIEW", view: "settings" });
    const hidden = islandReducer(settings, { type: "HIDE" });
    expect(hidden.level).toBe("hidden");
    expect(hidden.view).toBe("home");
    const shown = islandReducer(hidden, { type: "SHOW", now: 3000 });
    expect(shown.level).toBe("compact");
  });

  it("show while visible is a no-op", () => {
    const s = islandReducer(initialIslandState, { type: "SHOW", now: 1000 });
    expect(s).toBe(initialIslandState);
  });

  it("notification arrival sets emphasis and extends hold", () => {
    const s = islandReducer(
      { ...initialIslandState, holdUntil: 0 },
      { type: "NOTIFICATION_ARRIVED", now: 1000 },
    );
    expect(s.emphasis).toBe("notification");
    expect(s.holdUntil).toBe(1000 + MIN_DWELL_MS);
  });

  it("emphasis can be reset to idle", () => {
    const s = islandReducer(
      { ...initialIslandState, emphasis: "notification" },
      { type: "SET_EMPHASIS", emphasis: "idle" },
    );
    expect(s.emphasis).toBe("idle");
  });
});
