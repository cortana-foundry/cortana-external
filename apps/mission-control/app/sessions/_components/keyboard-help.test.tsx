import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeyboardHelp } from "./keyboard-help";

describe("KeyboardHelp", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(<KeyboardHelp open={false} onOpenChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the panel when open is true", () => {
    render(<KeyboardHelp open onOpenChange={() => {}} />);
    expect(screen.getByText("Keyboard shortcuts")).toBeInTheDocument();
  });

  it("shows all expected shortcut rows", () => {
    render(<KeyboardHelp open onOpenChange={() => {}} />);
    expect(screen.getByText("Focus reply composer")).toBeInTheDocument();
    expect(screen.getByText("Next thread")).toBeInTheDocument();
    expect(screen.getByText("Prev thread")).toBeInTheDocument();
    expect(screen.getByText("Open thread palette")).toBeInTheDocument();
    expect(screen.getByText("Send message")).toBeInTheDocument();
    expect(screen.getByText("Close overlays")).toBeInTheDocument();
    expect(screen.getByText("Open this help")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) when close button is clicked", () => {
    const onOpenChange = vi.fn();
    render(<KeyboardHelp open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByLabelText("Close keyboard help"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when Esc key is pressed", () => {
    const onOpenChange = vi.fn();
    render(<KeyboardHelp open onOpenChange={onOpenChange} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when clicking the overlay background", () => {
    const onOpenChange = vi.fn();
    const { container } = render(<KeyboardHelp open onOpenChange={onOpenChange} />);
    // Find the overlay div (the one with fixed inset-0)
    const overlay = container.querySelector('[role="dialog"]');
    fireEvent.click(overlay!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not close when clicking inside the panel", () => {
    const onOpenChange = vi.fn();
    render(<KeyboardHelp open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText("Keyboard shortcuts"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
