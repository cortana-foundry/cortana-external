import os from "node:os";
import path from "node:path";
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
  listCodexSessionIndexSummaries: vi.fn(),
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
  listCodexSessionIndexSummaries: codexSessionMocks.listCodexSessionIndexSummaries,
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

  it("excludes sessions without any resolved workspace context", () => {
    const result = buildVisibleCodexSessionGroups(
      [
        {
          sessionId: "unknown-context",
          threadName: "Reply with exactly: ack-two",
          updatedAt: 300,
          cwd: null,
          model: null,
          source: null,
          cliVersion: null,
          lastMessagePreview: null,
          transcriptPath: null,
        },
        {
          sessionId: "known-context",
          threadName: "Brainstorm Codex web interface",
          updatedAt: 250,
          cwd: "/Users/hd/Developer/cortana-external",
          model: "gpt-5.4",
          source: "vscode",
          cliVersion: "0.121.0",
          lastMessagePreview: "Visible in project rail",
          transcriptPath: "/tmp/known.jsonl",
        },
      ],
      [
        {
          id: "unknown-context",
          title: "Reply with exactly: ack-two",
          cwd: null,
          source: null,
          archived: 0,
          has_user_event: 1,
          updated_at_ms: 300,
        },
        {
          id: "known-context",
          title: "Brainstorm Codex web interface",
          cwd: "/Users/hd/Developer/cortana-external",
          source: "vscode",
          archived: 0,
          has_user_event: 1,
          updated_at_ms: 250,
        },
      ],
      {
        activeWorkspaceRoots: ["/Users/hd/Developer/cortana-external"],
        savedWorkspaceRoots: [],
        collapsedGroups: [],
      },
      { limit: 20, homeDir: "/Users/hd" },
    );

    expect(result.totalMatchedSessions).toBe(1);
    expect(result.totalVisibleSessions).toBe(1);
    expect(result.sessions.map((session) => session.sessionId)).toEqual(["known-context"]);
  });

  it("hides exec/cli-sourced threads to match the Codex desktop sidebar", () => {
    const result = buildVisibleCodexSessionGroups(
      [
        {
          sessionId: "vscode-one",
          threadName: "Desktop thread",
          updatedAt: 300,
          cwd: "/Users/hd/Developer/cortana-external",
          model: "gpt-5.4",
          source: "vscode",
          cliVersion: "0.121.0",
          lastMessagePreview: "visible",
          transcriptPath: "/tmp/one.jsonl",
        },
        {
          sessionId: "exec-one",
          threadName: "testing from mission control",
          updatedAt: 200,
          cwd: "/Users/hd/Developer/cortana-external",
          model: "gpt-5.4",
          source: "exec",
          cliVersion: "0.121.0",
          lastMessagePreview: "ephemeral",
          transcriptPath: "/tmp/two.jsonl",
        },
        {
          sessionId: "cli-one",
          threadName: "CLI repl",
          updatedAt: 150,
          cwd: "/Users/hd/Developer/cortana-external",
          model: "gpt-5.4",
          source: "cli",
          cliVersion: "0.121.0",
          lastMessagePreview: "terminal",
          transcriptPath: "/tmp/three.jsonl",
        },
      ],
      [
        {
          id: "vscode-one",
          title: "Desktop thread",
          cwd: "/Users/hd/Developer/cortana-external",
          source: "vscode",
          archived: 0,
          has_user_event: 1,
          updated_at_ms: 300,
        },
        {
          id: "exec-one",
          title: "testing from mission control",
          cwd: "/Users/hd/Developer/cortana-external",
          source: "exec",
          archived: 0,
          has_user_event: 1,
          updated_at_ms: 200,
        },
        {
          id: "cli-one",
          title: "CLI repl",
          cwd: "/Users/hd/Developer/cortana-external",
          source: "cli",
          archived: 0,
          has_user_event: 1,
          updated_at_ms: 150,
        },
      ],
      {
        activeWorkspaceRoots: ["/Users/hd/Developer/cortana-external"],
        savedWorkspaceRoots: [],
        collapsedGroups: [],
      },
      { limit: 20, homeDir: "/Users/hd" },
    );

    expect(result.sessions.map((session) => session.sessionId)).toEqual(["vscode-one"]);
  });

  it("includes exec-sourced threads when includeSessionIds contains their id", () => {
    const result = buildVisibleCodexSessionGroups(
      [
        {
          sessionId: "vscode-one",
          threadName: "Desktop thread",
          updatedAt: 300,
          cwd: "/Users/hd/Developer/cortana-external",
          model: "gpt-5.4",
          source: "vscode",
          cliVersion: "0.121.0",
          lastMessagePreview: "visible",
          transcriptPath: "/tmp/one.jsonl",
        },
        {
          sessionId: "exec-one",
          threadName: "MC-created thread",
          updatedAt: 200,
          cwd: "/Users/hd/Developer/cortana-external",
          model: "gpt-5.4",
          source: "exec",
          cliVersion: "0.121.0",
          lastMessagePreview: "should be included",
          transcriptPath: "/tmp/two.jsonl",
        },
      ],
      [
        {
          id: "vscode-one",
          title: "Desktop thread",
          cwd: "/Users/hd/Developer/cortana-external",
          source: "vscode",
          archived: 0,
          has_user_event: 1,
          updated_at_ms: 300,
        },
        {
          id: "exec-one",
          title: "MC-created thread",
          cwd: "/Users/hd/Developer/cortana-external",
          source: "exec",
          archived: 0,
          has_user_event: 1,
          updated_at_ms: 200,
        },
      ],
      {
        activeWorkspaceRoots: ["/Users/hd/Developer/cortana-external"],
        savedWorkspaceRoots: [],
        collapsedGroups: [],
      },
      { limit: 20, homeDir: "/Users/hd", includeSessionIds: new Set(["exec-one"]) },
    );

    expect(result.sessions.map((session) => session.sessionId)).toEqual(["vscode-one", "exec-one"]);
  });
});

