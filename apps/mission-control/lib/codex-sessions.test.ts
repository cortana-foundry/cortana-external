import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  getCodexSessionDetail,
  parseCodexSessionIndex,
  parseCodexTranscriptEvents,
  parseCodexTranscriptMetadata,
} from "@/lib/codex-sessions";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

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

describe("getCodexSessionDetail", () => {
  it("falls back to the Codex state db rollout_path when updated_at points at the wrong day folder", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "codex-sessions-test-"));
    tempDirs.push(tempDir);

    const sessionIndexPath = path.join(tempDir, "session_index.jsonl");
    const sessionsRoot = path.join(tempDir, "sessions");
    const archivedRoot = path.join(tempDir, "archived_sessions");
    const stateDbPath = path.join(tempDir, "state_5.sqlite");
    const transcriptDir = path.join(sessionsRoot, "2026", "03", "13");
    const transcriptPath = path.join(
      transcriptDir,
      "rollout-2026-03-13T20-51-36-019ce9d3-c678-7eb3-9c2a-8f7b0a2ee4ce.jsonl",
    );

    await fs.mkdir(transcriptDir, { recursive: true });
    await fs.mkdir(archivedRoot, { recursive: true });
    await fs.writeFile(
      sessionIndexPath,
      `${JSON.stringify({
        id: "019ce9d3-c678-7eb3-9c2a-8f7b0a2ee4ce",
        thread_name: "Add Polymarket intelligence layer",
        updated_at: "2026-04-21T19:47:41.526Z",
      })}\n`,
      "utf8",
    );
    await fs.writeFile(
      transcriptPath,
      [
        JSON.stringify({
          timestamp: "2026-03-14T00:54:56.312Z",
          type: "session_meta",
          payload: {
            cwd: "/Users/hd/Developer/cortana-external",
            source: "vscode",
            cli_version: "0.115.0-alpha.11",
          },
        }),
        JSON.stringify({
          timestamp: "2026-03-14T00:54:56.318Z",
          type: "event_msg",
          payload: {
            type: "user_message",
            message: "Read this PRD first",
          },
        }),
        JSON.stringify({
          timestamp: "2026-03-14T00:55:03.045Z",
          type: "event_msg",
          payload: {
            type: "agent_message",
            message: "I’m reading the PRD.",
            phase: "commentary",
          },
        }),
      ].join("\n"),
      "utf8",
    );

    await execFileAsync("sqlite3", [
      stateDbPath,
      `
        CREATE TABLE threads (
          id TEXT PRIMARY KEY,
          rollout_path TEXT
        );
        INSERT INTO threads (id, rollout_path)
        VALUES ('019ce9d3-c678-7eb3-9c2a-8f7b0a2ee4ce', '${transcriptPath.replaceAll("'", "''")}');
      `,
    ]);

    const detail = await getCodexSessionDetail("019ce9d3-c678-7eb3-9c2a-8f7b0a2ee4ce", {
      sessionIndexPath,
      sessionsRoot,
      archivedRoot,
      stateDbPath,
    });

    expect(detail).toEqual(
      expect.objectContaining({
        sessionId: "019ce9d3-c678-7eb3-9c2a-8f7b0a2ee4ce",
        threadName: "Add Polymarket intelligence layer",
        transcriptPath,
      }),
    );
    expect(detail.events).toEqual([
      expect.objectContaining({
        role: "user",
        text: "Read this PRD first",
      }),
      expect.objectContaining({
        role: "assistant",
        text: "I’m reading the PRD.",
      }),
    ]);
  });
});
