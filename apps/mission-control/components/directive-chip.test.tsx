import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DirectiveChip } from "./directive-chip";
import type { CodexDirective } from "@/lib/codex-directives";

describe("DirectiveChip", () => {
  it("renders the directive name", () => {
    const directive: CodexDirective = {
      name: "git-commit",
      attrs: {},
      raw: "::git-commit{}",
    };
    render(<DirectiveChip directive={directive} />);
    expect(screen.getByText("git-commit")).toBeInTheDocument();
  });

  it("uses fallback sparkles icon for unknown directive", () => {
    const directive: CodexDirective = {
      name: "unknown-directive",
      attrs: {},
      raw: "::unknown-directive{}",
    };
    const { container } = render(<DirectiveChip directive={directive} />);
    const badge = container.querySelector('[data-directive-icon="sparkles"]');
    expect(badge).toBeInTheDocument();
  });

  it("renders an anchor with url and target=_blank when attrs.url is present", () => {
    const directive: CodexDirective = {
      name: "git-create-pr",
      attrs: { url: "https://github.com/example/pr/1" },
      raw: '::git-create-pr{url="https://github.com/example/pr/1"}',
    };
    const { container } = render(<DirectiveChip directive={directive} />);
    const link = container.querySelector("a");
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://github.com/example/pr/1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders a non-anchor element without url", () => {
    const directive: CodexDirective = {
      name: "git-stage",
      attrs: { cwd: "/a" },
      raw: '::git-stage{cwd="/a"}',
    };
    const { container } = render(<DirectiveChip directive={directive} />);
    const link = container.querySelector("a");
    expect(link).not.toBeInTheDocument();
  });

  it("includes attrs serialization in title attribute", () => {
    const directive: CodexDirective = {
      name: "git-push",
      attrs: {
        cwd: "/Users/hd",
        branch: "main",
      },
      raw: '::git-push{cwd="/Users/hd" branch="main"}',
    };
    const { container } = render(<DirectiveChip directive={directive} />);
    const badge = container.querySelector("a [class*='badge']") || container.querySelector("[class*='badge']");
    expect(badge).toHaveAttribute(
      "title",
      'cwd="/Users/hd" branch="main"'
    );
  });

  it("renders correct icon for git-stage", () => {
    const directive: CodexDirective = {
      name: "git-stage",
      attrs: {},
      raw: "::git-stage{}",
    };
    const { container } = render(<DirectiveChip directive={directive} />);
    expect(container.querySelector('[data-directive-icon="git-stage"]')).toBeInTheDocument();
  });

  it("renders correct icon for git-create-pr", () => {
    const directive: CodexDirective = {
      name: "git-create-pr",
      attrs: {},
      raw: "::git-create-pr{}",
    };
    const { container } = render(<DirectiveChip directive={directive} />);
    expect(
      container.querySelector('[data-directive-icon="git-create-pr"]')
    ).toBeInTheDocument();
  });
});
