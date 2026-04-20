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

  it("renders absolute date when timestamp is 3 days old", () => {
    const threeDAysAgo = NOW - 3 * 24 * 60 * 60 * 1000;
    render(<LiveRelativeTime ts={threeDAysAgo} />);
    // Should render "Nov <N>" format (3 days before Nov 17, 2023 is Nov 14)
    const text = screen.getByText(/nov|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|dec/i).textContent;
    expect(text).toMatch(/^[A-Za-z]+\s+\d{1,2}$/);
  });

  it("renders absolute date when timestamp is 1 year old", () => {
    const oneYearAgo = NOW - 365 * 24 * 60 * 60 * 1000;
    render(<LiveRelativeTime ts={oneYearAgo} />);
    // Should render absolute date format
    const text = screen.getByText(/nov|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|dec/i).textContent;
    expect(text).toMatch(/^[A-Za-z]+\s+\d{1,2}$/);
  });
});
