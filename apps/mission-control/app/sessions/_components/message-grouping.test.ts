import { describe, expect, it } from "vitest";
import { shouldShowHeader, type Message } from "./message-grouping";

const TWO_MINUTES = 2 * 60 * 1000;

describe("shouldShowHeader", () => {
  it("always shows header for first message (no previous)", () => {
    const current: Message = {
      role: "user",
      timestamp: 1000,
    };
    expect(shouldShowHeader(current, null)).toBe(true);
  });

  it("shows header when switching roles", () => {
    const previous: Message = { role: "user", timestamp: 1000 };
    const current: Message = { role: "assistant", timestamp: 2000 };
    expect(shouldShowHeader(current, previous)).toBe(true);
  });

  it("hides header when same role within 2 minutes", () => {
    const previous: Message = { role: "assistant", timestamp: 1000 };
    const current: Message = { role: "assistant", timestamp: 1000 + TWO_MINUTES - 1000 };
    expect(shouldShowHeader(current, previous)).toBe(false);
  });

  it("shows header when same role outside 2 minutes", () => {
    const previous: Message = { role: "assistant", timestamp: 1000 };
    const current: Message = { role: "assistant", timestamp: 1000 + TWO_MINUTES + 1000 };
    expect(shouldShowHeader(current, previous)).toBe(true);
  });

  it("shows header when previous has no timestamp", () => {
    const previous: Message = { role: "user", timestamp: null };
    const current: Message = { role: "user", timestamp: 5000 };
    expect(shouldShowHeader(current, previous)).toBe(true);
  });

  it("shows header when current has no timestamp", () => {
    const previous: Message = { role: "user", timestamp: 1000 };
    const current: Message = { role: "user", timestamp: null };
    expect(shouldShowHeader(current, previous)).toBe(true);
  });

  it("shows header when both have no timestamp", () => {
    const previous: Message = { role: "user", timestamp: null };
    const current: Message = { role: "user", timestamp: null };
    expect(shouldShowHeader(current, previous)).toBe(true);
  });
});
