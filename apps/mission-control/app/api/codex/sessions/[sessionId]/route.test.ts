import { beforeEach, describe, expect, it, vi } from "vitest";

const codexMocks = vi.hoisted(() => ({
  getVisibleCodexSessionDetail: vi.fn(),
}));

vi.mock("@/lib/codex-session-access", () => ({
  getVisibleCodexSessionDetail: codexMocks.getVisibleCodexSessionDetail,
}));

import { GET } from "@/app/api/codex/sessions/[sessionId]/route";

describe("GET /api/codex/sessions/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns session detail", async () => {
    codexMocks.getVisibleCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      threadName: "Brainstorm",
      updatedAt: 123,
      cwd: "/Users/hd/Developer/cortana-external",
      model: "gpt-5.4",
      source: "exec",
      cliVersion: "0.121.0",
      lastMessagePreview: "Latest",
      transcriptPath: "/tmp/session.jsonl",
      events: [
        { id: "0:user", role: "user", text: "Hi", timestamp: 100, phase: null, rawType: "user_message" },
      ],
    });

    const response = await GET(new Request("http://localhost/api/codex/sessions/abc"), {
      params: Promise.resolve({ sessionId: "abc" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.session.sessionId).toBe("abc");
    expect(codexMocks.getVisibleCodexSessionDetail).toHaveBeenCalledWith("abc");
  });

  it("returns 404 when the session is missing", async () => {
    codexMocks.getVisibleCodexSessionDetail.mockRejectedValueOnce(new Error("Codex session abc not found"));

    const response = await GET(new Request("http://localhost/api/codex/sessions/abc"), {
      params: Promise.resolve({ sessionId: "abc" }),
    });
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toContain("not found");
  });
});
