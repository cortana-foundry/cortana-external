import { beforeEach, describe, expect, it, vi } from "vitest";

const codexCliMocks = vi.hoisted(() => ({
  runCodexJson: vi.fn(),
  streamCodexJson: vi.fn(),
}));

const codexSessionMocks = vi.hoisted(() => ({
  getCodexSessionDetail: vi.fn(),
  waitForCodexSessionDetail: vi.fn(),
}));

vi.mock("@/lib/codex-cli", () => ({
  runCodexJson: codexCliMocks.runCodexJson,
  streamCodexJson: codexCliMocks.streamCodexJson,
}));

vi.mock("@/lib/codex-sessions", () => ({
  getCodexSessionDetail: codexSessionMocks.getCodexSessionDetail,
  waitForCodexSessionDetail: codexSessionMocks.waitForCodexSessionDetail,
}));

import { POST } from "@/app/api/codex/sessions/[sessionId]/messages/route";

describe("POST /api/codex/sessions/[sessionId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resumes an existing codex session and returns refreshed detail", async () => {
    codexSessionMocks.getCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      cwd: "/Users/hd/Developer/cortana-external",
    });
    codexCliMocks.runCodexJson.mockResolvedValueOnce([]);
    codexSessionMocks.waitForCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      events: [],
    });

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
    expect(codexCliMocks.runCodexJson).toHaveBeenCalledWith(
      ["exec", "resume", "--json", "abc", "Resume this session"],
      expect.objectContaining({ cwd: "/Users/hd/Developer/cortana-external" }),
    );
    expect(payload.session.sessionId).toBe("abc");
  });

  it("streams a resumed codex session when requested", async () => {
    codexSessionMocks.getCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      cwd: "/Users/hd/Developer/cortana-external",
    });
    codexCliMocks.streamCodexJson.mockImplementationOnce(async (_args, options) => {
      options?.onEvent?.({
        type: "item.completed",
        item: { type: "agent_message", text: "streamed reply" },
      });
      return [];
    });
    codexSessionMocks.waitForCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      events: [],
    });

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
    expect(codexCliMocks.streamCodexJson).toHaveBeenCalledWith(
      ["exec", "resume", "--json", "abc", "Resume this session with streaming"],
      expect.objectContaining({ cwd: "/Users/hd/Developer/cortana-external", signal: expect.any(AbortSignal) }),
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
