import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/docs/code-block", () => ({
  CodeBlock: ({ code, language }: { code: string; language: string | null }) => (
    <pre data-testid="code-block" data-lang={language ?? ""}>
      {code}
    </pre>
  ),
}));

vi.mock("@/components/directive-chip", () => ({
  DirectiveChip: ({ directive }: { directive: { name: string; attrs: Record<string, string> } }) => (
    <span data-testid={`directive-chip-${directive.name}`}>{directive.name}</span>
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

  it("renders a directive chip inline when text contains ::git-stage{...}", () => {
    render(<MessageContent content={'Check this: ::git-stage{cwd="/a"} now'} />);
    expect(screen.getByTestId("directive-chip-git-stage")).toBeInTheDocument();
    expect(screen.getByText("Check this:")).toBeInTheDocument();
    expect(screen.getByText("now")).toBeInTheDocument();
  });

  it("leaves non-directive markdown untouched", () => {
    render(<MessageContent content={"# Title\n\nSome text with **bold** and `code`"} />);
    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("bold")).toBeInTheDocument();
    expect(screen.getByText("code")).toBeInTheDocument();
  });
});
