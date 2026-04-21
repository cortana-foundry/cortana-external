import { beforeEach, describe, expect, it, vi } from "vitest";

const codexMocks = vi.hoisted(() => ({
  listUnindexedCodexSessions: vi.fn(),
}));

const codexSessionAccessMocks = vi.hoisted(() => ({
  listVisibleCodexSessions: vi.fn(),
  waitForVisibleCodexSessionDetail: vi.fn(),
}));

const codexMirrorMocks = vi.hoisted(() => ({
  reconcileCodexMirrorSessions: vi.fn(),
  recordCodexMirrorNotification: vi.fn(),
  upsertCodexMirrorThread: vi.fn(),
}));

const codexAppServerMocks = vi.hoisted(() => ({
  backfillCodexThreadName: vi.fn(),
  createCodexThread: vi.fn(),
}));

vi.mock("@/lib/codex-sessions", () => ({
  listUnindexedCodexSessions: codexMocks.listUnindexedCodexSessions,
}));

vi.mock("@/lib/codex-session-access", () => ({
  listVisibleCodexSessions: codexSessionAccessMocks.listVisibleCodexSessions,
  waitForVisibleCodexSessionDetail: codexSessionAccessMocks.waitForVisibleCodexSessionDetail,
}));

vi.mock("@/lib/codex-app-server", () => ({
  backfillCodexThreadName: codexAppServerMocks.backfillCodexThreadName,
  createCodexThread: codexAppServerMocks.createCodexThread,
}));

vi.mock("@/lib/codex-mirror", () => ({
  reconcileCodexMirrorSessions: codexMirrorMocks.reconcileCodexMirrorSessions,
  recordCodexMirrorNotification: codexMirrorMocks.recordCodexMirrorNotification,
  upsertCodexMirrorThread: codexMirrorMocks.upsertCodexMirrorThread,
}));

import { GET, POST } from "@/app/api/codex/sessions/route";

const makeRequest = (query = "") => new Request(`http://localhost/api/codex/sessions${query}`);

describe("GET /api/codex/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codexMirrorMocks.reconcileCodexMirrorSessions.mockResolvedValue(undefined);
  });

  it("returns codex sessions with the default limit", async () => {
    codexMocks.listUnindexedCodexSessions.mockResolvedValueOnce([]);
    codexSessionAccessMocks.listVisibleCodexSessions.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: "abc",
          threadName: "Brainstorm Codex web interface",
          updatedAt: 123,
          cwd: "/Users/hd/Developer/cortana-external",
          model: "gpt-5.4",
          source: "exec",
          cliVersion: "0.121.0",
          lastMessagePreview: "Latest answer",
          transcriptPath: "/Users/hd/.codex/sessions/2026/04/18/file.jsonl",
        },
      ],
      groups: [
        {
          id: "/Users/hd/Developer/cortana-external",
          label: "cortana-external",
          rootPath: "/Users/hd/Developer/cortana-external",
          isActive: true,
          isCollapsed: false,
          hiddenSessionCount: 0,
          sessions: [
            {
              sessionId: "abc",
              threadName: "Brainstorm Codex web interface",
              updatedAt: 123,
              cwd: "/Users/hd/Developer/cortana-external",
              model: "gpt-5.4",
              source: "exec",
              cliVersion: "0.121.0",
              lastMessagePreview: "Latest answer",
              transcriptPath: "/Users/hd/.codex/sessions/2026/04/18/file.jsonl",
            },
          ],
        },
      ],
      latestUpdatedAt: 123,
      totalMatchedSessions: 1,
      totalVisibleSessions: 1,
    });

    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(codexMocks.listUnindexedCodexSessions).toHaveBeenCalledWith({ limit: 20 });
    expect(codexMirrorMocks.reconcileCodexMirrorSessions).not.toHaveBeenCalled();
    expect(codexSessionAccessMocks.listVisibleCodexSessions).toHaveBeenCalledWith(20, {});
    expect(response.status).toBe(200);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0]).toMatchObject({
      sessionId: "abc",
      threadName: "Brainstorm Codex web interface",
      model: "gpt-5.4",
    });
    expect(payload.totalVisibleSessions).toBe(1);
    expect(payload.groups).toHaveLength(1);
  });

  it("uses the supplied limit when present", async () => {
    codexMocks.listUnindexedCodexSessions.mockResolvedValueOnce([]);
    codexSessionAccessMocks.listVisibleCodexSessions.mockResolvedValueOnce({
      sessions: [],
      groups: [],
      latestUpdatedAt: null,
      totalMatchedSessions: 0,
      totalVisibleSessions: 0,
    });

    const response = await GET(makeRequest("?limit=5"));

    expect(response.status).toBe(200);
    expect(codexSessionAccessMocks.listVisibleCodexSessions).toHaveBeenCalledWith(5, {});
  });

  it("forces mirror reconciliation when requested", async () => {
    codexMocks.listUnindexedCodexSessions.mockResolvedValueOnce([]);
    codexSessionAccessMocks.listVisibleCodexSessions.mockResolvedValueOnce({
      sessions: [],
      groups: [],
      latestUpdatedAt: null,
      totalMatchedSessions: 0,
      totalVisibleSessions: 0,
    });

    const response = await GET(makeRequest("?reconcile=1"));

    expect(response.status).toBe(200);
    expect(codexMirrorMocks.reconcileCodexMirrorSessions).toHaveBeenCalledWith({ limit: 100 });
  });

  it("returns an error payload when discovery fails", async () => {
    codexMocks.listUnindexedCodexSessions.mockResolvedValueOnce([]);
    codexSessionAccessMocks.listVisibleCodexSessions.mockRejectedValueOnce(new Error("missing session index"));

    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "missing session index" });
  });

  it("backfills missing thread names before listing sessions", async () => {
    codexMocks.listUnindexedCodexSessions.mockResolvedValueOnce([
      {
        sessionId: "missing-thread",
        threadName: "Recovered session name",
        transcriptPath: "/tmp/missing-thread.jsonl",
      },
    ]);
    codexAppServerMocks.backfillCodexThreadName.mockResolvedValueOnce(undefined);
    codexSessionAccessMocks.listVisibleCodexSessions.mockResolvedValueOnce({
      sessions: [],
      groups: [],
      latestUpdatedAt: null,
      totalMatchedSessions: 0,
      totalVisibleSessions: 0,
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(codexAppServerMocks.backfillCodexThreadName).toHaveBeenCalledWith(
      "missing-thread",
      "Recovered session name",
    );
  });
});

