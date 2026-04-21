import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import os from "node:os";
import path from "node:path";

const DEFAULT_CODEX_ROOT = path.join(os.homedir(), ".codex");
const DEFAULT_SESSION_INDEX_PATH = path.join(DEFAULT_CODEX_ROOT, "session_index.jsonl");
const DEFAULT_SESSIONS_ROOT = path.join(DEFAULT_CODEX_ROOT, "sessions");
const DEFAULT_ARCHIVED_ROOT = path.join(DEFAULT_CODEX_ROOT, "archived_sessions");
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 1000;

export type CodexSessionSummary = {
  sessionId: string;
  threadName: string | null;
  updatedAt: number | null;
  cwd: string | null;
  model: string | null;
  source: string | null;
  cliVersion: string | null;
  lastMessagePreview: string | null;
  transcriptPath: string | null;
};

export type CodexSessionEvent = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number | null;
  phase: string | null;
  rawType: string;
};

export type CodexSessionDetail = CodexSessionSummary & {
  events: CodexSessionEvent[];
};

type SessionIndexEntry = {
  id: string;
  threadName: string | null;
  updatedAt: number | null;
};

type TranscriptMetadata = {
  cwd: string | null;
  model: string | null;
  source: string | null;
  cliVersion: string | null;
  lastMessagePreview: string | null;
};

type ListCodexSessionsOptions = {
  limit?: number | null;
  sessionIds?: string[] | null;
  sessionIndexPath?: string;
  sessionsRoot?: string;
  archivedRoot?: string;
};

type CodexSessionLookupOptions = Omit<ListCodexSessionsOptions, "limit">;

type UnindexedCodexSession = {
  sessionId: string;
  threadName: string;
  transcriptPath: string;
};

function truncatePreview(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function parseString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampLimit(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(value), MAX_LIMIT);
}

function parseJsonLine(rawLine: string): Record<string, unknown> | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseResponseItemMessageText(payload: Record<string, unknown>) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const text = content
    .flatMap((part) => {
      if (!part || typeof part !== "object") return [];
      const typedPart = part as Record<string, unknown>;
      const value = parseString(typedPart.text);
      return value ? [value] : [];
    })
    .join("\n\n")
    .trim();

  return text.length > 0 ? text : null;
}

function parseResponseItemMessages(raw: string): CodexSessionEvent[] {
  const events: CodexSessionEvent[] = [];

  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    const record = parseJsonLine(line);
    if (!record || record.type !== "response_item") continue;

    const payload = record.payload;
    if (!payload || typeof payload !== "object") continue;

    const typed = payload as Record<string, unknown>;
    if (typed.type !== "message") continue;

    const role = parseString(typed.role);
    if (role !== "user" && role !== "assistant") continue;

    const text = parseResponseItemMessageText(typed);
    if (!text) continue;

    events.push({
      id: `response:${index}:${role}`,
      role,
      text,
      timestamp: parseTimestamp(record.timestamp),
      phase: parseString(typed.phase),
      rawType: "message",
    });
  }

  return events;
}

