import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
