"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { JumpToLatest } from "./jump-to-latest";
import { MessageBlock } from "./message-block";
import { shouldShowHeader } from "./message-grouping";
import type { CodexSessionDetail, CodexSessionEvent, StreamingCodexEvent } from "./types";

const SCROLL_POSITION_STORAGE_PREFIX = "mc-session-scroll-";
const SCROLL_POSITION_METADATA_KEY = "mc-session-scroll-keys";
const MAX_RETAINED_SCROLL_POSITIONS = 100;

const SCROLLED_UP_THRESHOLD_PX = 160;
const INITIAL_WINDOW_SIZE = 30;
const WINDOW_INCREMENT = 30;
const TOP_EXPAND_THRESHOLD_PX = 200;

type TranscriptProps = {
  detail: CodexSessionDetail | null;
  pendingUserEvent: CodexSessionEvent | null;
  streamedAssistantEvents: StreamingCodexEvent[];
  loading: boolean;
  streaming: boolean;
  rootPath: string | null | undefined;
  className?: string;
};

export function Transcript({
  detail,
  pendingUserEvent,
  streamedAssistantEvents,
  loading,
  streaming,
  rootPath,
  className,
}: TranscriptProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const prevSessionIdRef = useRef<string | null>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_WINDOW_SIZE);
  const prevScrollHeightRef = useRef<number | null>(null);
  const isExpandingRef = useRef(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    userScrolledUpRef.current = false;
    setIsUserScrolledUp(false);
  }, []);

  const hasContent =
    Boolean(detail) ||
    Boolean(pendingUserEvent) ||
    streamedAssistantEvents.length > 0;
  const shouldRenderPendingUserEvent = Boolean(
    pendingUserEvent
    && !detail?.events.some((event) =>
      event.role === "user"
      && event.text.trim() === pendingUserEvent.text.trim(),
    ),
  );

  const eventCount = detail?.events.length ?? 0;
  const pendingId = pendingUserEvent?.id ?? null;
  const streamedCount = streamedAssistantEvents.length;
  const lastStreamedText = streamedAssistantEvents[streamedAssistantEvents.length - 1]?.text ?? "";
  const sessionId = detail?.sessionId ?? null;

  // Scroll position persistence callbacks
  const saveScrollPosition = useCallback((scrollTop: number) => {
    if (typeof window === "undefined" || !sessionId || streaming) return;

    try {
      const key = `${SCROLL_POSITION_STORAGE_PREFIX}${sessionId}`;
      window.localStorage.setItem(key, JSON.stringify(scrollTop));

      // Track keys for potential LRU eviction
      try {
        const stored = window.localStorage.getItem(SCROLL_POSITION_METADATA_KEY);
        const keys = stored ? (JSON.parse(stored) as string[]) : [];
        if (!keys.includes(key)) {
          const updated = [key, ...keys].slice(0, MAX_RETAINED_SCROLL_POSITIONS);
          window.localStorage.setItem(SCROLL_POSITION_METADATA_KEY, JSON.stringify(updated));
        }
      } catch {
        // Ignore metadata tracking errors
      }
    } catch {
      // Silently fail on quota exceeded or other storage errors
    }
  }, [sessionId, streaming]);

  const restoreScrollPosition = useCallback(() => {
    if (typeof window === "undefined" || !sessionId) return;

    try {
      const key = `${SCROLL_POSITION_STORAGE_PREFIX}${sessionId}`;
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const scrollTop = JSON.parse(stored) as number;
        if (typeof scrollTop === "number" && isFinite(scrollTop) && scrollTop >= 0) {
          const viewport = viewportRef.current;
          if (viewport) {
            viewport.scrollTop = scrollTop;
          }
          return true;
        }
      }
    } catch {
      // Silently fail on invalid storage
    }
    return false;
  }, [sessionId]);

  // Compute windowed events
  const totalEvents = detail?.events.length ?? 0;
  const windowedEvents = detail?.events.slice(Math.max(0, totalEvents - visibleCount)) ?? [];
  const hasMoreAbove = totalEvents > windowedEvents.length;

  // Reset visibleCount when session changes
  useEffect(() => {
    if (sessionId !== null && prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleCount(INITIAL_WINDOW_SIZE);
      isExpandingRef.current = false;
      prevScrollHeightRef.current = null;
    }
  }, [sessionId]);

  // Restore scroll position when session changes
  useLayoutEffect(() => {
    if (!sessionId) return;

    // Try to restore saved scroll position
    const restored = restoreScrollPosition();

    // If no saved position or restore failed, scroll to bottom
    if (!restored) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- scroll-to-bottom during layout phase after session change
      scrollToBottom("auto");
    }
  }, [sessionId, restoreScrollPosition, scrollToBottom]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (userScrolledUpRef.current) return;

    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [sessionId, eventCount, streamedCount, lastStreamedText.length, pendingId]);

  // Restore scroll position after expanding window
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || prevScrollHeightRef.current === null) return;

    const heightDelta = viewport.scrollHeight - prevScrollHeightRef.current;
    if (heightDelta > 0) {
      viewport.scrollTop += heightDelta;
    }

    prevScrollHeightRef.current = null;
    isExpandingRef.current = false;
  }, [visibleCount]);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    // Save scroll position (debounced via callback - will be called frequently but storage is fast)
    saveScrollPosition(viewport.scrollTop);

    // Check if user has scrolled away from bottom
    const distance = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
    const scrolledUp = distance > SCROLLED_UP_THRESHOLD_PX;
    userScrolledUpRef.current = scrolledUp;
    setIsUserScrolledUp(scrolledUp);

    // Check if user is near top and we should expand the window
    const scrolledFromTop = viewport.scrollTop;
    if (
      scrolledFromTop <= TOP_EXPAND_THRESHOLD_PX &&
      hasMoreAbove &&
      !loading &&
      !isExpandingRef.current
    ) {
      isExpandingRef.current = true;
      prevScrollHeightRef.current = viewport.scrollHeight;
      setVisibleCount((c) => Math.min(c + WINDOW_INCREMENT, totalEvents));
    }
  }, [hasMoreAbove, loading, totalEvents, saveScrollPosition]);

  return (
    <div
      ref={viewportRef}
      onScroll={handleScroll}
      className={cn(
        "relative flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6",
        className,
      )}
      data-testid="transcript-viewport"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 pb-6 2xl:max-w-4xl">
        {loading ? (
          <div className="rounded-lg border border-border/60 bg-background px-4 py-3 text-sm text-muted-foreground">
            Loading Codex transcript…
          </div>
        ) : null}

        {!loading && !hasContent ? (
          <div className="flex min-h-[42svh] items-center justify-center">
            <div className="max-w-md rounded-2xl border border-dashed border-border/60 bg-background/80 px-6 py-8 text-center">
              <p className="text-sm font-semibold text-foreground">No active transcript selected</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a thread from the inbox or launch a new one. Mission Control will keep the session aligned with the local Codex client state.
              </p>
            </div>
          </div>
        ) : null}

        {!loading &&
        detail &&
        detail.events.length === 0 &&
        !pendingUserEvent &&
        streamedAssistantEvents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            No transcript messages parsed yet.
          </div>
        ) : null}

        {hasMoreAbove && !loading ? (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={() => {
                const v = viewportRef.current;
                if (v) prevScrollHeightRef.current = v.scrollHeight;
                setVisibleCount((c) => Math.min(c + WINDOW_INCREMENT, totalEvents));
              }}
              className="rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              data-testid="load-older-button"
            >
              Load {Math.min(WINDOW_INCREMENT, totalEvents - windowedEvents.length)} older
            </button>
          </div>
        ) : null}

        {windowedEvents.map((event, idx, arr) => {
          const prev = arr[idx - 1];
          const showHeader = shouldShowHeader(
            { role: event.role, timestamp: event.timestamp },
            prev ? { role: prev.role, timestamp: prev.timestamp } : null
          );
          return (
            <MessageBlock
              key={event.id}
              role={event.role}
              text={event.text}
              timestamp={event.timestamp}
              rootPath={rootPath}
              showHeader={showHeader}
            />
          );
        })}

        {shouldRenderPendingUserEvent && pendingUserEvent ? (
          <MessageBlock
            key={pendingUserEvent.id}
            role="user"
            text={pendingUserEvent.text}
            timestamp={pendingUserEvent.timestamp}
            rootPath={rootPath}
            variant="pending"
            showHeader={
              windowedEvents.length === 0
                ? true
                : shouldShowHeader(
                    { role: "user", timestamp: pendingUserEvent.timestamp },
                    {
                      role: windowedEvents[windowedEvents.length - 1].role,
                      timestamp: windowedEvents[windowedEvents.length - 1].timestamp,
                    }
                  )
            }
          />
        ) : null}

        {streamedAssistantEvents.map((event, idx) => {
          let showHeader: boolean;

          if (idx === 0) {
            // First streamed event: check against last saved or pending event
            const lastSavedEvent = windowedEvents[windowedEvents.length - 1];
            const lastEvent = shouldRenderPendingUserEvent ? (pendingUserEvent || lastSavedEvent) : lastSavedEvent;

            if (!lastEvent) {
              showHeader = true;
            } else {
              showHeader = shouldShowHeader(
                { role: "assistant", timestamp: null },
                { role: lastEvent.role, timestamp: lastEvent.timestamp }
              );
            }
          } else {
            // Subsequent streamed events: all hidden (same as previous streamed)
            showHeader = false;
          }

          return (
            <MessageBlock
              key={event.id}
              role="assistant"
              text={event.text}
              timestamp={null}
              rootPath={rootPath}
              variant={streaming ? "streaming" : "default"}
              showHeader={showHeader}
            />
          );
        })}
      </div>

      <JumpToLatest visible={isUserScrolledUp} onClick={() => scrollToBottom("smooth")} />
    </div>
  );
}
