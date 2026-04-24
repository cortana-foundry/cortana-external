import os from "node:os";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { loadAlertDeliveryOverview, loadScheduleRegistryOverview } from "@/lib/trading-health-model";

async function writeJson(filePath: string, payload: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2));
}

describe("trading health model loaders", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("summarizes alert delivery receipts and failed sends", async () => {
    const repoPath = await mkdtemp(path.join(os.tmpdir(), "trading-health-"));
    tempDirs.push(repoPath);
    await mkdir(path.join(repoPath, "watchdog", "logs"), { recursive: true });
    await writeFile(
      path.join(repoPath, "watchdog", "logs", "alert-delivery-receipts.jsonl"),
      [
        JSON.stringify({ sent_at: "2026-04-24T14:00:00.000Z", channel: "telegram", severity: "high", status: "sent", dedupe_key: "trading_advisor:1", message_hash: "a" }),
        JSON.stringify({ sent_at: "2026-04-24T14:01:00.000Z", channel: "telegram", severity: "warning", status: "failed", dedupe_key: "watchdog:quote_smoke", message_hash: "b" }),
      ].join("\n"),
    );

    const overview = await loadAlertDeliveryOverview(repoPath);

    expect(overview.state).toBe("degraded");
    expect(overview.data?.sentCount).toBe(1);
    expect(overview.data?.failedCount).toBe(1);
    expect(overview.data?.lastDedupeKey).toBe("watchdog:quote_smoke");
  });

  it("loads schedule registry rows through the shared artifact reader", async () => {
    const repoPath = await mkdtemp(path.join(os.tmpdir(), "trading-health-"));
    tempDirs.push(repoPath);
    await writeJson(path.join(repoPath, ".cache", "trade_lifecycle", "schedule_registry_latest.json"), {
      artifact_family: "trading_schedule_registry",
      schema_version: 1,
      generated_at: "2026-04-24T14:00:00.000Z",
      schedules: [
        { name: "watchdog", kind: "launchd", target: "com.cortana.watchdog", owner: "watchdog", expected_interval_seconds: 900 },
      ],
      summary: { schedule_count: 1, launchd_count: 1, artifact_count: 0, cron_registry_count: 0 },
    });

    const overview = await loadScheduleRegistryOverview(repoPath);

    expect(overview.state).toBe("ok");
    expect(overview.data?.scheduleCount).toBe(1);
    expect(overview.data?.rows[0]?.name).toBe("watchdog");
  });
});
