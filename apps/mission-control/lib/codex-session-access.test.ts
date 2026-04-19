import { beforeEach, describe, expect, it, vi } from "vitest";

const codexMirrorMocks = vi.hoisted(() => ({
  getCodexMirroredSessionDetail: vi.fn(),
  listCodexMirroredSessions: vi.fn(),
  reconcileCodexMirrorSession: vi.fn(),
  reconcileCodexMirrorSessions: vi.fn(),
  syncCodexMirrorThreadFromSession: vi.fn(),
}));

const codexSessionMocks = vi.hoisted(() => ({
  getCodexSessionDetail: vi.fn(),
  listCodexSessions: vi.fn(),
}));

vi.mock("@/lib/codex-mirror", () => ({
  getCodexMirroredSessionDetail: codexMirrorMocks.getCodexMirroredSessionDetail,
  listCodexMirroredSessions: codexMirrorMocks.listCodexMirroredSessions,
  reconcileCodexMirrorSession: codexMirrorMocks.reconcileCodexMirrorSession,
  reconcileCodexMirrorSessions: codexMirrorMocks.reconcileCodexMirrorSessions,
  syncCodexMirrorThreadFromSession: codexMirrorMocks.syncCodexMirrorThreadFromSession,
}));

vi.mock("@/lib/codex-sessions", () => ({
  getCodexSessionDetail: codexSessionMocks.getCodexSessionDetail,
  listCodexSessions: codexSessionMocks.listCodexSessions,
}));

import {
  buildVisibleCodexSessionGroups,
  getVisibleCodexSessionDetail,
  listVisibleCodexSessions,
} from "@/lib/codex-session-access";

describe("buildVisibleCodexSessionGroups", () => {
  it("filters spawned worker threads and groups visible sessions by workspace root", () => {
    const result = buildVisibleCodexSessionGroups(
      [
        {
          sessionId: "visible",
          threadName: "Brainstorm Codex web interface",
          updatedAt: 300,
          cwd: "/Users/hd/Developer/cortana-external",
          model: "gpt-5.4",
          source: "vscode",
          cliVersion: "0.121.0",
          lastMessagePreview: "Ship Mission Control parity",
          transcriptPath: "/tmp/visible.jsonl",
        },
        {
          sessionId: "spawned",
          threadName: "Investigate streamer contract",
          updatedAt: 250,
          cwd: "/Users/hd/Developer/cortana-external",
          model: "gpt-5.4-mini",
          source: "{\"subagent\":{\"thread_spawn\":{\"parent_thread_id\":\"root\"}}}",
          cliVersion: "0.121.0",
          lastMessagePreview: "Worker lane",
          transcriptPath: "/tmp/spawned.jsonl",
        },
        {
          sessionId: "utility",
          threadName: "sessions",
          updatedAt: 200,
          cwd: "/Users/hd/Developer/cortana-external/apps/mission-control/scripts",
          model: "gpt-5.4",
          source: "cli",
          cliVersion: "0.121.0",
          lastMessagePreview: "helper",
          transcriptPath: "/tmp/utility.jsonl",
        },
      ],
      [
        {
          id: "visible",
          title: "Brainstorm Codex web interface",
          cwd: "/Users/hd/Developer/cortana-external",
          source: "vscode",
          archived: 0,
          has_user_event: 0,
          updated_at_ms: 300,
        },
        {
          id: "spawned",
          title: "Investigate streamer contract",
          cwd: "/Users/hd/Developer/cortana-external",
          source: "{\"subagent\":{\"thread_spawn\":{\"parent_thread_id\":\"root\"}}}",
          archived: 0,
          has_user_event: 0,
          updated_at_ms: 250,
        },
        {
          id: "utility",
          title: "sessions",
          cwd: "/Users/hd/Developer/cortana-external/apps/mission-control/scripts",
          source: "cli",
          archived: 0,
          has_user_event: 0,
          updated_at_ms: 200,
        },
      ],
      {
        activeWorkspaceRoots: ["/Users/hd/Developer/cortana-external"],
        savedWorkspaceRoots: ["/Users/hd/Developer/cortana"],
        collapsedGroups: [],
      },
      { limit: 20, homeDir: "/Users/hd" },
    );

    expect(result.totalMatchedSessions).toBe(1);
    expect(result.totalVisibleSessions).toBe(1);
    expect(result.groups).toEqual([
      expect.objectContaining({
        id: "/Users/hd/Developer/cortana-external",
        label: "cortana-external",
        isActive: true,
      }),
    ]);
    expect(result.sessions.map((session) => session.sessionId)).toEqual(["visible"]);
  });
});

