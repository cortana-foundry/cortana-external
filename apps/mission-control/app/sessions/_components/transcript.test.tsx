import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./message-block", () => ({
  MessageBlock: ({
    role,
    text,
    variant,
    showHeader,
  }: {
    role: string;
    text: string;
    variant?: string;
    showHeader?: boolean;
  }) => (
    <div
      data-testid={`block-${role}`}
      data-variant={variant ?? "default"}
      data-show-header={showHeader ?? true}
    >
      {text}
    </div>
  ),
}));

import { Transcript } from "./transcript";
import type { CodexSessionDetail } from "./types";

function makeDetail(): CodexSessionDetail {
  return {
    sessionId: "s1",
    threadName: "Thread",
    updatedAt: 1,
    cwd: null,
    model: null,
    source: null,
    cliVersion: null,
    lastMessagePreview: null,
    transcriptPath: null,
    events: [
      {
        id: "e1",
        role: "user",
        text: "hello",
        timestamp: 1,
        phase: null,
        rawType: "user.message",
      },
      {
        id: "e2",
        role: "assistant",
        text: "world",
        timestamp: 2,
        phase: null,
        rawType: "agent_message",
      },
    ],
  };
}

beforeEach(() => {
  Element.prototype.scrollTo = vi.fn();
});

describe("Transcript", () => {
  it("renders detail events in order", () => {
    render(
      <Transcript
        detail={makeDetail()}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );
    expect(screen.getByTestId("block-user")).toHaveTextContent("hello");
    expect(screen.getByTestId("block-assistant")).toHaveTextContent("world");
  });

  it("renders the pending user event", () => {
    render(
      <Transcript
        detail={null}
        pendingUserEvent={{
          id: "pending",
          role: "user",
          text: "queued msg",
          timestamp: null,
          phase: null,
          rawType: "user.pending",
        }}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );
    const blocks = screen.getAllByTestId("block-user");
    expect(blocks[0]).toHaveAttribute("data-variant", "pending");
    expect(blocks[0]).toHaveTextContent("queued msg");
  });

  it("does not duplicate a pending user event once the durable message is already present", () => {
    render(
      <Transcript
        detail={{
          sessionId: "s1",
          threadName: "Thread",
          updatedAt: 1,
          cwd: null,
          model: null,
          source: null,
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
          events: [
            {
              id: "e1",
              role: "user",
              text: "I am testing this chat from mission control",
              timestamp: 1,
              phase: null,
              rawType: "user.message",
            },
          ],
        }}
        pendingUserEvent={{
          id: "pending",
          role: "user",
          text: "I am testing this chat from mission control",
          timestamp: null,
          phase: null,
          rawType: "user.pending",
        }}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );

    const blocks = screen.getAllByTestId("block-user");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveTextContent("I am testing this chat from mission control");
    expect(blocks[0]).not.toHaveAttribute("data-variant", "pending");
  });

  it("renders streamed assistant events in streaming variant", () => {
    render(
      <Transcript
        detail={null}
        pendingUserEvent={null}
        streamedAssistantEvents={[{ id: "s1", role: "assistant", text: "partial" }]}
        loading={false}
        streaming={true}
        rootPath={null}
      />,
    );
    const block = screen.getByTestId("block-assistant");
    expect(block).toHaveAttribute("data-variant", "streaming");
    expect(block).toHaveTextContent("partial");
  });

  it("renders empty-state when there is no content", () => {
    render(
      <Transcript
        detail={null}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );
    expect(screen.getByText(/no active transcript selected/i)).toBeInTheDocument();
  });

  it("renders loading state", () => {
    render(
      <Transcript
        detail={null}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading
        streaming={false}
        rootPath={null}
      />,
    );
    expect(screen.getByText(/loading codex transcript/i)).toBeInTheDocument();
  });

  it("shows jump-to-latest when user scrolled up", () => {
    render(
      <Transcript
        detail={makeDetail()}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );
    const viewport = screen.getByTestId("transcript-viewport") as HTMLDivElement;
    Object.defineProperty(viewport, "scrollHeight", { value: 1000, configurable: true });
    Object.defineProperty(viewport, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(viewport, "scrollTop", { value: 0, configurable: true });
    fireEvent.scroll(viewport);
    expect(screen.getByRole("button", { name: /jump to latest/i })).toBeInTheDocument();
  });

  it("renders only the last 30 messages when events exceed the window", () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      id: `e${i}`,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `message ${i}`,
      timestamp: i,
      phase: null,
      rawType: "message" as const,
    }));

    render(
      <Transcript
        detail={{
          sessionId: "s1",
          threadName: "Thread",
          updatedAt: 1,
          cwd: null,
          model: null,
          source: null,
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
          events,
        }}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );

    const userBlocks = screen.getAllByTestId("block-user");
    const assistantBlocks = screen.getAllByTestId("block-assistant");
    expect(userBlocks.length + assistantBlocks.length).toBe(30);
  });

  it("shows load older button when there are hidden messages", () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      id: `e${i}`,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `message ${i}`,
      timestamp: i,
      phase: null,
      rawType: "message" as const,
    }));

    render(
      <Transcript
        detail={{
          sessionId: "s1",
          threadName: "Thread",
          updatedAt: 1,
          cwd: null,
          model: null,
          source: null,
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
          events,
        }}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );

    const button = screen.getByTestId("load-older-button");
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent("Load 30 older");
  });

  it("clicking load older renders additional 30 messages", () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      id: `e${i}`,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `message ${i}`,
      timestamp: i,
      phase: null,
      rawType: "message" as const,
    }));

    render(
      <Transcript
        detail={{
          sessionId: "s1",
          threadName: "Thread",
          updatedAt: 1,
          cwd: null,
          model: null,
          source: null,
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
          events,
        }}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );

    let userBlocks = screen.getAllByTestId("block-user");
    let assistantBlocks = screen.getAllByTestId("block-assistant");
    expect(userBlocks.length + assistantBlocks.length).toBe(30);

    const button = screen.getByTestId("load-older-button");
    fireEvent.click(button);

    userBlocks = screen.getAllByTestId("block-user");
    assistantBlocks = screen.getAllByTestId("block-assistant");
    expect(userBlocks.length + assistantBlocks.length).toBe(60);
  });

  it("hides the load older button when all messages fit in the window", () => {
    const events = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `message ${i}`,
      timestamp: i,
      phase: null,
      rawType: "message" as const,
    }));

    render(
      <Transcript
        detail={{
          sessionId: "s1",
          threadName: "Thread",
          updatedAt: 1,
          cwd: null,
          model: null,
          source: null,
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
          events,
        }}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );

    const button = screen.queryByTestId("load-older-button");
    expect(button).not.toBeInTheDocument();
  });

  it("renders consecutive same-role events within 2 min with showHeader=false on second", () => {
    const now = Date.now();
    const twoMinInMs = 2 * 60 * 1000;
    render(
      <Transcript
        detail={{
          sessionId: "s1",
          threadName: "Thread",
          updatedAt: 1,
          cwd: null,
          model: null,
          source: null,
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
          events: [
            {
              id: "e1",
              role: "assistant",
              text: "first",
              timestamp: now,
              phase: null,
              rawType: "agent_message",
            },
            {
              id: "e2",
              role: "assistant",
              text: "second",
              timestamp: now + twoMinInMs - 10000, // within 2 min
              phase: null,
              rawType: "agent_message",
            },
          ],
        }}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );
    const blocks = screen.getAllByTestId("block-assistant");
    expect(blocks[0]).toHaveAttribute("data-show-header", "true");
    expect(blocks[1]).toHaveAttribute("data-show-header", "false");
  });

  it("resets window size when selected session changes", () => {
    const events1 = Array.from({ length: 100 }, (_, i) => ({
      id: `e1_${i}`,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `message ${i}`,
      timestamp: i,
      phase: null,
      rawType: "message" as const,
    }));

    const events2 = Array.from({ length: 100 }, (_, i) => ({
      id: `e2_${i}`,
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      text: `message ${i}`,
      timestamp: i,
      phase: null,
      rawType: "message" as const,
    }));

    const { rerender } = render(
      <Transcript
        detail={{
          sessionId: "s1",
          threadName: "Thread",
          updatedAt: 1,
          cwd: null,
          model: null,
          source: null,
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
          events: events1,
        }}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );

    let userBlocks = screen.getAllByTestId("block-user");
    let assistantBlocks = screen.getAllByTestId("block-assistant");
    expect(userBlocks.length + assistantBlocks.length).toBe(30);

    const button = screen.getByTestId("load-older-button");
    fireEvent.click(button);

    userBlocks = screen.getAllByTestId("block-user");
    assistantBlocks = screen.getAllByTestId("block-assistant");
    expect(userBlocks.length + assistantBlocks.length).toBe(60);

    rerender(
      <Transcript
        detail={{
          sessionId: "s2",
          threadName: "Thread",
          updatedAt: 1,
          cwd: null,
          model: null,
          source: null,
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
          events: events2,
        }}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );

    userBlocks = screen.getAllByTestId("block-user");
    assistantBlocks = screen.getAllByTestId("block-assistant");
    expect(userBlocks.length + assistantBlocks.length).toBe(30);
  });

  it("restores scroll position from localStorage when session changes", () => {
    // Setup: save a scroll position for session s1
    const storageKey = "mc-session-scroll-s1";
    window.localStorage.setItem(storageKey, JSON.stringify(500));

    const detail1 = makeDetail();
    detail1.sessionId = "s1";

    const { rerender } = render(
      <Transcript
        detail={detail1}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );

    const viewport = screen.getByTestId("transcript-viewport") as HTMLDivElement;
    expect(viewport.scrollTop).toBe(500);

    // Change to a different session without saved position
    const detail2 = makeDetail();
    detail2.sessionId = "s2";

    rerender(
      <Transcript
        detail={detail2}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={false}
        rootPath={null}
      />,
    );

    // Should scroll to bottom since no saved position for s2
    expect(viewport.scrollTo).toHaveBeenCalled();
  });

  it("does not persist scroll position while streaming", () => {
    const detail = makeDetail();
    const viewport = render(
      <Transcript
        detail={detail}
        pendingUserEvent={null}
        streamedAssistantEvents={[]}
        loading={false}
        streaming={true}
        rootPath={null}
      />,
    ).getByTestId("transcript-viewport") as HTMLDivElement;

    Object.defineProperty(viewport, "scrollTop", { value: 100, configurable: true });
    fireEvent.scroll(viewport);

    // Scroll position should not be saved while streaming
    const storageKey = `mc-session-scroll-${detail.sessionId}`;
    expect(window.localStorage.getItem(storageKey)).toBeNull();
  });
});
