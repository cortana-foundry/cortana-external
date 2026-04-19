import { describe, expect, it } from "vitest";

import { getCodexAssistantMessageText, getCodexThreadId, parseCodexJsonLines } from "@/lib/codex-cli";

describe("parseCodexJsonLines", () => {
  it("parses jsonl output into event objects", () => {
    const raw = [
      JSON.stringify({ type: "thread.started", thread_id: "abc" }),
      JSON.stringify({ type: "turn.started" }),
    ].join("\n");

    expect(parseCodexJsonLines(raw)).toEqual([
      { type: "thread.started", thread_id: "abc" },
      { type: "turn.started" },
    ]);
  });
});

describe("getCodexThreadId", () => {
  it("returns the thread id from events", () => {
    expect(getCodexThreadId([{ type: "thread.started", thread_id: "abc" }])).toBe("abc");
  });
});

describe("getCodexAssistantMessageText", () => {
  it("extracts assistant text from completed message items", () => {
    expect(
      getCodexAssistantMessageText({
        type: "item.completed",
        item: {
          type: "agent_message",
          text: "streamed assistant text",
        },
      }),
    ).toBe("streamed assistant text");
  });
});
