import { describe, expect, it } from "vitest";
import {
  mergeCodexSessions,
  mergeStreamedAssistantEvents,
  summarizeCodexSessions,
} from "./page";

describe("summarizeCodexSessions", () => {
  it("counts codex sessions and derived metadata", () => {
    const summary = summarizeCodexSessions([
      {
        sessionId: "codex-1",
        threadName: "Brainstorm",
        updatedAt: 100,
        cwd: "/Users/hd/Developer/cortana-external",
        model: "gpt-5.4",
        source: "exec",
        cliVersion: "0.121.0",
        lastMessagePreview: "preview",
        transcriptPath: "/tmp/one.jsonl",
      },
      {
        sessionId: "codex-2",
        threadName: "Verify repo purpose",
        updatedAt: 250,
        cwd: null,
        model: "gpt-5.4",
        source: "resume",
        cliVersion: "0.121.0",
        lastMessagePreview: null,
        transcriptPath: null,
      },
    ]);

    expect(summary).toEqual({
      total: 2,
      latestUpdatedAt: 250,
      withCwd: 1,
      withPreview: 1,
    });
  });
});

describe("mergeCodexSessions", () => {
  it("keeps a fallback session visible when discovery lags behind", () => {
    const merged = mergeCodexSessions(
      [
        {
          sessionId: "older-session",
          threadName: "Older",
          updatedAt: 100,
          cwd: "/tmp/older",
          model: "gpt-5.4",
          source: "resume",
          cliVersion: "0.121.0",
          lastMessagePreview: "older preview",
          transcriptPath: "/tmp/older.jsonl",
        },
      ],
      {
        sessionId: "new-session",
        threadName: "New thread",
        updatedAt: 200,
        cwd: "/tmp/new",
        model: "gpt-5.4",
        source: "exec",
        cliVersion: "0.121.0",
        lastMessagePreview: "new preview",
        transcriptPath: "/tmp/new.jsonl",
      },
    );

    expect(merged.map((session) => session.sessionId)).toEqual(["new-session", "older-session"]);
  });
});

describe("mergeStreamedAssistantEvents", () => {
  it("appends deltas onto an in-flight streamed assistant message", () => {
    const merged = mergeStreamedAssistantEvents(
      [{ id: "assistant-1", role: "assistant", text: "Hello" }],
      { id: "assistant-1", role: "assistant", text: " world" },
      "append",
    );

    expect(merged).toEqual([{ id: "assistant-1", role: "assistant", text: "Hello world" }]);
  });

  it("replaces the buffered message when the completed payload arrives", () => {
    const merged = mergeStreamedAssistantEvents(
      [{ id: "assistant-1", role: "assistant", text: "Partial" }],
      { id: "assistant-1", role: "assistant", text: "Final answer" },
      "replace",
    );

    expect(merged).toEqual([{ id: "assistant-1", role: "assistant", text: "Final answer" }]);
  });
});
