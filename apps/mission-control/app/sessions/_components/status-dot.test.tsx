import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot } from "./status-dot";

describe("StatusDot", () => {
  it("applies idle classes by default", () => {
    const { container } = render(<StatusDot state="idle" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveClass("thinking-dot");
    expect(dot).toHaveClass("thinking-idle");
    expect(dot).toHaveAttribute("data-state", "idle");
  });

  it("applies streaming classes", () => {
    const { container } = render(<StatusDot state="streaming" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveClass("thinking-active");
    expect(dot).toHaveAttribute("data-state", "streaming");
  });

  it("applies offline classes", () => {
    const { container } = render(<StatusDot state="offline" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveAttribute("data-state", "offline");
  });

  it("applies error classes", () => {
    const { container } = render(<StatusDot state="error" />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveAttribute("data-state", "error");
    expect(dot).toHaveClass("bg-destructive");
  });

  it("honors custom aria-label", () => {
    const { getByRole } = render(<StatusDot state="streaming" aria-label="Streaming reply" />);
    expect(getByRole("status")).toHaveAttribute("aria-label", "Streaming reply");
  });
});
