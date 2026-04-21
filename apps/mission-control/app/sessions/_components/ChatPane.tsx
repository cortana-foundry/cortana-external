"use client";

import type { KeyboardEvent, ReactNode, RefObject } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Info,
  Loader2,
  MessageSquareText,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  CodexMutationKind,
  CodexSession,
  CodexSessionDetail,
  CodexSessionEvent,
  CodexSessionPagination,
  StreamingCodexEvent,
} from "./types";

type ChatPaneProps = {
  transcriptViewportRef: RefObject<HTMLDivElement | null>;
  activeCodexSession: CodexSession | CodexSessionDetail | null;
  activeCodexTitle: string;
  activeCodexMessageCount: string;
  codexMutationPending: CodexMutationKind | null;
  copiedSessionId: string | null;
  onCopySessionId: () => void;
  onArchiveCodexSession: () => void;
  onDeleteCodexSession: () => void;
  selectedCodexSession: CodexSessionDetail | null;
  selectedCodexSessionId: string | null;
  selectedCodexPagination: CodexSessionPagination | null;
  codexDetailLoading: boolean;
  codexOlderLoading: boolean;
  hasCodexTranscriptContent: boolean;
  pendingCodexUserEvent: CodexSessionEvent | null;
  streamedAssistantEvents: StreamingCodexEvent[];
  codexMutationError: string | null;
  replyPrompt: string;
  setReplyPrompt: (value: string) => void;
  onReplyToCodexSession: () => void;
  formatTimestamp: (value: number | null | undefined) => string;
  formatRelativeTimestamp: (value: number | null | undefined) => string;
  formatShortSessionId: (value: string | null | undefined) => string;
  onOpenInspector?: () => void;
  className?: string;
};

const COMPOSER_MAX_HEIGHT_PX = 192;
const COMPOSER_MIN_HEIGHT_PX = 40;
const SCROLL_JUMP_THRESHOLD_PX = 24;

type GroupableEvent = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number | null;
  streaming?: boolean;
  pending?: boolean;
};

type MessageGroup = {
  role: "user" | "assistant";
  events: GroupableEvent[];
};

