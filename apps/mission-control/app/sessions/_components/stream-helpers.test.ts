import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatRelativeTimestamp,
  getCodexSessionTitle,
  getProvisionalThreadName,
  mergeCodexSessions,
  mergeStreamedAssistantEvents,
  parseCodexSseChunk,
  summarizeCodexSessions,
} from "./stream-helpers";

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

  it("returns the original list when fallback is null", () => {
    const sessions = [
      {
        sessionId: "a",
        threadName: null,
        updatedAt: 1,
        cwd: null,
        model: null,
        source: null,
        cliVersion: null,
        lastMessagePreview: null,
        transcriptPath: null,
      },
    ];
    expect(mergeCodexSessions(sessions, null)).toBe(sessions);
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

  it("inserts a new event when the id has not been seen", () => {
    const merged = mergeStreamedAssistantEvents(
      [{ id: "assistant-1", role: "assistant", text: "First" }],
      { id: "assistant-2", role: "assistant", text: "Second" },
      "append",
    );
    expect(merged).toHaveLength(2);
    expect(merged[1]).toEqual({ id: "assistant-2", role: "assistant", text: "Second" });
  });
});

describe("formatRelativeTimestamp", () => {
  const NOW = 1_700_000_000_000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Unknown' for null/undefined", () => {
    expect(formatRelativeTimestamp(null)).toBe("Unknown");
    expect(formatRelativeTimestamp(undefined)).toBe("Unknown");
  });

  it("uses minute granularity for deltas under an hour", () => {
    const label = formatRelativeTimestamp(NOW - 5 * 60_000);
    expect(label).toMatch(/minute|minutes|min\.?|ago/i);
  });

  it("uses hour granularity for deltas between 1-48h", () => {
    const label = formatRelativeTimestamp(NOW - 5 * 3_600_000);
    expect(label).toMatch(/hour|hr|ago/i);
  });

  it("uses day granularity for deltas >48h", () => {
    const label = formatRelativeTimestamp(NOW - 5 * 86_400_000);
    expect(label).toMatch(/day|d\.?|ago/i);
  });
});

describe("getCodexSessionTitle", () => {
  it("returns the trimmed threadName when present", () => {
    expect(getCodexSessionTitle({ threadName: "  My thread  ", sessionId: "x" })).toBe("My thread");
  });

  it("falls back to a default for missing title", () => {
    expect(getCodexSessionTitle(null)).toBe("Untitled Codex session");
    expect(getCodexSessionTitle({ threadName: null, sessionId: "x" })).toBe("Untitled Codex session");
    expect(getCodexSessionTitle({ threadName: "   ", sessionId: "x" })).toBe("Untitled Codex session");
  });
});

describe("getProvisionalThreadName", () => {
  it("uses the prompt when short", () => {
    expect(getProvisionalThreadName("  Fix the build  ")).toBe("Fix the build");
  });

  it("truncates long prompts with ellipsis", () => {
    const long = "a".repeat(100);
    const result = getProvisionalThreadName(long);
    expect(result.length).toBe(72);
    expect(result.endsWith("…")).toBe(true);
  });

  it("falls back when prompt is empty", () => {
    expect(getProvisionalThreadName("   ")).toBe("Starting new Codex thread");
  });
});

describe("parseCodexSseChunk", () => {
  it("returns null when there are no data lines", () => {
    expect(parseCodexSseChunk(":heartbeat\nevent: ping")).toBeNull();
  });

  it("parses event + data envelopes", () => {
    const envelope = parseCodexSseChunk("event: codex_event\ndata: {\"type\":\"done\"}");
    expect(envelope).toEqual({ event: "codex_event", data: { type: "done" } });
  });
});
