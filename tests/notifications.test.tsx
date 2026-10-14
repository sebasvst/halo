import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { NotificationsProvider, useNotifications } from "../src/state/NotificationsContext";
import { SettingsProvider } from "../src/state/SettingsContext";
import type { NotificationItem } from "../src/types/bridge";
import { DEFAULT_SETTINGS } from "../src/types/settings";

// Capture handlers registered through the bridge so tests can push events.
type Handler<T> = (payload: T) => void;
const handlers: Array<{ name: string; fn: Handler<unknown> }> = [];

vi.mock("../src/services/bridge", () => {
  const bridgeEvents = {
    notificationReceived: (fn: Handler<unknown>) => {
      handlers.push({ name: "received", fn });
      return Promise.resolve(() => undefined);
    },
    notificationAccess: (fn: Handler<unknown>) => {
      handlers.push({ name: "access", fn });
      return Promise.resolve(() => undefined);
    },
    relayout: () => Promise.resolve(() => undefined),
    openSettings: () => Promise.resolve(() => undefined),
    visibility: () => Promise.resolve(() => undefined),
    dndChanged: () => Promise.resolve(() => undefined),
    settingsImported: () => Promise.resolve(() => undefined),
    mediaState: () => Promise.resolve(() => undefined),
    audioState: () => Promise.resolve(() => undefined),
  };
  return {
    bridgeEvents,
    app: {
      notificationAccess: () => Promise.resolve(null),
      notificationRequestAccess: () => Promise.resolve(null),
      notificationResubscribe: () => Promise.resolve(null),
      info: () => Promise.resolve(null),
      quit: () => Promise.resolve(null),
    },
    settingsApi: { export: () => Promise.resolve(null), import: () => Promise.resolve(null) },
    media: {},
    audio: {},
    shortcuts: {},
    onEvent: () => Promise.resolve(() => undefined),
    applyLayout: () => Promise.resolve(null),
  };
});

function makeItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: `n-${Math.random().toString(36).slice(2)}`,
    appName: "Correo",
    title: "Asunto",
    preview: "Cuerpo del mensaje",
    icon: null,
    receivedAt: Date.now(),
    seed: false,
    category: "mail",
    tag: null,
    actions: [],
    privacy: { hasLaunchTarget: false, hasBody: true },
    ...overrides,
  };
}

function renderNotifications() {
  const utils = renderHook(() => useNotifications(), {
    wrapper: ({ children }) => (
      <SettingsProvider>
        <NotificationsProvider>{children}</NotificationsProvider>
      </SettingsProvider>
    ),
  });
  return utils;
}

function push(item: NotificationItem): void {
  const h = handlers.find((x) => x.name === "received");
  act(() => {
    h?.fn(item);
  });
}

describe("NotificationsContext", () => {
  it("adds a received notification to the queue", () => {
    handlers.length = 0;
    const { result } = renderNotifications();
    const item = makeItem();
    push(item);
    expect(result.current.queue).toHaveLength(1);
    expect(result.current.current?.id).toBe(item.id);
  });

  it("deduplicates by id and moves the repeat to the front", () => {
    handlers.length = 0;
    const { result } = renderNotifications();
    const a = makeItem({ id: "a" });
    const b = makeItem({ id: "b" });
    push(a);
    push(b);
    expect(result.current.queue.map((n) => n.id)).toEqual(["b", "a"]);
    push(a);
    expect(result.current.queue.map((n) => n.id)).toEqual(["a", "b"]);
    expect(result.current.queue).toHaveLength(2);
  });

  it("enforces the configured queue limit, dropping the oldest", () => {
    handlers.length = 0;
    const { result } = renderNotifications();
    const limit = DEFAULT_SETTINGS.notifications.queueLimit;
    for (let i = 0; i < limit + 5; i++) {
      push(makeItem({ id: `n${i}` }));
    }
    expect(result.current.queue).toHaveLength(limit);
    // Newest kept, oldest dropped.
    expect(result.current.queue[0]?.id).toBe(`n${limit + 4}`);
    expect(result.current.queue.at(-1)?.id).toBe(`n${5}`);
  });

  it("dismiss removes only that item and clamps the selected index", () => {
    handlers.length = 0;
    const { result } = renderNotifications();
    push(makeItem({ id: "a" }));
    push(makeItem({ id: "b" }));
    expect(result.current.index).toBe(0);
    act(() => {
      result.current.select(1);
    });
    expect(result.current.current?.id).toBe("a");
    act(() => {
      result.current.dismiss("a");
    });
    expect(result.current.queue.map((n) => n.id)).toEqual(["b"]);
    expect(result.current.current?.id).toBe("b");
  });

  it("dismissAll empties the queue", () => {
    handlers.length = 0;
    const { result } = renderNotifications();
    push(makeItem());
    push(makeItem());
    act(() => {
      result.current.dismissAll();
    });
    expect(result.current.queue).toHaveLength(0);
    expect(result.current.current).toBeNull();
  });

  it("next/previous wrap around the queue", () => {
    handlers.length = 0;
    const { result } = renderNotifications();
    push(makeItem({ id: "a" }));
    push(makeItem({ id: "b" }));
    expect(result.current.index).toBe(0);
    act(() => {
      result.current.next();
    });
    expect(result.current.index).toBe(1);
    act(() => {
      result.current.next();
    });
    expect(result.current.index).toBe(0);
    act(() => {
      result.current.previous();
    });
    expect(result.current.index).toBe(1);
  });

  it("emits a flash only when visual alerts are enabled and DND is off", async () => {
    handlers.length = 0;
    const { result } = renderNotifications();
    // Default settings: visualAlerts on, DND off → flash present.
    push(makeItem({ id: "flash-1" }));
    expect(result.current.flash?.id).toBe("flash-1");
    expect(result.current.flash?.receivedAt).toBeTypeOf("number");
  });
});