describe("POST /api/codex/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a codex session and returns detail", async () => {
    codexAppServerMocks.createCodexThread.mockResolvedValueOnce({ threadId: "new-thread" });
    codexSessionAccessMocks.waitForVisibleCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "new-thread",
      events: [],
    });
    codexMirrorMocks.upsertCodexMirrorThread.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/codex/sessions", {
        method: "POST",
        body: JSON.stringify({ prompt: "Start a new codex session" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(codexAppServerMocks.createCodexThread).toHaveBeenCalledWith(
      "Start a new codex session",
      expect.any(String),
      expect.objectContaining({
        onNotification: expect.any(Function),
      }),
    );
    expect(payload.session.sessionId).toBe("new-thread");
  });

  it("streams codex events when the client requests event-stream", async () => {
    codexAppServerMocks.createCodexThread.mockImplementationOnce(async (_prompt, _cwd, options) => {
      options?.onEvent?.({ type: "thread.started", thread_id: "new-thread" });
      options?.onEvent?.({
        type: "item.delta",
        item: { type: "agent_message", id: "assistant-1", delta: "streamed answer" },
      });
      return { threadId: "new-thread" };
    });
    codexSessionAccessMocks.waitForVisibleCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "new-thread",
      events: [],
    });
    codexMirrorMocks.upsertCodexMirrorThread.mockResolvedValue(undefined);

    const response = await POST(
      new Request("http://localhost/api/codex/sessions", {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify({ prompt: "Start a streamed codex session" }),
      }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(codexAppServerMocks.createCodexThread).toHaveBeenCalledWith(
      "Start a streamed codex session",
      expect.any(String),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onNotification: expect.any(Function),
      }),
    );
    expect(body).toContain("event: ready");
    expect(body).toContain("event: codex_event");
    expect(body).toContain("streamed answer");
    expect(body).toContain("event: done");
  });

  it("rejects empty prompts", async () => {
    const response = await POST(
      new Request("http://localhost/api/codex/sessions", {
        method: "POST",
        body: JSON.stringify({ prompt: "   " }),
      }),
    );

    expect(response.status).toBe(400);
  });
});
