"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MetadataAccordion } from "./_components/metadata-accordion";
import { NewThreadEmptyState } from "./_components/new-thread-empty-state";
import { ReaderHeader } from "./_components/reader-header";
import { ReplyComposer } from "./_components/reply-composer";
import { SessionHeader } from "./_components/session-header";
import { StatusStrip } from "./_components/status-strip";
import { ThreadInbox } from "./_components/thread-inbox";
import { ThreadPalette } from "./_components/thread-palette";
import { Transcript } from "./_components/transcript";
import { useKeyboardShortcuts } from "./_components/use-keyboard-shortcuts";
import { useMediaQuery } from "./_components/use-media-query";
import { useMCCreatedSessions } from "./_components/use-mc-created-sessions";
import { useThreadReadState } from "./_components/use-thread-read-state";
import {
  getCodexSessionTitle,
  getCodexStreamError,
  getCodexStreamSession,
  getProvisionalThreadName,
  getStreamedAssistantCompletion,
  getStreamedAssistantDelta,
  getStreamedThreadId,
  mergeCodexSessions,
  mergeStreamedAssistantEvents,
  parseCodexSseChunk,
  summarizeCodexSessions,
  CODEX_RECONCILE_INTERVAL_MS,
} from "./_components/stream-helpers";
import type {
  CodexSession,
  CodexSessionDetail,
  CodexSessionDetailResponse,
  CodexSessionEvent,
  CodexSessionGroup,
  CodexSessionsResponse,
  StreamingCodexEvent,
} from "./_components/types";

export {
  mergeCodexSessions,
  mergeStreamedAssistantEvents,
  summarizeCodexSessions,
} from "./_components/stream-helpers";

