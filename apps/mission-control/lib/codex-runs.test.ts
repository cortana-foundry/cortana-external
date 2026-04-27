import { beforeEach, describe, expect, it, vi } from "vitest";

const codexCliMocks = vi.hoisted(() => ({
  streamCodexJson: vi.fn(),
}));

const sessionAccessMocks = vi.hoisted(() => ({
  getVisibleCodexSessionDetail: vi.fn(),
}));

const sessionMocks = vi.hoisted(() => ({
  upsertCodexSessionIndexEntry: vi.fn(),
  waitForCodexSessionDetail: vi.fn(),
}));

const mirrorMocks = vi.hoisted(() => ({
  upsertCodexMirrorThread: vi.fn(),
}));

vi.mock("@/lib/codex-cli", () => ({
  getCodexThreadId: (events: Array<Record<string, unknown>>) => {
    const started = events.find((event) => event.type === "thread.started");
    return typeof started?.thread_id === "string" ? started.thread_id : null;
  },
  streamCodexJson: codexCliMocks.streamCodexJson,
}));

vi.mock("@/lib/codex-session-access", () => ({
  getVisibleCodexSessionDetail: sessionAccessMocks.getVisibleCodexSessionDetail,
}));

vi.mock("@/lib/codex-sessions", () => ({
  upsertCodexSessionIndexEntry: sessionMocks.upsertCodexSessionIndexEntry,
  waitForCodexSessionDetail: sessionMocks.waitForCodexSessionDetail,
}));

vi.mock("@/lib/codex-mirror", () => ({
  upsertCodexMirrorThread: mirrorMocks.upsertCodexMirrorThread,
}));

import { startCreateCodexRun, startReplyCodexRun } from "@/lib/codex-runs";

const NO_SANDBOX_FLAG = "--dangerously-bypass-approvals-and-sandbox";
const CORTANA_EXTERNAL_CWD = "/Users/hd/Developer/cortana-external";
const CORTANA_CWD = "/Users/hd/Developer/cortana";

describe("Codex CLI runs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codexCliMocks.streamCodexJson.mockResolvedValue([
      { type: "thread.started", thread_id: "thread-abc" },
    ]);
    sessionMocks.waitForCodexSessionDetail.mockResolvedValue({
      sessionId: "thread-abc",
      threadName: "Existing session",
      updatedAt: Date.now(),
      cwd: CORTANA_EXTERNAL_CWD,
      model: "gpt-5.4",
      source: "exec",
      cliVersion: "0.125.0",
      lastMessagePreview: "Latest reply",
      transcriptPath: "/Users/hd/.codex/sessions/thread.jsonl",
      events: [],
    });
  });

  it("starts new sessions with the no-sandbox Codex flag from the selected workspace", async () => {
    await startCreateCodexRun({
      prompt: "Start from cortana",
      workspaceKey: "cortana",
    });

    expect(codexCliMocks.streamCodexJson).toHaveBeenCalledWith(
      ["exec", "--json", NO_SANDBOX_FLAG, "-C", CORTANA_CWD, "Start from cortana"],
      expect.objectContaining({
        cwd: CORTANA_CWD,
      }),
    );
  });

  it("resumes sessions with the no-sandbox Codex flag from the stored session cwd", async () => {
    sessionAccessMocks.getVisibleCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "thread-abc",
      cwd: CORTANA_EXTERNAL_CWD,
    });

    await startReplyCodexRun({
      sessionId: "thread-abc",
      prompt: "Patch this repo",
    });

    expect(codexCliMocks.streamCodexJson).toHaveBeenCalledWith(
      ["exec", "resume", "--json", NO_SANDBOX_FLAG, "thread-abc", "Patch this repo"],
      expect.objectContaining({
        cwd: CORTANA_EXTERNAL_CWD,
      }),
    );
  });
});
