"use client";

import type { KeyboardEvent, RefObject } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Eraser,
  Info,
  Loader2,
  MessageSquareText,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MessageContent } from "./MessageContent";
import { useToast } from "./Toast";
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
  activeSessionHasRunInProgress: boolean;
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
  replyComposerError: string | null;
  replyPrompt: string;
  setReplyPrompt: (value: string) => void;
  onReplyToCodexSession: () => void;
  formatTimestamp: (value: number | null | undefined) => string;
  formatRelativeTimestamp: (value: number | null | undefined) => string;
  formatShortSessionId: (value: string | null | undefined) => string;
  onOpenInspector?: () => void;
  onStartNewThread?: () => void;
  onPickSuggestion?: (text: string) => void;
  className?: string;
};

type SlashCommand = {
  id: string;
  label: string;
  description: string;
  icon: typeof Copy;
  disabled?: boolean;
  run: () => void;
};

const PROMPT_SUGGESTIONS: readonly string[] = [
  "Debug a failing test",
  "Write a unit test for this file",
  "Explain how this module works",
  "Refactor to extract helpers",
  "Add error handling to X",
  "Review this PR branch",
];

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
  activeSessionHasRunInProgress,
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
  replyComposerError,
  replyPrompt,
  setReplyPrompt,
  onReplyToCodexSession,
  formatTimestamp,
  formatRelativeTimestamp: _formatRelativeTimestamp,
  formatShortSessionId: _formatShortSessionId,
  onOpenInspector,
  onStartNewThread,
  onPickSuggestion,
  className,
}: ChatPaneProps) {
  void _activeCodexMessageCount;
  void _formatRelativeTimestamp;
  void _formatShortSessionId;
  const { showToast } = useToast();
  const replyTextareaRef = useAutosizeTextarea(replyPrompt);
  const replyLocked = activeSessionHasRunInProgress;
  const replyDisabled =
    !selectedCodexSessionId || !replyPrompt.trim() || replyLocked;
  const replyPending = replyLocked;
  const streamingInProgress =
    activeSessionHasRunInProgress
    || pendingCodexUserEvent != null
    || streamedAssistantEvents.length > 0
    || (codexMutationPending === "create" && !selectedCodexSessionId && !activeCodexSession);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [slashPaletteOpen, setSlashPaletteOpen] = useState(false);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const composerWrapperRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const previousMutationErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const viewport = transcriptViewportRef.current;
    if (!viewport) return;
    let idleTimer: number | undefined;
    const handleScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setShowJumpToLatest(distanceFromBottom > SCROLL_JUMP_THRESHOLD_PX);
      stickToBottomRef.current = distanceFromBottom <= SCROLL_JUMP_THRESHOLD_PX;
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

  const hasSession = Boolean(activeCodexSession?.sessionId);

  const slashCommands: SlashCommand[] = useMemo(
    () => [
      {
        id: "copy",
        label: "/copy",
        description: "Copy session id",
        icon: Copy,
        disabled: !hasSession,
        run: () => {
          if (hasSession) onCopySessionId();
        },
      },
      {
        id: "archive",
        label: "/archive",
        description: "Archive this thread",
        icon: Archive,
        disabled: !hasSession,
        run: () => {
          if (hasSession) onArchiveCodexSession();
        },
      },
      {
        id: "delete",
        label: "/delete",
        description: "Delete this thread",
        icon: Trash2,
        disabled: !hasSession,
        run: () => {
          if (hasSession) onDeleteCodexSession();
        },
      },
      {
        id: "clear",
        label: "/clear",
        description: "Clear the composer",
        icon: Eraser,
        run: () => {
          setReplyPrompt("");
        },
      },
      {
        id: "info",
        label: "/info",
        description: "Open session details",
        icon: Info,
        disabled: !onOpenInspector,
        run: () => {
          onOpenInspector?.();
        },
      },
    ],
    [
      hasSession,
      onArchiveCodexSession,
      onCopySessionId,
      onDeleteCodexSession,
      onOpenInspector,
      setReplyPrompt,
    ],
  );

  const slashQueryActive = slashPaletteOpen && replyPrompt.startsWith("/");
  const filteredSlashCommands = useMemo(() => {
    if (!slashPaletteOpen) return slashCommands;
    if (!slashQueryActive) return slashCommands;
    const query = replyPrompt.slice(1).trim().toLowerCase();
    if (query.length === 0) return slashCommands;
    return slashCommands.filter((command) =>
      command.label.slice(1).toLowerCase().startsWith(query),
    );
  }, [slashCommands, slashPaletteOpen, slashQueryActive, replyPrompt]);

  const effectiveSlashIndex =
    slashPaletteOpen && filteredSlashCommands.length > 0
      ? slashActiveIndex % filteredSlashCommands.length
      : 0;

  useEffect(() => {
    if (!slashPaletteOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const wrapper = composerWrapperRef.current;
      if (!wrapper) return;
      if (wrapper.contains(event.target as Node)) return;
      setSlashPaletteOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [slashPaletteOpen]);

  const runSlashCommand = (command: SlashCommand) => {
    if (command.disabled) return;
    command.run();
    setReplyPrompt("");
    setSlashPaletteOpen(false);
    setSlashActiveIndex(0);
  };

  const handleReplyChange = (value: string) => {
    setReplyPrompt(value);
    if (value.startsWith("/")) {
      setSlashPaletteOpen(true);
    } else {
      setSlashPaletteOpen(false);
    }
  };

  const handleReplyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (slashPaletteOpen && filteredSlashCommands.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashActiveIndex(
          (effectiveSlashIndex + 1) % filteredSlashCommands.length,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashActiveIndex(
          (effectiveSlashIndex - 1 + filteredSlashCommands.length) %
            filteredSlashCommands.length,
        );
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const command = filteredSlashCommands[effectiveSlashIndex];
        if (command) runSlashCommand(command);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashPaletteOpen(false);
        return;
      }
    }
    if (event.key === "Escape" && slashPaletteOpen) {
      event.preventDefault();
      setSlashPaletteOpen(false);
      return;
    }
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

  const canCopy = hasSession;
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
  const hasStreamedAssistantText = streamedAssistantEvents.some(
    (event) => typeof event.text === "string" && event.text.length > 0,
  );
  const showThinkingPlaceholder =
    streamingInProgress && !hasStreamedAssistantText;
  const hasAnyMessages = groups.length > 0 || showThinkingPlaceholder;
  const noSelection = !selectedCodexSessionId && !activeCodexSession;

  const activeSessionId = activeCodexSession?.sessionId ?? null;
  useEffect(() => {
    if (!copiedSessionId) return;
    if (copiedSessionId !== activeSessionId) return;
    showToast("Session id copied", "success");
  }, [copiedSessionId, activeSessionId, showToast]);

  useEffect(() => {
    const previous = previousMutationErrorRef.current;
    if (codexMutationError && previous !== codexMutationError) {
      showToast(codexMutationError, "error");
    }
    previousMutationErrorRef.current = codexMutationError;
  }, [codexMutationError, showToast]);

  const streamedTokenLength = streamedAssistantEvents.reduce(
    (sum, event) => sum + (event.text?.length ?? 0),
    0,
  );
  const persistedEventsLength = selectedCodexSession?.events.length ?? 0;

  useEffect(() => {
    if (!hasAnyMessages) return;
    if (!stickToBottomRef.current) return;
    const viewport = transcriptViewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "auto" });
  }, [streamedTokenLength, persistedEventsLength, hasAnyMessages, transcriptViewportRef]);

  const indicatorTone: "streaming" | "attached" | "idle" = streamingInProgress
    ? "streaming"
    : activeCodexSession != null
      ? "attached"
      : "idle";
  const indicatorTitle =
    indicatorTone === "streaming"
      ? "Streaming"
      : indicatorTone === "attached"
        ? "Attached"
        : "Idle";

  return (
    <section
      className={cn(
        "relative flex min-h-0 min-w-0 flex-1 flex-col bg-background",
        className,
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/90 px-3 backdrop-blur md:px-5">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 line-clamp-1 text-sm font-semibold text-foreground md:text-base">
            {activeCodexSession ? (
              <span
                aria-hidden="true"
                title={indicatorTitle}
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  indicatorTone === "streaming"
                    ? "bg-amber-500 motion-safe:animate-pulse dark:bg-amber-400"
                    : indicatorTone === "attached"
                      ? "bg-emerald-500 dark:bg-emerald-400"
                      : "bg-muted-foreground",
                )}
              />
            ) : null}
            <span className="line-clamp-1">
              {activeCodexSession ? activeCodexTitle : "Codex"}
            </span>
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
        <div
          data-testid="codex-transcript-shell"
          className="mx-auto w-full max-w-none px-3 py-5 sm:px-4 md:max-w-3xl md:px-6"
        >
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

          {codexDetailLoading && !hasCodexTranscriptContent ? (
            <TranscriptSkeleton />
          ) : null}

          {!codexDetailLoading && !hasCodexTranscriptContent && noSelection ? (
            <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-center">
              <MessageSquareText className="h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">
                Pick a thread or start a new one
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Mission Control mirrors the local Codex store on this machine.
              </p>
              {onStartNewThread ? (
                <Button
                  type="button"
                  onClick={onStartNewThread}
                  className="rounded-full bg-blue-600 px-4 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Start new thread
                </Button>
              ) : null}
              {onPickSuggestion ? (
                <div className="flex flex-wrap justify-center gap-2 max-w-md mx-auto">
                  {PROMPT_SUGGESTIONS.map((suggestion) => (
                    <button
                      type="button"
                      key={suggestion}
                      onClick={() => onPickSuggestion(suggestion)}
                      className="rounded-full border border-border/60 bg-card hover:border-blue-500/50 hover:bg-accent/40 px-3 py-1.5 text-xs text-foreground transition-colors"
                    >
                      <Sparkles className="mr-1.5 inline-block h-3 w-3 text-muted-foreground align-[-2px]" aria-hidden="true" />
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
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
              {showThinkingPlaceholder ? <ThinkingPlaceholder /> : null}
            </div>
          ) : null}
        </div>

      </div>

      <div className="sticky bottom-0 border-t border-border/60 bg-background/90 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:px-4 md:px-6">
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
          <div className="mx-auto mb-2 max-w-none rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive md:max-w-3xl">
            {codexMutationError}
          </div>
        ) : null}
        {activeSessionHasRunInProgress && !codexMutationError && !replyComposerError ? (
          <div className="mx-auto mb-2 max-w-none rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 md:max-w-3xl">
            Codex is still finishing the previous reply for this thread.
          </div>
        ) : null}

        <div
          ref={composerWrapperRef}
          data-testid="codex-composer-shell"
          className="relative mx-auto w-full max-w-none md:max-w-3xl"
        >
          {slashPaletteOpen && filteredSlashCommands.length > 0 ? (
            <div
              role="listbox"
              aria-label="Slash commands"
              className="absolute bottom-full mb-2 left-0 right-0 rounded-xl border border-border/60 bg-card shadow-lg p-1 max-h-64 overflow-y-auto"
            >
              {filteredSlashCommands.map((command, index) => {
                const Icon = command.icon;
                const active = index === effectiveSlashIndex;
                return (
                  <button
                    type="button"
                    key={command.id}
                    role="option"
                    aria-selected={active}
                    disabled={command.disabled}
                    onMouseEnter={() => setSlashActiveIndex(index)}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => runSlashCommand(command)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-left transition-colors",
                      active ? "bg-accent" : "hover:bg-accent",
                      command.disabled
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium text-foreground">
                      {command.label}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {command.description}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div
            className={cn(
              "flex w-full items-end gap-2 rounded-3xl border bg-card px-3 py-2 shadow-sm transition-colors",
              replyComposerError
                ? "border-destructive focus-within:border-destructive focus-within:ring-2 focus-within:ring-destructive/20"
                : "border-border/60 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20",
            )}
          >
            <Textarea
              ref={replyTextareaRef}
              rows={1}
              value={replyPrompt}
              onChange={(event) => handleReplyChange(event.target.value)}
              onKeyDown={handleReplyKeyDown}
              onFocus={() => {
                if (replyPrompt.startsWith("/")) setSlashPaletteOpen(true);
              }}
              placeholder={
                selectedCodexSessionId ? "Message Codex…" : "Select a thread to reply"
              }
              disabled={!selectedCodexSessionId || replyLocked}
              aria-invalid={replyComposerError ? true : undefined}
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
          {replyComposerError ? (
            <p className="mt-2 px-2 text-xs text-destructive" role="status">
              {replyComposerError}
            </p>
          ) : null}
        </div>

        <p className="mx-auto mt-1 hidden max-w-none text-[11px] text-muted-foreground sm:block md:max-w-3xl">
          {replyLocked && selectedCodexSessionId
            ? "Composer locked while Codex finishes this turn"
            : "Enter to send · Shift+Enter for newline"}
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
    <div className="motion-safe:animate-entrance">
      {group.events.map((event, index) => {
        const firstInGroup = index === 0;
        const lastInGroup = index === group.events.length - 1;
        const showStreamingCaret = Boolean(event.streaming) && streamingInProgress;
        return (
          <div
            key={event.id}
            className={cn(
              "group/bubble flex gap-3",
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
                text={event.text}
                isUser={isUser}
              />
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

function ThinkingPlaceholder() {
  return (
    <div className="motion-safe:animate-entrance" aria-live="polite">
      <div className="group/bubble mt-3 flex gap-3 flex-row">
        <div className="w-7 shrink-0">
          <span
            className="flex size-7 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white dark:bg-blue-500"
            aria-hidden="true"
          >
            C
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start">
          <span className="mb-1 text-[11px] font-medium text-muted-foreground">
            Codex
          </span>
          <div className="relative max-w-[calc(100%-0.25rem)] rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-2.5 text-sm leading-7 text-foreground shadow-sm ring-1 ring-amber-400/40 sm:max-w-[92%] md:max-w-full">
            <span className="flex items-center gap-2">
              <span className="italic text-muted-foreground">
                Codex is thinking…
              </span>
              <span
                className="inline-flex items-center gap-1"
                aria-hidden="true"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-amber-500 [animation-delay:0ms] dark:bg-amber-400" />
                <span className="size-1.5 animate-pulse rounded-full bg-amber-500 [animation-delay:150ms] dark:bg-amber-400" />
                <span className="size-1.5 animate-pulse rounded-full bg-amber-500 [animation-delay:300ms] dark:bg-amber-400" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  streaming,
  pending,
  text,
  isUser,
}: {
  role: "user" | "assistant";
  streaming?: boolean;
  pending?: boolean;
  text: string;
  isUser: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    return () => {
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const handleCopyText = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      showToast("Message copied", "success");
      if (copyTimerRef.current != null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={cn(
        "relative max-w-[calc(100%-0.25rem)] break-words [overflow-wrap:anywhere] px-4 py-2.5 text-sm shadow-sm sm:max-w-[92%] md:max-w-full",
        role === "user"
          ? "rounded-2xl rounded-tr-sm bg-blue-600 text-white leading-relaxed whitespace-pre-wrap dark:bg-blue-500"
          : "rounded-2xl rounded-tl-sm border border-border/60 bg-card text-foreground leading-7",
        pending ? "opacity-70" : null,
        streaming
          ? "ring-2 ring-amber-400/40 dark:ring-amber-400/40"
          : null,
      )}
      {...(streaming
        ? { "aria-live": "polite" as const, "aria-atomic": "false" as const }
        : null)}
    >
      <button
        type="button"
        onClick={handleCopyText}
        aria-label={copied ? "Copied" : "Copy text"}
        title={copied ? "Copied" : "Copy text"}
        className={cn(
          "absolute top-1.5 inline-flex size-6 items-center justify-center rounded-md border border-border/50 bg-background/80 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 group-hover/bubble:opacity-100",
          isUser ? "left-1.5" : "right-1.5",
        )}
      >
        {copied ? (
          <Check className="h-3 w-3 text-blue-600 dark:text-blue-400" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
      <MessageContent text={text} variant={role} />
      {streaming ? (
        <span
          aria-hidden="true"
          className="ml-1 inline-block h-[1em] w-[2px] animate-pulse bg-amber-500 align-middle dark:bg-amber-400"
        />
      ) : null}
    </div>
  );
}

function TranscriptSkeleton() {
  const rows: Array<{
    side: "left" | "right";
    widthClass: string;
    heightClass: string;
  }> = [
    { side: "left", widthClass: "w-[60%]", heightClass: "h-12" },
    { side: "right", widthClass: "w-[75%]", heightClass: "h-16" },
    { side: "left", widthClass: "w-[50%]", heightClass: "h-10" },
  ];
  return (
    <div
      role="status"
      aria-label="Loading Codex transcript"
      className="space-y-3"
    >
      {rows.map((row, idx) => (
        <div
          key={idx}
          className={cn(
            "flex",
            row.side === "right" ? "justify-end" : "justify-start",
          )}
        >
          <div
            className={cn(
              "animate-pulse rounded-2xl bg-muted",
              row.heightClass,
              row.widthClass,
              row.side === "right" ? "rounded-tr-sm" : "rounded-tl-sm",
            )}
          />
        </div>
      ))}
      <span className="sr-only">Loading Codex transcript…</span>
    </div>
  );
}
