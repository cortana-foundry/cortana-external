import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "mc-created-session-ids";

describe("useMCCreatedSessions", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it("ids is empty when no persisted state", async () => {
    const { useMCCreatedSessions } = await import("./use-mc-created-sessions");
    const { result } = renderHook(() => useMCCreatedSessions());

    expect(result.current.ids).toEqual([]);
  });

  it("register adds an id", async () => {
    const { useMCCreatedSessions } = await import("./use-mc-created-sessions");
    const { result } = renderHook(() => useMCCreatedSessions());

    act(() => {
      result.current.register("session-1");
    });

    expect(result.current.ids).toEqual(["session-1"]);
  });

  it("register does not duplicate an id", async () => {
    const { useMCCreatedSessions } = await import("./use-mc-created-sessions");
    const { result } = renderHook(() => useMCCreatedSessions());

    act(() => {
      result.current.register("session-1");
    });

    expect(result.current.ids).toEqual(["session-1"]);

    act(() => {
      result.current.register("session-1");
    });

    expect(result.current.ids).toEqual(["session-1"]);
  });

  it("persists to localStorage", async () => {
    const { useMCCreatedSessions } = await import("./use-mc-created-sessions");
    const { result } = renderHook(() => useMCCreatedSessions());

    act(() => {
      result.current.register("session-1");
      result.current.register("session-2");
    });

    const stored = window.localStorage.getItem(STORAGE_KEY);
    expect(stored).toBe(JSON.stringify(["session-2", "session-1"]));
  });

  it("caps at 50 items, evicting the oldest", async () => {
    const { useMCCreatedSessions } = await import("./use-mc-created-sessions");
    const { result } = renderHook(() => useMCCreatedSessions());

    // Register 51 items
    act(() => {
      for (let i = 0; i < 51; i++) {
        result.current.register(`session-${i}`);
      }
    });

    expect(result.current.ids).toHaveLength(50);
    expect(result.current.ids[0]).toBe("session-50");
    expect(result.current.ids[49]).toBe("session-1");
    expect(result.current.ids).not.toContain("session-0");
  });

  it("hydrates from persisted localStorage", async () => {
    // Pre-populate localStorage
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["session-2", "session-1"]));

    const { useMCCreatedSessions } = await import("./use-mc-created-sessions");
    const { result } = renderHook(() => useMCCreatedSessions());

    // Wait for hydration effect
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(result.current.ids).toEqual(["session-2", "session-1"]);
  });
});
