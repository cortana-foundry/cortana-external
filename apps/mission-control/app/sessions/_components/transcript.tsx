"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { JumpToLatest } from "./jump-to-latest";
import { MessageBlock } from "./message-block";
import type { CodexSessionDetail, CodexSessionEvent, StreamingCodexEvent } from "./types";

const SCROLLED_UP_THRESHOLD_PX = 160;

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
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

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

  const eventCount = detail?.events.length ?? 0;
  const pendingId = pendingUserEvent?.id ?? null;
  const streamedCount = streamedAssistantEvents.length;
  const lastStreamedText = streamedAssistantEvents[streamedAssistantEvents.length - 1]?.text ?? "";
  const sessionId = detail?.sessionId ?? null;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (userScrolledUpRef.current) return;

    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [sessionId, eventCount, streamedCount, lastStreamedText.length, pendingId]);

  const handleScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
    const scrolledUp = distance > SCROLLED_UP_THRESHOLD_PX;
    userScrolledUpRef.current = scrolledUp;
    setIsUserScrolledUp(scrolledUp);
  }, []);

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

        {detail?.events.map((event) => (
          <MessageBlock
            key={event.id}
            role={event.role}
            text={event.text}
            timestamp={event.timestamp}
            rootPath={rootPath}
          />
        ))}

        {pendingUserEvent ? (
          <MessageBlock
            key={pendingUserEvent.id}
            role="user"
            text={pendingUserEvent.text}
            timestamp={pendingUserEvent.timestamp}
            rootPath={rootPath}
            variant="pending"
          />
        ) : null}

        {streamedAssistantEvents.map((event) => (
          <MessageBlock
            key={event.id}
            role="assistant"
            text={event.text}
            timestamp={null}
            rootPath={rootPath}
            variant={streaming ? "streaming" : "default"}
          />
        ))}
      </div>

      <JumpToLatest visible={isUserScrolledUp} onClick={() => scrollToBottom("smooth")} />
    </div>
  );
}
