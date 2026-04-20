import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useThreadReadState } from "./use-thread-read-state";

// Mock localStorage
const mockStorage: Record<string, string> = {};

beforeEach(() => {
  delete mockStorage["mc-sessions-read-state"];
  vi.clearAllMocks();
});

Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, value: string) => {
      mockStorage[key] = value;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
    },
    length: 0,
    key: () => null,
  } as Storage,
  configurable: true,
});

describe("useThreadReadState", () => {
  it("returns false for null/undefined updatedAt", () => {
    const { result } = renderHook(() => useThreadReadState());
    expect(result.current.isUnread("s1", null)).toBe(false);
    expect(result.current.isUnread("s1", undefined)).toBe(false);
  });

  it("returns true when nothing persisted for that id", () => {
    const { result } = renderHook(() => useThreadReadState());
    const now = Date.now();
    expect(result.current.isUnread("s1", now)).toBe(true);
  });

  it("markSeen makes isUnread return false for the same updatedAt", () => {
    const { result } = renderHook(() => useThreadReadState());
    const timestamp = 1_700_000_000_000;

    // Initially unread
    expect(result.current.isUnread("s1", timestamp)).toBe(true);

    // After marking seen
    act(() => {
      result.current.markSeen("s1");
    });

    expect(result.current.isUnread("s1", timestamp)).toBe(false);
  });

  it("markSeen persists to localStorage", () => {
    const { result } = renderHook(() => useThreadReadState());

    act(() => {
      result.current.markSeen("s1");
    });

    const stored = mockStorage["mc-sessions-read-state"];
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored) as Record<string, number>;
    expect(parsed.s1).toBeDefined();
    expect(typeof parsed.s1).toBe("number");
  });

  it("a newer updatedAt again returns true after markSeen", () => {
    const { result } = renderHook(() => useThreadReadState());
    const now = Date.now();
    const oldTimestamp = now - 2_000;
    const newTimestamp = now + 2_000;

    act(() => {
      result.current.markSeen("s1");
    });

    // Old timestamp should be false
    expect(result.current.isUnread("s1", oldTimestamp)).toBe(false);

    // Newer timestamp should be true
    expect(result.current.isUnread("s1", newTimestamp)).toBe(true);
  });

  it("handles multiple sessions independently", () => {
    const { result } = renderHook(() => useThreadReadState());
    const ts1 = 1_000_000;
    const ts2 = 2_000_000;

    act(() => {
      result.current.markSeen("s1");
    });

    // s1 is marked seen
    expect(result.current.isUnread("s1", ts1)).toBe(false);

    // s2 is not marked seen
    expect(result.current.isUnread("s2", ts2)).toBe(true);
  });

  it("loads from localStorage on mount if available", () => {
    const savedState = { s1: Date.now() - 1000 };
    mockStorage["mc-sessions-read-state"] = JSON.stringify(savedState);

    const { result } = renderHook(() => useThreadReadState());

    // The hook should have loaded the stored state
    // s1 with a timestamp after the saved one should be unread
    expect(result.current.isUnread("s1", Date.now())).toBe(true);

    // s1 with a timestamp before the saved one should be read
    expect(result.current.isUnread("s1", Date.now() - 2000)).toBe(false);
  });
});
