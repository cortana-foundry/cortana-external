import { beforeEach, describe, expect, it, vi } from "vitest";

const codexRunMocks = vi.hoisted(() => ({
  startReplyCodexRun: vi.fn(),
  CodexRunError: class MockCodexRunError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock("@/lib/codex-runs", () => ({
  startReplyCodexRun: codexRunMocks.startReplyCodexRun,
  CodexRunError: codexRunMocks.CodexRunError,
}));

import { POST } from "@/app/api/codex/sessions/[sessionId]/messages/route";

describe("POST /api/codex/sessions/[sessionId]/messages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts a resumed codex session run and returns stream id", async () => {
    codexRunMocks.startReplyCodexRun.mockResolvedValueOnce({ streamId: "stream-abc" });

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

    expect(response.status).toBe(202);
    expect(codexRunMocks.startReplyCodexRun).toHaveBeenCalledWith({
      sessionId: "abc",
      prompt: "Resume this session",
      model: undefined,
      imageIds: undefined,
    });
    expect(payload).toEqual({ streamId: "stream-abc" });
  });

  it("maps active run conflicts to 409", async () => {
    codexRunMocks.startReplyCodexRun.mockRejectedValueOnce(
      new codexRunMocks.CodexRunError("conflict", "Codex session abc already has an active run"),
    );

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

    expect(response.status).toBe(409);
    expect(payload).toEqual({
      error: "Codex session abc already has an active run",
      code: "conflict",
    });
  });

  it("returns structured codes for other codex run errors", async () => {
    codexRunMocks.startReplyCodexRun.mockRejectedValueOnce(
      new codexRunMocks.CodexRunError("invalid_request", "Prompt is required"),
    );

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

    expect(response.status).toBe(400);
    expect(payload).toEqual({ error: "Prompt is required", code: "invalid_request" });
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
