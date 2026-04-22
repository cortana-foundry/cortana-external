import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatPane } from "./ChatPane";
import { ToastProvider } from "./Toast";
import type { CodexSessionDetail } from "./types";

const baseSession: CodexSessionDetail = {
  sessionId: "session-1",
  threadName: "Verify repo purpose",
  updatedAt: Date.now(),
  cwd: "/Users/hd/Developer/cortana-external",
  model: "gpt-5.4",
  source: "exec",
  cliVersion: "0.122.0",
  lastMessagePreview: "Ready when you are.",
  transcriptPath: "/tmp/session-1.jsonl",
  events: [
    {
      id: "assistant-1",
      role: "assistant",
      text: "Ready when you are.",
      timestamp: Date.now(),
      phase: null,
      rawType: "assistant.message",
    },
  ],
};

describe("ChatPane", () => {
  it("locks the composer and shows a friendly busy message when a session already has an active run", () => {
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    const transcriptViewportRef = { current: null };

    render(
      <ToastProvider>
        <ChatPane
          transcriptViewportRef={transcriptViewportRef}
          activeCodexSession={baseSession}
          activeSessionHasRunInProgress
          activeCodexTitle="Verify repo purpose"
          activeCodexMessageCount="1"
          codexMutationPending={null}
          copiedSessionId={null}
          onCopySessionId={vi.fn()}
          onArchiveCodexSession={vi.fn()}
          onDeleteCodexSession={vi.fn()}
          selectedCodexSession={baseSession}
          selectedCodexSessionId={baseSession.sessionId}
          selectedCodexPagination={{
            totalEvents: 1,
            loadedEvents: 1,
            hasMore: false,
            nextBefore: null,
            rangeStart: 0,
            rangeEnd: 1,
          }}
          codexDetailLoading={false}
          codexOlderLoading={false}
          hasCodexTranscriptContent
          pendingCodexUserEvent={null}
          streamedAssistantEvents={[]}
          codexMutationError={null}
          replyPrompt="Need a follow-up"
          setReplyPrompt={vi.fn()}
          onReplyToCodexSession={vi.fn()}
          formatTimestamp={(value) => (value ? new Date(value).toLocaleString() : "Unknown")}
          formatRelativeTimestamp={() => "this minute"}
          formatShortSessionId={(value) => value ?? "Unavailable"}
        />
      </ToastProvider>,
    );

    expect(
      screen.getByText("Codex is still finishing the previous reply for this thread."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Reply message")).toBeDisabled();
    expect(screen.getByTestId("codex-transcript-shell").className).toContain("max-w-none");
    expect(screen.getByTestId("codex-composer-shell").className).toContain("max-w-none");
  });
});