function useAutosizeTextarea(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      const next = Math.min(Math.max(el.scrollHeight, COMPOSER_MIN_HEIGHT_PX), COMPOSER_MAX_HEIGHT_PX);
      el.style.height = `${next}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
    };
  }, [value]);

  return ref;
}

function isSendKeystroke(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.nativeEvent.isComposing) return false;
  if (event.key !== "Enter") return false;
  if (event.shiftKey) return false;
  return true;
}

function groupEvents(events: GroupableEvent[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && last.role === event.role) {
      last.events.push(event);
    } else {
      groups.push({ role: event.role, events: [event] });
    }
  }
  return groups;
}

export function ChatPane({
  transcriptViewportRef,
  activeCodexSession,
  activeCodexTitle,
  activeCodexMessageCount: _activeCodexMessageCount,
  codexMutationPending,
  copiedSessionId,
  onCopySessionId,
  onArchiveCodexSession,
  onDeleteCodexSession,
  selectedCodexSession,
  selectedCodexSessionId,
  selectedCodexPagination,
  codexDetailLoading,
  codexOlderLoading,
  hasCodexTranscriptContent,
  pendingCodexUserEvent,
  streamedAssistantEvents,
  codexMutationError,
  replyPrompt,
  setReplyPrompt,
  onReplyToCodexSession,
  formatTimestamp,
  formatRelativeTimestamp: _formatRelativeTimestamp,
  formatShortSessionId: _formatShortSessionId,
  onOpenInspector,
  className,
}: ChatPaneProps) {
  void _activeCodexMessageCount;
  void _formatRelativeTimestamp;
  void _formatShortSessionId;
  const replyTextareaRef = useAutosizeTextarea(replyPrompt);
  const replyDisabled =
    !selectedCodexSessionId || !replyPrompt.trim() || codexMutationPending === "reply";
  const replyPending = codexMutationPending === "reply";
  const streamingInProgress = codexMutationPending === "create" || codexMutationPending === "reply";
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    const viewport = transcriptViewportRef.current;
    if (!viewport) return;
    let idleTimer: number | undefined;
    const handleScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setShowJumpToLatest(distanceFromBottom > SCROLL_JUMP_THRESHOLD_PX);
      setIsScrolling(true);
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setIsScrolling(false), 350);
    };
    handleScroll();
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      viewport.removeEventListener("scroll", handleScroll);
      if (idleTimer !== undefined) window.clearTimeout(idleTimer);
    };
  }, [transcriptViewportRef, selectedCodexSessionId]);

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    const metaSend = event.key === "Enter" && (event.metaKey || event.ctrlKey);
    if (metaSend || isSendKeystroke(event)) {
      event.preventDefault();
      if (!replyDisabled) {
        onReplyToCodexSession();
      }
    }
  };

  const handleJumpToLatest = () => {
    const viewport = transcriptViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  };

  const canCopy = Boolean(activeCodexSession?.sessionId);
  const canAct = canCopy && codexMutationPending == null;
  const copiedActive = copiedSessionId != null && copiedSessionId === activeCodexSession?.sessionId;

  const renderedEvents: GroupableEvent[] = [];
  if (selectedCodexSession) {
    for (const event of selectedCodexSession.events) {
      if (!event.text || event.text.trim().length === 0) continue;
      renderedEvents.push({
        id: event.id,
        role: event.role,
        text: event.text,
        timestamp: event.timestamp,
      });
    }
  }
  if (pendingCodexUserEvent && pendingCodexUserEvent.text.trim().length > 0) {
    renderedEvents.push({
      id: pendingCodexUserEvent.id,
      role: "user",
      text: pendingCodexUserEvent.text,
      timestamp: pendingCodexUserEvent.timestamp,
      pending: true,
    });
  }
  for (const event of streamedAssistantEvents) {
    if (!event.text || event.text.length === 0) continue;
    renderedEvents.push({
      id: event.id,
      role: "assistant",
      text: event.text,
      timestamp: null,
      streaming: true,
    });
  }

  const groups = groupEvents(renderedEvents);
  const hasAnyMessages = groups.length > 0;
  const noSelection = !selectedCodexSessionId && !activeCodexSession;

  return (
    <section
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col bg-background",
        className,
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-3 backdrop-blur md:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-1 text-sm font-semibold text-foreground md:text-base">
            {activeCodexSession ? activeCodexTitle : "Codex"}
          </h2>
          <p className="hidden line-clamp-1 text-xs text-muted-foreground md:block">
            {activeCodexSession?.cwd ?? "Select a thread to continue"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onCopySessionId()}
            disabled={!canCopy}
            aria-label="Copy session id"
            title={copiedActive ? "Copied" : "Copy session id"}
            className="hidden rounded-full md:inline-flex"
          >
            {copiedActive ? (
              <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onArchiveCodexSession()}
            disabled={!canAct}
            aria-label="Archive thread"
            title="Archive thread"
            className="hidden rounded-full md:inline-flex"
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onDeleteCodexSession()}
            disabled={!canAct}
            aria-label="Delete thread"
            title="Delete thread"
            className="hidden rounded-full md:inline-flex"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          {onOpenInspector ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenInspector}
              aria-label="Open session details"
              title="Session details"
              className="rounded-full"
            >
              <Info className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </header>

      <div
        ref={transcriptViewportRef}
        className="relative min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6">
          {selectedCodexSession && (codexOlderLoading || selectedCodexPagination?.hasMore) ? (
            <div
              className={cn(
                "sticky top-0 z-10 mb-3 flex justify-center transition-opacity duration-200",
                isScrolling && !codexOlderLoading
                  ? "pointer-events-none opacity-0"
                  : "opacity-100",
              )}
            >
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/95 px-3 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
                {codexOlderLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <MessageSquareText className="h-3 w-3" />
                )}
                <span>
                  {codexOlderLoading ? "Loading earlier messages…" : "Scroll up to load earlier"}
                </span>
              </div>
            </div>
          ) : null}

          {codexDetailLoading ? (
            <p className="text-center text-sm text-muted-foreground">Loading Codex transcript…</p>
          ) : null}

          {!codexDetailLoading && !hasCodexTranscriptContent && noSelection ? (
            <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-center">
              <MessageSquareText className="h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">
                Pick a thread or start a new one
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Mission Control mirrors the local Codex store on this machine.
              </p>
            </div>
          ) : null}

          {!codexDetailLoading &&
          selectedCodexSession &&
          !hasAnyMessages &&
          !streamingInProgress ? (
            <div className="flex min-h-[30dvh] items-center justify-center text-sm text-muted-foreground">
              No messages yet — say hi.
            </div>
          ) : null}

          {hasAnyMessages ? (
            <div className="space-y-1">
              {groups.map((group, groupIdx) => {
                const lastEvent = group.events[group.events.length - 1]!;
                const lastTimestamp = lastEvent.timestamp;
                const streamingGroup = group.events.some((event) => event.streaming);
                return (
                  <MessageGroupView
                    key={`${group.role}-${group.events[0]!.id}-${groupIdx}`}
                    group={group}
                    streamingGroup={streamingGroup}
                    streamingInProgress={streamingInProgress}
                    timestamp={
                      lastTimestamp != null
                        ? formatTimestamp(lastTimestamp)
                        : streamingGroup && streamingInProgress
                          ? "Streaming…"
                          : null
                    }
                  />
                );
              })}
            </div>
          ) : null}
        </div>

      </div>

      <div className="sticky bottom-0 border-t border-border/60 bg-background/90 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:px-6">
        {showJumpToLatest && hasAnyMessages && !isScrolling ? (
          <button
            type="button"
            onClick={handleJumpToLatest}
            aria-label="Jump to latest message"
            title="Jump to latest"
            className="absolute -top-12 right-4 inline-flex size-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        ) : null}
        {codexMutationError ? (
          <div className="mx-auto mb-2 max-w-3xl rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {codexMutationError}
          </div>
        ) : null}

        <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-border/60 bg-card px-3 py-2 shadow-sm transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
          <Textarea
            ref={replyTextareaRef}
            rows={1}
            value={replyPrompt}
            onChange={(event) => setReplyPrompt(event.target.value)}
            onKeyDown={handleReplyKeyDown}
            placeholder={
              selectedCodexSessionId ? "Message Codex…" : "Select a thread to reply"
            }
            disabled={!selectedCodexSessionId || replyPending}
            aria-label="Reply message"
            className="min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-6 shadow-none focus-visible:outline-none focus-visible:ring-0"
          />
          <Button
            type="button"
            onClick={() => onReplyToCodexSession()}
            disabled={replyDisabled}
            aria-label="Send message"
            className="size-9 shrink-0 rounded-full bg-blue-600 p-0 text-white hover:bg-blue-700 disabled:bg-blue-600/40 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {replyPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>

        <p className="mx-auto mt-1 hidden max-w-3xl text-[11px] text-muted-foreground sm:block">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </section>
  );
}

function MessageGroupView({
  group,
  streamingGroup,
  streamingInProgress,
  timestamp,
}: {
  group: MessageGroup;
  streamingGroup: boolean;
  streamingInProgress: boolean;
  timestamp: string | null;
}) {
  const label = group.role === "assistant" ? "Codex" : "You";
  const avatarMonogram = group.role === "assistant" ? "C" : "U";
  const avatarClasses =
    group.role === "assistant"
      ? "bg-blue-600 text-white dark:bg-blue-500"
      : "bg-accent text-accent-foreground";
  const isUser = group.role === "user";

  return (
    <div className="group">
      {group.events.map((event, index) => {
        const firstInGroup = index === 0;
        const lastInGroup = index === group.events.length - 1;
        const showStreamingCaret = Boolean(event.streaming) && streamingInProgress;
        return (
          <div
            key={event.id}
            className={cn(
              "flex gap-3",
              isUser ? "flex-row-reverse" : "flex-row",
              firstInGroup ? "mt-3" : "mt-0.5",
            )}
          >
            <div className="w-7 shrink-0">
              {firstInGroup ? (
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                    avatarClasses,
                  )}
                  aria-hidden="true"
                >
                  {avatarMonogram}
                </span>
              ) : null}
            </div>
            <div className={cn("flex min-w-0 flex-1 flex-col", isUser ? "items-end" : "items-start")}>
              {firstInGroup ? (
                <span className="mb-1 text-[11px] font-medium text-muted-foreground">
                  {label}
                </span>
              ) : null}
              <MessageBubble
                role={group.role}
                streaming={showStreamingCaret}
                pending={event.pending}
              >
                {event.text}
              </MessageBubble>
              {lastInGroup && (timestamp || (streamingGroup && streamingInProgress)) ? (
                <span
                  className={cn(
                    "mt-1 text-[11px] text-muted-foreground",
                    isUser ? "text-right" : "text-left",
                  )}
                >
                  {timestamp}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MessageBubble({
  role,
  streaming,
  pending,
  children,
}: {
  role: "user" | "assistant";
  streaming?: boolean;
  pending?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-w-[85%] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] shadow-sm md:max-w-full",
        role === "user"
          ? "rounded-2xl rounded-tr-sm bg-blue-600 text-white dark:bg-blue-500"
          : "rounded-2xl rounded-tl-sm border border-border/60 bg-card text-foreground",
        pending ? "opacity-70" : null,
      )}
    >
      {children}
      {streaming ? (
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-[1em] w-[2px] animate-pulse bg-foreground/80 align-middle"
        />
      ) : null}
    </div>
  );
}
