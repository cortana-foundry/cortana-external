import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/docs/code-block", () => ({
  CodeBlock: ({ code, language }: { code: string; language: string | null }) => (
    <pre data-testid="code-block" data-lang={language ?? ""}>
      {code}
    </pre>
  ),
}));

import { MessageContent } from "./message-content";

describe("MessageContent", () => {
  it("renders GFM lists", () => {
    render(<MessageContent content={"- one\n- two\n- three"} />);
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByText("two")).toBeInTheDocument();
    expect(screen.getByText("three")).toBeInTheDocument();
  });

  it("renders headings", () => {
    render(<MessageContent content={"# Hello"} />);
    expect(screen.getByRole("heading", { name: "Hello" })).toBeInTheDocument();
  });

  it("renders inline code", () => {
    render(<MessageContent content={"Use `foo.ts` here"} />);
    expect(screen.getByText("foo.ts")).toBeInTheDocument();
  });

  it("delegates fenced code blocks to CodeBlock", () => {
    render(<MessageContent content={"```ts\nconst x = 1\n```"} />);
    const block = screen.getByTestId("code-block");
    expect(block).toHaveAttribute("data-lang", "ts");
    expect(block.textContent).toContain("const x = 1");
  });

  it("sets target=_blank and rel=noopener on external links", () => {
    render(<MessageContent content={"[link](https://example.com)"} />);
    const link = screen.getByRole("link", { name: "link" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
