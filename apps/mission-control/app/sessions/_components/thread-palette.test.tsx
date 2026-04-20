import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadPalette } from "./thread-palette";
import type { CodexSession, CodexSessionGroup } from "./types";

function makeSession(overrides: Partial<CodexSession> = {}): CodexSession {
  return {
    sessionId: "s1",
    threadName: "Test Thread",
    updatedAt: 1_700_000_000_000,
    cwd: "/tmp/test",
    model: "gpt-4",
    source: "exec",
    cliVersion: "0.1.0",
    lastMessagePreview: "Test preview",
    transcriptPath: null,
    ...overrides,
  };
}

function makeGroup(sessions: CodexSession[]): CodexSessionGroup {
  return {
    id: "g1",
    label: "Test",
    rootPath: "/tmp",
    isActive: false,
    isCollapsed: false,
    sessions,
  };
}

describe("ThreadPalette", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(
      <ThreadPalette
        open={false}
        onOpenChange={() => {}}
        groups={[]}
        onSelectSession={() => {}}
      />,
    );
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders input and sessions when open=true", () => {
    render(
      <ThreadPalette
        open={true}
        onOpenChange={() => {}}
        groups={[
          makeGroup([
            makeSession({ sessionId: "s1", threadName: "Thread 1" }),
            makeSession({ sessionId: "s2", threadName: "Thread 2" }),
          ]),
        ]}
        onSelectSession={() => {}}
      />,
    );
    expect(screen.getByPlaceholderText("Search threads...")).toBeInTheDocument();
    expect(screen.getByText("Thread 1")).toBeInTheDocument();
    expect(screen.getByText("Thread 2")).toBeInTheDocument();
  });

  it("filters results as user types", () => {
    render(
      <ThreadPalette
        open={true}
        onOpenChange={() => {}}
        groups={[
          makeGroup([
            makeSession({ sessionId: "s1", threadName: "testing" }),
            makeSession({ sessionId: "s2", threadName: "other" }),
          ]),
        ]}
        onSelectSession={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText("Search threads...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "testing" } });
    expect(screen.getByText("testing")).toBeInTheDocument();
    expect(screen.queryByText("other")).toBeNull();
  });

  it("cycles through results with arrow keys", () => {
    const { rerender } = render(
      <ThreadPalette
        open={true}
        onOpenChange={() => {}}
        groups={[
          makeGroup([
            makeSession({ sessionId: "s1", threadName: "Thread 1" }),
            makeSession({ sessionId: "s2", threadName: "Thread 2" }),
            makeSession({ sessionId: "s3", threadName: "Thread 3" }),
          ]),
        ]}
        onSelectSession={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText("Search threads...") as HTMLInputElement;

    // Check that first item starts highlighted
    let highlighted = screen.getByText("Thread 1").closest("button");
    expect(highlighted).toHaveClass("bg-muted");

    // Press down arrow
    fireEvent.keyDown(input, { key: "ArrowDown" });
    rerender(
      <ThreadPalette
        open={true}
        onOpenChange={() => {}}
        groups={[
          makeGroup([
            makeSession({ sessionId: "s1", threadName: "Thread 1" }),
            makeSession({ sessionId: "s2", threadName: "Thread 2" }),
            makeSession({ sessionId: "s3", threadName: "Thread 3" }),
          ]),
        ]}
        onSelectSession={() => {}}
      />,
    );

    // After re-render with same input, second item should be highlighted
    highlighted = screen.getByText("Thread 2").closest("button");
    expect(highlighted).toHaveClass("bg-muted");
  });

  it("calls onSelectSession and onOpenChange on Enter", () => {
    const onSelectSession = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ThreadPalette
        open={true}
        onOpenChange={onOpenChange}
        groups={[
          makeGroup([
            makeSession({ sessionId: "s1", threadName: "Thread 1" }),
          ]),
        ]}
        onSelectSession={onSelectSession}
      />,
    );

    const input = screen.getByPlaceholderText("Search threads...") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelectSession).toHaveBeenCalledWith("s1");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes on Escape key", () => {
    const onOpenChange = vi.fn();
    render(
      <ThreadPalette
        open={true}
        onOpenChange={onOpenChange}
        groups={[]}
        onSelectSession={() => {}}
      />,
    );
    const input = screen.getByPlaceholderText("Search threads...") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes when clicking outside the panel", () => {
    const onOpenChange = vi.fn();
    const { container } = render(
      <ThreadPalette
        open={true}
        onOpenChange={onOpenChange}
        groups={[]}
        onSelectSession={() => {}}
      />,
    );
    const overlay = container.querySelector(".fixed");
    fireEvent.click(overlay!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("limits results to first 20 items", () => {
    const sessions = Array.from({ length: 25 }, (_, i) =>
      makeSession({
        sessionId: `s${i}`,
        threadName: `Thread ${i}`,
      }),
    );
    render(
      <ThreadPalette
        open={true}
        onOpenChange={() => {}}
        groups={[makeGroup(sessions)]}
        onSelectSession={() => {}}
      />,
    );
    // Should render 20 items
    const buttons = screen.getAllByRole("button").filter((btn) => btn.className.includes("w-full") && !btn.className.includes("px-3"));
    expect(buttons.length).toBeLessThanOrEqual(20);
  });

  it("calls onSelectSession when clicking a result", () => {
    const onSelectSession = vi.fn();
    render(
      <ThreadPalette
        open={true}
        onOpenChange={() => {}}
        groups={[
          makeGroup([
            makeSession({ sessionId: "s1", threadName: "Thread 1" }),
          ]),
        ]}
        onSelectSession={onSelectSession}
      />,
    );
    fireEvent.click(screen.getByText("Thread 1"));
    expect(onSelectSession).toHaveBeenCalledWith("s1");
  });
});
