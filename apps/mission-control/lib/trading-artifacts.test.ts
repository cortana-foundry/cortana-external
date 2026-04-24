import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { classifyArtifactFreshness, readTradingJsonArtifact } from "@/lib/trading-artifacts";

describe("trading artifact loader", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("rejects mock-generated JSON artifacts", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "trading-artifacts-"));
    tempDirs.push(dir);
    const filePath = path.join(dir, "artifact.json");
    await writeFile(filePath, JSON.stringify({ rows: ["<MagicMock name=scorecard>"] }));

    const result = await readTradingJsonArtifact(filePath);

    expect(result.data).toBeNull();
    expect(result.error).toBe("invalid");
    expect(result.message).toMatch(/test-generated/);
  });

  it("classifies missing and stale timestamps with a shared freshness window", () => {
    expect(classifyArtifactFreshness(null, 60).state).toBe("missing");
    expect(classifyArtifactFreshness("2026-04-24T14:00:00.000Z", 60, Date.parse("2026-04-24T14:02:00.000Z")).state).toBe("stale");
  });
});
