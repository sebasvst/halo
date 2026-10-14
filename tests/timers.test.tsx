import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { TimersProvider, useTimers } from "../src/state/TimersContext";
import { SettingsProvider } from "../src/state/SettingsContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <TimersProvider>{children}</TimersProvider>
    </SettingsProvider>
  );
}

describe("TimersContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a paused timer with the requested duration", () => {
    const { result } = renderHook(() => useTimers(), { wrapper });
    act(() => {
      result.current.create("Café", 5 * 60_000);
    });
    expect(result.current.timers).toHaveLength(1);
    expect(result.current.timers[0]?.status).toBe("paused");
    expect(result.current.timers[0]?.remainingMs).toBe(5 * 60_000);
  });

  it("clamps durations to sane bounds", () => {
    const { result } = renderHook(() => useTimers(), { wrapper });
    act(() => {
      result.current.create("tiny", 5);
      result.current.create("huge", 100 * 3600_000);
    });
    expect(result.current.timers[0]?.durationMs).toBe(1000);
    expect(result.current.timers[1]?.durationMs).toBe(24 * 3600_000);
  });

  it("counts down from timestamps and finishes exactly at the deadline", () => {
    const { result } = renderHook(() => useTimers(), { wrapper });
    act(() => {
      result.current.create("corto", 3000);
    });
    const id = result.current.timers[0]!.id;
    act(() => {
      result.current.start(id);
    });
    const running = result.current.timers[0]!;
    expect(running.status).toBe("running");
    expect(running.endsAt).not.toBeNull();

    // 1s later, ~2s remain (timestamp based, not accumulated).
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const mid = result.current.timers[0]!;
    const remaining = result.current.remainingOf(mid, Date.now());
    expect(remaining).toBeGreaterThan(1500);
    expect(remaining).toBeLessThanOrEqual(2001);

    // Pass the deadline → status flips to done.
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.timers[0]?.status).toBe("done");
    expect(result.current.remainingOf(result.current.timers[0]!, Date.now())).toBe(0);
  });

  it("pause freezes remaining time and resume restarts from it", () => {
    const { result } = renderHook(() => useTimers(), { wrapper });
    act(() => {
      result.current.create("p", 10_000);
    });
    const id = result.current.timers[0]!.id;
    act(() => {
      result.current.start(id);
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => {
      result.current.pause(id);
    });
    const paused = result.current.timers[0]!;
    expect(paused.status).toBe("paused");
    expect(paused.endsAt).toBeNull();
    expect(paused.remainingMs).toBeGreaterThan(5000);
    expect(paused.remainingMs).toBeLessThanOrEqual(6001);

    act(() => {
      result.current.start(id);
    });
    expect(result.current.timers[0]?.status).toBe("running");
  });

  it("reset returns the full duration and cancel removes the timer", () => {
    const { result } = renderHook(() => useTimers(), { wrapper });
    act(() => {
      result.current.create("r", 60_000);
    });
    const id = result.current.timers[0]!.id;
    act(() => {
      result.current.start(id);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => {
      result.current.reset(id);
    });
    expect(result.current.timers[0]?.remainingMs).toBe(60_000);
    expect(result.current.timers[0]?.status).toBe("paused");
    act(() => {
      result.current.cancel(id);
    });
    expect(result.current.timers).toHaveLength(0);
  });

  it("does not persist across restarts by default", () => {
    const { result } = renderHook(() => useTimers(), { wrapper });
    act(() => {
      result.current.create("no-persist", 60_000);
    });
    expect(localStorage.getItem("halo.timers")).toBeNull();
  });

  it("handles an empty label with a default name", () => {
    const { result } = renderHook(() => useTimers(), { wrapper });
    act(() => {
      result.current.create("   ", 60_000);
    });
    expect(result.current.timers[0]?.label).toBe("Temporizador");
  });
});
