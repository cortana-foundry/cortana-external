"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Clock3,
  FolderTree,
  Loader2,
  MessageSquareText,
  Plus,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatInt } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

type CodexSession = {
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

type CodexSessionGroup = {
  id: string;
  label: string;
  rootPath: string;
  isActive: boolean;
  isCollapsed: boolean;
  sessions: CodexSession[];
};

type CodexSessionEvent = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number | null;
  phase: string | null;
  rawType: string;
};

type CodexSessionDetail = CodexSession & {
  events: CodexSessionEvent[];
};

type CodexSessionPagination = {
  totalEvents: number;
  loadedEvents: number;
  hasMore: boolean;
  nextBefore: number | null;
  rangeStart: number;
  rangeEnd: number;
};

type StreamingCodexEvent = {
  id: string;
  role: "assistant";
  text: string;
};

type CodexSessionsResponse = {
  sessions: CodexSession[];
  groups: CodexSessionGroup[];
  latestUpdatedAt: number | null;
  totalMatchedSessions: number;
  totalVisibleSessions: number;
  error?: string;
};
type CodexSessionDetailResponse = {
  session?: CodexSessionDetail;
  pagination?: CodexSessionPagination;
  error?: string;
};
type CodexRunStartResponse = { streamId?: string; error?: string };

type CodexStreamEnvelope = {
  event: string;
  data: unknown;
};

const CODEX_RECONCILE_INTERVAL_MS = 4_000;
const DEFAULT_CODEX_EVENT_PAGE_SIZE = 60;
const TRANSCRIPT_SCROLL_TOP_FETCH_THRESHOLD_PX = 72;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parseCodexSseChunk(rawChunk: string): CodexStreamEnvelope | null {
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

function getCodexStreamError(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const error = data.error;
  if (typeof error === "string" && error.trim().length > 0) return error;
  const message = data.message;
  if (typeof message === "string" && message.trim().length > 0) return message;
  return null;
}

function getCodexStreamSession(data: unknown): CodexSessionDetail | null {
  if (!isRecord(data)) return null;
  const session = data.session;
  return isRecord(session) ? (session as CodexSessionDetail) : null;
}

function getLifecycleSessionId(data: unknown): string | null {
  if (!isRecord(data)) return null;
  const sessionId = data.codexSessionId;
  return typeof sessionId === "string" && sessionId.trim().length > 0 ? sessionId : null;
}

function getStreamedAssistantDelta(data: unknown): { id: string; text: string } | null {
  if (!isRecord(data) || data.type !== "item.delta") return null;
  const item = data.item;
  if (!isRecord(item) || item.type !== "agent_message") return null;

  const id = item.id;
  const delta = item.delta;
  if (typeof id !== "string" || id.trim().length === 0) return null;
  if (typeof delta !== "string" || delta.length === 0) return null;

  return { id, text: delta };
}

function getStreamedAssistantCompletion(data: unknown): { id: string; text: string } | null {
  if (!isRecord(data) || data.type !== "item.completed") return null;
  const item = data.item;
  if (!isRecord(item) || item.type !== "agent_message") return null;

  const id = item.id;
  const text = item.text;
  if (typeof id !== "string" || id.trim().length === 0) return null;
  if (typeof text !== "string" || text.trim().length === 0) return null;

  return { id, text };
}

function getStreamedThreadId(data: unknown): string | null {
  if (!isRecord(data) || data.type !== "thread.started") return null;
  const threadId = data.thread_id;
  return typeof threadId === "string" && threadId.trim().length > 0 ? threadId : null;
}

function formatTimestamp(value: number | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Unknown";
}

function formatRelativeTimestamp(value: number | null | undefined) {
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

function getCodexSessionTitle(session: Pick<CodexSession, "threadName" | "sessionId"> | null | undefined) {
  return session?.threadName?.trim() || "Untitled Codex session";
}

function getProvisionalThreadName(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return "Starting new Codex thread";
  return normalized.length > 72 ? `${normalized.slice(0, 71)}…` : normalized;
}

function formatCompactPath(value: string | null | undefined, keepSegments = 3) {
  if (!value) return "Unavailable";

  const normalized = value.trim();
  if (!normalized) return "Unavailable";

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= keepSegments) return normalized;

  return `.../${parts.slice(-keepSegments).join("/")}`;
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
    }
  );
}

function mergeOlderCodexSessionEvents(
  existingEvents: CodexSessionEvent[],
  olderEvents: CodexSessionEvent[],
) {
  const byId = new Set(existingEvents.map((event) => event.id));
  return [
    ...olderEvents.filter((event) => !byId.has(event.id)),
    ...existingEvents,
  ];
}

