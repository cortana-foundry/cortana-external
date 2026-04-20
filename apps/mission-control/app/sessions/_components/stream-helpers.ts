import type {
  CodexSession,
  CodexSessionDetail,
  CodexStreamEnvelope,
  StreamingCodexEvent,
} from "./types";

export const CODEX_RECONCILE_INTERVAL_MS = 4_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function parseCodexSseChunk(rawChunk: string): CodexStreamEnvelope | null {
  const normalized = rawChunk.replace(/\r/g, "");
  const lines = normalized.split("\n");
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }

  if (dataLines.length === 0) return null;

  try {
    return {
      event,
      data: JSON.parse(dataLines.join("\n")),
    };
  } catch {
    return null;
  }
}

export function getCodexStreamError(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const error = data.error;
  if (typeof error === "string" && error.trim().length > 0) return error;
  const message = data.message;
  if (typeof message === "string" && message.trim().length > 0) return message;
  return null;
}

export function getCodexStreamSession(data: unknown): CodexSessionDetail | null {
  if (!isRecord(data)) return null;
  const session = data.session;
  return isRecord(session) ? (session as CodexSessionDetail) : null;
}

export function getStreamedAssistantDelta(data: unknown): { id: string; text: string } | null {
  if (!isRecord(data) || data.type !== "item.delta") return null;
  const item = data.item;
  if (!isRecord(item) || item.type !== "agent_message") return null;

  const id = item.id;
  const delta = item.delta;
  if (typeof id !== "string" || id.trim().length === 0) return null;
  if (typeof delta !== "string" || delta.length === 0) return null;

  return { id, text: delta };
}

export function getStreamedAssistantCompletion(data: unknown): { id: string; text: string } | null {
  if (!isRecord(data) || data.type !== "item.completed") return null;
  const item = data.item;
  if (!isRecord(item) || item.type !== "agent_message") return null;

  const id = item.id;
  const text = item.text;
  if (typeof id !== "string" || id.trim().length === 0) return null;
  if (typeof text !== "string" || text.trim().length === 0) return null;

  return { id, text };
}

export function getStreamedThreadId(data: unknown): string | null {
  if (!isRecord(data) || data.type !== "thread.started") return null;
  const threadId = data.thread_id;
  return typeof threadId === "string" && threadId.trim().length > 0 ? threadId : null;
}

export function formatTimestamp(value: number | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

export function formatRelativeTimestamp(value: number | null | undefined) {
  if (!value) return "Unknown";

  const diffMs = value - Date.now();
  const diffMinutes = Math.round(diffMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}

export function getCodexSessionTitle(
  session: Pick<CodexSession, "threadName" | "sessionId"> | null | undefined,
) {
  return session?.threadName?.trim() || "Untitled Codex session";
}

export function getProvisionalThreadName(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "Starting new Codex thread";
  return normalized.length > 72 ? `${normalized.slice(0, 71)}…` : normalized;
}

export function mergeCodexSessions(
  sessions: CodexSession[],
  fallbackSession: CodexSession | null | undefined,
) {
  if (!fallbackSession) return sessions;

  const existing = sessions.find((session) => session.sessionId === fallbackSession.sessionId);
  const merged = existing
    ? sessions.map((session) =>
        session.sessionId === fallbackSession.sessionId ? { ...session, ...fallbackSession } : session,
      )
    : [fallbackSession, ...sessions];

  return [...merged].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
}

export function mergeStreamedAssistantEvents(
  events: StreamingCodexEvent[],
  nextEvent: StreamingCodexEvent,
  mode: "append" | "replace",
) {
  const existing = events.find((event) => event.id === nextEvent.id);
  if (!existing) {
    return [...events, nextEvent];
  }

  return events.map((event) =>
    event.id === nextEvent.id
      ? {
          ...event,
          text: mode === "append" ? `${event.text}${nextEvent.text}` : nextEvent.text,
        }
      : event,
  );
}

export function summarizeCodexSessions(sessions: CodexSession[]) {
  return sessions.reduce(
    (acc, session) => {
      acc.total += 1;
      if (session.updatedAt && (!acc.latestUpdatedAt || session.updatedAt > acc.latestUpdatedAt)) {
        acc.latestUpdatedAt = session.updatedAt;
      }
      if (session.cwd) acc.withCwd += 1;
      if (session.lastMessagePreview) acc.withPreview += 1;
      return acc;
    },
    {
      total: 0,
      latestUpdatedAt: null as number | null,
      withCwd: 0,
      withPreview: 0,
    },
  );
}
