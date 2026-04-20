import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./message-block", () => ({
  MessageBlock: ({
    role,
    text,
    variant,
  }: {
    role: string;
    text: string;
    variant?: string;
  }) => (
    <div data-testid={`block-${role}`} data-variant={variant ?? "default"}>
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
});