describe("listVisibleCodexSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codexMirrorMocks.reconcileCodexMirrorSessions.mockResolvedValue(undefined);
    codexMirrorMocks.syncCodexMirrorThreadFromSession.mockResolvedValue(undefined);
  });

  it("reconciles mirror state and merges visible sessions", async () => {
    codexMirrorMocks.listCodexMirroredSessions.mockResolvedValueOnce([
      {
        sessionId: "abc",
        threadName: "Mirror title",
        updatedAt: 200,
        cwd: null,
        model: "gpt-5.4",
        source: "vscode",
        cliVersion: "0.121.0",
        lastMessagePreview: "mirror preview",
        transcriptPath: "/tmp/mirror.jsonl",
      },
    ]);
    codexSessionMocks.listCodexSessions.mockResolvedValueOnce([
      {
        sessionId: "abc",
        threadName: "File title",
        updatedAt: 100,
        cwd: "/Users/hd/Developer/cortana-external",
        model: null,
        source: null,
        cliVersion: null,
        lastMessagePreview: "file preview",
        transcriptPath: "/tmp/file.jsonl",
      },
    ]);

    const result = await listVisibleCodexSessions(10);

    expect(codexMirrorMocks.reconcileCodexMirrorSessions).toHaveBeenCalledWith({ limit: 50 });
    expect(result.sessions).toEqual([
      {
        sessionId: "abc",
        threadName: "Mirror title",
        updatedAt: 200,
        cwd: "/Users/hd/Developer/cortana-external",
        model: "gpt-5.4",
        source: "vscode",
        cliVersion: "0.121.0",
        lastMessagePreview: "mirror preview",
        transcriptPath: "/tmp/mirror.jsonl",
      },
    ]);
    expect(result.totalVisibleSessions).toBe(1);
    expect(codexMirrorMocks.syncCodexMirrorThreadFromSession).toHaveBeenCalledWith(result.sessions[0]);
  });
});

describe("getVisibleCodexSessionDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codexMirrorMocks.syncCodexMirrorThreadFromSession.mockResolvedValue(undefined);
  });

  it("returns null when the session was archived outside Mission Control", async () => {
    codexMirrorMocks.reconcileCodexMirrorSession.mockResolvedValueOnce("archived");

    const session = await getVisibleCodexSessionDetail("abc");

    expect(session).toBeNull();
    expect(codexSessionMocks.getCodexSessionDetail).not.toHaveBeenCalled();
  });

  it("merges mirrored and file-backed detail for active sessions", async () => {
    codexMirrorMocks.reconcileCodexMirrorSession.mockResolvedValueOnce("active");
    codexMirrorMocks.getCodexMirroredSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      threadName: "Mirror title",
      updatedAt: 200,
      cwd: null,
      model: "gpt-5.4",
      source: "vscode",
      cliVersion: "0.121.0",
      lastMessagePreview: "mirror preview",
      transcriptPath: "/tmp/mirror.jsonl",
      events: [
        {
          id: "assistant-1",
          role: "assistant",
          text: "Hello",
          timestamp: 200,
          phase: "final_answer",
          rawType: "agent_message",
        },
      ],
    });
    codexSessionMocks.getCodexSessionDetail.mockResolvedValueOnce({
      sessionId: "abc",
      threadName: "File title",
      updatedAt: 150,
      cwd: "/tmp/workspace",
      model: null,
      source: null,
      cliVersion: null,
      lastMessagePreview: "file preview",
      transcriptPath: "/tmp/file.jsonl",
      events: [
        {
          id: "user-1",
          role: "user",
          text: "Hi",
          timestamp: 100,
          phase: null,
          rawType: "user_message",
        },
      ],
    });

    const session = await getVisibleCodexSessionDetail("abc");

    expect(session).toEqual({
      sessionId: "abc",
      threadName: "Mirror title",
      updatedAt: 200,
      cwd: "/tmp/workspace",
      model: "gpt-5.4",
      source: "vscode",
      cliVersion: "0.121.0",
      lastMessagePreview: "mirror preview",
      transcriptPath: "/tmp/mirror.jsonl",
      events: [
        {
          id: "user-1",
          role: "user",
          text: "Hi",
          timestamp: 100,
          phase: null,
          rawType: "user_message",
        },
        {
          id: "assistant-1",
          role: "assistant",
          text: "Hello",
          timestamp: 200,
          phase: "final_answer",
          rawType: "agent_message",
        },
      ],
    });
    expect(codexMirrorMocks.syncCodexMirrorThreadFromSession).toHaveBeenCalledWith(session);
  });
});