describe("listVisibleCodexSessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codexMirrorMocks.listCodexMirroredSessions.mockResolvedValue([]);
    codexMirrorMocks.syncCodexMirrorThreadFromSession.mockResolvedValue(undefined);
  });

  it("uses file-backed codex sessions and syncs the visible subset into the mirror", async () => {
    const repoRoot = path.join(os.homedir(), "Developer", "cortana-external");
    codexSessionMocks.listCodexSessionIndexSummaries.mockResolvedValueOnce([
      {
        sessionId: "abc",
        threadName: "Visible title",
        updatedAt: 200,
        cwd: null,
        model: null,
        source: null,
        cliVersion: null,
        lastMessagePreview: null,
        transcriptPath: null,
      },
    ]);
    codexMirrorMocks.listCodexMirroredSessions.mockResolvedValueOnce([
      {
        sessionId: "abc",
        threadName: "Visible title",
        updatedAt: 200,
        cwd: repoRoot,
        model: "gpt-5.4",
        source: "vscode",
        cliVersion: "0.121.0",
        lastMessagePreview: "file preview",
        transcriptPath: "/tmp/file.jsonl",
      },
    ]);

    const result = await listVisibleCodexSessions(10);

    expect(codexSessionMocks.listCodexSessionIndexSummaries).toHaveBeenCalledWith({ limit: 50 });
    expect(result.sessions).toEqual([
      {
        sessionId: "abc",
        threadName: "Visible title",
        updatedAt: 200,
        cwd: repoRoot,
        model: "gpt-5.4",
        source: "vscode",
        cliVersion: "0.121.0",
        lastMessagePreview: "file preview",
        transcriptPath: "/tmp/file.jsonl",
      },
    ]);
    expect(result.totalVisibleSessions).toBe(1);
    expect(codexMirrorMocks.syncCodexMirrorThreadFromSession).toHaveBeenCalledWith(result.sessions[0]);
  });

  it("keeps Codex index timing and preview metadata ahead of newer mirror timestamps", async () => {
    const repoRoot = path.join(os.homedir(), "Developer", "cortana-external");
    codexSessionMocks.listCodexSessionIndexSummaries.mockResolvedValueOnce([
      {
        sessionId: "abc",
        threadName: "Visible title",
        updatedAt: 200,
        cwd: repoRoot,
        model: "gpt-5.4",
        source: "vscode",
        cliVersion: "0.121.0",
        lastMessagePreview: "desktop preview",
        transcriptPath: "/tmp/file.jsonl",
      },
    ]);
    codexMirrorMocks.listCodexMirroredSessions.mockResolvedValueOnce([
      {
        sessionId: "abc",
        threadName: "Mirror title",
        updatedAt: 900,
        cwd: repoRoot,
        model: "gpt-5.4",
        source: "vscode",
        cliVersion: "0.121.0",
        lastMessagePreview: "mirror preview",
        transcriptPath: "/tmp/mirror.jsonl",
      },
    ]);

    const result = await listVisibleCodexSessions(10);

    expect(result.sessions).toEqual([
      {
        sessionId: "abc",
        threadName: "Visible title",
        updatedAt: 200,
        cwd: repoRoot,
        model: "gpt-5.4",
        source: "vscode",
        cliVersion: "0.121.0",
        lastMessagePreview: "desktop preview",
        transcriptPath: "/tmp/file.jsonl",
      },
    ]);
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
      threadName: "File title",
      updatedAt: 150,
      cwd: "/tmp/workspace",
      model: "gpt-5.4",
      source: "vscode",
      cliVersion: "0.121.0",
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
    expect(codexMirrorMocks.syncCodexMirrorThreadFromSession).toHaveBeenCalledWith({
      sessionId: "abc",
      threadName: "File title",
      updatedAt: 150,
      cwd: "/tmp/workspace",
      model: "gpt-5.4",
      source: "vscode",
      cliVersion: "0.121.0",
      lastMessagePreview: "file preview",
      transcriptPath: "/tmp/file.jsonl",
    });
  });

  it("prefers file-backed events when mirrored rows only contain synthetic backfill ids", async () => {
    codexMirrorMocks.reconcileCodexMirrorSession.mockResolvedValueOnce("active");
    codexMirrorMocks.getCodexMirroredSessionDetail.mockResolvedValueOnce({
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
          id: "0:user",
          role: "user",
          text: "Hi",
          timestamp: 100,
          phase: null,
          rawType: "user_message",
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
          text: "Hi from file",
          timestamp: 100,
          phase: null,
          rawType: "user_message",
        },
      ],
    });

    const session = await getVisibleCodexSessionDetail("abc");

    expect(session?.events).toEqual([
      {
        id: "user-1",
        role: "user",
        text: "Hi from file",
        timestamp: 100,
        phase: null,
        rawType: "user_message",
      },
    ]);
  });

  it("merges canonical mirrored events with file-backed history", async () => {
    codexMirrorMocks.reconcileCodexMirrorSession.mockResolvedValueOnce("active");
    codexMirrorMocks.getCodexMirroredSessionDetail.mockResolvedValueOnce({
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
          id: "assistant-item-1",
          role: "assistant",
          text: "Canonical hello",
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
          id: "0:user",
          role: "user",
          text: "Historical prompt",
          timestamp: 100,
          phase: null,
          rawType: "user_message",
        },
      ],
    });

    const session = await getVisibleCodexSessionDetail("abc");

    expect(session?.events).toEqual([
      {
        id: "0:user",
        role: "user",
        text: "Historical prompt",
        timestamp: 100,
        phase: null,
        rawType: "user_message",
      },
      {
        id: "assistant-item-1",
        role: "assistant",
        text: "Canonical hello",
        timestamp: 200,
        phase: "final_answer",
        rawType: "agent_message",
      },
    ]);
  });
});
