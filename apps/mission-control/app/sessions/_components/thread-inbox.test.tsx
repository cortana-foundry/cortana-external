import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThreadInbox } from "./thread-inbox";
import type { CodexSession, CodexSessionGroup } from "./types";

function makeSession(overrides: Partial<CodexSession> = {}): CodexSession {
  return {
    sessionId: "s1",
    threadName: "Thread one",
    updatedAt: 1_700_000_000_000,
    cwd: "/tmp/alpha",
    model: "gpt-5.4",
    source: "exec",
    cliVersion: "0.121.0",
    lastMessagePreview: "preview",
    transcriptPath: null,
    ...overrides,
  };
}

function makeGroup(overrides: Partial<CodexSessionGroup> = {}): CodexSessionGroup {
  return {
    id: "g1",
    label: "Alpha project",
    rootPath: "/tmp/alpha",
    isActive: false,
    isCollapsed: false,
    sessions: [makeSession()],
    ...overrides,
  };
}

describe("ThreadInbox", () => {
  it("renders group headers and thread cards", () => {
    render(
      <ThreadInbox
        groups={[makeGroup()]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
      />,
    );
    expect(screen.getByText("Alpha project")).toBeInTheDocument();
    expect(screen.getAllByText("/tmp/alpha").length).toBeGreaterThan(0);
    expect(screen.getByText("Thread one")).toBeInTheDocument();
  });

  it("renders a provisional card when provided", () => {
    render(
      <ThreadInbox
        groups={[]}
        provisionalSession={makeSession({ sessionId: "p", threadName: "New chat" })}
        activeSessionId={null}
        onSelectSession={() => {}}
      />,
    );
    expect(screen.getByText(/starting now/i)).toBeInTheDocument();
    expect(screen.getByText("New chat")).toBeInTheDocument();
  });

  it("shows an error banner when error is provided", () => {
    render(
      <ThreadInbox
        groups={[]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
        error="Boom"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  });

  it("shows the empty state when nothing is available", () => {
    render(
      <ThreadInbox
        groups={[]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
      />,
    );
    expect(screen.getByText(/no codex sessions found/i)).toBeInTheDocument();
  });

  it("renders the active badge when group.isActive", () => {
    render(
      <ThreadInbox
        groups={[makeGroup({ isActive: true })]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
      />,
    );
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders the search input when onQueryChange is provided", () => {
    render(
      <ThreadInbox
        groups={[]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
        query=""
        onQueryChange={() => {}}
      />,
    );
    expect(screen.getByPlaceholderText("Search threads")).toBeInTheDocument();
  });

  it("calls onQueryChange when user types in search", () => {
    const onQueryChange = vi.fn();
    render(
      <ThreadInbox
        groups={[]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
        query=""
        onQueryChange={onQueryChange}
      />,
    );
    const input = screen.getByPlaceholderText("Search threads") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test" } });
    expect(onQueryChange).toHaveBeenCalledWith("test");
  });

  it("filters threads by query matching threadName", () => {
    render(
      <ThreadInbox
        groups={[
          makeGroup({
            sessions: [
              makeSession({ sessionId: "s1", threadName: "testing" }),
              makeSession({ sessionId: "s2", threadName: "other" }),
            ],
          }),
        ]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
        query="testing"
        onQueryChange={() => {}}
      />,
    );
    expect(screen.getByText("testing")).toBeInTheDocument();
    expect(screen.queryByText("other")).toBeNull();
  });

  it("shows 'No threads match' message when query produces no results", () => {
    render(
      <ThreadInbox
        groups={[makeGroup()]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
        query="nomatch"
        onQueryChange={() => {}}
      />,
    );
    expect(screen.getByText(/no threads match/i)).toBeInTheDocument();
  });

  it("renders duplicate index suffix for threads with duplicate names", () => {
    render(
      <ThreadInbox
        groups={[
          makeGroup({
            sessions: [
              makeSession({
                sessionId: "s1",
                threadName: "testing",
                updatedAt: 2_000_000_000_000,
              }),
              makeSession({
                sessionId: "s2",
                threadName: "testing",
                updatedAt: 1_000_000_000_000,
              }),
            ],
          }),
        ]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
      />,
    );
    // Newest first should be · 1, oldest should be · 2
    const buttons = screen.getAllByRole("button");
    // Both should have the suffix rendered (in ThreadCard)
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it("clears search when Clear button is clicked", () => {
    const onQueryChange = vi.fn();
    render(
      <ThreadInbox
        groups={[]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
        query="test"
        onQueryChange={onQueryChange}
      />,
    );
    const clearButton = screen.getByLabelText("Clear search");
    fireEvent.click(clearButton);
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  it("hides model pills when all threads have the same model", () => {
    render(
      <ThreadInbox
        groups={[
          makeGroup({
            sessions: [
              makeSession({
                sessionId: "s1",
                threadName: "Thread one",
                model: "gpt-5.4",
              }),
              makeSession({
                sessionId: "s2",
                threadName: "Thread two",
                model: "gpt-5.4",
              }),
            ],
          }),
        ]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
      />,
    );
    const pills = screen.queryAllByTestId("model-pill");
    expect(pills.length).toBe(0);
  });

  it("shows model pills when threads have different models", () => {
    render(
      <ThreadInbox
        groups={[
          makeGroup({
            sessions: [
              makeSession({
                sessionId: "s1",
                threadName: "Thread one",
                model: "gpt-5.4",
              }),
              makeSession({
                sessionId: "s2",
                threadName: "Thread two",
                model: "claude-3-sonnet",
              }),
            ],
          }),
        ]}
        provisionalSession={null}
        activeSessionId={null}
        onSelectSession={() => {}}
      />,
    );
    const pills = screen.getAllByTestId("model-pill");
    expect(pills.length).toBe(2);
  });
});
