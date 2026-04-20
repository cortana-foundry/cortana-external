import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReaderHeader } from "./reader-header";

describe("ReaderHeader", () => {
  it("renders the title and saved count", () => {
    render(
      <ReaderHeader
        title="My Thread"
        state="idle"
        savedMessageCount={7}
        updatedAt={null}
        open={false}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText("My Thread")).toBeInTheDocument();
    expect(screen.getByText(/7 saved/i)).toBeInTheDocument();
  });

  it("reflects aria-expanded based on open prop", () => {
    const { rerender } = render(
      <ReaderHeader
        title="t"
        state="idle"
        savedMessageCount={0}
        updatedAt={null}
        open={false}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { expanded: false })).toBeInTheDocument();

    rerender(
      <ReaderHeader
        title="t"
        state="idle"
        savedMessageCount={0}
        updatedAt={null}
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByRole("button", { expanded: true })).toBeInTheDocument();
  });

  it("calls onOpenChange with the inverse of open when clicked", () => {
    const onOpenChange = vi.fn();
    render(
      <ReaderHeader
        title="t"
        state="idle"
        savedMessageCount={0}
        updatedAt={null}
        open={false}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("shows an inbox toggle when showInboxToggle is true", () => {
    const onOpenInbox = vi.fn();
    render(
      <ReaderHeader
        title="t"
        state="idle"
        savedMessageCount={0}
        updatedAt={null}
        open={false}
        onOpenChange={() => {}}
        onOpenInbox={onOpenInbox}
        showInboxToggle
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open thread inbox/i }));
    expect(onOpenInbox).toHaveBeenCalledTimes(1);
  });

  it("shows keyboard help button when onOpenKeyboardHelp is provided", () => {
    const onOpenKeyboardHelp = vi.fn();
    render(
      <ReaderHeader
        title="t"
        state="idle"
        savedMessageCount={0}
        updatedAt={null}
        open={false}
        onOpenChange={() => {}}
        onOpenKeyboardHelp={onOpenKeyboardHelp}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open keyboard shortcuts help/i }));
    expect(onOpenKeyboardHelp).toHaveBeenCalledTimes(1);
  });

  it("does not show keyboard help button when onOpenKeyboardHelp is not provided", () => {
    render(
      <ReaderHeader
        title="t"
        state="idle"
        savedMessageCount={0}
        updatedAt={null}
        open={false}
        onOpenChange={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /open keyboard shortcuts help/i })).not.toBeInTheDocument();
  });
});
