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

  it("prefers response_item messages for the latest preview", () => {
    const raw = [
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "Older fallback answer",
        },
      }),
      JSON.stringify({
        type: "response_item",
        timestamp: "2026-04-18T22:26:56.764Z",
        payload: {
          type: "message",
          role: "assistant",
          phase: "final_answer",
          content: [
            {
              type: "output_text",
              text: "Codex-native latest answer",
            },
          ],
        },
      }),
    ].join("\n");

    expect(parseCodexTranscriptMetadata(raw)).toEqual({
      cwd: null,
      model: null,
      source: null,
      cliVersion: null,
      lastMessagePreview: "Codex-native latest answer",
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

  it("prefers response_item user and assistant messages over legacy event records", () => {
    const raw = [
      JSON.stringify({
        timestamp: "2026-04-18T22:26:54.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "developer",
          content: [
            {
              type: "output_text",
              text: "Do not render developer instructions",
            },
          ],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-18T22:26:55.266Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Hello from response items",
            },
          ],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-18T22:26:56.764Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          phase: "commentary",
          content: [
            {
              type: "output_text",
              text: "Commentary shown by Codex",
            },
          ],
        },
      }),
      JSON.stringify({
        timestamp: "2026-04-18T22:26:57.764Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "Legacy fallback that should be ignored here",
          phase: "final_answer",
        },
      }),
    ].join("\n");

    expect(parseCodexTranscriptEvents(raw)).toEqual([
      {
        id: "response:1:user",
        role: "user",
        text: "Hello from response items",
        timestamp: Date.parse("2026-04-18T22:26:55.266Z"),
        phase: null,
        rawType: "message",
      },
      {
        id: "response:2:assistant",
        role: "assistant",
        text: "Commentary shown by Codex",
        timestamp: Date.parse("2026-04-18T22:26:56.764Z"),
        phase: "commentary",
        rawType: "message",
      },
    ]);
  });
});
