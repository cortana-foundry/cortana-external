import { beforeEach, describe, expect, it, vi } from "vitest";

const execSyncMock = vi.fn();
const readFileSyncMock = vi.fn();
const existsSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
  default: {
    execSync: execSyncMock,
  },
}));

vi.mock("node:fs", () => ({
  readFileSync: readFileSyncMock,
  existsSync: existsSyncMock,
  default: {
    readFileSync: readFileSyncMock,
    existsSync: existsSyncMock,
  },
}));

describe("lib/agent-models", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.AGENT_MODELS_PATH = "/tmp/agent-models.json";
  });

  it("returns friendly display name when config and models API are available", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(
      JSON.stringify({ Huragok: "openai-codex/gpt-5.3-codex" })
    );
    execSyncMock.mockReturnValue(
      JSON.stringify({
        models: [
          {
            key: "openai-codex/gpt-5.3-codex",
            name: "Codex 5.3",
            available: true,
          },
        ],
      })
    );

    const { getAgentModelDisplay } = await import("@/lib/agent-models");
    const result = getAgentModelDisplay("Huragok");

    expect(result).toEqual({ key: "openai-codex/gpt-5.3-codex", displayName: "Codex 5.3" });
  });

  it("falls back to DB model when agent is not in config", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({ Oracle: "openai-codex/gpt-5.3-codex" }));
    execSyncMock.mockReturnValue(
      JSON.stringify({
        models: [
          { key: "openai-codex/gpt-5.1", name: "GPT-5.1", available: true },
        ],
      })
    );

    const { getAgentModelDisplay } = await import("@/lib/agent-models");
    const result = getAgentModelDisplay("Monitor", "openai-codex/gpt-5.1");

    expect(result).toEqual({ key: "openai-codex/gpt-5.1", displayName: "GPT-5.1" });
  });

  it("returns raw key when models API fails", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(JSON.stringify({ Librarian: "openai-codex/gpt-5.1" }));
    execSyncMock.mockImplementation(() => {
      throw new Error("openclaw unavailable");
    });

    const { getAgentModelDisplay } = await import("@/lib/agent-models");
    const result = getAgentModelDisplay("Librarian");

    expect(result).toEqual({ key: "openai-codex/gpt-5.1", displayName: "openai-codex/gpt-5.1" });
  });

  it("returns nulls when no config and no DB model", async () => {
    existsSyncMock.mockReturnValue(false);

    const { getAgentModelDisplay } = await import("@/lib/agent-models");
    const result = getAgentModelDisplay("Unknown");

    expect(result).toEqual({ key: null, displayName: null });
  });

  it("getAgentModelMap handles missing and invalid config gracefully", async () => {
    const { getAgentModelMap } = await import("@/lib/agent-models");

    existsSyncMock.mockReturnValue(false);
    expect(getAgentModelMap()).toEqual({});

    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("{invalid-json}");
    expect(getAgentModelMap()).toEqual({});
  });
});
