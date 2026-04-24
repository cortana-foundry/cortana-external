import { promises as fs } from "node:fs";

export type JsonArtifactError = "missing" | "invalid" | "read";

export type JsonArtifactRead<T> = {
  path: string;
  data: T | null;
  message?: string;
  error?: JsonArtifactError;
};

export type ArtifactFreshness = {
  state: "fresh" | "stale" | "missing" | "unknown";
  ageSeconds: number | null;
  maxAgeSeconds: number;
};

export async function readTradingJsonArtifact<T>(filePath: string): Promise<JsonArtifactRead<T>> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw) as T;
    if (looksLikeMockArtifact(data)) {
      return { path: filePath, data: null, error: "invalid", message: "JSON artifact appears corrupt or test-generated." };
    }
    return { path: filePath, data };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      return { path: filePath, data: null, error: "missing", message: "File not found." };
    }
    if (error instanceof SyntaxError) {
      return { path: filePath, data: null, error: "invalid", message: "Could not parse JSON artifact." };
    }
    return { path: filePath, data: null, error: "read", message: formatArtifactError(error) };
  }
}

export function classifyArtifactFreshness(
  timestamp: string | null | undefined,
  maxAgeSeconds: number,
  nowMs = Date.now(),
): ArtifactFreshness {
  if (!timestamp) return { state: "missing", ageSeconds: null, maxAgeSeconds };
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return { state: "unknown", ageSeconds: null, maxAgeSeconds };
  const ageSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  return {
    state: ageSeconds > maxAgeSeconds ? "stale" : "fresh",
    ageSeconds,
    maxAgeSeconds,
  };
}

export function looksLikeMockArtifact(value: unknown): boolean {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" && /MagicMock|<MagicMock|\[object MagicMock\]/u.test(serialized);
  } catch {
    return false;
  }
}

function formatArtifactError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