export default function SessionsPage() {
  const [codexSessions, setCodexSessions] = useState<CodexSession[]>([]);
  const [codexSessionGroups, setCodexSessionGroups] = useState<CodexSessionGroup[]>([]);
  const [codexVisibleTotal, setCodexVisibleTotal] = useState(0);
  const [codexMatchedTotal, setCodexMatchedTotal] = useState(0);
  const [codexLatestUpdatedAt, setCodexLatestUpdatedAt] = useState<number | null>(null);
  const [selectedCodexSessionId, setSelectedCodexSessionId] = useState<string | null>(null);
  const [selectedCodexSession, setSelectedCodexSession] = useState<CodexSessionDetail | null>(null);
  const [provisionalCodexSession, setProvisionalCodexSession] = useState<CodexSession | null>(null);
  const [streamedAssistantEvents, setStreamedAssistantEvents] = useState<StreamingCodexEvent[]>([]);
  const [pendingCodexUserEvent, setPendingCodexUserEvent] = useState<CodexSessionEvent | null>(null);
  const [codexError, setCodexError] = useState<string | null>(null);
  const [codexDetailLoading, setCodexDetailLoading] = useState(false);
  const [newCodexPrompt, setNewCodexPrompt] = useState("");
  const [replyPrompt, setReplyPrompt] = useState("");
  const [codexMutationPending, setCodexMutationPending] = useState<"create" | "reply" | null>(null);
  const [codexMutationError, setCodexMutationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [replyTextareaEl, setReplyTextareaEl] = useState<HTMLTextAreaElement | null>(null);
  const [mobileInboxOpen, setMobileInboxOpen] = useState(false);
  const [composingNew, setComposingNew] = useState(false);
  const [threadQuery, setThreadQuery] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const isDesktop = useMediaQuery("(min-width: 988px)");
  const prefersHover = useMediaQuery("(hover: hover)");

  const { isUnread, markSeen } = useThreadReadState();
  const { ids: mcCreatedSessionIds, register: registerMCCreatedSession } = useMCCreatedSessions();

  async function fetchCodexSessions(options: { reconcile?: boolean } = {}) {
    const params = new URLSearchParams();
    if (mcCreatedSessionIds.length > 0) {
      params.set("includeIds", mcCreatedSessionIds.join(","));
    }
    if (options.reconcile) {
      params.set("reconcile", "1");
    }

    const query = params.toString();
    const url = query.length > 0 ? `/api/codex/sessions?${query}` : "/api/codex/sessions";
    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json()) as CodexSessionsResponse;

    if (!response.ok) {
      throw new Error(payload.error ?? "Failed to load Codex sessions");
    }

    return payload;
  }

  async function loadCodexSessionDetail(
    sessionId: string,
    options: { background?: boolean } = {},
  ) {
    if (!options.background) {
      setCodexDetailLoading(true);
    }

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
      if (!options.background) {
        setCodexDetailLoading(false);
      }
    }
  }

  async function refreshCodexSessions(
    preferredSessionId?: string | null,
    fallbackSession?: CodexSession | null,
    options: { reconcile?: boolean } = {},
  ) {
    const payload = await fetchCodexSessions(options);
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
      const codexResult = await fetchCodexSessions({ reconcile: true })
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
      setPendingCodexUserEvent(null);
      setStreamedAssistantEvents([]);
      return;
    }

    setPendingCodexUserEvent(null);
    setStreamedAssistantEvents([]);
    void loadCodexSessionDetail(selectedCodexSessionId);
  }, [selectedCodexSessionId]);

  useEffect(() => {
    if (loading || codexMutationPending) {
      return;
    }

    let cancelled = false;

    const runReconciliation = async (options: { reconcile?: boolean } = {}) => {
      if (cancelled || document.visibilityState === "hidden") {
        return;
      }

      try {
        const previousSelectedSessionId = selectedCodexSessionId;
        const { selectedSessionId } = await refreshCodexSessions(previousSelectedSessionId, undefined, options);
        if (cancelled) return;

        if (previousSelectedSessionId && previousSelectedSessionId !== selectedSessionId) {
          setSelectedCodexSession(null);
          setPendingCodexUserEvent(null);
          setStreamedAssistantEvents([]);
          setCodexMutationError("Selected Codex thread was archived or removed outside Mission Control.");
          return;
        }

        if (selectedSessionId) {
          await loadCodexSessionDetail(selectedSessionId, { background: true });
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
        void runReconciliation({ reconcile: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loading, codexMutationPending, selectedCodexSessionId]);

  const visibleCodexSessions = useMemo(
    () => mergeCodexSessions(codexSessions, provisionalCodexSession),
    [codexSessions, provisionalCodexSession],
  );
  const codexSummary = useMemo(() => summarizeCodexSessions(visibleCodexSessions), [visibleCodexSessions]);
  const activeCodexThreadId = selectedCodexSessionId ?? provisionalCodexSession?.sessionId ?? null;
  const activeCodexSummary =
    activeCodexThreadId
      ? visibleCodexSessions.find((session) => session.sessionId === activeCodexThreadId) ?? null
      : provisionalCodexSession;
  const activeCodexSession = selectedCodexSession ?? activeCodexSummary ?? provisionalCodexSession;
  const activeCodexTitle =
    selectedCodexSession?.threadName ??
    activeCodexSummary?.threadName ??
    (codexMutationPending === "create" ? "Starting new Codex thread" : "Codex workspace");

  async function handleCreateCodexSession() {
    const prompt = newCodexPrompt.trim();
    if (!prompt) return;

    setCodexMutationPending("create");
    setCodexMutationError(null);
    setSelectedCodexSessionId(null);
    setSelectedCodexSession(null);
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

      await consumeCodexStream(
        response,
        async (session) => {
          registerMCCreatedSession(session.sessionId);
          const { selectedSessionId } = await refreshCodexSessions(session.sessionId, session);
          setProvisionalCodexSession(null);
          setSelectedCodexSessionId(selectedSessionId ?? session.sessionId);
          setSelectedCodexSession(session);
          setPendingCodexUserEvent(null);
          setStreamedAssistantEvents([]);
          setComposingNew(false);
          setNewCodexPrompt("");
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

    setCodexMutationPending("reply");
    setCodexMutationError(null);
    setReplyPrompt("");
    setStreamedAssistantEvents([]);
    setPendingCodexUserEvent({
      id: `pending-reply-${Date.now()}`,
      role: "user",
      text: prompt,
      timestamp: Date.now(),
      phase: "submitted",
      rawType: "user.pending",
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
        await refreshCodexSessions(session.sessionId, session);
        setSelectedCodexSession(session);
        setPendingCodexUserEvent(null);
        setStreamedAssistantEvents([]);
      });
    } catch (err) {
      setReplyPrompt(prompt);
      setPendingCodexUserEvent(null);
      void loadCodexSessionDetail(selectedCodexSessionId);
      setStreamedAssistantEvents([]);
      setCodexMutationError(err instanceof Error ? err.message : "Failed to send message to Codex session");
    } finally {
      setCodexMutationPending(null);
    }
  }

  const focusComposer = useCallback(() => {
    if (replyTextareaEl) {
      replyTextareaEl.focus();
    }
  }, [replyTextareaEl]);

  const advanceThread = useCallback(
    (delta: number) => {
      const list = visibleCodexSessions;
      if (list.length === 0) return;
      const currentIndex = list.findIndex((session) => session.sessionId === activeCodexThreadId);
      const nextIndex =
        currentIndex === -1
          ? 0
          : Math.min(Math.max(currentIndex + delta, 0), list.length - 1);
      const next = list[nextIndex];
      if (next) setSelectedCodexSessionId(next.sessionId);
    },
    [visibleCodexSessions, activeCodexThreadId],
  );

  useKeyboardShortcuts({
    enabled: prefersHover,
    onFocusComposer: focusComposer,
    onNextThread: () => advanceThread(1),
    onPrevThread: () => advanceThread(-1),
    onOpenPalette: () => setPaletteOpen(true),
  });

  const workspacePath = codexSessionGroups[0]?.rootPath ?? "Local Codex workspace";

  const statusState = codexMutationPending
    ? "streaming"
    : codexError
      ? "error"
      : loading
        ? "offline"
        : "idle";

  const readerState = codexMutationPending ? "streaming" : codexError ? "error" : "idle";

  const activeRootPath =
    (activeCodexThreadId
      ? codexSessionGroups.find((group) =>
          group.sessions.some((session) => session.sessionId === activeCodexThreadId),
        )?.rootPath
      : undefined) ??
    activeCodexSession?.cwd ??
    null;

  const previewCount = codexSummary.withPreview;
  const latestTimestamp = codexLatestUpdatedAt ?? codexSummary.latestUpdatedAt;

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      setSelectedCodexSessionId(sessionId);
      setComposingNew(false);
      if (!isDesktop) {
        setMobileInboxOpen(false);
      }
      markSeen(sessionId);
    },
    [isDesktop, markSeen],
  );

  const handleStartNewThread = useCallback(() => {
    setComposingNew(true);
    setSelectedCodexSessionId(null);
    setSelectedCodexSession(null);
    setCodexMutationError(null);
    setMobileInboxOpen(false);
  }, []);

  const handleCancelNewThread = useCallback(() => {
    setComposingNew(false);
    setNewCodexPrompt("");
  }, []);

  const activeTitle = activeCodexSession
    ? getCodexSessionTitle(activeCodexSession)
    : activeCodexTitle;

  const inboxActionButton = (
    <Button
      type="button"
      onClick={handleStartNewThread}
      className="w-full justify-center gap-2"
      size="sm"
      aria-label="Start a new Codex thread"
    >
      <Plus className="h-4 w-4" />
      <span>New thread</span>
    </Button>
  );

  return (
    <div className="flex h-[calc(100svh-8rem)] min-[988px]:h-[calc(100svh-4rem)] flex-col gap-3 sm:gap-4">
      <SessionHeader mutationPending={codexMutationPending} />

      <StatusStrip
        workspacePath={workspacePath}
        threadCount={codexVisibleTotal || visibleCodexSessions.length}
        projectCount={codexSessionGroups.length}
        previewCount={previewCount}
        latestUpdatedAt={latestTimestamp}
        state={statusState}
      />

      {codexError ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {codexError}
        </div>
      ) : null}

      {codexMatchedTotal > (codexVisibleTotal || visibleCodexSessions.length) ? (
        <p className="text-xs text-muted-foreground">
          Filtered to the project-oriented Codex surface, excluding threads without resolved workspace context.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading Codex sessions…</p>
      ) : (
        <div className="relative grid min-h-0 flex-1 gap-3 min-[988px]:grid-cols-[22rem_minmax(0,1fr)] 2xl:grid-cols-[26rem_minmax(0,1fr)]">
          {isDesktop ? (
            <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-muted/[0.14]">
              <div className="border-b border-border/60 p-3">{inboxActionButton}</div>
              <ThreadInbox
                groups={codexSessionGroups}
                provisionalSession={provisionalCodexSession}
                activeSessionId={activeCodexThreadId}
                onSelectSession={handleSelectSession}
                density="comfortable"
                error={null}
                query={threadQuery}
                onQueryChange={setThreadQuery}
                isUnread={isUnread}
              />
            </aside>
          ) : null}

          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-background">
            {composingNew ? (
              <NewThreadEmptyState
                value={newCodexPrompt}
                onChange={setNewCodexPrompt}
                onSubmit={() => void handleCreateCodexSession()}
                onCancel={handleCancelNewThread}
                pending={codexMutationPending === "create"}
              />
            ) : (
              <>
                <ReaderHeader
                  title={activeTitle}
                  subtitle={activeCodexSession?.cwd ?? null}
                  state={readerState}
                  savedMessageCount={selectedCodexSession?.events.length ?? 0}
                  updatedAt={activeCodexSession?.updatedAt ?? null}
                  open={inspectorOpen}
                  onOpenChange={setInspectorOpen}
                  onOpenInbox={() => setMobileInboxOpen(true)}
                  showInboxToggle={!isDesktop}
                />
                <MetadataAccordion
                  open={inspectorOpen}
                  cwd={activeCodexSession?.cwd ?? null}
                  sessionId={activeCodexSession?.sessionId ?? null}
                  transcriptPath={activeCodexSession?.transcriptPath ?? null}
                  cliVersion={activeCodexSession?.cliVersion ?? null}
                  model={activeCodexSession?.model ?? null}
                  updatedAt={activeCodexSession?.updatedAt ?? null}
                />
                <div className="flex min-h-0 flex-1 flex-col 2xl:mx-auto 2xl:w-full 2xl:max-w-5xl">
                  <Transcript
                    detail={selectedCodexSession}
                    pendingUserEvent={pendingCodexUserEvent}
                    streamedAssistantEvents={streamedAssistantEvents}
                    loading={codexDetailLoading}
                    streaming={codexMutationPending !== null}
                    rootPath={activeRootPath}
                  />
                  <ReplyComposer
                    value={replyPrompt}
                    onChange={setReplyPrompt}
                    onSubmit={() => void handleReplyToCodexSession()}
                    pending={codexMutationPending === "reply"}
                    disabled={!selectedCodexSessionId}
                    error={codexMutationError}
                    onKeyboardRegister={setReplyTextareaEl}
                  />
                </div>
              </>
            )}
          </section>

          {!isDesktop && mobileInboxOpen ? (
            <div
              className="fixed inset-0 z-40 flex bg-foreground/30 backdrop-blur-sm min-[988px]:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Thread inbox"
              onClick={() => setMobileInboxOpen(false)}
            >
              <div
                className={cn(
                  "flex h-full w-[min(20rem,85vw)] flex-col overflow-hidden border-r border-border/60 bg-background shadow-xl",
                  "transition-transform",
                )}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Threads
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setMobileInboxOpen(false)}
                    aria-label="Close thread inbox"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="border-b border-border/60 p-3">{inboxActionButton}</div>
                <ThreadInbox
                  groups={codexSessionGroups}
                  provisionalSession={provisionalCodexSession}
                  activeSessionId={activeCodexThreadId}
                  onSelectSession={handleSelectSession}
                  density="compact"
                  error={null}
                  isUnread={isUnread}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}

      <ThreadPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        groups={codexSessionGroups}
        onSelectSession={handleSelectSession}
      />
    </div>
  );
}
