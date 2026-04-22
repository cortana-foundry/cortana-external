import { beforeEach, describe, expect, it, vi } from "vitest";

const codexMocks = vi.hoisted(() => ({
  listUnindexedCodexSessions: vi.fn(),
}));

const codexSessionAccessMocks = vi.hoisted(() => ({
  listVisibleCodexSessions: vi.fn(),
}));

const codexMirrorMocks = vi.hoisted(() => ({
  upsertCodexMirrorThread: vi.fn(),
}));

const codexRunMocks = vi.hoisted(() => ({
  getActiveCodexSessionIds: vi.fn(),
  startCreateCodexRun: vi.fn(),
  CodexRunError: class MockCodexRunError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("@/lib/codex-sessions", () => ({
  listUnindexedCodexSessions: codexMocks.listUnindexedCodexSessions,
}));

vi.mock("@/lib/codex-session-access", () => ({
  listVisibleCodexSessions: codexSessionAccessMocks.listVisibleCodexSessions,
}));

vi.mock("@/lib/codex-runs", () => ({
  getActiveCodexSessionIds: codexRunMocks.getActiveCodexSessionIds,
  startCreateCodexRun: codexRunMocks.startCreateCodexRun,
  CodexRunError: codexRunMocks.CodexRunError,
}));

vi.mock("@/lib/codex-mirror", () => ({
  upsertCodexMirrorThread: codexMirrorMocks.upsertCodexMirrorThread,
}));

import { GET, POST } from "@/app/api/codex/sessions/route";

const makeRequest = (query = "") => new Request(`http://localhost/api/codex/sessions${query}`);

describe("GET /api/codex/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codexRunMocks.getActiveCodexSessionIds.mockReturnValue(new Set());
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
    expect(codexSessionAccessMocks.listVisibleCodexSessions).toHaveBeenCalledWith(20);
    expect(response.status).toBe(200);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0]).toMatchObject({
      sessionId: "abc",
      threadName: "Brainstorm Codex web interface",
      model: "gpt-5.4",
      activeRun: false,
    });
    expect(payload.totalVisibleSessions).toBe(1);
    expect(payload.groups).toHaveLength(1);
  });

  it("marks sessions with active runs", async () => {
    codexMocks.listUnindexedCodexSessions.mockResolvedValueOnce([]);
    codexRunMocks.getActiveCodexSessionIds.mockReturnValue(new Set(["abc"]));
    codexSessionAccessMocks.listVisibleCodexSessions.mockResolvedValueOnce({
      sessions: [
        {
          sessionId: "abc",
          threadName: "Brainstorm Codex web interface",
          updatedAt: 123,
          cwd: "/Users/hd/Developer/cortana-external",
          model: null,
          source: "exec",
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
        },
      ],
      groups: [],
      latestUpdatedAt: 123,
      totalMatchedSessions: 1,
      totalVisibleSessions: 1,
    });

    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.sessions[0].activeRun).toBe(true);
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
    expect(codexSessionAccessMocks.listVisibleCodexSessions).toHaveBeenCalledWith(5);
  });

  it("returns an error payload when discovery fails", async () => {
    codexMocks.listUnindexedCodexSessions.mockResolvedValueOnce([]);
    codexSessionAccessMocks.listVisibleCodexSessions.mockRejectedValueOnce(new Error("missing session index"));

    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "missing session index" });
  });

  it("mirrors missing thread names before listing sessions", async () => {
    codexMocks.listUnindexedCodexSessions.mockResolvedValueOnce([
      {
        sessionId: "missing-thread",
        threadName: "Recovered session name",
        transcriptPath: "/tmp/missing-thread.jsonl",
      },
    ]);
    codexSessionAccessMocks.listVisibleCodexSessions.mockResolvedValueOnce({
      sessions: [],
      groups: [],
      latestUpdatedAt: null,
      totalMatchedSessions: 0,
      totalVisibleSessions: 0,
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(codexMirrorMocks.upsertCodexMirrorThread).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "missing-thread",
        threadName: "Recovered session name",
        transcriptPath: "/tmp/missing-thread.jsonl",
      }),
    );
  });
});

describe("POST /api/codex/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a codex session run and returns stream id", async () => {
    codexRunMocks.startCreateCodexRun.mockResolvedValueOnce({ streamId: "stream-1" });

    const response = await POST(
      new Request("http://localhost/api/codex/sessions", {
        method: "POST",
        body: JSON.stringify({ prompt: "Start a new codex session", workspaceKey: "repo-root" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(codexRunMocks.startCreateCodexRun).toHaveBeenCalledWith({
      prompt: "Start a new codex session",
      workspaceKey: "repo-root",
      model: undefined,
      imageIds: undefined,
    });
    expect(payload).toEqual({ streamId: "stream-1" });
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

  it("maps invalid request failures to 400", async () => {
    codexRunMocks.startCreateCodexRun.mockRejectedValueOnce(
      new codexRunMocks.CodexRunError("invalid_request", "Unsupported workspaceKey"),
    );

    const response = await POST(
      new Request("http://localhost/api/codex/sessions", {
        method: "POST",
        body: JSON.stringify({ prompt: "Start a new codex session", workspaceKey: "bad" }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "Unsupported workspaceKey" });
  });
});
