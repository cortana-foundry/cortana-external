import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NewThreadEmptyState } from "./new-thread-empty-state";

describe("NewThreadEmptyState", () => {
  it("renders heading, textarea, and action buttons", () => {
    render(
      <NewThreadEmptyState
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByRole("heading", { name: /start a new codex thread/i })).toBeDefined();
    expect(screen.getByRole("textbox", { name: /new codex thread prompt/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /cancel new thread/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /start thread/i })).toBeDefined();
  });

  it("disables the submit button when empty or whitespace", () => {
    const { rerender } = render(
      <NewThreadEmptyState
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByRole("button", { name: /start thread/i })).toHaveProperty("disabled", true);

    rerender(
      <NewThreadEmptyState
        value="   "
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByRole("button", { name: /start thread/i })).toHaveProperty("disabled", true);

    rerender(
      <NewThreadEmptyState
        value="Refactor auth"
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        pending={false}
      />,
    );
    expect(screen.getByRole("button", { name: /start thread/i })).toHaveProperty("disabled", false);
  });

  it("invokes onSubmit on ⌘↵ when non-empty and not pending", () => {
    const onSubmit = vi.fn();
    render(
      <NewThreadEmptyState
        value="Ship it"
        onChange={() => {}}
        onSubmit={onSubmit}
        onCancel={() => {}}
        pending={false}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: /new codex thread prompt/i });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does NOT invoke onSubmit on ⌘↵ when empty", () => {
    const onSubmit = vi.fn();
    render(
      <NewThreadEmptyState
        value=""
        onChange={() => {}}
        onSubmit={onSubmit}
        onCancel={() => {}}
        pending={false}
      />,
    );
    const textarea = screen.getByRole("textbox", { name: /new codex thread prompt/i });
    fireEvent.keyDown(textarea, { key: "Enter", metaKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("invokes onCancel when cancel button clicked", () => {
    const onCancel = vi.fn();
    render(
      <NewThreadEmptyState
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={onCancel}
        pending={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel new thread/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("shows a spinner and disables submit while pending", () => {
    render(
      <NewThreadEmptyState
        value="Anything"
        onChange={() => {}}
        onSubmit={() => {}}
        onCancel={() => {}}
        pending
      />,
    );
    const submitButton = screen.getByRole("button", { name: /starting/i });
    expect(submitButton).toHaveProperty("disabled", true);
    expect(screen.getByText(/starting/i)).toBeDefined();
  });
});