export default function SessionsPage() {
  const transcriptViewportRef = useRef<HTMLDivElement | null>(null);
  const transcriptScrollActionRef = useRef<"bottom" | "preserve" | null>(null);
  const transcriptPrependAnchorRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const [codexSessions, setCodexSessions] = useState<CodexSession[]>([]);
  const [codexSessionGroups, setCodexSessionGroups] = useState<CodexSessionGroup[]>([]);
  const [codexVisibleTotal, setCodexVisibleTotal] = useState(0);
  const [codexMatchedTotal, setCodexMatchedTotal] = useState(0);
  const [codexLatestUpdatedAt, setCodexLatestUpdatedAt] = useState<number | null>(null);
  const [selectedCodexSessionId, setSelectedCodexSessionId] = useState<string | null>(null);
  const [selectedCodexSession, setSelectedCodexSession] = useState<CodexSessionDetail | null>(null);
  const [selectedCodexPagination, setSelectedCodexPagination] = useState<CodexSessionPagination | null>(null);
  const [provisionalCodexSession, setProvisionalCodexSession] = useState<CodexSession | null>(null);
  const [streamedAssistantEvents, setStreamedAssistantEvents] = useState<StreamingCodexEvent[]>([]);
  const [pendingCodexUserEvent, setPendingCodexUserEvent] = useState<CodexSessionEvent | null>(null);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [codexDetailLoading, setCodexDetailLoading] = useState(false);
  const [codexOlderLoading, setCodexOlderLoading] = useState(false);
  const [newCodexPrompt, setNewCodexPrompt] = useState("");
  const [replyPrompt, setReplyPrompt] = useState("");
  const [codexMutationPending, setCodexMutationPending] = useState<"create" | "reply" | null>(null);
  const [codexMutationError, setCodexMutationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchCodexSessions() {
    const response = await fetch("/api/codex/sessions", { cache: "no-store" });
    const payload = (await response.json()) as CodexSessionsResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load Codex sessions");
    }

    return payload;
  }

  async function loadCodexSessionDetail(
    sessionId: string,
    options: { background?: boolean; before?: number | null; appendMode?: "replace" | "prepend" } = {},
  ) {
    const appendMode = options.appendMode ?? "replace";
    const query = new URLSearchParams({
      limit: String(DEFAULT_CODEX_EVENT_PAGE_SIZE),
    });
    if (options.before != null) {
      query.set("before", String(options.before));
    }

    if (appendMode === "prepend") {
      setCodexOlderLoading(true);
    } else if (!options.background) {
      setCodexDetailLoading(true);
    }

    try {
      const response = await fetch(`/api/codex/sessions/${sessionId}?${query.toString()}`, { cache: "no-store" });
      const payload = (await response.json()) as CodexSessionDetailResponse;

      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "Failed to load Codex transcript");
      }

      if (appendMode === "prepend") {
        startTransition(() => {
          setSelectedCodexSession((current) => {
            if (!current) return payload.session ?? null;
            return {
              ...payload.session!,
              events: mergeOlderCodexSessionEvents(current.events, payload.session!.events),
            };
          });
          setSelectedCodexPagination(payload.pagination ?? null);
        });
      } else {
        transcriptScrollActionRef.current = "bottom";
        setSelectedCodexSession(payload.session);
        setSelectedCodexPagination(payload.pagination ?? null);
      }
      setCodexMutationError(null);
    } catch (err) {
      if (appendMode === "replace") {
        setSelectedCodexSession(null);
        setSelectedCodexPagination(null);
      } else {
        transcriptPrependAnchorRef.current = null;
        transcriptScrollActionRef.current = null;
      }
      setCodexMutationError(err instanceof Error ? err.message : "Failed to load Codex transcript");
    } finally {
      if (appendMode === "prepend") {
        setCodexOlderLoading(false);
      } else if (!options.background) {
        setCodexDetailLoading(false);
      }
    }
  }

  async function refreshCodexSessions(
    preferredSessionId?: string | null,
    fallbackSession?: CodexSession | null,
  ) {
    const payload = await fetchCodexSessions();
    const sessions = mergeCodexSessions(payload.sessions ?? [], fallbackSession);
    setCodexSessions(sessions);
    setCodexSessionGroups(payload.groups ?? []);
    setCodexVisibleTotal(payload.totalVisibleSessions ?? sessions.length);
    setCodexMatchedTotal(payload.totalMatchedSessions ?? sessions.length);
    setCodexLatestUpdatedAt(payload.latestUpdatedAt ?? null);
    setCodexError(null);

    const nextSelected =
      preferredSessionId && sessions.some((session) => session.sessionId === preferredSessionId)
        ? preferredSessionId
        : sessions[0]?.sessionId ?? preferredSessionId ?? null;

    setSelectedCodexSessionId(nextSelected);
    return { sessions, selectedSessionId: nextSelected };
  }

  async function consumeCodexStream(
    response: Response,
    onDone: (session: CodexSessionDetail) => Promise<void>,
    options?: {
      onThreadStarted?: (threadId: string) => void;
    },
  ) {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Codex stream response did not include a body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let completed = false;

    const handleChunk = async (rawChunk: string) => {
      const envelope = parseCodexSseChunk(rawChunk);
      if (!envelope) return;

      if (envelope.event === "codex_event") {
        const threadId = getStreamedThreadId(envelope.data);
        if (threadId) {
          options?.onThreadStarted?.(threadId);
        }

        const delta = getStreamedAssistantDelta(envelope.data);
        if (delta) {
          setStreamedAssistantEvents((events) =>
            mergeStreamedAssistantEvents(
              events,
              {
                id: delta.id,
                role: "assistant",
                text: delta.text,
              },
              "append",
            ),
          );
          return;
        }

        const completion = getStreamedAssistantCompletion(envelope.data);
        if (completion) {
          setStreamedAssistantEvents((events) =>
            mergeStreamedAssistantEvents(
              events,
              {
                id: completion.id,
                role: "assistant",
                text: completion.text,
              },
              "replace",
            ),
          );
        }
        return;
      }

      if (envelope.event === "lifecycle") {
        const threadId = getLifecycleSessionId(envelope.data);
        if (threadId) {
          options?.onThreadStarted?.(threadId);
        }
        return;
      }

      if (envelope.event === "error") {
        throw new Error(getCodexStreamError(envelope.data) ?? "Codex stream failed");
      }

      if (envelope.event === "done") {
        const session = getCodexStreamSession(envelope.data);
        if (!session) {
          throw new Error("Codex stream completed without session detail");
        }

        completed = true;
        await onDone(session);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let boundaryIndex = buffer.indexOf("\n\n");
      while (boundaryIndex !== -1) {
        const rawChunk = buffer.slice(0, boundaryIndex);
        buffer = buffer.slice(boundaryIndex + 2);
        await handleChunk(rawChunk);
        boundaryIndex = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      await handleChunk(buffer);
    }

    if (!completed) {
      throw new Error("Codex stream ended before the session finished");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const codexResult = await fetchCodexSessions()
        .then((value) => ({ status: "fulfilled" as const, value }))
        .catch((reason) => ({ status: "rejected" as const, reason }));

      if (cancelled) return;

      if (codexResult.status === "fulfilled") {
        try {
          setCodexSessions(codexResult.value.sessions ?? []);
          setCodexSessionGroups(codexResult.value.groups ?? []);
          setCodexVisibleTotal(codexResult.value.totalVisibleSessions ?? codexResult.value.sessions.length ?? 0);
          setCodexMatchedTotal(codexResult.value.totalMatchedSessions ?? codexResult.value.sessions.length ?? 0);
          setCodexLatestUpdatedAt(codexResult.value.latestUpdatedAt ?? null);
          setSelectedCodexSessionId(codexResult.value.sessions[0]?.sessionId ?? null);
        } catch (err) {
          setCodexError(err instanceof Error ? err.message : "Failed to load Codex sessions");
        }
      } else {
        setCodexError(codexResult.reason instanceof Error ? codexResult.reason.message : "Failed to load Codex sessions");
      }

      if (!cancelled) {
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCodexSessionId) {
      setSelectedCodexSession(null);
      setSelectedCodexPagination(null);
      setPendingCodexUserEvent(null);
      setStreamedAssistantEvents([]);
      return;
    }

    setPendingCodexUserEvent(null);
    setStreamedAssistantEvents([]);
    setSelectedCodexPagination(null);
    void loadCodexSessionDetail(selectedCodexSessionId);
  }, [selectedCodexSessionId]);

  useEffect(() => {
    if (loading || codexMutationPending) {
      return;
    }

    let cancelled = false;

    const runReconciliation = async () => {
      if (cancelled || document.visibilityState === "hidden") {
        return;
      }

      try {
        const previousSelectedSessionId = selectedCodexSessionId;
        const { selectedSessionId } = await refreshCodexSessions(previousSelectedSessionId);
        if (cancelled) return;

        if (previousSelectedSessionId && previousSelectedSessionId !== selectedSessionId) {
          setSelectedCodexSession(null);
          setPendingCodexUserEvent(null);
          setStreamedAssistantEvents([]);
          setCodexMutationError("Selected Codex thread was archived or removed outside Mission Control.");
          return;
        }

      } catch (err) {
        if (!cancelled) {
          setCodexError(err instanceof Error ? err.message : "Failed to reconcile Codex sessions");
        }
      }
    };

    const intervalId = window.setInterval(() => {
      void runReconciliation();
    }, CODEX_RECONCILE_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runReconciliation();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loading, codexMutationPending, selectedCodexSessionId]);

  async function loadOlderCodexEvents() {
    if (!selectedCodexSessionId || !selectedCodexPagination?.hasMore || selectedCodexPagination.nextBefore == null) {
      return;
    }

    const viewport = transcriptViewportRef.current;
    if (viewport) {
      transcriptPrependAnchorRef.current = {
        scrollHeight: viewport.scrollHeight,
        scrollTop: viewport.scrollTop,
      };
      transcriptScrollActionRef.current = "preserve";
    }

    await loadCodexSessionDetail(selectedCodexSessionId, {
      background: true,
      before: selectedCodexPagination.nextBefore,
      appendMode: "prepend",
    });
  }

  useEffect(() => {
    const viewport = transcriptViewportRef.current;
    if (!viewport) return;

    const handleScroll = () => {
      if (
        viewport.scrollTop <= TRANSCRIPT_SCROLL_TOP_FETCH_THRESHOLD_PX
        && selectedCodexPagination?.hasMore
        && !codexOlderLoading
        && !codexDetailLoading
        && !codexMutationPending
      ) {
        void loadOlderCodexEvents();
      }
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
    };
  }, [selectedCodexPagination?.hasMore, codexOlderLoading, codexDetailLoading, codexMutationPending, selectedCodexSessionId]);

  useEffect(() => {
    const viewport = transcriptViewportRef.current;
    if (!viewport) return;

    if (transcriptScrollActionRef.current === "preserve") {
      const anchor = transcriptPrependAnchorRef.current;
      transcriptPrependAnchorRef.current = null;
      transcriptScrollActionRef.current = null;
      if (anchor) {
        viewport.scrollTop = viewport.scrollHeight - anchor.scrollHeight + anchor.scrollTop;
      }
      return;
    }

    if (transcriptScrollActionRef.current === "bottom") {
      transcriptScrollActionRef.current = null;
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [
    selectedCodexSessionId,
    selectedCodexSession?.events.length,
    streamedAssistantEvents.length,
    pendingCodexUserEvent?.id,
  ]);

  const visibleCodexSessions = useMemo(
    () => mergeCodexSessions(codexSessions, provisionalCodexSession),
    [codexSessions, provisionalCodexSession],
  );
  const codexSummary = useMemo(() => summarizeCodexSessions(visibleCodexSessions), [visibleCodexSessions]);
  const activeCodexThreadId = selectedCodexSessionId ?? provisionalCodexSession?.sessionId ?? null;
  const hasCodexTranscriptContent =
    Boolean(selectedCodexSession) ||
    Boolean(provisionalCodexSession) ||
    Boolean(pendingCodexUserEvent) ||
    streamedAssistantEvents.length > 0;
  const activeCodexSummary =
    activeCodexThreadId
      ? visibleCodexSessions.find((session) => session.sessionId === activeCodexThreadId) ?? null
      : provisionalCodexSession;
  const activeCodexSession = selectedCodexSession ?? activeCodexSummary ?? provisionalCodexSession;
  const activeCodexTitle =
    selectedCodexSession?.threadName ??
    activeCodexSummary?.threadName ??
    (codexMutationPending === "create" ? "Starting new Codex thread" : "Codex workspace");
  const topStats = [
    {
      label: "Threads",
      value: formatInt(codexVisibleTotal || visibleCodexSessions.length),
      detail: `${formatInt(codexSessionGroups.length)} project groups`,
    },
    {
      label: "With context",
      value: formatInt(codexSummary.withCwd),
      detail: "resolved cwd",
    },
    {
      label: "With preview",
      value: formatInt(codexSummary.withPreview),
      detail: "preview ready",
    },
    {
      label: "Last update",
      value: formatRelativeTimestamp(codexLatestUpdatedAt ?? codexSummary.latestUpdatedAt),
      detail: "desktop state",
    },
  ];
  const activeCodexMessageCount = formatInt(
    selectedCodexPagination?.totalEvents ?? selectedCodexSession?.events.length ?? 0,
  );

  async function handleCreateCodexSession() {
    const prompt = newCodexPrompt.trim();
    if (!prompt) return;

    transcriptScrollActionRef.current = "bottom";
    setCodexMutationPending("create");
    setCodexMutationError(null);
    setSelectedCodexSessionId(null);
    setSelectedCodexSession(null);
    setSelectedCodexPagination(null);
    setProvisionalCodexSession(null);
    setPendingCodexUserEvent({
      id: `pending-create-${Date.now()}`,
      role: "user",
      text: prompt,
      timestamp: Date.now(),
      phase: "submitted",
      rawType: "user.pending",
    });
    setStreamedAssistantEvents([]);
    try {
      const startResponse = await fetch("/api/codex/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt, workspaceKey: "repo-root" }),
      });

      const startPayload = (await startResponse.json()) as CodexRunStartResponse;
      if (!startResponse.ok || !startPayload.streamId) {
        const payload = startPayload as CodexSessionDetailResponse & CodexRunStartResponse;
        throw new Error(payload.error ?? "Failed to create Codex session");
      }

      const response = await fetch(`/api/codex/streams/${startPayload.streamId}`, {
        headers: {
          Accept: "text/event-stream",
        },
      });

      if (!response.ok) {
        const payload = (await response.json()) as CodexRunStartResponse;
        throw new Error(payload.error ?? "Failed to attach to Codex stream");
      }

      await consumeCodexStream(
        response,
        async (session) => {
          transcriptScrollActionRef.current = "bottom";
          const { selectedSessionId } = await refreshCodexSessions(session.sessionId, session);
          setProvisionalCodexSession(null);
          setSelectedCodexSessionId(selectedSessionId ?? session.sessionId);
          setSelectedCodexSession(session);
          setSelectedCodexPagination({
            totalEvents: session.events.length,
            loadedEvents: session.events.length,
            hasMore: false,
            nextBefore: null,
            rangeStart: 0,
            rangeEnd: session.events.length,
          });
          setPendingCodexUserEvent(null);
          setStreamedAssistantEvents([]);
        },
        {
          onThreadStarted: (threadId) => {
            setProvisionalCodexSession((current) => {
              if (current?.sessionId === threadId) return current;
              return {
                sessionId: threadId,
                threadName: getProvisionalThreadName(prompt),
                updatedAt: Date.now(),
                cwd: null,
                model: null,
                source: "exec",
                cliVersion: null,
                lastMessagePreview: prompt,
                transcriptPath: null,
              };
            });
          },
        },
      );
      setNewCodexPrompt("");
    } catch (err) {
      setProvisionalCodexSession(null);
      setPendingCodexUserEvent(null);
      setStreamedAssistantEvents([]);
      setCodexMutationError(err instanceof Error ? err.message : "Failed to create Codex session");
    } finally {
      setCodexMutationPending(null);
    }
  }

  async function handleReplyToCodexSession() {
    if (!selectedCodexSessionId) return;
    const prompt = replyPrompt.trim();
    if (!prompt) return;

    transcriptScrollActionRef.current = "bottom";
    setCodexMutationPending("reply");
    setCodexMutationError(null);
    setStreamedAssistantEvents([]);
    setSelectedCodexSession((current) => {
      if (!current) return current;
      return {
        ...current,
        events: [
          ...current.events,
          {
            id: `pending-reply-${Date.now()}`,
            role: "user",
            text: prompt,
            timestamp: Date.now(),
            phase: "submitted",
            rawType: "user.pending",
          },
        ],
      };
    });
    try {
      const startResponse = await fetch(`/api/codex/sessions/${selectedCodexSessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      const startPayload = (await startResponse.json()) as CodexRunStartResponse;
      if (!startResponse.ok || !startPayload.streamId) {
        const payload = startPayload as CodexSessionDetailResponse & CodexRunStartResponse;
        throw new Error(payload.error ?? "Failed to send message to Codex session");
      }

      const response = await fetch(`/api/codex/streams/${startPayload.streamId}`, {
        headers: {
          Accept: "text/event-stream",
        },
      });

      if (!response.ok) {
        const payload = (await response.json()) as CodexRunStartResponse;
        throw new Error(payload.error ?? "Failed to attach to Codex stream");
      }

      await consumeCodexStream(response, async (session) => {
        transcriptScrollActionRef.current = "bottom";
        await refreshCodexSessions(session.sessionId, session);
        setSelectedCodexSession(session);
        setSelectedCodexPagination({
          totalEvents: session.events.length,
          loadedEvents: session.events.length,
          hasMore: false,
          nextBefore: null,
          rangeStart: 0,
          rangeEnd: session.events.length,
        });
        setStreamedAssistantEvents([]);
      });
      setReplyPrompt("");
    } catch (err) {
      void loadCodexSessionDetail(selectedCodexSessionId);
      setStreamedAssistantEvents([]);
      setCodexMutationError(err instanceof Error ? err.message : "Failed to send message to Codex session");
    } finally {
      setCodexMutationPending(null);
    }
  }

  return (
    <div className="space-y-5 pb-6">
      <section className="relative overflow-hidden rounded-[32px] border border-border/60 bg-[linear-gradient(145deg,rgba(15,23,42,0.06),rgba(15,23,42,0.018)_42%,rgba(255,255,255,0.96)_100%)]">
        <div className="absolute inset-y-0 right-0 hidden w-[34rem] bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_55%)] lg:block" />
        <div className="relative space-y-8 px-5 py-6 md:px-7 md:py-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 backdrop-blur">
                  <TerminalSquare className="h-3.5 w-3.5" />
                  Mission Control
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5 backdrop-blur">
                  Shared via <code>~/.codex</code>
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-700 dark:text-emerald-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  {codexMutationPending ? "Turn in progress" : "Idle and ready"}
                </span>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  Shared Codex workspace
                </p>
                <div className="space-y-2">
                  <h1 className="text-4xl font-semibold tracking-[-0.04em] text-foreground md:text-5xl">
                    Codex sessions
                  </h1>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                    Review live threads, continue the same local session state, and inspect the machine context without
                    leaving Mission Control.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2 xl:max-w-3xl xl:grid-cols-4">
              {topStats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[24px] border border-border/60 bg-background/72 px-4 py-4 backdrop-blur transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {item.label}
                  </p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-foreground">{item.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 border-t border-border/60 pt-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.9fr)]">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Selected thread</p>
              <div className="space-y-2">
                <p className="text-xl font-semibold tracking-tight text-foreground">
                  {activeCodexSession ? getCodexSessionTitle(activeCodexSession) : "Choose a thread or start one"}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {activeCodexSession?.cwd
                    ? formatCompactPath(activeCodexSession.cwd, 4)
                    : "Mission Control stays attached to the local Codex store and mirrors the desktop session list."}
                </p>
              </div>
            </div>

            <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2">
              <div className="space-y-1 rounded-[22px] border border-border/60 bg-background/72 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Transcript</p>
                <p className="text-base font-medium text-foreground">{activeCodexMessageCount} saved messages</p>
              </div>
              <div className="space-y-1 rounded-[22px] border border-border/60 bg-background/72 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Freshness</p>
                <p className="text-base font-medium text-foreground">
                  {formatRelativeTimestamp(activeCodexSession?.updatedAt ?? codexLatestUpdatedAt)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {loading ? <p className="text-sm text-muted-foreground">Loading Codex sessions…</p> : null}

      {!loading ? (
        <div className="space-y-4">
          {codexError ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {codexError}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[32px] border border-border/60 bg-background/96 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div className="grid gap-0 xl:h-[calc(100svh-15.5rem)] xl:min-h-[44rem] xl:grid-cols-[20rem_minmax(0,1fr)] 2xl:grid-cols-[20rem_minmax(0,1fr)_19rem]">
              <aside className="overflow-y-auto border-b border-border/60 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(248,250,252,0.6))] xl:border-r xl:border-b-0">
                <div className="space-y-6 p-4 md:p-5">
                  <section className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        Start thread
                      </p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Launch a new Codex thread against this machine’s shared state.
                      </p>
                    </div>

                    <div className="rounded-[28px] border border-border/60 bg-background/92 p-4 shadow-sm">
                      <Textarea
                        value={newCodexPrompt}
                        onChange={(event) => setNewCodexPrompt(event.target.value)}
                        placeholder="Outline the task, repo, or question"
                        className="min-h-[140px] resize-none border-0 bg-transparent px-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                      />
                      <div className="mt-4 flex flex-col gap-3">
                        <p className="text-xs text-muted-foreground">
                          Mission Control will create the thread and attach to the same local Codex session.
                        </p>
                        <Button
                          onClick={() => void handleCreateCodexSession()}
                          disabled={codexMutationPending === "create" || !newCodexPrompt.trim()}
                          className="h-11 w-full justify-between rounded-2xl bg-foreground px-4 text-background transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
                        >
                          <span>{codexMutationPending === "create" ? "Starting thread…" : "Start Codex thread"}</span>
                          {codexMutationPending === "create" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Project threads</p>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {formatInt(codexVisibleTotal || visibleCodexSessions.length)} visible across {formatInt(codexSessionGroups.length)} projects.
                        {" "}
                        Latest sync {formatRelativeTimestamp(codexLatestUpdatedAt ?? codexSummary.latestUpdatedAt)}.
                      </p>
                      {codexMatchedTotal > (codexVisibleTotal || visibleCodexSessions.length) ? (
                        <p className="text-xs text-muted-foreground">
                          Showing the same project-oriented surface as the desktop Codex list.
                        </p>
                      ) : null}
                    </div>

                    {!codexError && visibleCodexSessions.length === 0 ? (
                      <div className="rounded-[22px] border border-dashed border-border/60 bg-background/70 p-4 text-sm text-muted-foreground">
                        No Codex sessions found.
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {provisionalCodexSession ? (
                          <div className="space-y-2">
                            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                              Starting now
                            </p>
                            <button
                              type="button"
                              onClick={() =>
                                provisionalCodexSession.sessionId && setSelectedCodexSessionId(provisionalCodexSession.sessionId)
                              }
                              className="w-full rounded-[24px] border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-4 text-left transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 space-y-2">
                                  <p className="truncate text-sm font-semibold text-foreground">
                                    {getCodexSessionTitle(provisionalCodexSession)}
                                  </p>
                                  <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                                    {provisionalCodexSession.lastMessagePreview ?? "Waiting for Codex to register the new thread."}
                                  </p>
                                </div>
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/20 bg-background/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  live
                                </span>
                              </div>
                            </button>
                          </div>
                        ) : null}

                        {codexSessionGroups.map((group) => (
                          <div key={group.id} className="space-y-3">
                            <div className="flex items-start justify-between gap-3 px-1">
                              <div className="min-w-0 space-y-1">
                                <p className="truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                                  {group.label}
                                </p>
                                <p className="truncate text-xs text-muted-foreground" title={group.rootPath}>
                                  {group.rootPath}
                                </p>
                              </div>
                              {group.isActive ? (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                                  active
                                </span>
                              ) : null}
                            </div>

                            <div className="space-y-2">
                              {group.sessions.map((session) => {
                                const selected = session.sessionId === activeCodexThreadId;
                                return (
                                  <button
                                    key={session.sessionId}
                                    type="button"
                                    onClick={() => setSelectedCodexSessionId(session.sessionId)}
                                    className={cn(
                                      "w-full rounded-[24px] border px-4 py-4 text-left transition-all duration-200 motion-safe:hover:-translate-y-0.5",
                                      selected
                                        ? "border-foreground/15 bg-background shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
                                        : "border-transparent bg-transparent hover:border-border/60 hover:bg-background/72",
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0 space-y-2">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                          {getCodexSessionTitle(session)}
                                        </p>
                                        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                                          {session.lastMessagePreview ?? "No transcript preview available yet."}
                                        </p>
                                      </div>
                                      <span className="shrink-0 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                                        {session.model ?? "unknown"}
                                      </span>
                                    </div>

                                    <div className="mt-4 flex flex-col gap-2 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                                      <span className="truncate" title={session.cwd ?? undefined}>
                                        {session.cwd ? formatCompactPath(session.cwd, 3) : "cwd unavailable"}
                                      </span>
                                      <span className="shrink-0">{formatRelativeTimestamp(session.updatedAt)}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </aside>

              <section className="flex min-h-0 flex-col bg-[linear-gradient(180deg,rgba(248,250,252,0.42),rgba(255,255,255,0.96))] xl:border-b-0 2xl:border-r 2xl:border-border/60">
                <div className="border-b border-border/60 bg-background/90 px-5 py-5 backdrop-blur md:px-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {codexMutationPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
                          {codexMutationPending ? "Streaming" : "Shared thread"}
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          <Clock3 className="h-3 w-3" />
                          {formatRelativeTimestamp(activeCodexSession?.updatedAt ?? null)}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-foreground md:text-[2rem]">
                          {activeCodexTitle}
                        </h2>
                        <p className="max-w-3xl break-words text-sm leading-6 text-muted-foreground">
                          {activeCodexSession?.cwd
                            ? activeCodexSession.cwd
                            : "Select a thread to inspect the transcript and continue the same session."}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[18rem]">
                      <div className="rounded-[22px] border border-border/60 bg-background/75 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Messages</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">{activeCodexMessageCount}</p>
                      </div>
                      <div className="rounded-[22px] border border-border/60 bg-background/75 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Model</p>
                        <p className="mt-2 truncate text-lg font-semibold text-foreground">
                          {activeCodexSession?.model ?? "Unknown"}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-border/60 bg-background/75 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">State</p>
                        <p className="mt-2 text-lg font-semibold text-foreground">
                          {codexMutationPending ? "Live" : activeCodexSession ? "Attached" : "Waiting"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  ref={transcriptViewportRef}
                  className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6 md:py-6"
                >
                  <div className="mx-auto flex max-w-4xl flex-col gap-4 pb-6">
                    {selectedCodexSession && (codexOlderLoading || selectedCodexPagination?.hasMore) ? (
                      <div className="sticky top-3 z-10 flex justify-center px-2">
                        <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border/60 bg-background/95 px-4 py-1.5 text-xs text-muted-foreground shadow-sm backdrop-blur">
                          {codexOlderLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MessageSquareText className="h-3.5 w-3.5" />
                          )}
                          <span className="truncate">
                            {codexOlderLoading ? "Loading earlier messages…" : "Scroll up to load earlier messages"}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {codexDetailLoading ? (
                      <div className="rounded-[24px] border border-border/60 bg-background/90 px-4 py-3 text-sm text-muted-foreground">
                        Loading Codex transcript…
                      </div>
                    ) : null}

                    {!codexDetailLoading && !hasCodexTranscriptContent ? (
                      <div className="flex min-h-[42svh] items-center justify-center">
                        <div className="max-w-lg rounded-[30px] border border-dashed border-border/60 bg-background/90 px-6 py-10 text-center">
                          <p className="text-sm font-semibold text-foreground">No active transcript selected</p>
                          <p className="mt-3 text-sm leading-6 text-muted-foreground">
                            Choose a thread from the left rail or start one above. The transcript will stay aligned with
                            the same local Codex session on this machine.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {!codexDetailLoading &&
                    selectedCodexSession &&
                    selectedCodexSession.events.length === 0 &&
                    !pendingCodexUserEvent &&
                    streamedAssistantEvents.length === 0 ? (
                      <div className="rounded-[24px] border border-dashed border-border/60 bg-background/90 px-4 py-3 text-sm text-muted-foreground">
                        No transcript messages parsed yet.
                      </div>
                    ) : null}

                    {pendingCodexUserEvent ? (
                      <div className="ml-auto w-full max-w-[44rem] rounded-[28px] rounded-br-md bg-foreground px-5 py-4 text-background shadow-[0_20px_45px_rgba(15,23,42,0.24)]">
                        <div className="flex flex-col gap-2 border-b border-white/10 pb-3 text-[11px] uppercase tracking-[0.18em] text-background/70 sm:flex-row sm:items-center sm:justify-between">
                          <span>You</span>
                          <span>Queued now</span>
                        </div>
                        <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7">{pendingCodexUserEvent.text}</p>
                      </div>
                    ) : null}

                    {selectedCodexSession?.events.map((event) => (
                      <div
                        key={event.id}
                        className={cn(
                          "w-full max-w-[44rem] rounded-[28px] px-5 py-4 transition-transform duration-200 motion-safe:hover:-translate-y-0.5",
                          event.role === "assistant"
                            ? "rounded-bl-md border border-border/60 bg-background/96 shadow-[0_16px_36px_rgba(15,23,42,0.06)]"
                            : "ml-auto rounded-br-md bg-foreground text-background shadow-[0_20px_45px_rgba(15,23,42,0.2)]",
                        )}
                      >
                        <div
                          className={cn(
                            "flex flex-col gap-2 border-b pb-3 text-[11px] uppercase tracking-[0.18em] sm:flex-row sm:items-center sm:justify-between",
                            event.role === "assistant"
                              ? "border-border/70 text-muted-foreground"
                              : "border-white/10 text-background/70",
                          )}
                        >
                          <span>{event.role === "assistant" ? "Codex" : "You"}</span>
                          <span className="break-words sm:text-right">{formatTimestamp(event.timestamp)}</span>
                        </div>
                        <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7">{event.text}</p>
                      </div>
                    ))}

                    {streamedAssistantEvents.map((event) => (
                      <div
                        key={event.id}
                        className="w-full max-w-[44rem] rounded-[28px] rounded-bl-md border border-emerald-500/20 bg-emerald-500/[0.07] px-5 py-4 shadow-[0_16px_36px_rgba(16,185,129,0.12)]"
                      >
                        <div className="flex flex-col gap-2 border-b border-emerald-500/15 pb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Codex
                          </span>
                          <span>{codexMutationPending ? "Streaming…" : "Pending refresh"}</span>
                        </div>
                        <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7">{event.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-border/60 bg-background/92 px-4 py-4 backdrop-blur md:px-6">
                  {codexMutationError ? (
                    <div className="mb-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {codexMutationError}
                    </div>
                  ) : null}

                    <div className="rounded-[28px] border border-border/60 bg-background/96 p-4 shadow-sm">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {selectedCodexSessionId ? "Reply" : "Reply disabled"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {selectedCodexSessionId
                            ? "Send the next message into this shared Codex thread."
                            : "Select a thread from the left rail before sending a reply."}
                        </p>
                      </div>

                    <div className="mt-4 space-y-4">
                        <Textarea
                          value={replyPrompt}
                          onChange={(event) => setReplyPrompt(event.target.value)}
                          placeholder={
                            selectedCodexSessionId
                              ? "Type your next message"
                              : "Pick a thread from the left rail before sending a reply"
                          }
                          disabled={!selectedCodexSessionId || codexMutationPending === "reply"}
                        className="min-h-[124px] resize-none border-0 bg-transparent px-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                      />

                      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <p className="max-w-xl text-xs leading-5 text-muted-foreground">
                          Messages sent here continue the same local Codex session id and stay visible in the shared
                          `.codex` history.
                        </p>
                        <Button
                          onClick={() => void handleReplyToCodexSession()}
                          disabled={!selectedCodexSessionId || !replyPrompt.trim() || codexMutationPending === "reply"}
                          className="h-11 rounded-2xl px-5 transition-transform duration-200 motion-safe:hover:-translate-y-0.5"
                        >
                          {codexMutationPending === "reply" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {codexMutationPending === "reply" ? "Sending…" : "Send message"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <aside className="overflow-y-auto border-t border-border/60 bg-[linear-gradient(180deg,rgba(248,250,252,0.72),rgba(255,255,255,0.98))] xl:col-span-2 2xl:col-span-1 2xl:border-t-0 2xl:border-l">
                <div className="space-y-6 p-4 md:p-5">
                  <section className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Inspector</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Session state, machine context, and metadata stay visible here while the transcript remains the
                      primary surface.
                    </p>
                  </section>

                  <section className="rounded-[28px] border border-border/60 bg-background/82 p-4">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">State</p>
                        <p className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                          {codexMutationPending
                            ? "Turn executing"
                            : activeCodexSession
                              ? "Attached to selected thread"
                              : "Waiting for thread selection"}
                        </p>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-1">
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Model</p>
                          <p className="text-sm leading-6 text-foreground">{activeCodexSession?.model ?? "Unknown"}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Updated</p>
                          <p className="text-sm leading-6 text-foreground">{formatTimestamp(activeCodexSession?.updatedAt ?? null)}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-border/60 bg-background/82 p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      <FolderTree className="h-3.5 w-3.5" />
                      Working context
                    </div>
                    <div className="mt-4 space-y-4">
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Cwd</p>
                        <p className="break-words text-sm leading-6 text-foreground">{activeCodexSession?.cwd ?? "Unavailable"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Session id</p>
                        <p className="break-words text-sm leading-6 text-foreground">
                          {activeCodexSession?.sessionId ?? "No thread selected"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Transcript path</p>
                        <p className="break-words text-sm leading-6 text-foreground">
                          {activeCodexSession?.transcriptPath ?? "Resolved from the local Codex store on demand"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">CLI version</p>
                        <p className="text-sm leading-6 text-foreground">{activeCodexSession?.cliVersion ?? "Unknown"}</p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[28px] border border-border/60 bg-background/82 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Provider snapshot</p>
                    <div className="mt-4 space-y-3">
                      <div className="flex items-start justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">Codex latest</span>
                        <span className="max-w-[11rem] text-right leading-6 text-foreground">
                          {formatTimestamp(codexSummary.latestUpdatedAt)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">With cwd</span>
                        <span className="text-foreground">{formatInt(codexSummary.withCwd)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">With preview</span>
                        <span className="text-foreground">{formatInt(codexSummary.withPreview)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">Visible threads</span>
                        <span className="text-foreground">{formatInt(codexVisibleTotal || visibleCodexSessions.length)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-muted-foreground">Project groups</span>
                        <span className="text-foreground">{formatInt(codexSessionGroups.length)}</span>
                      </div>
                    </div>
                  </section>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && visibleCodexSessions.length === 0 && !codexError ? (
        <p className="text-sm text-muted-foreground">No session activity found yet.</p>
      ) : null}
    </div>
  );
}
