import { describe, expect, it } from "vitest";
import { summarizeCodexSessions, summarizeOpenClawSessions } from "./page";

describe("summarizeOpenClawSessions", () => {
  it("aggregates totals and system stats correctly", () => {
    const summary = summarizeOpenClawSessions([
      {
        key: "a",
        sessionId: "s1",
        updatedAt: 100,
        totalTokens: 100,
        inputTokens: 40,
        outputTokens: 60,
        model: "gpt-5.3-codex",
        agentId: "main",
        systemSent: true,
        abortedLastRun: false,
        estimatedCost: 0.001,
      },
      {
        key: "b",
        sessionId: "s2",
        updatedAt: 250,
        totalTokens: 80,
        inputTokens: 20,
        outputTokens: 60,
        model: "gpt-5.3-codex",
        agentId: "researcher",
        systemSent: false,
        abortedLastRun: true,
        estimatedCost: 0.002,
      },
    ]);

    expect(summary).toMatchObject({
      total: 2,
      inputTokens: 60,
      outputTokens: 120,
      estimatedCost: 0.003,
      systemSent: 1,
      aborted: 1,
      latestUpdatedAt: 250,
    });
  });
});

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
