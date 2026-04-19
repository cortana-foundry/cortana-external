import { beforeEach, describe, expect, it, vi } from "vitest";

const codexMocks = vi.hoisted(() => ({
  listCodexSessions: vi.fn(),
}));

vi.mock("@/lib/codex-sessions", () => ({
  listCodexSessions: codexMocks.listCodexSessions,
}));

import { GET } from "@/app/api/codex/sessions/route";

const makeRequest = (query = "") => new Request(`http://localhost/api/codex/sessions${query}`);

describe("GET /api/codex/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns codex sessions with the default limit", async () => {
    codexMocks.listCodexSessions.mockResolvedValueOnce([
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
    ]);

    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(codexMocks.listCodexSessions).toHaveBeenCalledWith({ limit: 20 });
    expect(response.status).toBe(200);
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0]).toMatchObject({
      sessionId: "abc",
      threadName: "Brainstorm Codex web interface",
      model: "gpt-5.4",
    });
  });

  it("uses the supplied limit when present", async () => {
    codexMocks.listCodexSessions.mockResolvedValueOnce([]);

    const response = await GET(makeRequest("?limit=5"));

    expect(response.status).toBe(200);
    expect(codexMocks.listCodexSessions).toHaveBeenCalledWith({ limit: 5 });
  });

  it("returns an error payload when discovery fails", async () => {
    codexMocks.listCodexSessions.mockRejectedValueOnce(new Error("missing session index"));

    const response = await GET(makeRequest());
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({ error: "missing session index" });
  });
});

