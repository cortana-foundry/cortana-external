import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveRelativeTime } from "./live-relative-time";

describe("LiveRelativeTime", () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders Unknown when ts is null", () => {
    render(<LiveRelativeTime ts={null} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("ticks every 30s for recent timestamps", () => {
    const { rerender } = render(<LiveRelativeTime ts={NOW - 60_000} />);
    const initial = screen.getByText(/ago|minute|min/i).textContent;

    act(() => {
      vi.setSystemTime(NOW + 30 * 60_000);
      vi.advanceTimersByTime(30_000);
    });

    rerender(<LiveRelativeTime ts={NOW - 60_000} />);
    const updated = screen.getByText(/ago|minute|min/i).textContent;
    expect(updated).not.toBe(initial);
  });

  it("does not register an interval for stale timestamps (>48h)", () => {
    const spy = vi.spyOn(window, "setInterval");
    render(<LiveRelativeTime ts={NOW - 72 * 60 * 60 * 1000} />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("does not register an interval when ts is null", () => {
    const spy = vi.spyOn(window, "setInterval");
    render(<LiveRelativeTime ts={null} />);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
