import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { JumpToLatest } from "./jump-to-latest";

describe("JumpToLatest", () => {
  it("renders nothing when not visible", () => {
    const { container } = render(<JumpToLatest visible={false} onClick={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a button when visible", () => {
    render(<JumpToLatest visible onClick={() => {}} />);
    expect(screen.getByRole("button", { name: /jump to latest/i })).toBeInTheDocument();
  });

  it("invokes onClick", () => {
    const spy = vi.fn();
    render(<JumpToLatest visible onClick={spy} />);
    fireEvent.click(screen.getByRole("button"));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
