import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_OPTIONS: ExecFileOptionsWithStringEncoding = {
  encoding: "utf8",
  timeout: 15 * 60_000,
  maxBuffer: 10 * 1024 * 1024,
  windowsHide: true,
};

export type CodexExecError = Error & {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  code?: number | string | null;
};

type CodexJsonEvent = Record<string, unknown>;

function parseJsonLine(rawLine: string): CodexJsonEvent | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? (parsed as CodexJsonEvent) : null;
  } catch {
    return null;
  }
}

function parseString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseCodexJsonLines(raw: string): CodexJsonEvent[] {
  return raw.split(/\r?\n/).map(parseJsonLine).filter((line): line is CodexJsonEvent => Boolean(line));
}

export function getCodexThreadId(events: CodexJsonEvent[]): string | null {
  for (const event of events) {
    if (event.type !== "thread.started") continue;
    return parseString(event.thread_id);
  }
  return null;
}

export async function runCodex(
  args: string[],
  options?: Partial<ExecFileOptionsWithStringEncoding>,
) {
  const result = await execFileAsync("codex", args, {
    ...DEFAULT_OPTIONS,
    ...options,
  });

  return result.stdout.trim();
}

export async function runCodexJson(
  args: string[],
  options?: Partial<ExecFileOptionsWithStringEncoding>,
) {
  const raw = await runCodex(args, options);
  return parseCodexJsonLines(raw);
}

