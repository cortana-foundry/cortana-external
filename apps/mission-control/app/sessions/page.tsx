"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatInt, formatCost } from "@/lib/format-utils";
import { cn } from "@/lib/utils";

type OpenClawSession = {
  key: string | null;
  sessionId: string | null;
  updatedAt: number | null;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  agentId: string | null;
  systemSent: boolean | null;
  abortedLastRun: boolean | null;
  estimatedCost: number;
};

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

type StreamingCodexEvent = {
  id: string;
  role: "assistant";
  text: string;
};

type OpenClawSessionsResponse = { sessions: OpenClawSession[]; error?: string };
type CodexSessionsResponse = { sessions: CodexSession[]; error?: string };
type CodexSessionDetailResponse = { session?: CodexSessionDetail; error?: string };

type CodexStreamEnvelope = {
  event: string;
  data: unknown;
};

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

function getStreamedAssistantText(data: unknown): string | null {
  if (!isRecord(data) || data.type !== "item.completed") return null;
  const item = data.item;
  if (!isRecord(item) || item.type !== "agent_message") return null;
  const text = item.text;
  return typeof text === "string" && text.trim().length > 0 ? text : null;
}

export function summarizeOpenClawSessions(sessions: OpenClawSession[]) {
  return sessions.reduce(
    (acc, session) => {
      acc.total += 1;
      acc.inputTokens += session.inputTokens ?? 0;
      acc.outputTokens += session.outputTokens ?? 0;
      acc.estimatedCost += session.estimatedCost ?? 0;
      acc.systemSent += session.systemSent ? 1 : 0;
      acc.aborted += session.abortedLastRun ? 1 : 0;

      if (session.updatedAt && (!acc.latestUpdatedAt || session.updatedAt > acc.latestUpdatedAt)) {
        acc.latestUpdatedAt = session.updatedAt;
      }

      return acc;
    },
    {
      total: 0,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      systemSent: 0,
      aborted: 0,
      latestUpdatedAt: null as number | null,
    }
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

export default function SessionsPage() {
  const [openClawSessions, setOpenClawSessions] = useState<OpenClawSession[]>([]);
  const [codexSessions, setCodexSessions] = useState<CodexSession[]>([]);
  const [selectedCodexSessionId, setSelectedCodexSessionId] = useState<string | null>(null);
  const [selectedCodexSession, setSelectedCodexSession] = useState<CodexSessionDetail | null>(null);
  const [streamedAssistantEvents, setStreamedAssistantEvents] = useState<StreamingCodexEvent[]>([]);
  const [pendingCodexUserEvent, setPendingCodexUserEvent] = useState<CodexSessionEvent | null>(null);
  const [openClawError, setOpenClawError] = useState<string | null>(null);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [codexDetailLoading, setCodexDetailLoading] = useState(false);
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

    return payload.sessions ?? [];
  }

  async function loadCodexSessionDetail(sessionId: string) {
    setCodexDetailLoading(true);
    try {
      const response = await fetch(`/api/codex/sessions/${sessionId}`, { cache: "no-store" });
      const payload = (await response.json()) as CodexSessionDetailResponse;

      if (!response.ok || !payload.session) {
        throw new Error(payload.error ?? "Failed to load Codex transcript");
      }

      setSelectedCodexSession(payload.session);
      setCodexMutationError(null);
    } catch (err) {
      setSelectedCodexSession(null);
      setCodexMutationError(err instanceof Error ? err.message : "Failed to load Codex transcript");
    } finally {
      setCodexDetailLoading(false);
    }
  }

  async function refreshCodexSessions(preferredSessionId?: string | null) {
    const sessions = await fetchCodexSessions();
    setCodexSessions(sessions);
    setCodexError(null);

    const nextSelected =
      preferredSessionId && sessions.some((session) => session.sessionId === preferredSessionId)
        ? preferredSessionId
        : sessions[0]?.sessionId ?? null;

    setSelectedCodexSessionId(nextSelected);
    return { sessions, selectedSessionId: nextSelected };
  }

  async function consumeCodexStream(
    response: Response,
    onDone: (session: CodexSessionDetail) => Promise<void>,
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
        const text = getStreamedAssistantText(envelope.data);
        if (text) {
          setStreamedAssistantEvents((events) => [
            ...events,
            {
              id: `stream-${Date.now()}-${events.length}`,
              role: "assistant",
              text,
            },
          ]);
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
      const [openClawResult, codexResult] = await Promise.allSettled([
        fetch("/api/sessions", { cache: "no-store" }),
        fetchCodexSessions(),
      ]);

      if (cancelled) return;

      if (openClawResult.status === "fulfilled") {
        try {
          const payload = (await openClawResult.value.json()) as OpenClawSessionsResponse;
          if (!openClawResult.value.ok) {
            throw new Error(payload.error ?? "Failed to load OpenClaw sessions");
          }
          setOpenClawSessions(payload.sessions ?? []);
        } catch (err) {
          setOpenClawError(err instanceof Error ? err.message : "Failed to load OpenClaw sessions");
        }
      } else {
        setOpenClawError(openClawResult.reason instanceof Error ? openClawResult.reason.message : "Failed to load OpenClaw sessions");
      }

      if (codexResult.status === "fulfilled") {
        try {
          setCodexSessions(codexResult.value);
          setSelectedCodexSessionId(codexResult.value[0]?.sessionId ?? null);
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
      setPendingCodexUserEvent(null);
      setStreamedAssistantEvents([]);
      return;
    }

    setPendingCodexUserEvent(null);
    setStreamedAssistantEvents([]);
    void loadCodexSessionDetail(selectedCodexSessionId);
  }, [selectedCodexSessionId]);

  const openClawSummary = useMemo(() => summarizeOpenClawSessions(openClawSessions), [openClawSessions]);
  const codexSummary = useMemo(() => summarizeCodexSessions(codexSessions), [codexSessions]);
  const hasData = openClawSessions.length > 0 || codexSessions.length > 0;
  const hasCodexTranscriptContent =
    Boolean(selectedCodexSession) || Boolean(pendingCodexUserEvent) || streamedAssistantEvents.length > 0;

  async function handleCreateCodexSession() {
    const prompt = newCodexPrompt.trim();
    if (!prompt) return;

    setCodexMutationPending("create");
    setCodexMutationError(null);
    setSelectedCodexSessionId(null);
    setSelectedCodexSession(null);
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
      const response = await fetch("/api/codex/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as CodexSessionDetailResponse;
        throw new Error(payload.error ?? "Failed to create Codex session");
      }

      await consumeCodexStream(response, async (session) => {
        const { selectedSessionId } = await refreshCodexSessions(session.sessionId);
        setSelectedCodexSession(session);
        setSelectedCodexSessionId(selectedSessionId);
        setPendingCodexUserEvent(null);
        setStreamedAssistantEvents([]);
      });
      setNewCodexPrompt("");
    } catch (err) {
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
      const response = await fetch(`/api/codex/sessions/${selectedCodexSessionId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as CodexSessionDetailResponse;
        throw new Error(payload.error ?? "Failed to send message to Codex session");
      }

      await consumeCodexStream(response, async (session) => {
        await refreshCodexSessions(session.sessionId);
        setSelectedCodexSession(session);
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sessions</h1>
        <p className="text-sm text-muted-foreground">
          Mission Control session hub for local Codex and OpenClaw activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Codex sessions</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInt(codexSummary.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">OpenClaw sessions</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInt(openClawSummary.total)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Input tokens</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInt(openClawSummary.inputTokens)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Output tokens</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatInt(openClawSummary.outputTokens)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Estimated cost</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{formatCost(openClawSummary.estimatedCost)}</CardContent>
        </Card>
      </div>

      {!loading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session providers</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Codex latest</p>
              <p className="text-sm font-medium">
                {codexSummary.latestUpdatedAt ? new Date(codexSummary.latestUpdatedAt).toLocaleString() : "N/A"}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Codex with cwd</p>
              <p className="text-xl font-semibold">{formatInt(codexSummary.withCwd)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Codex with preview</p>
              <p className="text-xl font-semibold">{formatInt(codexSummary.withPreview)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">OpenClaw system-started</p>
              <p className="text-xl font-semibold">{formatInt(openClawSummary.systemSent)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">OpenClaw aborted</p>
              <p className="text-xl font-semibold">{formatInt(openClawSummary.aborted)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">OpenClaw latest</p>
              <p className="text-sm font-medium">
                {openClawSummary.latestUpdatedAt ? new Date(openClawSummary.latestUpdatedAt).toLocaleString() : "N/A"}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading session providers…</p> : null}

      {!loading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="codex" className="space-y-4">
              <TabsList variant="line" className="w-full justify-start overflow-x-auto font-mono text-xs uppercase tracking-wide">
                <TabsTrigger value="codex">Codex</TabsTrigger>
                <TabsTrigger value="openclaw">OpenClaw</TabsTrigger>
              </TabsList>

              <TabsContent value="codex" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Mission Control reads the local Codex session store from <code>~/.codex</code> and can now start or resume a session through Codex CLI.
                </p>
                {codexError ? <p className="text-sm text-destructive">{codexError}</p> : null}
                <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
                  <div className="space-y-3">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Start new Codex session</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Textarea
                          value={newCodexPrompt}
                          onChange={(event) => setNewCodexPrompt(event.target.value)}
                          placeholder="Start a fresh Codex thread from Mission Control"
                        />
                        <Button
                          onClick={() => void handleCreateCodexSession()}
                          disabled={codexMutationPending === "create" || !newCodexPrompt.trim()}
                        >
                          {codexMutationPending === "create" ? "Starting…" : "Start Codex session"}
                        </Button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Recent Codex sessions</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {!codexError && codexSessions.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No Codex sessions found.</p>
                        ) : (
                          <div className="space-y-3">
                            {codexSessions.map((session) => (
                              <button
                                key={session.sessionId}
                                type="button"
                                onClick={() => setSelectedCodexSessionId(session.sessionId)}
                                className={cn(
                                  "w-full rounded-md border p-3 text-left transition-colors",
                                  session.sessionId === selectedCodexSessionId ? "border-foreground/40 bg-muted/50" : "hover:bg-muted/30",
                                )}
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-medium">{session.threadName ?? "Untitled Codex session"}</p>
                                  <p className="text-xs text-muted-foreground">{session.model ?? "unknown-model"}</p>
                                </div>
                                <p className="mt-1 break-all text-xs text-muted-foreground">{session.sessionId}</p>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {session.cwd ?? "cwd unavailable"} · {session.updatedAt ? new Date(session.updatedAt).toLocaleString() : "unknown update"}
                                </p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {session.lastMessagePreview ?? "No transcript preview available yet."}
                                </p>
                              </button>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-3">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">
                          {selectedCodexSession?.threadName ??
                            (codexMutationPending === "create" ? "Starting Codex session" : "Codex transcript")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {codexDetailLoading ? <p className="text-sm text-muted-foreground">Loading Codex transcript…</p> : null}
                        {!codexDetailLoading && !hasCodexTranscriptContent ? (
                          <p className="text-sm text-muted-foreground">Select a Codex session to inspect the transcript.</p>
                        ) : null}
                        {!codexDetailLoading &&
                        selectedCodexSession &&
                        selectedCodexSession.events.length === 0 &&
                        !pendingCodexUserEvent &&
                        streamedAssistantEvents.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No transcript messages parsed yet.</p>
                        ) : null}
                        {pendingCodexUserEvent ? (
                          <div className="rounded-md border bg-background p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">You</p>
                              <p className="text-xs text-muted-foreground">Queued now</p>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm">{pendingCodexUserEvent.text}</p>
                          </div>
                        ) : null}
                        {selectedCodexSession?.events.map((event) => (
                          <div
                            key={event.id}
                            className={cn(
                              "rounded-md border p-3",
                              event.role === "assistant" ? "bg-muted/40" : "bg-background",
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {event.role === "assistant" ? "Codex" : "You"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {event.timestamp ? new Date(event.timestamp).toLocaleString() : "Unknown time"}
                              </p>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm">{event.text}</p>
                          </div>
                        ))}
                        {streamedAssistantEvents.map((event) => (
                          <div key={event.id} className="rounded-md border bg-muted/40 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Codex</p>
                              <p className="text-xs text-muted-foreground">
                                {codexMutationPending ? "Streaming…" : "Pending refresh"}
                              </p>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap text-sm">{event.text}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Reply to selected Codex session</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {codexMutationError ? <p className="text-sm text-destructive">{codexMutationError}</p> : null}
                        <Textarea
                          value={replyPrompt}
                          onChange={(event) => setReplyPrompt(event.target.value)}
                          placeholder={selectedCodexSessionId ? "Send a message to the selected Codex session" : "Select a session first"}
                          disabled={!selectedCodexSessionId || codexMutationPending === "reply"}
                        />
                        <Button
                          onClick={() => void handleReplyToCodexSession()}
                          disabled={!selectedCodexSessionId || !replyPrompt.trim() || codexMutationPending === "reply"}
                        >
                          {codexMutationPending === "reply" ? "Sending…" : "Send to Codex session"}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="openclaw" className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Active OpenClaw sessions across agents, including token usage and estimated cost.
                </p>
                {openClawError ? <p className="text-sm text-destructive">{openClawError}</p> : null}
                {!openClawError && openClawSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active OpenClaw sessions found.</p>
                ) : (
                  <div className="space-y-3">
                    {openClawSessions.map((session, index) => (
                      <div key={session.key ?? session.sessionId ?? `session-${index}`} className="rounded-md border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{session.agentId ?? "unknown-agent"}</p>
                          <p className="text-xs text-muted-foreground">{session.model ?? "unknown-model"}</p>
                        </div>
                        <p className="mt-1 break-all text-xs text-muted-foreground">{session.sessionId ?? session.key ?? "no-session-id"}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatInt(session.totalTokens ?? 0)} tokens · {formatCost(session.estimatedCost ?? 0)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}

      {!loading && !hasData && !openClawError && !codexError ? (
        <p className="text-sm text-muted-foreground">No session activity found yet.</p>
      ) : null}
    </div>
  );
}
