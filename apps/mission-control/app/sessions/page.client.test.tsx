import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SessionsPage from "./page";
import type { CodexSessionDetail } from "./_components/types";

const CWD = "/Users/hd/Developer/cortana-external";
const updatedAt = Date.now();

const baseSession = {
  sessionId: "session-1",
  threadName: "Verify repo purpose",
  updatedAt,
  cwd: CWD,
  model: "gpt-5.4",
  source: "exec",
  cliVersion: "0.122.0",
  lastMessagePreview: "Ready when you are.",
  transcriptPath: "/tmp/session-1.jsonl",
  activeRun: false,
};

const baseSessionDetail: CodexSessionDetail = {
  ...baseSession,
  events: [
    {
      id: "assistant-1",
      role: "assistant" as const,
      text: "Ready when you are.",
      timestamp: updatedAt,
      phase: null,
      rawType: "assistant.message",
    },
  ],
};

const basePagination = {
  totalEvents: 1,
  loadedEvents: 1,
  hasMore: false,
  nextBefore: null,
  rangeStart: 0,
  rangeEnd: 1,
};

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function sseResponse(session = baseSessionDetail) {
  const body = [
    `event: done`,
    `data: ${JSON.stringify({ session })}`,
    ``,
    ``,
  ].join("\n");

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function installFetchMock(options?: {
  onSessionsGet?: (callCount: number) => Promise<Response> | Response;
  onReplyPost?: () => Promise<Response> | Response;
  onStream?: () => Promise<Response> | Response;
}) {
  let sessionsGetCalls = 0;
  const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";

    if (url === "/api/codex/sessions" && method === "GET") {
      sessionsGetCalls += 1;
      if (options?.onSessionsGet) {
        return options.onSessionsGet(sessionsGetCalls);
      }
      return jsonResponse({
        sessions: [baseSession],
        groups: [
          {
            id: CWD,
            label: "cortana-external",
            rootPath: CWD,
            isActive: true,
            isCollapsed: false,
            sessions: [baseSession],
          },
        ],
        latestUpdatedAt: updatedAt,
        totalMatchedSessions: 1,
        totalVisibleSessions: 1,
      });
    }

    if (url.startsWith("/api/codex/sessions/session-1?") && method === "GET") {
      return jsonResponse({ session: baseSessionDetail, pagination: basePagination });
    }

    if (url === "/api/codex/sessions/session-1/messages" && method === "POST") {
      if (options?.onReplyPost) return options.onReplyPost();
      return jsonResponse({ streamId: "stream-1" }, 202);
    }

    if (url === "/api/codex/streams/stream-1" && method === "GET") {
      if (options?.onStream) return options.onStream();
      return sseResponse({
        ...baseSessionDetail,
        events: [
          ...baseSessionDetail.events,
          {
            id: "user-2",
            role: "user" as const,
            text: "Check the alert state",
            timestamp: updatedAt + 1_000,
            phase: null,
            rawType: "user.message",
          },
          {
            id: "assistant-2",
            role: "assistant" as const,
            text: "Looking at it now.",
            timestamp: updatedAt + 2_000,
            phase: null,
            rawType: "assistant.message",
          },
        ],
      });
    }

    return jsonResponse({ error: `Unhandled request: ${method} ${url}` }, 500);
  });

  return {
    fetchSpy,
    getSessionsGetCalls: () => sessionsGetCalls,
  };
}

describe("SessionsPage reply composer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears and locks the composer immediately while a reply is in flight", async () => {
    const replyDeferred = createDeferred<Response>();
    installFetchMock({
      onReplyPost: () => replyDeferred.promise,
    });

    render(<SessionsPage />);

    const textarea = (await screen.findByLabelText("Reply message")) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Check the alert state" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByLabelText("Reply message")).toHaveValue(""));
    expect(screen.getByLabelText("Reply message")).toBeDisabled();
    expect(screen.getByText("Check the alert state")).toBeInTheDocument();

    replyDeferred.resolve(jsonResponse({ streamId: "stream-1" }, 202));

    await waitFor(() => expect(screen.getByText("Looking at it now.")).toBeInTheDocument());
    expect(screen.getByLabelText("Reply message")).toHaveValue("");
    expect(screen.getByLabelText("Reply message")).not.toBeDisabled();
  });

  it("restores the original prompt and shows a friendly message when the session is already busy", async () => {
    const fetchState = installFetchMock({
      onSessionsGet: (callCount) =>
        jsonResponse({
          sessions: [{ ...baseSession, activeRun: callCount > 1 }],
          groups: [
            {
              id: CWD,
              label: "cortana-external",
              rootPath: CWD,
              isActive: true,
              isCollapsed: false,
              sessions: [{ ...baseSession, activeRun: callCount > 1 }],
            },
          ],
          latestUpdatedAt: updatedAt,
          totalMatchedSessions: 1,
          totalVisibleSessions: 1,
        }),
      onReplyPost: () =>
        jsonResponse(
          { error: "Codex session session-1 already has an active run", code: "conflict" },
          409,
        ),
    });

    render(<SessionsPage />);

    const textarea = (await screen.findByLabelText("Reply message")) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "That's okay keep going" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByLabelText("Reply message")).toHaveValue(""));
    await waitFor(() =>
      expect(screen.getByLabelText("Reply message")).toHaveValue("That's okay keep going"),
    );

    const replyMessage = "Codex is still finishing the previous reply for this thread.";
    expect(await screen.findAllByText(replyMessage)).toHaveLength(1);
    expect(screen.queryByText(/already has an active run/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Reply message")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Reply message")).toBeDisabled();
    expect(fetchState.getSessionsGetCalls()).toBeGreaterThanOrEqual(2);
  });

  it("keeps the composer cleared when the stream completes but the session refresh lags", async () => {
    installFetchMock({
      onSessionsGet: (callCount) =>
        callCount === 1
          ? jsonResponse({
              sessions: [baseSession],
              groups: [
                {
                  id: CWD,
                  label: "cortana-external",
                  rootPath: CWD,
                  isActive: true,
                  isCollapsed: false,
                  sessions: [baseSession],
                },
              ],
              latestUpdatedAt: updatedAt,
              totalMatchedSessions: 1,
              totalVisibleSessions: 1,
            })
          : jsonResponse({ error: "Failed to load Codex sessions" }, 500),
    });

    render(<SessionsPage />);

    const textarea = (await screen.findByLabelText("Reply message")) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Check the alert state" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => expect(screen.getByText("Looking at it now.")).toBeInTheDocument());
    expect(screen.getByLabelText("Reply message")).toHaveValue("");
    expect(screen.getByLabelText("Reply message")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Failed to send message to Codex session")).not.toBeInTheDocument();
  });
});
