import { beforeEach, describe, expect, it, vi } from "vitest";

const codexCliMocks = vi.hoisted(() => ({
  runCodexJson: vi.fn(),
}));

const codexSessionMocks = vi.hoisted(() => ({
  getCodexSessionDetail: vi.fn(),
  waitForCodexSessionDetail: vi.fn(),
}));

vi.mock("@/lib/codex-cli", () => ({
  runCodexJson: codexCliMocks.runCodexJson,
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

