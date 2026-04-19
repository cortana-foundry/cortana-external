import { beforeEach, describe, expect, it, vi } from "vitest";

const codexAppServerMocks = vi.hoisted(() => ({
  replyToCodexThread: vi.fn(),
}));

const codexSessionAccessMocks = vi.hoisted(() => ({
  getVisibleCodexSessionDetail: vi.fn(),
  waitForVisibleCodexSessionDetail: vi.fn(),
}));

const codexMirrorMocks = vi.hoisted(() => ({
  recordCodexMirrorNotification: vi.fn(),
  upsertCodexMirrorThread: vi.fn(),
}));

vi.mock("@/lib/codex-app-server", () => ({
  replyToCodexThread: codexAppServerMocks.replyToCodexThread,
}));

vi.mock("@/lib/codex-session-access", () => ({
  getVisibleCodexSessionDetail: codexSessionAccessMocks.getVisibleCodexSessionDetail,
  waitForVisibleCodexSessionDetail: codexSessionAccessMocks.waitForVisibleCodexSessionDetail,
}));

vi.mock("@/lib/codex-mirror", () => ({
  recordCodexMirrorNotification: codexMirrorMocks.recordCodexMirrorNotification,
  upsertCodexMirrorThread: codexMirrorMocks.upsertCodexMirrorThread,
}));

import { POST } from "@/app/api/codex/sessions/[sessionId]/messages/route";

describe("POST /api/codex/sessions/[sessionId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resumes an existing codex session and returns refreshed detail", async () => {
    codexSessionAccessMocks.getVisibleCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      threadName: "Brainstorm",
      cwd: "/Users/hd/Developer/cortana-external",
    });
    codexAppServerMocks.replyToCodexThread.mockResolvedValueOnce(undefined);
    codexSessionAccessMocks.waitForVisibleCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      events: [],
    });
    codexMirrorMocks.upsertCodexMirrorThread.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/codex/sessions/abc/messages", {
        method: "POST",
        body: JSON.stringify({ prompt: "Resume this session" }),
      }),
      {
        params: Promise.resolve({ sessionId: "abc" }),
      },
    );

    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(codexAppServerMocks.replyToCodexThread).toHaveBeenCalledWith(
      "abc",
      "Resume this session",
      "/Users/hd/Developer/cortana-external",
      expect.objectContaining({
        onNotification: expect.any(Function),
      }),
    );
    expect(payload.session.sessionId).toBe("abc");
  });

  it("streams a resumed codex session when requested", async () => {
    codexSessionAccessMocks.getVisibleCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      threadName: "Brainstorm",
      cwd: "/Users/hd/Developer/cortana-external",
    });
    codexAppServerMocks.replyToCodexThread.mockImplementationOnce(async (_threadId, _prompt, _cwd, options) => {
      options?.onEvent?.({
        type: "item.delta",
        item: { type: "agent_message", id: "assistant-1", delta: "streamed reply" },
      });
    });
    codexSessionAccessMocks.waitForVisibleCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      events: [],
    });
    codexMirrorMocks.upsertCodexMirrorThread.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/codex/sessions/abc/messages", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ prompt: "Resume this session with streaming" }),
      }),
      {
        params: Promise.resolve({ sessionId: "abc" }),
      },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(codexAppServerMocks.replyToCodexThread).toHaveBeenCalledWith(
      "abc",
      "Resume this session with streaming",
      "/Users/hd/Developer/cortana-external",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onNotification: expect.any(Function),
      }),
    );
    expect(body).toContain("event: ready");
    expect(body).toContain("event: codex_event");
    expect(body).toContain("streamed reply");
    expect(body).toContain("event: done");
  });

  it("rejects empty prompts", async () => {
    const response = await POST(
      new Request("http://localhost/api/codex/sessions/abc/messages", {
        method: "POST",
        body: JSON.stringify({ prompt: "   " }),
      }),
      {
        params: Promise.resolve({ sessionId: "abc" }),
      },
    );

    expect(response.status).toBe(400);
  });
});
