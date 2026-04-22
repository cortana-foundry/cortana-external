import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { writeJsonFileAtomic } from "./files.js";

const threshold = 3;
const failures = new Map<string, number>();

export interface AuthAlertRecord {
  provider: string;
  consecutive_failures: number;
  last_error: string;
  updated_at: string;
}

export interface ProviderAuthAlertState {
  active: boolean;
  consecutive_failures: number;
  last_error: string | null;
  updated_at: string | null;
}

function authAlertPath(provider: string): string {
  return path.join(os.homedir(), ".cortana", "auth-alerts", `${provider}.json`);
}

function inactiveAuthAlertState(): ProviderAuthAlertState {
  return {
    active: false,
    consecutive_failures: 0,
    last_error: null,
    updated_at: null,
  };
}

export async function markFailure(provider: string, error?: unknown): Promise<void> {
  const count = (failures.get(provider) ?? 0) + 1;
  failures.set(provider, count);
  if (count < threshold) {
    return;
  }

  await writeJsonFileAtomic(
    authAlertPath(provider),
    {
      provider,
      consecutive_failures: count,
      last_error: error instanceof Error ? error.message : error ? String(error) : "",
      updated_at: new Date().toISOString(),
    },
    0o600,
  );
}

export async function markSuccess(provider: string): Promise<void> {
  failures.set(provider, 0);
  try {
    await fs.promises.rm(authAlertPath(provider), { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function readAuthAlert(provider: string): Promise<ProviderAuthAlertState> {
  try {
    const raw = await fs.promises.readFile(authAlertPath(provider), "utf-8");
    const parsed = JSON.parse(raw) as Partial<AuthAlertRecord>;
    return {
      active: true,
      consecutive_failures:
        typeof parsed.consecutive_failures === "number" && Number.isFinite(parsed.consecutive_failures)
          ? parsed.consecutive_failures
          : 0,
      last_error: typeof parsed.last_error === "string" && parsed.last_error.length > 0 ? parsed.last_error : null,
      updated_at: typeof parsed.updated_at === "string" && parsed.updated_at.length > 0 ? parsed.updated_at : null,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      return inactiveAuthAlertState();
    }
    throw error;
  }
}

export function resetAuthAlertsForTests(): void {
  failures.clear();
}
