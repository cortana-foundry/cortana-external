import { execFile, spawn, type ExecFileOptionsWithStringEncoding, type SpawnOptionsWithoutStdio } from "node:child_process";
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
type CodexStreamOptions = SpawnOptionsWithoutStdio & {
  signal?: AbortSignal;
  onEvent?: (event: CodexJsonEvent) => void;
  onStderr?: (chunk: string) => void;
};

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

export function getCodexAssistantMessageText(event: CodexJsonEvent): string | null {
  if (event.type !== "item.completed") return null;
  const item = event.item;
  if (!item || typeof item !== "object") return null;

  const typed = item as Record<string, unknown>;
  if (typed.type !== "agent_message") return null;
  return parseString(typed.text);
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

export async function streamCodexJson(
  args: string[],
  options: CodexStreamOptions = {},
): Promise<CodexJsonEvent[]> {
  return new Promise((resolve, reject) => {
    const { signal, onEvent, onStderr, ...spawnOptions } = options;
    const child = spawn("codex", args, {
      ...spawnOptions,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const events: CodexJsonEvent[] = [];
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const flushStdout = () => {
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseJsonLine(line);
        if (!event) continue;
        events.push(event);
        onEvent?.(event);
      }
    };

    const abortHandler = () => {
      child.kill("SIGTERM");
    };

    const cleanup = () => {
      if (signal) {
        signal.removeEventListener("abort", abortHandler);
      }
    };

    if (signal) {
      if (signal.aborted) {
        abortHandler();
      } else {
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    }

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdoutBuffer += chunk;
      flushStdout();
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderrBuffer += chunk;
      onStderr?.(chunk);
    });

    child.on("error", (error) => {
      cleanup();
      reject(error);
    });

    child.on("close", (code) => {
      flushStdout();
      cleanup();

      if (code === 0) {
        resolve(events);
        return;
      }

      const error = new Error(stderrBuffer.trim() || `codex exited with code ${code}`) as CodexExecError;
      error.code = code;
      error.stderr = stderrBuffer;
      reject(error);
    });
  });
}
