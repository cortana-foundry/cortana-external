import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./mermaid-diagram", () => ({
  MermaidDiagram: ({ code }: { code: string }) => <div data-testid="mermaid">{code}</div>,
}));

import { CodeBlock } from "./code-block";

describe("CodeBlock", () => {
  it("renders language name in header when provided", async () => {
    const { container } = render(<CodeBlock code="const x = 1;" language="typescript" />);
    // Wait for shiki to load and render
    const header = container.querySelector("div.flex.items-center.justify-between");
    expect(header).toBeInTheDocument();
    expect(header?.textContent).toContain("typescript");
  });

  it("renders 'text' fallback when language is null", async () => {
    const { container } = render(<CodeBlock code="some code" language={null} />);
    const header = container.querySelector("div.flex.items-center.justify-between");
    expect(header).toBeInTheDocument();
    expect(header?.textContent).toContain("text");
  });

  it("renders 'text' fallback when language is undefined", async () => {
    const { container } = render(<CodeBlock code="some code" language={undefined} />);
    const header = container.querySelector("div.flex.items-center.justify-between");
    expect(header).toBeInTheDocument();
    expect(header?.textContent).toContain("text");
  });

  it("renders a copy button in the header", async () => {
    render(<CodeBlock code="const x = 1;" language="typescript" />);
    const button = screen.getByRole("button", { name: /copy/i });
    expect(button).toBeInTheDocument();
  });

  it("renders MermaidDiagram without chrome when language is 'mermaid'", () => {
    render(<CodeBlock code="graph TD; A-->B;" language="mermaid" />);
    expect(screen.getByTestId("mermaid")).toBeInTheDocument();
    // Ensure no header is rendered for mermaid
    const headers = screen.queryAllByText(/typescript|javascript|python|text/i);
    expect(headers.length).toBe(0);
  });

  it("normalizes language name to lowercase in header", async () => {
    const { container } = render(<CodeBlock code="const x = 1;" language="TypeScript" />);
    const header = container.querySelector("div.flex.items-center.justify-between");
    expect(header?.textContent).toContain("typescript");
  });
});
