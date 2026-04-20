import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/message-content", () => ({
  MessageContent: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

import { MessageBlock } from "./message-block";
import { getProjectColor } from "./project-color";

describe("MessageBlock", () => {
  it("renders the user variant", () => {
    render(<MessageBlock role="user" text="hi" timestamp={null} rootPath="/a" />);
    expect(screen.getByText("You")).toBeInTheDocument();
  });

  it("renders the assistant variant", () => {
    render(<MessageBlock role="assistant" text="answer" timestamp={null} rootPath="/a" />);
    expect(screen.getByText("Codex")).toBeInTheDocument();
  });

  it("renders the streaming variant with a status dot", () => {
    render(
      <MessageBlock
        role="assistant"
        text="partial"
        timestamp={null}
        rootPath="/a"
        variant="streaming"
      />,
    );
    expect(screen.getByText(/streaming/i)).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /streaming/i })).toBeInTheDocument();
  });

  it("renders the pending variant with queued label", () => {
    const { container } = render(
      <MessageBlock
        role="user"
        text="placeholder"
        timestamp={null}
        rootPath="/a"
        variant="pending"
      />,
    );
    expect(container.querySelector("[data-variant='pending']")).toBeInTheDocument();
    expect(screen.getByText("queued")).toBeInTheDocument();
  });

  it("applies a project-color stripe as a CSS variable", () => {
    const { container } = render(
      <MessageBlock role="user" text="hi" timestamp={null} rootPath="/Users/hd/projects/alpha" />,
    );
    const article = container.querySelector("article");
    const expected = getProjectColor("/Users/hd/projects/alpha").stripe;
    expect(article?.getAttribute("style")).toContain(expected);
  });

  it("copies message text to the clipboard on click", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<MessageBlock role="assistant" text="hello there" timestamp={null} rootPath={null} />);
    fireEvent.click(screen.getByRole("button", { name: /copy message/i }));
    expect(writeText).toHaveBeenCalledWith("hello there");
  });

  it("shows avatar, role label, and timestamp when showHeader=true (default)", () => {
    render(
      <MessageBlock
        role="assistant"
        text="hello"
        timestamp={Date.now()}
        rootPath={null}
        showHeader={true}
      />,
    );
    expect(screen.getByText("Codex")).toBeInTheDocument();
    // Timestamp should be visible in the header
    const spans = screen.getAllByText(/:\d{2}/);
    expect(spans.length).toBeGreaterThan(0);
  });

  it("hides avatar, role label, and timestamp when showHeader=false", () => {
    const { container } = render(
      <MessageBlock
        role="assistant"
        text="hello"
        timestamp={Date.now()}
        rootPath={null}
        showHeader={false}
      />,
    );
    // Role label should not be in document
    expect(screen.queryByText("Codex")).not.toBeInTheDocument();
    // Stripe should still be visible (div with aria-hidden, comes first in flex)
    const article = container.querySelector("article");
    expect(article).toHaveClass("project-stripe");
  });

  it("keeps hover copy button visible in both header and no-header modes", () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(
      <MessageBlock
        role="user"
        text="test"
        timestamp={Date.now()}
        rootPath={null}
        showHeader={false}
      />,
    );
    // Copy button should still be present even without header
    const buttons = screen.getAllByRole("button", { name: /copy message/i });
    expect(buttons.length).toBeGreaterThan(0);
  });

  it("renders hover timestamp when showHeader=false and timestamp is non-null", () => {
    const ts = Date.now();
    const { container } = render(
      <MessageBlock
        role="assistant"
        text="hello"
        timestamp={ts}
        rootPath={null}
        showHeader={false}
      />,
    );
    // Find the time element
    const timeElement = container.querySelector("time");
    expect(timeElement).toBeInTheDocument();
    expect(timeElement).toHaveAttribute("dateTime");
    // Check that it has the correct class for hover visibility
    expect(timeElement).toHaveClass("opacity-0", "group-hover:opacity-100");
  });

  it("does not render hover timestamp when showHeader=false and timestamp is null", () => {
    const { container } = render(
      <MessageBlock
        role="assistant"
        text="hello"
        timestamp={null}
        rootPath={null}
        showHeader={false}
      />,
    );
    // Find the time element - should not exist
    const timeElement = container.querySelector("time");
    expect(timeElement).not.toBeInTheDocument();
  });

  it("does not render hover timestamp when showHeader=true (header already shows it)", () => {
    const ts = Date.now();
    const { container } = render(
      <MessageBlock
        role="assistant"
        text="hello"
        timestamp={ts}
        rootPath={null}
        showHeader={true}
      />,
    );
    // With showHeader=true, we don't render the extra hover timestamp
    // The main timestamp is in the header instead
    const timeElements = container.querySelectorAll("time");
    // Should not have the grouped-message hover time element
    // (there might be other time elements from the header)
    const hoverTimeElements = Array.from(timeElements).filter((el) =>
      el.classList.contains("opacity-0"),
    );
    expect(hoverTimeElements.length).toBe(0);
  });
});

