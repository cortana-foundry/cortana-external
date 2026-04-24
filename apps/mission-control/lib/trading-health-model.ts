import { promises as fs } from "node:fs";
import path from "node:path";
import { readTradingJsonArtifact } from "@/lib/trading-artifacts";
import type { AlertDeliveryOverview, ArtifactState, LoadState, ScheduleRegistryOverview } from "@/lib/trading-ops-contract";

export async function loadAlertDeliveryOverview(repoPath: string): Promise<ArtifactState<AlertDeliveryOverview>> {
  const repoRoot = path.basename(repoPath) === "backtester" ? path.dirname(repoPath) : repoPath;
  const receiptPath = path.join(repoRoot, "watchdog", "logs", "alert-delivery-receipts.jsonl");
  const raw = await readTextIfExists(receiptPath);
  if (!raw.trim()) {
    return {
      state: "missing",
      label: "No alert delivery receipts",
      message: "Watchdog has not written alert delivery receipts yet.",
      data: null,
      source: receiptPath,
      warnings: [],
    };
  }
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseJsonLine)
    .filter((row): row is Record<string, unknown> => Boolean(row))
    .slice(-20)
    .map((row) => ({
      sentAt: stringValue(row.sent_at) ?? "",
      channel: stringValue(row.channel) ?? "unknown",
      severity: stringValue(row.severity) ?? "unknown",
      status: stringValue(row.status) ?? "unknown",
      dedupeKey: stringValue(row.dedupe_key) ?? "unknown",
      messageHash: stringValue(row.message_hash) ?? "",
    }));
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const sentCount = rows.filter((row) => row.status === "sent").length;
  const last = rows.at(-1) ?? null;
  return {
    state: failedCount > 0 ? "degraded" : "ok",
    label: "Alert delivery receipts",
    message: last
      ? `Last ${last.channel} delivery ${last.status} for ${last.dedupeKey}.`
      : "Alert delivery receipts are present but empty.",
    data: {
      sentCount,
      failedCount,
      lastSentAt: last?.sentAt ?? null,
      lastStatus: last?.status ?? null,
      lastChannel: last?.channel ?? null,
      lastDedupeKey: last?.dedupeKey ?? null,
      rows: rows.reverse(),
    },
    source: receiptPath,
    updatedAt: last?.sentAt ?? null,
    warnings: rows.filter((row) => row.status === "failed").map((row) => `${row.channel}:${row.dedupeKey}:failed`),
    badgeText: failedCount > 0 ? `${failedCount} failed` : `${sentCount} sent`,
  };
}

export async function loadScheduleRegistryOverview(repoPath: string): Promise<ArtifactState<ScheduleRegistryOverview>> {
  const registryPath = path.join(repoPath, ".cache", "trade_lifecycle", "schedule_registry_latest.json");
  const registry = await readTradingJsonArtifact<Record<string, unknown>>(registryPath);
  if (!registry.data) {
    return {
      state: registry.error === "invalid" ? "error" : "missing",
      label: "No schedule registry",
      message: registry.message ?? "Schedule registry has not been generated yet.",
      data: null,
      source: registryPath,
      warnings: registry.error ? [registry.error] : [],
    };
  }
  const schedules = asArray(registry.data.schedules)
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      name: stringValue(item.name) ?? "unknown",
      kind: stringValue(item.kind) ?? "unknown",
      target: stringValue(item.target) ?? "unknown",
      owner: stringValue(item.owner) ?? "unknown",
      expectedIntervalSeconds: numberValue(item.expected_interval_seconds),
    }));
  const summary = asRecord(registry.data.summary) ?? {};
  const generatedAt = stringValue(registry.data.generated_at);
  const overview: ScheduleRegistryOverview = {
    scheduleCount: numberValue(summary.schedule_count) ?? schedules.length,
    launchdCount: numberValue(summary.launchd_count) ?? schedules.filter((row) => row.kind === "launchd").length,
    artifactCount: numberValue(summary.artifact_count) ?? schedules.filter((row) => row.kind === "artifact").length,
    cronRegistryCount: numberValue(summary.cron_registry_count) ?? schedules.filter((row) => row.kind === "cron_registry").length,
    rows: schedules,
  };
  return {
    state: schedules.length > 0 ? "ok" : "degraded",
    label: "Schedule registry",
    message: schedules.length > 0
      ? `${overview.scheduleCount} expected runtime schedules are registered.`
      : "Schedule registry artifact exists but contains no schedules.",
    data: overview,
    source: registryPath,
    updatedAt: generatedAt,
    warnings: schedules.length > 0 ? [] : ["schedule_registry_empty"],
    badgeText: String(overview.scheduleCount),
  };
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return "";
    throw error;
  }
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
