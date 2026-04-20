import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadCard } from "./thread-card";
import { getProjectColor } from "./project-color";
import type { CodexSession } from "./types";

function makeSession(overrides: Partial<CodexSession> = {}): CodexSession {
  return {
    sessionId: "s1",
    threadName: "A thread",
    updatedAt: 1_700_000_000_000,
    cwd: "/tmp/alpha",
    model: "gpt-5.4",
    source: "exec",
    cliVersion: "0.121.0",
    lastMessagePreview: "a preview line",
    transcriptPath: "/tmp/t.jsonl",
    ...overrides,
  };
}

describe("ThreadCard", () => {
  it("renders the title, model, cwd, and preview by default", () => {
    render(
      <ThreadCard
        session={makeSession()}
        rootPath="/tmp/alpha"
        isActive={false}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText("A thread")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.4")).toBeInTheDocument();
    expect(screen.getByText("/tmp/alpha")).toBeInTheDocument();
    expect(screen.getByText("a preview line")).toBeInTheDocument();
  });

  it("applies the active data attribute when isActive is true", () => {
    render(
      <ThreadCard
        session={makeSession()}
        rootPath="/tmp/alpha"
        isActive
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("button")).toHaveAttribute("data-active", "true");
  });

  it("hides the preview in compact density", () => {
    render(
      <ThreadCard
        session={makeSession()}
        rootPath="/tmp/alpha"
        isActive={false}
        density="compact"
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText("a preview line")).toBeNull();
  });

  it("invokes onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(
      <ThreadCard
        session={makeSession()}
        rootPath="/tmp/alpha"
        isActive={false}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("applies project stripe color matching utility output", () => {
    render(
      <ThreadCard
        session={makeSession()}
        rootPath="/tmp/alpha"
        isActive={false}
        onSelect={() => {}}
      />,
    );
    const button = screen.getByRole("button");
    const expected = getProjectColor("/tmp/alpha").stripe;
    expect(button.getAttribute("style")).toContain(expected);
  });
});
