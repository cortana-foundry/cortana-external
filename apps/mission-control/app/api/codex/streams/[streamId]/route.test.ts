import { describe, expect, it, vi } from "vitest";

const codexRunMocks = vi.hoisted(() => ({
  getCodexRun: vi.fn(),
}));

vi.mock("@/lib/codex-runs", () => ({
  getCodexRun: codexRunMocks.getCodexRun,
}));

import { GET } from "@/app/api/codex/streams/[streamId]/route";

describe("GET /api/codex/streams/[streamId]", () => {
  it("returns 404 when the stream is missing", async () => {
    codexRunMocks.getCodexRun.mockReturnValueOnce(null);

    const response = await GET(
      new Request("http://localhost/api/codex/streams/missing"),
      { params: Promise.resolve({ streamId: "missing" }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual({ error: "Codex stream missing not found" });
  });

  it("replays stream events and closes when completed", async () => {
    codexRunMocks.getCodexRun.mockReturnValue({
      streamId: "stream-1",
      status: "completed",
      events: [
        { seq: 1, event: "ready", data: { streamId: "stream-1" } },
        { seq: 2, event: "lifecycle", data: { codexSessionId: "thread-1" } },
        { seq: 3, event: "done", data: { sessionId: "thread-1", session: { sessionId: "thread-1", events: [] } } },
      ],
    });

    const response = await GET(
      new Request("http://localhost/api/codex/streams/stream-1"),
      { params: Promise.resolve({ streamId: "stream-1" }) },
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(body).toContain("event: ready");
    expect(body).toContain("event: lifecycle");
    expect(body).toContain("thread-1");
    expect(body).toContain("event: done");
  });
});