export function parseCodexSessionIndex(raw: string): SessionIndexEntry[] {
  return raw
    .split(/\r?\n/)
    .map(parseJsonLine)
    .flatMap((record) => {
      if (!record) return [];

      const id = parseString(record.id);
      if (!id) return [];

      return [
        {
          id,
          threadName: parseString(record.thread_name),
          updatedAt: parseTimestamp(record.updated_at),
        },
      ];
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export async function listCodexSessionIndexSummaries(
  options: Pick<ListCodexSessionsOptions, "limit" | "sessionIndexPath"> = {},
): Promise<CodexSessionSummary[]> {
  const limit = clampLimit(options.limit);
  const sessionIndexPath = options.sessionIndexPath ?? DEFAULT_SESSION_INDEX_PATH;
  const raw = await fs.readFile(sessionIndexPath, "utf8");

  return parseCodexSessionIndex(raw)
    .slice(0, limit)
    .map((entry) => ({
      sessionId: entry.id,
      threadName: entry.threadName,
      updatedAt: entry.updatedAt,
      cwd: null,
      model: null,
      source: null,
      cliVersion: null,
      lastMessagePreview: null,
      transcriptPath: null,
    }));
}

export function parseCodexTranscriptMetadata(raw: string): TranscriptMetadata {
  const metadata: TranscriptMetadata = {
    cwd: null,
    model: null,
    source: null,
    cliVersion: null,
    lastMessagePreview: null,
  };

  const responseItemMessages = parseResponseItemMessages(raw);
  const latestResponseMessage = responseItemMessages.at(-1);
  const hasResponsePreview = Boolean(latestResponseMessage);
  if (latestResponseMessage) {
    metadata.lastMessagePreview = truncatePreview(latestResponseMessage.text);
  }

  for (const line of raw.split(/\r?\n/)) {
    const record = parseJsonLine(line);
    if (!record) continue;

    if (record.type === "session_meta") {
      const payload = record.payload;
      if (payload && typeof payload === "object") {
        const typed = payload as Record<string, unknown>;
        metadata.cwd = parseString(typed.cwd) ?? metadata.cwd;
        metadata.source =
          parseString(typed.source) ??
          parseString(typed.originator) ??
          metadata.source;
        metadata.cliVersion = parseString(typed.cli_version) ?? metadata.cliVersion;
        metadata.model = parseString(typed.model) ?? metadata.model;
      }
      continue;
    }

    if (record.type === "turn_context") {
      const payload = record.payload;
      if (payload && typeof payload === "object") {
        const typed = payload as Record<string, unknown>;
        metadata.cwd = parseString(typed.cwd) ?? metadata.cwd;
        metadata.model = parseString(typed.model) ?? metadata.model;
      }
      continue;
    }

    if (hasResponsePreview && record.type !== "session_meta" && record.type !== "turn_context") {
      continue;
    }

    if (record.type !== "event_msg") continue;

    const payload = record.payload;
    if (!payload || typeof payload !== "object") continue;

    const typed = payload as Record<string, unknown>;
    const payloadType = parseString(typed.type);
    if (payloadType !== "user_message" && payloadType !== "agent_message" && payloadType !== "task_complete") {
      continue;
    }

    const message =
      parseString(typed.message) ??
      parseString(typed.last_agent_message);

    if (message) {
      metadata.lastMessagePreview = truncatePreview(message);
    }
  }

  return metadata;
}

export function parseCodexTranscriptEvents(raw: string): CodexSessionEvent[] {
  const responseItemMessages = parseResponseItemMessages(raw);
  if (responseItemMessages.length > 0) {
    return responseItemMessages;
  }

  const events: CodexSessionEvent[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const record = parseJsonLine(line);
    if (!record || record.type !== "event_msg") continue;

    const payload = record.payload;
    if (!payload || typeof payload !== "object") continue;

    const typed = payload as Record<string, unknown>;
    const payloadType = parseString(typed.type);
    const message = parseString(typed.message);

    if (payloadType === "user_message" && message) {
      events.push({
        id: `${events.length}:user`,
        role: "user",
        text: message,
        timestamp: parseTimestamp(record.timestamp),
        phase: null,
        rawType: payloadType,
      });
      continue;
    }

    if (payloadType === "agent_message" && message) {
      events.push({
        id: `${events.length}:assistant`,
        role: "assistant",
        text: message,
        timestamp: parseTimestamp(record.timestamp),
        phase: parseString(typed.phase),
        rawType: payloadType,
      });
    }
  }

  return events;
}

function parseFirstUserMessage(raw: string): string | null {
  for (const line of raw.split(/\r?\n/)) {
    const record = parseJsonLine(line);
    if (!record || record.type !== "event_msg") continue;

    const payload = record.payload;
    if (!payload || typeof payload !== "object") continue;

    const typed = payload as Record<string, unknown>;
    if (typed.type !== "user_message") continue;

    const message = parseString(typed.message);
    if (message) return message;
  }

  return null;
}

function buildThreadName(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "Untitled Codex session";
  return normalized.length > 72 ? `${normalized.slice(0, 71)}…` : normalized;
}

function extractSessionIdFromTranscriptFile(entry: string) {
  const match = entry.match(/([0-9a-f]{8}-[0-9a-f-]{27})\.jsonl$/i);
  return match?.[1] ?? null;
}

async function readDailyTranscriptFiles(directoryPath: string) {
  try {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => path.join(directoryPath, entry.name));
  } catch {
    return [];
  }
}

async function findTranscriptFileInDirectory(directoryPath: string, sessionId: string) {
  try {
    const entries = await fs.readdir(directoryPath);
    const match = entries.find((entry) => entry.includes(sessionId) && entry.endsWith(".jsonl"));
    return match ? path.join(directoryPath, match) : null;
  } catch {
    return null;
  }
}

function buildNearbyTranscriptDirectories(updatedAt: number | null, sessionsRoot: string, radiusDays = 7) {
  if (!updatedAt) return [];

  const updatedDate = new Date(updatedAt);
  if (Number.isNaN(updatedDate.getTime())) {
    return [];
  }

  const offsets = [0];
  for (let distance = 1; distance <= radiusDays; distance += 1) {
    offsets.push(-distance, distance);
  }

  const directories = new Set<string>();
  for (const offset of offsets) {
    const day = new Date(updatedDate);
    day.setUTCDate(day.getUTCDate() + offset);
    directories.add(
      path.join(
        sessionsRoot,
        String(day.getUTCFullYear()),
        String(day.getUTCMonth() + 1).padStart(2, "0"),
        String(day.getUTCDate()).padStart(2, "0"),
      ),
    );
  }

  return [...directories];
}

async function findTranscriptPathByWalk(sessionId: string, rootPath: string): Promise<string | null> {
  const queue = [rootPath];

  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) continue;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(currentPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const matchingFile = entries.find((entry) => entry.isFile() && entry.name.includes(sessionId) && entry.name.endsWith(".jsonl"));
    if (matchingFile) {
      return path.join(currentPath, matchingFile.name);
    }

    const childDirectories = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
      .reverse()
      .map((directoryName) => path.join(currentPath, directoryName));

    queue.unshift(...childDirectories);
  }

  return null;
}

export async function listUnindexedCodexSessions(
  options: CodexSessionLookupOptions & { limit?: number; lookbackDays?: number } = {},
): Promise<UnindexedCodexSession[]> {
  const limit = clampLimit(options.limit);
  const lookbackDays = Math.max(1, Math.min(options.lookbackDays ?? 2, 7));
  const sessionIndexPath = options.sessionIndexPath ?? DEFAULT_SESSION_INDEX_PATH;
  const sessionsRoot = options.sessionsRoot ?? DEFAULT_SESSIONS_ROOT;

  const rawIndex = await fs.readFile(sessionIndexPath, "utf8");
  const indexedSessionIds = new Set(parseCodexSessionIndex(rawIndex).map((entry) => entry.id));

  const candidatePaths: string[] = [];
  for (let offset = 0; offset < lookbackDays; offset += 1) {
    const day = new Date();
    day.setUTCDate(day.getUTCDate() - offset);
    const directoryPath = path.join(
      sessionsRoot,
      String(day.getUTCFullYear()),
      String(day.getUTCMonth() + 1).padStart(2, "0"),
      String(day.getUTCDate()).padStart(2, "0"),
    );
    candidatePaths.push(...(await readDailyTranscriptFiles(directoryPath)));
  }

  const recentPaths = candidatePaths.sort().reverse();
  const results: UnindexedCodexSession[] = [];

  for (const transcriptPath of recentPaths) {
    if (results.length >= limit) break;

    const sessionId = extractSessionIdFromTranscriptFile(path.basename(transcriptPath));
    if (!sessionId || indexedSessionIds.has(sessionId)) continue;

    const rawTranscript = await fs.readFile(transcriptPath, "utf8");
    const firstUserMessage = parseFirstUserMessage(rawTranscript);
    if (!firstUserMessage) continue;

    results.push({
      sessionId,
      threadName: buildThreadName(firstUserMessage),
      transcriptPath,
    });
  }

  return results;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findTranscriptPath(
  sessionId: string,
  updatedAt: number | null,
  sessionsRoot: string,
  archivedRoot: string,
): Promise<string | null> {
  for (const dailyDir of buildNearbyTranscriptDirectories(updatedAt, sessionsRoot)) {
    const match = await findTranscriptFileInDirectory(dailyDir, sessionId);
    if (match) {
      return match;
    }
  }

  try {
    const archivedEntries = await fs.readdir(archivedRoot);
    const archivedMatch = archivedEntries.find((entry) => entry.includes(sessionId) && entry.endsWith(".jsonl"));
    if (archivedMatch) return path.join(archivedRoot, archivedMatch);
  } catch {
    // Archived sessions are optional.
  }

  return findTranscriptPathByWalk(sessionId, sessionsRoot);
}

async function enrichSessionEntry(
  entry: SessionIndexEntry,
  sessionsRoot: string,
  archivedRoot: string,
): Promise<CodexSessionSummary> {
  const transcriptPath = await findTranscriptPath(entry.id, entry.updatedAt, sessionsRoot, archivedRoot);
  if (!transcriptPath || !(await fileExists(transcriptPath))) {
    return {
      sessionId: entry.id,
      threadName: entry.threadName,
      updatedAt: entry.updatedAt,
      cwd: null,
      model: null,
      source: null,
      cliVersion: null,
      lastMessagePreview: null,
      transcriptPath: null,
    };
  }

  const rawTranscript = await fs.readFile(transcriptPath, "utf8");
  const metadata = parseCodexTranscriptMetadata(rawTranscript);

  return {
    sessionId: entry.id,
    threadName: entry.threadName,
    updatedAt: entry.updatedAt ?? null,
    cwd: metadata.cwd,
    model: metadata.model,
    source: metadata.source,
    cliVersion: metadata.cliVersion,
    lastMessagePreview: metadata.lastMessagePreview,
    transcriptPath,
  };
}

export async function listCodexSessions(options: ListCodexSessionsOptions = {}): Promise<CodexSessionSummary[]> {
  const limit = clampLimit(options.limit);
  const sessionIndexPath = options.sessionIndexPath ?? DEFAULT_SESSION_INDEX_PATH;
  const sessionsRoot = options.sessionsRoot ?? DEFAULT_SESSIONS_ROOT;
  const archivedRoot = options.archivedRoot ?? DEFAULT_ARCHIVED_ROOT;
  const requestedIds = new Set(
    (options.sessionIds ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

  const raw = await fs.readFile(sessionIndexPath, "utf8");
  const parsedEntries = parseCodexSessionIndex(raw);
  const entries = requestedIds.size > 0
    ? parsedEntries.filter((entry) => requestedIds.has(entry.id)).slice(0, limit)
    : parsedEntries.slice(0, limit);

  return Promise.all(entries.map((entry) => enrichSessionEntry(entry, sessionsRoot, archivedRoot)));
}

export async function getCodexSessionDetail(
  sessionId: string,
  options: CodexSessionLookupOptions = {},
): Promise<CodexSessionDetail> {
  const sessionIndexPath = options.sessionIndexPath ?? DEFAULT_SESSION_INDEX_PATH;
  const sessionsRoot = options.sessionsRoot ?? DEFAULT_SESSIONS_ROOT;
  const archivedRoot = options.archivedRoot ?? DEFAULT_ARCHIVED_ROOT;

  const rawIndex = await fs.readFile(sessionIndexPath, "utf8");
  const entry = parseCodexSessionIndex(rawIndex).find((item) => item.id === sessionId) ?? {
    id: sessionId,
    threadName: null,
    updatedAt: Date.now(),
  };

  const transcriptPath = await findTranscriptPath(entry.id, entry.updatedAt, sessionsRoot, archivedRoot);
  if (!transcriptPath || !(await fileExists(transcriptPath))) {
    throw new Error(`Codex session ${sessionId} not found`);
  }

  const rawTranscript = await fs.readFile(transcriptPath, "utf8");
  const metadata = parseCodexTranscriptMetadata(rawTranscript);
  const events = parseCodexTranscriptEvents(rawTranscript);
  const latestEvent = events.at(-1)?.timestamp ?? null;
  const updatedAt = entry.updatedAt ?? latestEvent ?? null;

  return {
    sessionId: entry.id,
    threadName: entry.threadName,
    updatedAt,
    cwd: metadata.cwd,
    model: metadata.model,
    source: metadata.source,
    cliVersion: metadata.cliVersion,
    lastMessagePreview: metadata.lastMessagePreview,
    transcriptPath,
    events,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitForCodexSessionDetail(
  sessionId: string,
  options: CodexSessionLookupOptions & { attempts?: number; delayMs?: number } = {},
): Promise<CodexSessionDetail> {
  const attempts = options.attempts ?? 5;
  const delayMs = options.delayMs ?? 200;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await getCodexSessionDetail(sessionId, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(delayMs);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Codex session ${sessionId} not found`);
}
