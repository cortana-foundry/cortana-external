import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyPill } from "./copy-pill";

describe("CopyPill", () => {
  const writeText = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders label and value", () => {
    render(<CopyPill label="Cwd" value="/tmp/one" />);
    expect(screen.getByText("Cwd")).toBeInTheDocument();
    expect(screen.getByText("/tmp/one")).toBeInTheDocument();
  });

  it("copies the value to clipboard on click", () => {
    render(<CopyPill label="Session id" value="abc-123" />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).toHaveBeenCalledWith("abc-123");
  });

  it("shows copied state and reverts after timeout", () => {
    render(<CopyPill label="X" value="y" />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-label", "X copied");

    act(() => {
      vi.advanceTimersByTime(1700);
    });

    expect(button).toHaveAttribute("aria-label", "Copy X");
  });

  it("is disabled when value is missing", () => {
    render(<CopyPill label="Unknown" value={null} />);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("does not write to clipboard when value is null", () => {
    render(<CopyPill label="Unknown" value={null} />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeText).not.toHaveBeenCalled();
  });
});
