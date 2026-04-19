import { describe, expect, it } from "vitest";

import { parseCodexSessionIndex, parseCodexTranscriptEvents, parseCodexTranscriptMetadata } from "@/lib/codex-sessions";

describe("parseCodexSessionIndex", () => {
  it("parses valid lines and sorts newest first", () => {
    const raw = [
      JSON.stringify({
        id: "older",
        thread_name: "Older session",
        updated_at: "2026-04-18T22:00:00.000Z",
      }),
      "not-json",
      JSON.stringify({
        id: "newer",
        thread_name: "Newer session",
        updated_at: "2026-04-18T23:00:00.000Z",
      }),
    ].join("\n");

    expect(parseCodexSessionIndex(raw)).toEqual([
      {
        id: "newer",
        threadName: "Newer session",
        updatedAt: Date.parse("2026-04-18T23:00:00.000Z"),
      },
      {
        id: "older",
        threadName: "Older session",
        updatedAt: Date.parse("2026-04-18T22:00:00.000Z"),
      },
    ]);
  });
});

describe("parseCodexTranscriptMetadata", () => {
  it("extracts cwd, model, source, cli version, and latest preview", () => {
    const raw = [
      JSON.stringify({
        type: "session_meta",
        payload: {
          cwd: "/Users/hd/Developer/cortana-external",
          source: "exec",
          cli_version: "0.121.0",
        },
      }),
      JSON.stringify({
        type: "turn_context",
        payload: {
          model: "gpt-5.4",
        },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "First prompt",
        },
      }),
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "Latest answer from Codex",
        },
      }),
    ].join("\n");

    expect(parseCodexTranscriptMetadata(raw)).toEqual({
      cwd: "/Users/hd/Developer/cortana-external",
      model: "gpt-5.4",
      source: "exec",
      cliVersion: "0.121.0",
      lastMessagePreview: "Latest answer from Codex",
    });
  });
});

describe("parseCodexTranscriptEvents", () => {
  it("extracts chat transcript messages from event records", () => {
    const raw = [
      JSON.stringify({
        timestamp: "2026-04-18T22:26:55.266Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Hello Codex",
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-18T22:26:56.764Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "Hello operator",
          phase: "final_answer",
        },
      }),
    ].join("\n");

    expect(parseCodexTranscriptEvents(raw)).toEqual([
      {
        id: "0:user",
        role: "user",
        text: "Hello Codex",
        timestamp: Date.parse("2026-04-18T22:26:55.266Z"),
        phase: null,
        rawType: "user_message",
      },
      {
        id: "1:assistant",
        role: "assistant",
        text: "Hello operator",
        timestamp: Date.parse("2026-04-18T22:26:56.764Z"),
        phase: "final_answer",
        rawType: "agent_message",
      },
    ]);
  });
});
