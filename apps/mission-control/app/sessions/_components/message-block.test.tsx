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
});
